import { randomBytes } from "node:crypto";
import { DeliverableKind, deliverableContentTypes, DifficultyTier, ReviewDecision, Role } from "@platform/contracts";
import {
    ChannelType,
    LabelBuilder,
    MessageFlags,
    ModalBuilder,
    SlashCommandBuilder,
    TextInputBuilder,
    TextInputStyle,
    type Attachment,
    type ButtonInteraction,
    type ChatInputCommandInteraction,
    type ModalSubmitInteraction
} from "discord.js";
import type { ActingApiClient } from "../Api/PlatformApiClient.js";
import { asEdit, ephemeral, panel, plain, pluralize, text, when } from "../Discord/Ui.js";
import { referenceOf } from "../Services/TaskForum.js";
import { deliverableLinks, deliverablesButtonPrefix, reviewButtonPrefix, reviewOutcome } from "../Views/TaskViews.js";
import {
    actingAs,
    requirePlatformRole,
    UserFacingError,
    type BotContext,
    type ComponentHandler,
    type ComponentInteraction,
    type SlashCommand
} from "./Command.js";

const reviewModalPrefix = "review-modal";
const maximumAttachmentBytes = 100 * 1024 * 1024;
const attachmentHosts = new Set(["cdn.discordapp.com", "media.discordapp.net"]);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

function shotInThread(interaction: ChatInputCommandInteraction, context: BotContext): string {
    const channel = interaction.channel;
    const inForum = channel !== null && channel.isThread() && channel.parent?.type === ChannelType.GuildForum;
    const shotId = inForum ? context.forum.shotFor(channel.id) : undefined;
    if (shotId === undefined) {
        throw new UserFacingError("Run this inside a task post in the task forum.");
    }
    return shotId;
}

async function uploadAttachment(api: ActingApiClient, shotId: string, attachment: Attachment, kind: DeliverableKind): Promise<string> {
    const url = new URL(attachment.url);
    if (url.protocol !== "https:" || !attachmentHosts.has(url.hostname)) {
        throw new UserFacingError("Attachments must be uploaded to Discord directly.");
    }
    if (attachment.size <= 0 || attachment.size > maximumAttachmentBytes) {
        throw new UserFacingError("That file is too large to relay through Discord. Upload it on the web app instead.");
    }
    const contentType = kind === DeliverableKind.Blend ? "application/octet-stream" : (attachment.contentType?.split(";")[0]?.trim() ?? "");
    if (!deliverableContentTypes[kind].includes(contentType)) {
        throw new UserFacingError(
            kind === DeliverableKind.Video ? "The video must be MP4, WebM or MOV." : "The project file must be a .blend file."
        );
    }

    const upload = await api.requestDeliverableUpload(shotId, { kind, fileName: attachment.name, contentType, sizeBytes: attachment.size });
    const download = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(120_000) });
    if (!download.ok) {
        throw new UserFacingError("Discord wouldn't hand over the attachment. Try uploading it again.");
    }
    const body = new Uint8Array(await download.arrayBuffer());
    if (body.byteLength !== attachment.size) {
        throw new UserFacingError("The attachment changed while it was being uploaded. Try again.");
    }
    const stored = await fetch(upload.url, {
        method: upload.method,
        headers: upload.headers,
        body,
        redirect: "error",
        signal: AbortSignal.timeout(300_000)
    });
    await stored.body?.cancel();
    if (!stored.ok) {
        throw new UserFacingError("Storage rejected the upload. Try again, or use the web app.");
    }
    return upload.key;
}

