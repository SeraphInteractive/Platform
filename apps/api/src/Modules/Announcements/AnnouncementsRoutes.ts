import {
    NotificationType,
    announcementPublishResultSchema,
    publishAnnouncementSchema,
    type AnnouncementPublishResultDto
} from "@platform/contracts";
import { eq, isNotNull } from "drizzle-orm";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { ApplicationError, ErrorCode, NotFoundError } from "../../Common/Errors/ApplicationError.js";
import { dataEnvelope, errorResponses, isSafeDiscordWebhookUrl } from "../../Common/Http/Schemas.js";
import { optionalUser, requireRole } from "../../Common/Security/Authorization.js";
import type { ServiceContainer } from "../../Composition/ServiceContainer.js";
import { Role } from "../../Domain/Roles.js";
import { departmentDiscordMaps, departments, discordSettings } from "../../Infrastructure/Database/Schema.js";

const embedColor = 0x3498db; // clean stairway blue accent

export const announcementsRoutes: FastifyPluginAsyncZod<{ services: ServiceContainer }> = async (application, { services }) => {
    const { database } = services;
    const security = [{ bearer: [] }];

    application.post(
        "/announcements",
        {
            preHandler: requireRole(Role.Supervisor),
            schema: {
                tags: ["Announcements"],
                summary: "Publish an announcement to Discord channels via webhook.",
                security,
                body: publishAnnouncementSchema,
                response: { 200: dataEnvelope(announcementPublishResultSchema), ...errorResponses }
            }
        },
        async (request): Promise<{ data: AnnouncementPublishResultDto }> => {
            const { target, title, content, pings } = request.body;
            const author = optionalUser(request);
            const authorName = author?.discordUsername ?? "Supervisor";

            const pingParts: string[] = [];
            if (pings?.everyone) {
                pingParts.push("@everyone");
            }
            if (pings?.here) {
                pingParts.push("@here");
            }
            for (const roleId of pings?.roleIds ?? []) {
                pingParts.push(`<@&${roleId}>`);
            }
            for (const userId of pings?.userIds ?? []) {
                pingParts.push(`<@${userId}>`);
            }
            const pingText = pingParts.join(" ");

            const parseMentions: ("everyone" | "roles" | "users")[] = [];
            if (pings?.everyone || pings?.here) {
                parseMentions.push("everyone");
            }

            // discord rejects payloads containing both parse type and explicit id whitelist
            const allowedMentions: {
                parse: ("everyone" | "roles" | "users")[];
                roles?: string[];
                users?: string[];
            } = {
                parse: parseMentions
            };
            if (pings?.roleIds && pings.roleIds.length > 0) {
                allowedMentions.roles = pings.roleIds;
            }
            if (pings?.userIds && pings.userIds.length > 0) {
                allowedMentions.users = pings.userIds;
            }

            const components: { type: number; accent_color?: number; content?: string; components?: unknown[] }[] = [];
            if (pingText.length > 0) {
                // components v2 rejects top-level content, mentions must live in text display
                components.push({
                    type: 10,
                    content: pingText
                });
            }
            components.push({
                type: 17,
                accent_color: embedColor,
                components: [
                    {
                        type: 10,
                        content: `# ${title.trim()}`
                    },
                    {
                        type: 10,
                        content: content.trim()
                    },
                    {
                        type: 10,
                        content: `-# ~ ${authorName}`
                    }
                ]
            });

            const webhookPayload = {
                username: "Project Stairway",
                flags: 32768,
                allowed_mentions: allowedMentions,
                components
            };

            const webhookTargets: { name: string; url: string }[] = [];

            if (target === "global") {
                const [settings] = await database.select().from(discordSettings).limit(1);
                const globalWebhook = settings?.webhooks?.announcements;
                if (!globalWebhook) {
                    throw new ApplicationError(
                        400,
                        ErrorCode.BadRequest,
                        "Global announcements webhook is not configured in Discord settings."
                    );
                }
                webhookTargets.push({ name: "global", url: globalWebhook });
            } else if (target === "all_departments") {
                const rows = await database
                    .select({
                        deptName: departments.name,
                        webhookUrl: departmentDiscordMaps.discordInfoWebhookUrl
                    })
                    .from(departments)
                    .innerJoin(departmentDiscordMaps, eq(departments.id, departmentDiscordMaps.departmentId))
                    .where(isNotNull(departmentDiscordMaps.discordInfoWebhookUrl));

                for (const row of rows) {
                    if (row.webhookUrl) {
                        webhookTargets.push({ name: row.deptName, url: row.webhookUrl });
                    }
                }

                if (webhookTargets.length === 0) {
                    throw new ApplicationError(400, ErrorCode.BadRequest, "No department info webhooks are configured yet.");
                }
            } else if (target.startsWith("department:")) {
                const slug = target.replace(/^department:/u, "").trim();
                const [row] = await database
                    .select({
                        deptName: departments.name,
                        webhookUrl: departmentDiscordMaps.discordInfoWebhookUrl
                    })
                    .from(departments)
                    .leftJoin(departmentDiscordMaps, eq(departments.id, departmentDiscordMaps.departmentId))
                    .where(eq(departments.slug, slug))
                    .limit(1);

                if (row === undefined) {
                    throw new NotFoundError("Department");
                }
                if (!row.webhookUrl) {
                    throw new ApplicationError(400, ErrorCode.BadRequest, `No info webhook is configured for department ${row.deptName}.`);
                }
                webhookTargets.push({ name: row.deptName, url: row.webhookUrl });
            } else {
                throw new ApplicationError(400, ErrorCode.ValidationFailed, `Unknown announcement target: ${target}`);
            }

            const dispatchedChannels: string[] = [];
            const errors: string[] = [];

            await Promise.all(
                webhookTargets.map(async (item) => {
                    try {
                        if (!isSafeDiscordWebhookUrl(item.url)) {
                            request.log.warn({ target: item.name }, "blocked unsafe announcement webhook URL");
                            errors.push(item.name);
                            return;
                        }
                        const targetUrl = item.url.includes("?") ? `${item.url}&with_components=true` : `${item.url}?with_components=true`;
                        const response = await fetch(targetUrl, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify(webhookPayload),
                            signal: AbortSignal.timeout(10_000)
                        });
                        if (response.ok || response.status === 204) {
                            dispatchedChannels.push(item.name);
                        } else {
                            const errorBody = await response.text().catch(() => "");
                            request.log.warn(
                                { target: item.name, status: response.status, body: errorBody },
                                "failed to dispatch announcement webhook"
                            );
                            errors.push(item.name);
                        }
                    } catch (err: unknown) {
                        request.log.warn({ target: item.name, err }, "exception dispatching announcement webhook");
                        errors.push(item.name);
                    }
                })
            );

            if (dispatchedChannels.length === 0 && errors.length > 0) {
                // use 422 to prevent cloudflare 502 bad gateway edge error page interception
                throw new ApplicationError(
                    422,
                    ErrorCode.InternalError,
                    `Failed to publish announcement to any channels: ${errors.join(", ")}`
                );
            }

            services.notifier.notify({
                type: NotificationType.AnnouncementPublished,
                title: title.trim(),
                target,
                author: {
                    discordId: author?.discordId ?? null,
                    username: authorName
                },
                channels: dispatchedChannels
            });

            return {
                data: {
                    target,
                    dispatchedCount: dispatchedChannels.length,
                    channels: dispatchedChannels
                }
            };
        }
    );
};
