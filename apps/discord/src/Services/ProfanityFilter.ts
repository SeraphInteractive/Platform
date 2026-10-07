import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    type Client,
    type Message,
    type PartialMessage,
    PermissionFlagsBits,
    type SendableChannels
} from "discord.js";
import type { Logger } from "pino";
import { Accent, message, panel, plain } from "../Discord/Ui.js";
import { ChannelPurpose, type SettingsStore } from "../State/SettingsStore.js";
import { type InfractionPenalty, type WarningStore } from "../State/WarningStore.js";
import { isLeadership, studioRoles } from "./StudioRoles.js";

// word boundaries and exact root patterns for banned profanity & slurs
const profanityPatterns: readonly RegExp[] = Object.freeze([
    // f-word variants
    /\bf+[u_*\-.\s04]+c+k+(?:e+r+|i+n+g+|s+|e+d+|a+|y+)?\b/iu,
    /\bm+o+t+h+e+r+f+[u_*\-.\s04]+c+k+(?:e+r+|i+n+g+|s+|e+d+)?\b/iu,
    /\bf+u+q+\b/iu,
    /\bf+k+n+\b/iu,
    // s-word variants
    /\bs+[h_*\-.\s]+i+t+(?:t+e+r+|t+y+|s+|e+d+|i+n+g+|h+e+a+d+)?\b/iu,
    /\bb+u+l+l+s+[h_*\-.\s]+i+t+\b/iu,
    /\bd+i+p+s+[h_*\-.\s]+i+t+\b/iu,
    // b-word variants
    /\bb+[i1!|*_.\-\s]+t+c+h+(?:e+s+|i+n+g+|y+)?\b/iu,
    /\bb+a+s+t+a+r+d+(?:s+)?\b/iu,
    // a-word variants (ensuring word boundaries to avoid assassin/pass/classic)
    /\ba+s+s+h+o+l+e+(?:s+)?\b/iu,
    /\bd+u+m+b+a+s+s+(?:es+)?\b/iu,
    /\bj+a+c+k+a+s+s+(?:es+)?\b/iu,
    /\b(a+s+s+e+s|a+s+s+w+i+p+e|a+s+s+h+a+t)\b/iu,
    // explicit slurs and severe derogatory terms
    /\bn+[i1!|]+g+g+([e3a4]|e+r+)(?:s+)?\b/iu,
    /\bn+[i1!|]+g+a+(?:s+)?\b/iu,
    /\bf+[a4]+g+[o0]+t+(?:s+)?\b/iu,
    /\bf+[a4]+g+(?:s+)?\b/iu,
    /\bc+[u_*\-.\s04]+n+t+(?:s+)?\b/iu,
    /\br+e+t+a+r+d+(?:e+d+|s+)?\b/iu,
    /\bt+r+a+n+n+y+\b/iu,
    /\bk+y+s+\b/iu,
    /\bk+i+l+l+\s+y+o+u+r+s+e+l+f+\b/iu,
    // c-word / d-word / p-word explicit sexual insults
    /\bd+[i1!|]+c+k+h+e+a+d+(?:s+)?\b/iu,
    /\bp+[u_*\-.\s]+s+s+y+(?:i+e+s+)?\b/iu,
    /\bw+h+[o0]+r+e+(?:s+)?\b/iu,
    /\bs+l+[u_*\-.\s04]+t+(?:s+)?\b/iu
]);

export function normalizeContent(raw: string): string {
    let normalized = raw
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/gu, "") // strip combining accents
        .replace(/[\u200B-\u200D\uFEFF]/gu, "") // strip zero-width chars
        .replace(/[@4]/gu, "a")
        .replace(/[3€]/gu, "e")
        .replace(/[1!|]/gu, "i")
        .replace(/[0]/gu, "o")
        .replace(/[$5]/gu, "s")
        .replace(/[7+]/gu, "t")
        .replace(/[8]/gu, "b");

    // collapse single-letter spaced or punctuated obfuscations: "f u c k you" -> "fuck you", "f.u.c.k" -> "fuck"
    for (let i = 0; i < 5; i++) {
        const next = normalized.replace(/\b([a-z0-9])[\s_.*-]+(?=[a-z0-9]\b)/gi, "$1");
        if (next === normalized) {
            break;
        }
        normalized = next;
    }

    return normalized;
}