export const createTaskCommand: SlashCommand = {
    definition: new SlashCommandBuilder()
        .setName("create-task")
        .setDescription("Add a task to the grab-box (supervisors)")
        .addStringOption((option) => option.setName("title").setDescription("What the task is").setRequired(true).setMaxLength(200))
        .addIntegerOption((option) =>
            option.setName("scene").setDescription("Scene number").setRequired(true).setMinValue(1).setMaxValue(100_000)
        )
        .addStringOption((option) =>
            option
                .setName("difficulty")
                .setDescription("How big the task is")
                .setRequired(true)
                .addChoices(
                    { name: "Easy (5 days)", value: DifficultyTier.Easy },
                    { name: "Medium (7 days)", value: DifficultyTier.Medium },
                    { name: "Hard (10 days)", value: DifficultyTier.Hard },
                    { name: "Complex (14 days)", value: DifficultyTier.Complex }
                )
        )
        .addStringOption((option) => option.setName("code").setDescription("Shot code, generated if empty").setMaxLength(50))
        .addStringOption((option) => option.setName("description").setDescription("Details for whoever takes it").setMaxLength(1500))
        .addIntegerOption((option) =>
            option
                .setName("senior_hours")
                .setDescription("Hours reserved for senior contributors (hard tasks only)")
                .setMinValue(0)
                .setMaxValue(168)
        )
        .toJSON(),
    async execute(interaction: ChatInputCommandInteraction, context: BotContext): Promise<void> {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const scene = interaction.options.getInteger("scene", true);
        const code =
            interaction.options.getString("code")?.trim() ??
            `SC${String(scene).padStart(2, "0")}_${randomBytes(2).toString("hex").toUpperCase()}`;
        const shot = await actingAs(interaction, context).createShot({
            title: interaction.options.getString("title", true).trim(),
            sceneNumber: scene,
            shotCode: code,
            difficultyTier: interaction.options.getString("difficulty", true) as DifficultyTier,
            description: interaction.options.getString("description")?.trim() ?? null,
            seniorPriorityHours: interaction.options.getInteger("senior_hours") ?? 0
        });
        const threadId = await context.forum.ensureThread(referenceOf(shot), shot.description, shot.status);
        const where = threadId === null ? "Set up the task forum with /setup-forum to give it a post." : `Its post is <#${threadId}>.`;
        await interaction.editReply(asEdit(ephemeral(panel(null, `Created **${plain(shot.shotCode, 50)}**. ${where}`))));
    }
};

export const takeTaskCommand: SlashCommand = {
    definition: new SlashCommandBuilder().setName("take-task").setDescription("Claim the task in this post").toJSON(),
    async execute(interaction: ChatInputCommandInteraction, context: BotContext): Promise<void> {
        const shotId = shotInThread(interaction, context);
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const shot = await actingAs(interaction, context).claimShot(shotId);
        const due = shot.deadlineAt === null ? "" : ` It's due ${when(shot.deadlineAt)}.`;
        await interaction.editReply(asEdit(ephemeral(panel(null, `It's yours.${due} Use /submit-task here when you're done.`))));
    }
};

export const releaseTaskCommand: SlashCommand = {
    definition: new SlashCommandBuilder()
        .setName("release-task")
        .setDescription("Give up your claim on the task in this post")
        .addStringOption((option) => option.setName("reason").setDescription("Optional note for the team").setMaxLength(500))
        .toJSON(),
    async execute(interaction: ChatInputCommandInteraction, context: BotContext): Promise<void> {
        const shotId = shotInThread(interaction, context);
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        await actingAs(interaction, context).releaseShot(shotId, interaction.options.getString("reason"));
        await interaction.editReply(asEdit(ephemeral(panel(null, "Released. The task is open for someone else."))));
    }
};

export const submitTaskCommand: SlashCommand = {
    definition: new SlashCommandBuilder()
        .setName("submit-task")
        .setDescription("Submit your work on the task in this post")
        .addAttachmentOption((option) => option.setName("video").setDescription("Rendered video (MP4, WebM or MOV)").setRequired(true))
        .addAttachmentOption((option) => option.setName("blend").setDescription("Project file (.blend)"))
        .addStringOption((option) => option.setName("notes").setDescription("Anything the reviewer should know").setMaxLength(2000))
        .toJSON(),
    async execute(interaction: ChatInputCommandInteraction, context: BotContext): Promise<void> {
        const shotId = shotInThread(interaction, context);
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const api = actingAs(interaction, context);
        const videoKey = await uploadAttachment(api, shotId, interaction.options.getAttachment("video", true), DeliverableKind.Video);
        const blend = interaction.options.getAttachment("blend");
        const blendKey = blend === null ? null : await uploadAttachment(api, shotId, blend, DeliverableKind.Blend);
        const submission = await api.submitWork(shotId, {
            videoKey,
            blendKey,
            notes: interaction.options.getString("notes")?.trim() ?? null
        });
        await interaction.editReply(
            asEdit(ephemeral(panel(null, `Submitted version ${submission.version}. A supervisor will review it.`)))
        );
    }
};

