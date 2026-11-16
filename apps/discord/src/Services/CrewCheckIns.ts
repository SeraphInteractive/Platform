import type { FeedbackSurveyDto } from "@platform/contracts";
import { PermissionFlagsBits, type Client, type GuildBasedChannel, type SendableChannels } from "discord.js";
import type { Logger } from "pino";
import type { PlatformApiClient } from "../Api/PlatformApiClient.js";
import { checkInMessage, outcomeMessage } from "../Views/FeedbackViews.js";

export class CrewCheckIns {
    public constructor(
        private readonly client: Client,
        private readonly guildId: string,
        private readonly api: PlatformApiClient,
        private readonly logger: Logger
    ) {}

    public async start(): Promise<void> {
        try {
            for (const survey of await this.api.openFeedbackSurveys()) {
                if (survey.messageId === null) {
                    await this.post(survey);
                }
            }
        } catch (error: unknown) {
            this.logger.warn({ err: error }, "failed to post pending crew check-ins");
        }
    }

    public async opened(surveyId: string): Promise<void> {
        const survey = await this.load(surveyId);
        if (survey !== null && survey.messageId === null) {
            await this.post(survey);
        }
    }

    public async closed(surveyId: string): Promise<void> {
        const survey = await this.load(surveyId);
        if (survey === null || survey.channelId === null || survey.messageId === null) {
            return;
        }
        const channel = await this.sendable(survey.channelId);
        const posted = await channel?.messages.fetch(survey.messageId).catch(() => null);
        if (posted === null || posted === undefined) {
            return;
        }
        const payload = checkInMessage(survey, false);
        await posted
            .edit({ components: payload.components, flags: payload.flags, allowedMentions: { parse: [] } })
            .catch((error: unknown) => {
                this.logger.warn({ err: error, survey: surveyId }, "failed to mark a crew check-in closed");
            });
    }

    public async outcome(surveyId: string): Promise<void> {
        const survey = await this.load(surveyId);
        const payload = survey === null ? null : outcomeMessage(survey);
        if (survey === null || payload === null) {
            return;
        }
        const supervisor = await this.client.users.fetch(survey.supervisor.discordId).catch(() => null);
        await supervisor?.send(payload).catch((error: unknown) => {
            this.logger.warn({ err: error, survey: surveyId }, "could not DM a supervisor their check-in outcome");
        });
    }

    private async post(survey: FeedbackSurveyDto): Promise<void> {
        const channel = await this.sendable(survey.channelId);
        if (channel === null) {
            this.logger.warn(
                { survey: survey.id, channel: survey.channelId },
                "a crew check-in channel is missing or the bot cannot post there"
            );
            return;
        }
        const posted = await channel.send(checkInMessage(survey, true));
        await this.api.bindFeedbackSurvey(survey.id, posted.id);
    }

    private async load(surveyId: string): Promise<FeedbackSurveyDto | null> {
        return this.api.getFeedbackSurvey(surveyId).catch((error: unknown) => {
            this.logger.warn({ err: error, survey: surveyId }, "failed to load a crew check-in");
            return null;
        });
    }

    private async sendable(channelId: string | null): Promise<(SendableChannels & GuildBasedChannel) | null> {
        if (channelId === null) {
            return null;
        }
        const channel = await this.client.channels.fetch(channelId).catch(() => null);
        if (channel === null || channel.isDMBased() || !channel.isSendable() || channel.guildId !== this.guildId) {
            return null;
        }
        const me = channel.guild.members.me;
        if (me !== null && !channel.permissionsFor(me).has(PermissionFlagsBits.SendMessages)) {
            return null;
        }
        return channel;
    }
}
