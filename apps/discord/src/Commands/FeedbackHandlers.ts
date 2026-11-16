import {
    FeedbackQuestionKind,
    FeedbackSurveyStatus,
    ratingLabels,
    ratingScale,
    type FeedbackQuestionDto,
    type FeedbackSurveyDto
} from "@platform/contracts";
import {
    LabelBuilder,
    MessageFlags,
    ModalBuilder,
    StringSelectMenuBuilder,
    TextInputBuilder,
    TextInputStyle,
    type ButtonInteraction
} from "discord.js";
import { Accent, asEdit, ephemeral, notice, panel, truncate } from "../Discord/Ui.js";
import { feedbackAnswerPrefix, feedbackFormPrefix } from "../Views/FeedbackViews.js";
import { UserFacingError, type BotContext, type ComponentHandler, type ComponentInteraction } from "./Command.js";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

function surveyIdOf(customId: string): string | null {
    const [, id] = customId.split(":");
    return id !== undefined && uuidPattern.test(id) ? id : null;
}

function roleIdsOf(interaction: Pick<ButtonInteraction, "member">): string[] {
    const member = interaction.member;
    return member === null ? [] : Array.isArray(member.roles) ? [...member.roles] : [...member.roles.cache.keys()];
}

function question(input: FeedbackQuestionDto): LabelBuilder {
    const label = new LabelBuilder().setLabel(input.label);
    if (input.kind === FeedbackQuestionKind.Rating) {
        return label.setStringSelectMenuComponent(
            new StringSelectMenuBuilder()
                .setCustomId(input.id)
                .setPlaceholder("Pick a rating")
                .setRequired(input.required)
                .setMinValues(input.required ? 1 : 0)
                .setMaxValues(1)
                .addOptions(
                    [...ratingScale].reverse().map((score) => ({ label: `${score} | ${ratingLabels[score] ?? ""}`, value: String(score) }))
                )
        );
    }
    return label.setTextInputComponent(
        new TextInputBuilder().setCustomId(input.id).setStyle(TextInputStyle.Paragraph).setRequired(input.required).setMaxLength(1000)
    );
}

function form(survey: FeedbackSurveyDto): ModalBuilder {
    return new ModalBuilder()
        .setCustomId(`${feedbackFormPrefix}:${survey.id}`)
        .setTitle(truncate(`Check-in | ${survey.title}`, 45))
        .addLabelComponents(...survey.questions.slice(0, 5).map(question));
}

function assertCanAnswer(survey: FeedbackSurveyDto, userId: string, roleIds: readonly string[]): void {
    if (survey.status !== FeedbackSurveyStatus.Open || new Date(survey.closesAt).getTime() <= Date.now()) {
        throw new UserFacingError("This check-in has closed.");
    }
    if (survey.supervisor.discordId === userId) {
        throw new UserFacingError("This check-in is for your crew, so you cannot answer it.");
    }
    if (survey.crewRoleIds.length > 0 && !survey.crewRoleIds.some((roleId) => roleIds.includes(roleId))) {
        throw new UserFacingError("This check-in is only for this department's crew.");
    }
}

export const feedbackAnswerHandler: ComponentHandler = {
    prefix: feedbackAnswerPrefix,
    async handle(interaction: ComponentInteraction, context: BotContext): Promise<void> {
        const surveyId = surveyIdOf(interaction.customId);
        if (!interaction.isButton() || surveyId === null) {
            return;
        }
        const survey = await context.api.getFeedbackSurvey(surveyId);
        try {
            assertCanAnswer(survey, interaction.user.id, roleIdsOf(interaction));
        } catch (error: unknown) {
            if (error instanceof UserFacingError) {
                await interaction.reply(notice(error.message, Accent.Warning));
                return;
            }
            throw error;
        }
        await interaction.showModal(form(survey));
    }
};

export const feedbackFormHandler: ComponentHandler = {
    prefix: feedbackFormPrefix,
    async handle(interaction: ComponentInteraction, context: BotContext): Promise<void> {
        const surveyId = surveyIdOf(interaction.customId);
        if (!interaction.isModalSubmit() || surveyId === null) {
            return;
        }
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const survey = await context.api.getFeedbackSurvey(surveyId);
        assertCanAnswer(survey, interaction.user.id, roleIdsOf(interaction));
        const answers = survey.questions.flatMap((item) => {
            if (!interaction.fields.fields.has(item.id)) {
                return [];
            }
            const value =
                item.kind === FeedbackQuestionKind.Rating
                    ? (interaction.fields.getStringSelectValues(item.id)[0] ?? "")
                    : interaction.fields.getTextInputValue(item.id).trim();
            return value.length === 0 ? [] : [{ questionId: item.id, value }];
        });
        const result = await context.api.recordFeedbackResponse(surveyId, {
            respondent: {
                discordId: interaction.user.id,
                username: (interaction.user.globalName ?? interaction.user.username).slice(0, 64)
            },
            answers
        });
        const lead = result.updated ? "Your answers were updated." : "Thanks, your answers were recorded.";
        await interaction.editReply(
            asEdit(
                ephemeral(
                    panel(
                        Accent.Success,
                        `${lead}\n-# They are anonymous and only project leadership reads them. Answer again any time before the check-in closes to change them.`
                    )
                )
            )
        );
    }
};