export function detectProfanity(content: string): { matched: boolean; terms: string[] } {
    if (!content || content.trim().length === 0) {
        return { matched: false, terms: [] };
    }

    const matchedTerms = new Set<string>();
    const normalized = normalizeContent(content);

    // check direct patterns on raw content and normalized content
    for (const pattern of profanityPatterns) {
        const rawMatch = content.match(pattern);
        if (rawMatch !== null) {
            matchedTerms.add(rawMatch[0].toLowerCase());
        }
        const normMatch = normalized.match(pattern);
        if (normMatch !== null) {
            matchedTerms.add(normMatch[0].toLowerCase());
        }
    }

    // also check collapsed spaced text (e.g. "f u c k" -> "fuck")
    const collapsed = normalized.replace(/\s+/gu, "");
    for (const pattern of profanityPatterns) {
        const match = collapsed.match(pattern);
        if (match !== null) {
            matchedTerms.add(match[0].toLowerCase());
        }
    }

    return {
        matched: matchedTerms.size > 0,
        terms: Array.from(matchedTerms)
    };
}

export class ProfanityFilter {
    public constructor(
        private readonly client: Client,
        private readonly guildId: string,
        private readonly settings: SettingsStore,
        private readonly warningStore: WarningStore,
        private readonly logger: Logger
    ) {}

