import { randomBytes } from "node:crypto";
import { DifficultyTier, ReviewDecision, Role, ShotStatus, type ShotDetailDto } from "@platform/contracts";
import {
    ChannelType,
    LabelBuilder,
    MessageFlags,
    ModalBuilder,
    SlashCommandBuilder,
    TextInputBuilder,
    TextInputStyle,
    type ButtonInteraction,
    type ChatInputCommandInteraction,
    type ModalSubmitInteraction
} from "discord.js";
import { Accent, asEdit, buttons, capitalize, divider, ephemeral, linkButton, panel, plain, pluralize, text, when } from "../Discord/Ui.js";
import { referenceOf } from "../Services/TaskForum.js";
import {
    claimButtonPrefix,
    deliverableLinks,
    deliverablesButtonPrefix,
    reviewButtonPrefix,
    reviewOutcome
} from "../Views/TaskViews.js";
import {
    actingAs,
    hasAtLeast,
    requirePlatformRole,
    UserFacingError,
    type BotContext,
    type ComponentHandler,
    type ComponentInteraction,
    type SlashCommand
} from "./Command.js";

const reviewModalPrefix = "review-modal";
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

async function resolveShotTarget(
    interaction: ChatInputCommandInteraction,
    context: BotContext,
    taskOption?: string | null
): Promise<ShotDetailDto> {
    const raw = taskOption?.trim();
    if (raw) {
        if (uuidPattern.test(raw)) {
            return context.api.getShot(raw);
        }
        const all = await context.api.listAllShots();
        const match = all.find((s) => s.shotCode.toLowerCase() === raw.toLowerCase() || s.id === raw);
        if (!match) {
            throw new UserFacingError(`No task found matching "${raw}".`);
        }
        return context.api.getShot(match.id);
    }
    const channel = interaction.channel;
    const inForum = channel !== null && channel.isThread() && channel.parent?.type === ChannelType.GuildForum;
    const shotId = inForum ? await context.forum.resolveShotFor(channel.id) : undefined;
    if (shotId === undefined) {
        throw new UserFacingError("Specify a task code (e.g. /take-task task:SC01_A1B2) or run this inside a task post.");
    }
    return context.api.getShot(shotId);
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
        await requirePlatformRole(interaction, context, Role.Supervisor);
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
    definition: new SlashCommandBuilder()
        .setName("take-task")
        .setDescription("Claim the task in this post or by code")
        .addStringOption((option) =>
            option.setName("task").setDescription("Task code (e.g. SC01_A1B2), defaults to current post").setMaxLength(50)
        )
        .toJSON(),
    async execute(interaction: ChatInputCommandInteraction, context: BotContext): Promise<void> {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const target = await resolveShotTarget(interaction, context, interaction.options.getString("task"));
        if (target.status !== ShotStatus.Available) {
            throw new UserFacingError(`Task ${target.shotCode} is ${target.status} and cannot be claimed.`);
        }
        const shot = await actingAs(interaction, context).claimShot(target.id);
        const due = shot.deadlineAt === null ? "" : ` It's due ${when(shot.deadlineAt)}.`;
        await interaction.editReply(asEdit(ephemeral(panel(null, `It's yours.${due} Use /submit-task here when you're done.`))));
    }
};

export const releaseTaskCommand: SlashCommand = {
    definition: new SlashCommandBuilder()
        .setName("release-task")
        .setDescription("Give up your claim on the task in this post or by code")
        .addStringOption((option) =>
            option.setName("task").setDescription("Task code (e.g. SC01_A1B2), defaults to current post").setMaxLength(50)
        )
        .addStringOption((option) => option.setName("reason").setDescription("Optional note for the team").setMaxLength(500))
        .toJSON(),
    async execute(interaction: ChatInputCommandInteraction, context: BotContext): Promise<void> {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const shot = await resolveShotTarget(interaction, context, interaction.options.getString("task"));
        if (shot.status === ShotStatus.Approved) {
            throw new UserFacingError("This task is already completed and cannot be released.");
        }
        if (shot.status !== ShotStatus.Claimed) {
            throw new UserFacingError("Only claimed tasks can be released.");
        }
        const me = await actingAs(interaction, context).me();
        const isStaff = hasAtLeast(me.role, Role.Supervisor);
        const isClaimant = shot.claimer?.id === me.id;
        if (!isStaff && !isClaimant) {
            throw new UserFacingError("Only the task claimant, department supervisors, or admins can release this task.");
        }
        await actingAs(interaction, context).releaseShot(shot.id, interaction.options.getString("reason")?.trim() ?? null);
        await interaction.editReply(asEdit(ephemeral(panel(null, `Released ${shot.shotCode}. The task is open for someone else.`))));
    }
};

