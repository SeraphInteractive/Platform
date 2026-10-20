import {
    NotificationType,
    announcementPublishResultSchema,
    publishAnnouncementSchema,
    type AnnouncementPublishResultDto
} from "@platform/contracts";
import { eq, isNotNull } from "drizzle-orm";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { ApplicationError, ErrorCode, NotFoundError } from "../../Common/Errors/ApplicationError.js";
import { dataEnvelope, errorResponses } from "../../Common/Http/Schemas.js";
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
            if (pings?.roleIds && pings.roleIds.length > 0) {
                parseMentions.push("roles");
            }
            if (pings?.userIds && pings.userIds.length > 0) {
                parseMentions.push("users");
            }

            const allowedMentions = {
                parse: parseMentions,
                roles: pings?.roleIds ?? [],
                users: pings?.userIds ?? []
            };

            // discord components v2 layout using container with stairway blue accent bar and text displays
            const webhookPayload = {
                username: "Project Stairway",
                flags: 32768, // IS_COMPONENTS_V2
                ...(pingText.length > 0 ? { content: pingText } : {}),
                allowed_mentions: allowedMentions,
                components: [
                    {
                        type: 17, // container
                        accent_color: embedColor,
                        components: [
                            {
                                type: 10, // text display
                                content: `# ${title.trim()}`
                            },
                            {
                                type: 10, // text display
                                content: content.trim()
                            },
                            {
                                type: 10, // text display
                                content: `-# ~ ${authorName}`
                            }
                        ]
                    }
                ]
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
                        const targetUrl = item.url.includes("?") ? `${item.url}&with_components=true` : `${item.url}?with_components=true`;
                        const response = await fetch(targetUrl, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify(webhookPayload)
                        });
                        if (response.ok || response.status === 204) {
                            dispatchedChannels.push(item.name);
                        } else {
                            const errorText = await response.text().catch(() => "");
                            request.log.warn(
                                { target: item.name, status: response.status, errorText },
                                "failed to dispatch announcement webhook"
                            );
                            errors.push(`${item.name} (status ${response.status})`);
                        }
                    } catch (err: unknown) {
                        request.log.warn({ target: item.name, err }, "exception dispatching announcement webhook");
                        errors.push(item.name);
                    }
                })
            );

            if (dispatchedChannels.length === 0 && errors.length > 0) {
                throw new ApplicationError(
                    502,
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
