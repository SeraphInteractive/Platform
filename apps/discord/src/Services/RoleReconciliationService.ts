import { Role } from "@platform/contracts";
import type { Client, Guild, SendableChannels } from "discord.js";
import type { Logger } from "pino";
import type { PlatformApiClient } from "../Api/PlatformApiClient.js";
import { Accent, message, panel, pluralize } from "../Discord/Ui.js";
import { ChannelPurpose, type SettingsStore } from "../State/SettingsStore.js";
import type { ServerProvisioner } from "./ServerProvisioner.js";
import { isStudioOrLegacyRole, syncMemberStudioRoles } from "./StudioRoles.js";

export interface ReconciliationSummary {
    readonly reorderedRoles: number;
    readonly totalUsersChecked: number;
    readonly driftedMembersSynced: number;
    readonly errors: readonly string[];
    readonly durationMs: number;
}

const mutationPacingDelayMs = 250;

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export class RoleReconciliationService {
    public constructor(
        private readonly api: PlatformApiClient,
        private readonly provisioner: ServerProvisioner,
        private readonly settings: SettingsStore,
        private readonly client: Client,
        private readonly logger: Logger
    ) {}

    public async reconcile(guild: Guild, trigger: "scheduled" | "manual"): Promise<ReconciliationSummary> {
        const start = Date.now();
        const errors: string[] = [];

        // enforce visual role hierarchy order in server settings
        const reorderedRoles = await this.provisioner.enforceRoleHierarchy(guild).catch((err: unknown) => {
            this.logger.warn({ err }, "failed to enforce role hierarchy during reconciliation");
            errors.push("Failed to enforce role hierarchy order");
            return 0;
        });

        let totalUsersChecked = 0;
        let driftedMembersSynced = 0;

        try {
            const allUsers = await this.api.listAllUsers();
            const registeredDiscordIds = new Set<string>();

            // Reconcile all registered platform users
            for (const user of allUsers) {
                if (!user.discordId) {
                    continue;
                }
                registeredDiscordIds.add(user.discordId);
                totalUsersChecked++;
                try {
                    const member = await guild.members.fetch(user.discordId).catch(() => null);
                    if (member === null) {
                        continue;
                    }
                    const result = await syncMemberStudioRoles(
                        member,
                        user.role,
                        user.specialties,
                        trigger === "scheduled" ? "Scheduled role reconciliation" : "Manual role hierarchy sync"
                    );
                    if (result.modified) {
                        driftedMembersSynced++;
                        // pace role writes to stay comfortably within discord rate limits
                        await sleep(mutationPacingDelayMs);
                    }
                } catch (memberErr: unknown) {
                    this.logger.warn({ err: memberErr, discordId: user.discordId }, "failed to reconcile member roles");
                    errors.push(`Failed to sync member <@${user.discordId}>`);
                }
            }

            // Reconcile unregistered Discord members holding studio roles
            const guildMembers = await guild.members.fetch().catch(() => null);
            if (guildMembers !== null) {
                for (const member of guildMembers.values()) {
                    if (member.user.bot || registeredDiscordIds.has(member.id)) {
                        continue;
                    }
                    const hasStudioRoles = member.roles.cache.some((role) => isStudioOrLegacyRole(role.name));
                    if (hasStudioRoles) {
                        totalUsersChecked++;
                        try {
                            const result = await syncMemberStudioRoles(
                                member,
                                Role.Member,
                                [],
                                trigger === "scheduled" ? "Scheduled role reconciliation (unregistered)" : "Manual role sync (unregistered)"
                            );
                            if (result.modified) {
                                driftedMembersSynced++;
                                await sleep(mutationPacingDelayMs);
                            }
                        } catch (memberErr: unknown) {
                            this.logger.warn(
                                { err: memberErr, discordId: member.id },
                                "failed to strip studio roles from unregistered member"
                            );
                            errors.push(`Failed to sync unregistered member <@${member.id}>`);
                        }
                    }
                }
            }
        } catch (apiErr: unknown) {
            this.logger.error({ err: apiErr }, "failed to fetch user list for role reconciliation");
            errors.push("Failed to fetch registered users from platform API");
        }

        const durationMs = Date.now() - start;
        const summary: ReconciliationSummary = {
            reorderedRoles,
            totalUsersChecked,
            driftedMembersSynced,
            errors,
            durationMs
        };

        if (trigger === "scheduled") {
            await this.dispatchScheduledReport(guild, summary);
        }

        return summary;
    }

    private async dispatchScheduledReport(guild: Guild, summary: ReconciliationSummary): Promise<void> {
        const hasDriftOrChanges = summary.reorderedRoles > 0 || summary.driftedMembersSynced > 0 || summary.errors.length > 0;
        if (!hasDriftOrChanges) {
            this.logger.info(
                { totalUsersChecked: summary.totalUsersChecked, durationMs: summary.durationMs },
                "scheduled role reconciliation clean, no drift detected"
            );
            return;
        }

        const channelId = this.settings.channel(ChannelPurpose.Telemetry);
        if (channelId === undefined) {
            return;
        }

        const channel = await this.client.channels.fetch(channelId).catch(() => null);
        if (channel === null || !channel.isSendable() || channel.isDMBased() || channel.guildId !== guild.id) {
            return;
        }

        const lines = [
            "## 🔄 Weekly Role Reconciliation Summary",
            `• Positioned **${summary.reorderedRoles}** studio roles by hierarchy.`,
            `• Checked **${summary.totalUsersChecked}** registered users, reconciled **${summary.driftedMembersSynced}** drifted ${pluralize(summary.driftedMembersSynced, "member")}.`,
            summary.errors.length > 0 ? `⚠️ **${summary.errors.length}** error(s) encountered during sync.` : null,
            `*Duration: ${(summary.durationMs / 1000).toFixed(1)}s*`
        ].filter((line): line is string => line !== null);

        const accent = summary.errors.length > 0 ? Accent.Danger : summary.driftedMembersSynced > 0 ? Accent.Warning : Accent.Success;
        await (channel as SendableChannels).send(message(panel(accent, lines.join("\n")))).catch((err: unknown) => {
            this.logger.warn({ err }, "failed to post scheduled reconciliation report to telemetry channel");
        });
    }
}