export const submitTaskCommand: SlashCommand = {
    definition: new SlashCommandBuilder()
        .setName("submit-task")
        .setDescription("Submit deliverables for the task in this post or by code via Grab-Box UI")
        .addStringOption((option) =>
            option.setName("task").setDescription("Task code (e.g. SC01_A1B2), defaults to current post").setMaxLength(50)
        )
        .toJSON(),
    async execute(interaction: ChatInputCommandInteraction, context: BotContext): Promise<void> {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const shot = await resolveShotTarget(interaction, context, interaction.options.getString("task"));
        if (shot.status === ShotStatus.Approved) {
            throw new UserFacingError("This task is already completed.");
        }
        if (shot.status !== ShotStatus.Claimed) {
            throw new UserFacingError("Only claimed tasks can accept submissions.");
        }
        const me = await actingAs(interaction, context).me();
        const isStaff = hasAtLeast(me.role, Role.Supervisor);
        const isClaimant = shot.claimer?.id === me.id;
        if (!isStaff && !isClaimant) {
            throw new UserFacingError("Only the contributor who claimed this task can submit work for it.");
        }
        const grabboxUrl = `${context.configuration.webAppUrl}/grabbox?shotId=${shot.id}`;
        await interaction.editReply(
            asEdit(
                ephemeral(
                    panel(
                        Accent.Info,
                        `### Deliverable Submission: **${plain(shot.shotCode, 50)}**\n` +
                            `To prevent Discord file size limits and relay failures, submit full video renders and Blender project files directly through the Grab-Box UI.\n\n` +
                            `• **Task:** ${plain(shot.title, 100)}\n` +
                            `• **Status:** ${capitalize(shot.status)}\n` +
                            `• **Claimant:** <@${interaction.user.id}>`,
                        divider(),
                        buttons(linkButton("Open Grab-Box & Submit", grabboxUrl))
                    )
                )
            )
        );
    }
};

export const availableTasksCommand: SlashCommand = {
    definition: new SlashCommandBuilder()
        .setName("available-tasks")
        .setDescription("View all tasks currently available in the grab-box")
        .addStringOption((option) =>
            option
                .setName("difficulty")
                .setDescription("Filter by difficulty tier")
                .setRequired(false)
                .addChoices(
                    { name: "Easy (5 days)", value: DifficultyTier.Easy },
                    { name: "Medium (7 days)", value: DifficultyTier.Medium },
                    { name: "Hard (10 days)", value: DifficultyTier.Hard },
                    { name: "Complex (14 days)", value: DifficultyTier.Complex }
                )
        )
        .toJSON(),
    async execute(interaction: ChatInputCommandInteraction, context: BotContext): Promise<void> {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const difficulty = interaction.options.getString("difficulty") as DifficultyTier | null;
        const allShots = await context.api.listAllShots();
        const available = allShots.filter(
            (shot) => shot.status === ShotStatus.Available && (difficulty === null || shot.difficultyTier === difficulty)
        );

        if (available.length === 0) {
            await interaction.editReply(
                asEdit(
                    ephemeral(
                        panel(
                            null,
                            difficulty
                                ? `No available **${difficulty}** tasks in the grab-box right now.`
                                : "No available tasks in the grab-box right now."
                        )
                    )
                )
            );
            return;
        }

        const lines = available.slice(0, 15).map((shot) => {
            const threadId = context.forum.threadFor(shot.id);
            const destination = threadId !== undefined ? `<#${threadId}>` : `Scene ${shot.sceneNumber}`;
            return `• **${plain(shot.shotCode, 50)}** - ${plain(shot.title, 80)} (${capitalize(shot.difficultyTier)})\n  ↳ ${destination}`;
        });

        const overflow = available.length > 15 ? `\n\n-# …and ${available.length - 15} more available tasks.` : "";
        const body = `### Available Tasks (${available.length})\n${lines.join("\n")}${overflow}\n\n-# Use \`/take-task\` in a task post to claim it.`;
        await interaction.editReply(asEdit(ephemeral(panel(Accent.Info, body))));
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

export const claimTaskButtonHandler: ComponentHandler = {
    prefix: claimButtonPrefix,
    async handle(interaction: ComponentInteraction, context: BotContext): Promise<void> {
        if (!interaction.isButton()) {
            return;
        }
        const [, shotId] = interaction.customId.split(":");
        if (shotId === undefined || !uuidPattern.test(shotId)) {
            return;
        }
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const shot = await actingAs(interaction, context).claimShot(shotId);
        const due = shot.deadlineAt === null ? "" : ` It's due ${when(shot.deadlineAt)}.`;
        await interaction.editReply(asEdit(ephemeral(panel(null, `It's yours.${due} Use /submit-task here when you're done.`))));
    }
};