export const syncTaskCommand: SlashCommand = {
    definition: new SlashCommandBuilder()
        .setName("sync-task")
        .setDescription("Bring the task forum in line with the platform (supervisors)")
        .toJSON(),
    async execute(interaction: ChatInputCommandInteraction, context: BotContext): Promise<void> {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        await requirePlatformRole(interaction, context, Role.Supervisor);
        const summary = await context.forum.sync(await context.api.listAllShots());
        const parts = [
            summary.created > 0 ? `created ${pluralize(summary.created, "post")}` : null,
            summary.updated > 0 ? `updated ${summary.updated}` : null,
            summary.removed > 0 ? `removed ${summary.removed} stale` : null,
            summary.failed > 0 ? `${summary.failed} failed, see logs` : null
        ].filter((part): part is string => part !== null);
        await interaction.editReply(
            asEdit(ephemeral(panel(null, parts.length === 0 ? "The forum is already up to date." : `Done: ${parts.join(", ")}.`)))
        );
    }
};

export const reviewButtonHandler: ComponentHandler = {
    prefix: reviewButtonPrefix,
    async handle(interaction: ComponentInteraction): Promise<void> {
        if (!interaction.isButton()) {
            return;
        }
        const button: ButtonInteraction = interaction;
        const [, submissionId, decision] = button.customId.split(":");
        if (
            submissionId === undefined ||
            !uuidPattern.test(submissionId) ||
            !Object.values(ReviewDecision).includes(decision as ReviewDecision)
        ) {
            return;
        }
        const approving = decision === ReviewDecision.Approved;
        const notes = new TextInputBuilder()
            .setCustomId("notes")
            .setStyle(TextInputStyle.Paragraph)
            .setMaxLength(2000)
            .setRequired(!approving)
            .setPlaceholder(approving ? "Optional" : "What needs to change?");
        await button.showModal(
            new ModalBuilder()
                .setCustomId(`${reviewModalPrefix}:${submissionId}:${decision}`)
                .setTitle(approving ? "Approve submission" : "Request changes")
                .addLabelComponents(
                    new LabelBuilder().setLabel(approving ? "Notes for the contributor" : "Feedback").setTextInputComponent(notes)
                )
        );
    }
};

export const reviewModalHandler: ComponentHandler = {
    prefix: reviewModalPrefix,
    async handle(interaction: ComponentInteraction, context: BotContext): Promise<void> {
        if (!interaction.isModalSubmit()) {
            return;
        }
        const modal: ModalSubmitInteraction = interaction;
        const [, submissionId, rawDecision] = modal.customId.split(":");
        const decision = rawDecision as ReviewDecision;
        if (submissionId === undefined || !uuidPattern.test(submissionId) || !Object.values(ReviewDecision).includes(decision)) {
            return;
        }
        const notes = modal.fields.getTextInputValue("notes").trim();
        await actingAs(modal, context).reviewSubmission(submissionId, decision, notes.length === 0 ? null : notes);
        if (modal.isFromMessage()) {
            const card = modal.message.components[0];
            await modal.update({
                components:
                    card === undefined
                        ? [text(reviewOutcome(decision, modal.user.id))]
                        : [card.toJSON(), text(reviewOutcome(decision, modal.user.id))],
                flags: MessageFlags.IsComponentsV2,
                allowedMentions: { parse: [] }
            });
            return;
        }
        await modal.reply(ephemeral(panel(null, "Review saved.")));
    }
};

export const deliverablesButtonHandler: ComponentHandler = {
    prefix: deliverablesButtonPrefix,
    async handle(interaction: ComponentInteraction, context: BotContext): Promise<void> {
        if (!interaction.isButton()) {
            return;
        }
        const [, shotId, submissionId] = interaction.customId.split(":");
        if (shotId === undefined || submissionId === undefined || !uuidPattern.test(shotId) || !uuidPattern.test(submissionId)) {
            return;
        }
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const shot = await actingAs(interaction, context).getShot(shotId);
        await interaction.editReply(asEdit(deliverableLinks(shot, submissionId)));
    }
};