    public async inspectMessage(messageInstance: Message | PartialMessage): Promise<void> {
        if (
            messageInstance.author === null ||
            messageInstance.author?.bot ||
            messageInstance.guildId !== this.guildId ||
            !messageInstance.content
        ) {
            return;
        }

        // bypass check for staff / leadership roles
        const member = messageInstance.member ?? (await messageInstance.guild?.members.fetch(messageInstance.author.id).catch(() => null));
        if (member !== null && member !== undefined) {
            if (member.permissions.has(PermissionFlagsBits.Administrator)) {
                return;
            }
            const isStaff = member.roles.cache.some((role) => {
                const studio = studioRoles.find((r) => r.name === role.name);
                return studio !== undefined && isLeadership(studio.tier);
            });
            if (isStaff) {
                return;
            }
        }

        const check = detectProfanity(messageInstance.content);
        if (!check.matched) {
            return;
        }

        const author = messageInstance.author;
        const channel = messageInstance.channel;
        const snippet = plain(messageInstance.content, 250);

        // delete offending message immediately
        await messageInstance.delete().catch((err) => {
            this.logger.warn({ err, messageId: messageInstance.id }, "failed to delete profanity message");
        });

        // record warning and compute progressive penalty tier
        const penalty: InfractionPenalty = this.warningStore.addWarning(
            author.id,
            `Profanity detected: ${check.terms.join(", ")}`,
            channel.id,
            snippet
        );

        this.logger.info(
            {
                userId: author.id,
                channelId: channel.id,
                penaltyType: penalty.type,
                terms: check.terms
            },
            "profanity detected by automod"
        );

        switch (penalty.type) {
            case "warning": {
                const stageLabel = penalty.offenceLevel === 0 ? "1st offence stage" : "2nd offence stage";
                await author
                    .send(
                        message(
                            panel(
                                Accent.Warning,
                                `⚠️ **Warning: Inappropriate Language (${penalty.current}/${penalty.max})**`,
                                `Your message in <#${channel.id}> was removed by AutoMod for prohibited language.\n\n` +
                                    `**Removed content:**\n> ${snippet}\n\n` +
                                    `*Current progress:* **${penalty.current}/${penalty.max} warnings** (${stageLabel}).\n` +
                                    `Please keep discussions respectful and PG-13 in accordance with our [Discord Rules](https://dev-api.seraphinteractive.com/rules).`
                            )
                        )
                    )
                    .catch(() => undefined);

                await this.logToModChannel(
                    Accent.Warning,
                    `⚠️ **AutoMod Warning (${penalty.current}/${penalty.max})**`,
                    `**User:** <@${author.id}> (${plain(author.tag ?? author.username)})\n` +
                        `**Channel:** <#${channel.id}>\n` +
                        `**Warning count:** **${penalty.current}/${penalty.max}** (${stageLabel})\n` +
                        `**Matched terms:** \`${check.terms.join("`, `")}\`\n` +
                        `**Message snippet:**\n> ${snippet}`
                );
                return;
            }

            case "first_offence_24h": {
                if (member !== null && member !== undefined) {
                    await member.timeout(penalty.durationMs, "1st offence: 5 profanity warnings reached (24h timeout)").catch((err) => {
                        this.logger.error({ err, userId: author.id }, "failed to apply 24h timeout");
                    });
                }

                await author
                    .send(
                        message(
                            panel(
                                Accent.Danger,
                                `🚨 **1st Offence: You have been timed out for 24 hours**`,
                                `You have reached **5 warnings** for prohibited language in Project Stairway.\n\n` +
                                    `**Violation snippet:**\n> ${snippet}\n\n` +
                                    `*Next penalty:* 3 more warnings will trigger a **1-week timeout (2nd offence)**.\n` +
                                    `Please review our [Discord Rules](https://dev-api.seraphinteractive.com/rules) before returning to chat.`
                            )
                        )
                    )
                    .catch(() => undefined);

                await this.logToModChannel(
                    Accent.Danger,
                    `🚨 **1st Offence: 24-Hour Timeout Applied**`,
                    `**User:** <@${author.id}> (${plain(author.tag ?? author.username)})\n` +
                        `**Channel:** <#${channel.id}>\n` +
                        `**Status:** Reached 5 warnings (24h timeout executed)\n` +
                        `**Next stage:** 3 warnings to 1-week timeout (2nd offence)\n` +
                        `**Matched terms:** \`${check.terms.join("`, `")}\`\n` +
                        `**Message snippet:**\n> ${snippet}`
                );
                return;
            }

            case "second_offence_1w": {
                if (member !== null && member !== undefined) {
                    await member.timeout(penalty.durationMs, "2nd offence: 3 additional warnings reached (1-week timeout)").catch((err) => {
                        this.logger.error({ err, userId: author.id }, "failed to apply 1-week timeout");
                    });
                }

                await author
                    .send(
                        message(
                            panel(
                                Accent.Danger,
                                `🚨 **2nd Offence: You have been timed out for 1 WEEK**`,
                                `You have reached **3 additional warnings** after your previous timeout.\n\n` +
                                    `**Violation snippet:**\n> ${snippet}\n\n` +
                                    `⚠️ **FINAL WARNING:** 1 more violation will result in a **1-MONTH SERVER BAN**.\n` +
                                    `Please review our [Discord Rules](https://dev-api.seraphinteractive.com/rules).`
                            )
                        )
                    )
                    .catch(() => undefined);

                await this.logToModChannel(
                    Accent.Danger,
                    `🚨 **2nd Offence: 1-Week Timeout Applied**`,
                    `**User:** <@${author.id}> (${plain(author.tag ?? author.username)})\n` +
                        `**Channel:** <#${channel.id}>\n` +
                        `**Status:** Reached 2nd offence (1-week timeout executed)\n` +
                        `**Next stage:** 1 warning to 1-month server ban (3rd offence)\n` +
                        `**Matched terms:** \`${check.terms.join("`, `")}\`\n` +
                        `**Message snippet:**\n> ${snippet}`
                );
                return;
            }

            case "third_offence_ban": {
                const guild = this.client.guilds.cache.get(this.guildId) ?? (await this.client.guilds.fetch(this.guildId).catch(() => null));

                const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
                    new ButtonBuilder()
                        .setCustomId("apology_request")
                        .setLabel("Request Ban Apology Review")
                        .setStyle(ButtonStyle.Primary)
                );

                // send DM with apology review request button before banning
                await author
                    .send({
                        content:
                            `🚨 **3rd Offence: You have been banned from Project Stairway**\n\n` +
                            `You have accumulated repeated profanity violations after multiple timeouts.\n` +
                            `**Violation snippet:**\n> ${snippet}\n\n` +
                            `Only banned members who submit a sincere apology may be reviewed by leadership for unbanning.\n` +
                            `Use the **/ban-apology** command or click the button below to submit your apology for supervisor review:`,
                        components: [row]
                    })
                    .catch(() => undefined);

                if (guild !== null) {
                    await guild.members
                        .ban(author.id, {
                            reason: "3rd offence: Repeated profanity infractions (1-month ban policy)"
                        })
                        .catch((err) => {
                            this.logger.error({ err, userId: author.id }, "failed to ban member on 3rd offence");
                        });
                }

                await this.logToModChannel(
                    Accent.Danger,
                    `🔨 **3rd Offence: User Banned from Server**`,
                    `**User:** <@${author.id}> (${plain(author.tag ?? author.username)})\n` +
                        `**Channel:** <#${channel.id}>\n` +
                        `**Status:** Reached 3rd offence (Server ban executed)\n` +
                        `**Apology status:** Eligible to submit a Ban Apology Review\n` +
                        `**Matched terms:** \`${check.terms.join("`, `")}\`\n` +
                        `**Message snippet:**\n> ${snippet}`
                );
                return;
            }
        }
    }

    private async logToModChannel(accent: Accent, title: string, body: string): Promise<void> {
        const modChannelId = this.settings.channel(ChannelPurpose.ModerationLogs);
        if (modChannelId === undefined) {
            return;
        }
        const ch = await this.client.channels.fetch(modChannelId).catch(() => null);
        if (ch !== null && ch.isSendable() && !ch.isDMBased()) {
            await (ch as SendableChannels).send(message(panel(accent, title, body))).catch((err) => {
                this.logger.warn({ err }, "failed to post to moderation-logs channel");
            });
        }
    }
}
