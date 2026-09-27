import {
    DifficultyTier,
    NotificationType,
    ReviewDecision,
    type NotificationOf,
    type ShotDetailDto,
    type ShotReference
} from "@platform/contracts";
import { ButtonStyle } from "discord.js";
import {
    Accent,
    actionButton,
    buttons,
    capitalize,
    divider,
    ephemeral,
    image,
    linkButton,
    message,
    panel,
    person,
    plain,
    quote,
    when,
    type V2Message
} from "../Discord/Ui.js";

export const reviewButtonPrefix = "review";
export const deliverablesButtonPrefix = "deliverables";

const tierDays: Readonly<Record<DifficultyTier, number>> = {
    [DifficultyTier.Easy]: 5,
    [DifficultyTier.Medium]: 7,
    [DifficultyTier.Hard]: 10,
    [DifficultyTier.Complex]: 14
};

export function threadStarter(shot: ShotReference, description: string | null): V2Message {
    const details = `${capitalize(shot.difficulty)}, scene ${shot.sceneNumber}, ${tierDays[shot.difficulty]} days once claimed`;
    return message(
        panel(
            null,
            [
                `**${plain(shot.title, 200)}**`,
                `-# ${plain(shot.code, 50)}`,
                details,
                description === null ? null : plain(description, 1500),
                "-# Use /take-task in this post to claim it."
            ]
                .filter((line): line is string => line !== null)
                .join("\n")
        )
    );
}

export function threadUpdate(
    notification: NotificationOf<
        | NotificationType.ShotClaimed
        | NotificationType.ShotReleased
        | NotificationType.ShotExpired
        | NotificationType.SubmissionCreated
        | NotificationType.SubmissionReviewed
    >
): V2Message {
    switch (notification.type) {
        case NotificationType.ShotClaimed:
            return message(
                panel(
                    null,
                    `Claimed by ${person(notification.claimant)}. Due ${when(notification.deadlineAt, "f")} (${when(notification.deadlineAt)}).`
                )
            );
        case NotificationType.ShotReleased:
            return message(
                panel(
                    null,
                    [
                        `Released by ${person(notification.actor)}. The task is open again.`,
                        notification.reason === null ? null : quote(notification.reason, 500)
                    ]
                        .filter((line): line is string => line !== null)
                        .join("\n")
                )
            );
        case NotificationType.ShotExpired:
            return message(
                panel(
                    Accent.Warning,
                    notification.claimant === null
                        ? "The claim expired. The task is open again."
                        : `The claim by ${person(notification.claimant)} expired. The task is open again.`
                )
            );
        case NotificationType.SubmissionCreated:
            return message(
                panel(
                    null,
                    [
                        `${person(notification.contributor)} submitted version ${notification.version} for review.`,
                        notification.notes === null ? null : quote(notification.notes, 800)
                    ]
                        .filter((line): line is string => line !== null)
                        .join("\n"),
                    notification.videoUrl ? image(notification.videoUrl, `${notification.shot.code} v${notification.version}`) : null
                )
            );
        case NotificationType.SubmissionReviewed: {
            const approved = notification.decision === ReviewDecision.Approved;
            const headline = approved
                ? `Version ${notification.version} approved by ${person(notification.reviewer)}.`
                : `${person(notification.reviewer)} asked for changes to version ${notification.version}.`;
            const next = approved ? null : "-# Upload a new version with /submit-task when it's ready.";
            return message(
                panel(
                    approved ? Accent.Success : Accent.Warning,
                    [headline, notification.notes === null ? null : quote(notification.notes, 1000), next]
                        .filter((line): line is string => line !== null)
                        .join("\n"),
                    notification.videoUrl ? image(notification.videoUrl, `${notification.shot.code} v${notification.version}`) : null
                )
            );
        }
    }
}

export function reviewCard(notification: NotificationOf<NotificationType.SubmissionCreated>, threadId: string | undefined): V2Message {
    const lines = [
        `**${plain(notification.shot.code, 50)}, version ${notification.version}**`,
        plain(notification.shot.title, 200),
        `Submitted by ${person(notification.contributor)}${threadId === undefined ? "" : ` in <#${threadId}>`}`,
        notification.notes === null ? null : quote(notification.notes, 800)
    ].filter((line): line is string => line !== null);
    return message(
        panel(
            Accent.Info,
            lines.join("\n"),
            notification.videoUrl ? image(notification.videoUrl, `${notification.shot.code} v${notification.version}`) : null
        ),
        buttons(
            actionButton(`${reviewButtonPrefix}:${notification.submissionId}:${ReviewDecision.Approved}`, "Approve", ButtonStyle.Success),
            actionButton(
                `${reviewButtonPrefix}:${notification.submissionId}:${ReviewDecision.RevisionRequested}`,
                "Request changes",
                ButtonStyle.Secondary
            ),
            actionButton(
                `${deliverablesButtonPrefix}:${notification.shot.id}:${notification.submissionId}`,
                "Get files",
                ButtonStyle.Secondary
            )
        )
    );
}

export function reviewOutcome(decision: ReviewDecision, reviewerId: string): string {
    return `-# ${decision === ReviewDecision.Approved ? "Approved" : "Changes requested"} by <@${reviewerId}> ${when(new Date().toISOString())}`;
}

export function deliverableLinks(shot: ShotDetailDto, submissionId: string): V2Message {
    const submission = shot.submissions.find((item) => item.id === submissionId);
    if (submission?.videoUrl === undefined || submission.videoUrl === null) {
        return ephemeral(panel(null, "Those files aren't available to you."));
    }
    const links = [linkButton("Video", submission.videoUrl)];
    if (submission.blendUrl !== null) {
        links.push(linkButton("Blend file", submission.blendUrl));
    }
    return ephemeral(
        panel(
            null,
            `**${plain(shot.shotCode, 50)}, version ${submission.version}**\n-# Links expire in an hour.`,
            divider(),
            buttons(...links)
        )
    );
}
