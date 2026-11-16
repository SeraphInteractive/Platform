import { FeedbackOutcome, FeedbackSurveyStatus, type FeedbackSurveyDto } from "@platform/contracts";
import { ButtonStyle, MessageFlags } from "discord.js";
import {
    Accent,
    actionButton,
    buttons,
    divider,
    message,
    panel,
    plain,
    pluralize,
    when,
    type Block,
    type TopLevelComponent,
    type V2Message
} from "../Discord/Ui.js";

export const feedbackAnswerPrefix = "fbk";
export const feedbackFormPrefix = "fbkform";

export interface CheckInPayload {
    readonly flags: number;
    readonly components: TopLevelComponent[];
    readonly allowedMentions: { readonly parse: []; readonly roles: string[] };
}

export function checkInMessage(survey: FeedbackSurveyDto, pingCrew: boolean): CheckInPayload {
    const isOpen = survey.status === FeedbackSurveyStatus.Open;
    const blocks: Block[] = [`## Crew check-in | ${plain(survey.title, 80)}`];
    if (survey.intro.trim().length > 0) {
        blocks.push(survey.intro.trim());
    }
    blocks.push(
        [
            `How is <@${survey.supervisor.discordId}> doing as your supervisor? This takes about a minute.`,
            "Answering is **optional and anonymous**. Only project leadership reads the answers, and they are never shared with your supervisor.",
            isOpen ? `-# Open until ${when(survey.closesAt, "f")}. You can change your answers until then.` : null
        ]
            .filter((line): line is string => line !== null)
            .join("\n")
    );
    if (!isOpen) {
        blocks.push(divider(), `-# This check-in has closed with ${pluralize(survey.responseCount, "response")}. Thank you.`);
    }
    if (pingCrew && isOpen && survey.crewRoleIds.length > 0) {
        blocks.push(`-# ${survey.crewRoleIds.map((id) => `<@&${id}>`).join(" ")}`);
    }
    blocks.push(
        buttons(
            actionButton(`${feedbackAnswerPrefix}:${survey.id}`, isOpen ? "Answer the check-in" : "Closed", ButtonStyle.Primary, !isOpen)
        )
    );
    return {
        flags: MessageFlags.IsComponentsV2,
        components: [panel(isOpen ? Accent.Info : Accent.Neutral, ...blocks)],
        allowedMentions: { parse: [], roles: pingCrew && isOpen ? [...survey.crewRoleIds] : [] }
    };
}

export function outcomeMessage(survey: FeedbackSurveyDto): V2Message | null {
    if (survey.outcomeMessage === null || survey.outcomeMessage.trim().length === 0) {
        return null;
    }
    const isMitigation = survey.outcome === FeedbackOutcome.Mitigation;
    return message(
        panel(
            isMitigation ? Accent.Warning : Accent.Success,
            isMitigation
                ? `**Next steps from project leadership | ${plain(survey.title, 80)}**`
                : `**A note from project leadership | ${plain(survey.title, 80)}**`,
            survey.outcomeMessage.trim(),
            isMitigation
                ? "-# These steps come from your crew's latest check-in. Individual answers stay private. Reach out to leadership with any questions."
                : "-# Based on your crew's latest check-in."
        )
    );
}
