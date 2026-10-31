import { ApplicationStage, TicketQuestionStyle, TicketStatus, type TicketDto, type TicketQuestionDto } from "@platform/contracts";
import {
    LabelBuilder,
    MessageFlags,
    ModalBuilder,
    PermissionFlagsBits,
    SlashCommandBuilder,
    TextInputBuilder,
    TextInputStyle,
    type ButtonInteraction,
    type ChatInputCommandInteraction,
    type ModalSubmitInteraction,
    type StringSelectMenuInteraction,
    type User
} from "discord.js";
import { Accent, asEdit, ephemeral, notice, panel, plain, truncate } from "../Discord/Ui.js";
import { isPlatformConflict, type StaffSubject, type TicketPlacement } from "../Services/TicketDesk.js";
import {
    listingView,
    TicketAction,
    ticketActionPrefix,
    ticketApplyPrefix,
    ticketCategoryPrefix,
    ticketFormPrefix,
    ticketHubPrefix,
    ticketJoinPrefix,
    ticketNotePrefix,
    ticketTypePrefix,
    typePicker
} from "../Views/TicketViews.js";
import { UserFacingError, type BotContext, type ComponentHandler, type ComponentInteraction, type SlashCommand } from "./Command.js";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const noteInputId = "note";

type MemberSource = Pick<ButtonInteraction, "member" | "memberPermissions">;

function staffSubject(interaction: MemberSource): StaffSubject {
    const member = interaction.member;
    const roleIds = member === null ? [] : Array.isArray(member.roles) ? [...member.roles] : [...member.roles.cache.keys()];
    return { roleIds, isAdministrator: interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) === true };
}

function personOf(user: User): { discordId: string; username: string } {
    return { discordId: user.id, username: (user.globalName ?? user.username).slice(0, 64) };
}

function isAction(value: string | undefined): value is TicketAction {
    return Object.values(TicketAction).includes(value as TicketAction);
}

async function requireStaff(context: BotContext, ticket: TicketDto, interaction: MemberSource): Promise<void> {
    if (!(await context.tickets.isStaff(ticket, staffSubject(interaction)))) {
        throw new UserFacingError("Only staff assigned to this kind of ticket can do that.");
    }
}

async function requireActor(
    context: BotContext,
    ticket: TicketDto,
    action: TicketAction,
    interaction: MemberSource & { readonly user: User }
): Promise<void> {
    if (action === TicketAction.Close && ticket.opener.discordId === interaction.user.id) {
        return;
    }
    await requireStaff(context, ticket, interaction);
}

function parseIds(customId: string): { action: TicketAction; ticketId: string } | null {
    const [, action, ticketId] = customId.split(":");
    return isAction(action) && ticketId !== undefined && uuidPattern.test(ticketId) ? { action, ticketId } : null;
}

function idAfterPrefix(customId: string): string | null {
    const [, id] = customId.split(":");
    return id !== undefined && uuidPattern.test(id) ? id : null;
}

function questionInput(question: TicketQuestionDto): LabelBuilder {
    const input = new TextInputBuilder()
        .setCustomId(question.id)
        .setStyle(question.style === TicketQuestionStyle.Paragraph ? TextInputStyle.Paragraph : TextInputStyle.Short)
        .setRequired(question.required)
        .setMaxLength(question.maxLength);
    if (question.minLength > 0) {
        input.setMinLength(question.minLength);
    }
    if (question.placeholder !== null && question.placeholder.length > 0) {
        input.setPlaceholder(question.placeholder);
    }
    return new LabelBuilder().setLabel(question.label).setTextInputComponent(input);
}

function ticketForm(placement: TicketPlacement): ModalBuilder {
    return new ModalBuilder()
        .setCustomId(`${ticketFormPrefix}:${placement.type.id}`)
        .setTitle(truncate(placement.type.name, 45))
        .addLabelComponents(...placement.type.questions.slice(0, 5).map(questionInput));
}

async function openTicket(
    interaction: ModalSubmitInteraction | ButtonInteraction | StringSelectMenuInteraction,
    context: BotContext,
    placement: TicketPlacement,
    answers: { questionId: string; value: string }[]
): Promise<string> {
    let ticket: TicketDto;
    try {
        ticket = await context.api.openTicket({ typeId: placement.type.id, opener: personOf(interaction.user), answers });
    } catch (error: unknown) {
        if (isPlatformConflict(error, "DUPLICATE_TICKET")) {
            const existing = await context.api.findOpenTicket(placement.type.id, interaction.user.id);
            const link = existing === null || existing.threadId === null ? "" : ` <#${existing.threadId}>`;
            throw new UserFacingError(`You already have an open ticket for ${plain(placement.type.name, 80)}.${link}`);
        }
        throw error;
    }
    try {
        ticket = await context.tickets.createThread(ticket, placement);
    } catch (error: unknown) {
        context.logger.error({ err: error, ticket: ticket.id }, "failed to create a ticket thread");
        await context.api
            .closeTicket(ticket.id, { actor: personOf(interaction.client.user), reason: "The ticket thread could not be created." })
            .catch(() => undefined);
        throw new UserFacingError("Your ticket could not be set up. Let staff know so they can check the ticket channels.");
    }
    try {
        ticket = await context.tickets.postStaffCard(ticket, placement);
    } catch (error: unknown) {
        context.logger.warn({ err: error, ticket: ticket.id }, "failed to notify staff about a ticket");
    }
    await context.tickets.logOpened(ticket);
    await context.tickets.notifyReceived(ticket);
    return `Your ticket is open: <#${ticket.threadId ?? ""}>`;
}

async function startTicket(
    interaction: ButtonInteraction | StringSelectMenuInteraction,
    context: BotContext,
    placement: TicketPlacement
): Promise<void> {
    if (placement.type.questions.length > 0) {
        await interaction.showModal(ticketForm(placement));
        return;
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const result = await openTicket(interaction, context, placement, []);
    await interaction.editReply(asEdit(ephemeral(panel(Accent.Success, result))));
}

async function showCategory(
    interaction: ButtonInteraction | StringSelectMenuInteraction,
    context: BotContext,
    categoryId: string
): Promise<void> {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const category = await context.tickets.category(categoryId);
    if (category === null || !category.isEnabled) {
        await interaction.editReply(asEdit(notice("This ticket category is not available any more.", Accent.Warning)));
        return;
    }
    await interaction.editReply(asEdit(typePicker(category)));
}

export const ticketCategoryHandler: ComponentHandler = {
    prefix: ticketCategoryPrefix,
    async handle(interaction: ComponentInteraction, context: BotContext): Promise<void> {
        const categoryId = idAfterPrefix(interaction.customId);
        if (interaction.isButton() && categoryId !== null) {
            await showCategory(interaction, context, categoryId);
        }
    }
};

export const ticketHubHandler: ComponentHandler = {
    prefix: ticketHubPrefix,
    async handle(interaction: ComponentInteraction, context: BotContext): Promise<void> {
        const categoryId = interaction.isStringSelectMenu() ? interaction.values[0] : undefined;
        if (interaction.isStringSelectMenu() && categoryId !== undefined && uuidPattern.test(categoryId)) {
            await showCategory(interaction, context, categoryId);
        }
    }
};

export const ticketTypeHandler: ComponentHandler = {
    prefix: ticketTypePrefix,
    async handle(interaction: ComponentInteraction, context: BotContext): Promise<void> {
        if (!interaction.isStringSelectMenu()) {
            return;
        }
        const typeId = interaction.values[0];
        if (typeId === undefined || !uuidPattern.test(typeId)) {
            return;
        }
        const placement = await context.tickets.placement(typeId, false);
        if (placement === null) {
            await interaction.reply(notice("That option is not available any more.", Accent.Warning));
            return;
        }
        if (placement.type.listing !== null) {
            await interaction.update(
                asEdit(listingView(placement.type, `${context.configuration.webAppUrl}/positions#${placement.type.id}`))
            );
            return;
        }
        await startTicket(interaction, context, placement);
    }
};

export const ticketApplyHandler: ComponentHandler = {
    prefix: ticketApplyPrefix,
    async handle(interaction: ComponentInteraction, context: BotContext): Promise<void> {
        const typeId = idAfterPrefix(interaction.customId);
        if (!interaction.isButton() || typeId === null) {
            return;
        }
        const placement = await context.tickets.placement(typeId, false);
        if (placement === null) {
            await interaction.reply(notice("That option is not available any more.", Accent.Warning));
            return;
        }
        await startTicket(interaction, context, placement);
    }
};

export const ticketFormHandler: ComponentHandler = {
    prefix: ticketFormPrefix,
    async handle(interaction: ComponentInteraction, context: BotContext): Promise<void> {
        const typeId = idAfterPrefix(interaction.customId);
        if (!interaction.isModalSubmit() || typeId === null) {
            return;
        }
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const placement = await context.tickets.placement(typeId);
        if (placement === null) {
            throw new UserFacingError("That option is not available any more.");
        }
        const answers = placement.type.questions.flatMap((question) => {
            const value = interaction.fields.fields.has(question.id) ? interaction.fields.getTextInputValue(question.id).trim() : "";
            return value.length === 0 ? [] : [{ questionId: question.id, value }];
        });
        const result = await openTicket(interaction, context, placement, answers);
        await interaction.editReply(asEdit(ephemeral(panel(Accent.Success, result))));
    }
};

export const ticketJoinHandler: ComponentHandler = {
    prefix: ticketJoinPrefix,
    async handle(interaction: ComponentInteraction, context: BotContext): Promise<void> {
        const ticketId = idAfterPrefix(interaction.customId);
        if (!interaction.isButton() || ticketId === null) {
            return;
        }
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const ticket = await context.api.getTicket(ticketId);
        await requireStaff(context, ticket, interaction);
        if (ticket.status === TicketStatus.Closed) {
            throw new UserFacingError("This ticket is closed.");
        }
        const thread = await context.tickets.thread(ticket);
        if (thread === null) {
            throw new UserFacingError("The thread for this ticket is gone.");
        }
        if (thread.archived === true) {
            await thread.setArchived(false, "Staff joined the ticket");
        }
        await thread.members.add(interaction.user.id);
        await interaction.editReply(asEdit(ephemeral(panel(Accent.Success, `You joined <#${thread.id}>.`))));
    }
};

function noteForm(action: TicketAction, ticket: TicketDto): ModalBuilder {
    const titles: Readonly<Record<TicketAction, string>> = {
        [TicketAction.Interview]: `Interview #${ticket.number}`,
        [TicketAction.Accept]: `Accept #${ticket.number}`,
        [TicketAction.Reject]: `Reject #${ticket.number}`,
        [TicketAction.Close]: `Close #${ticket.number}`,
        [TicketAction.Claim]: `Claim #${ticket.number}`
    };
    const label = action === TicketAction.Close ? "Reason (optional)" : "Note for the applicant (optional)";
    const input = new TextInputBuilder().setCustomId(noteInputId).setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(1000);
    return new ModalBuilder()
        .setCustomId(`${ticketNotePrefix}:${action}:${ticket.id}`)
        .setTitle(titles[action])
        .addLabelComponents(new LabelBuilder().setLabel(label).setTextInputComponent(input));
}

const stageOf: Readonly<Partial<Record<TicketAction, ApplicationStage.Interview | ApplicationStage.Accepted | ApplicationStage.Rejected>>> =
    {
        [TicketAction.Interview]: ApplicationStage.Interview,
        [TicketAction.Accept]: ApplicationStage.Accepted,
        [TicketAction.Reject]: ApplicationStage.Rejected
    };

async function perform(context: BotContext, ticket: TicketDto, action: TicketAction, user: User, note: string | null): Promise<string> {
    const actor = personOf(user);
    const stage = stageOf[action];
    if (stage !== undefined) {
        await context.api.setTicketStage(ticket.id, { stage, note, actor });
        return "Saved. The applicant has been told.";
    }
    if (action === TicketAction.Claim) {
        await context.api.assignTicket(ticket.id, { assignee: actor, actor });
        return `You are now handling #${ticket.number}.`;
    }
    await context.api.closeTicket(ticket.id, { reason: note, actor });
    return `Closed #${ticket.number}.`;
}

export const ticketActionHandler: ComponentHandler = {
    prefix: ticketActionPrefix,
    async handle(interaction: ComponentInteraction, context: BotContext): Promise<void> {
        const parsed = parseIds(interaction.customId);
        if (!interaction.isButton() || parsed === null) {
            return;
        }
        const ticket = await context.api.getTicket(parsed.ticketId);
        await requireActor(context, ticket, parsed.action, interaction);
        if (parsed.action === TicketAction.Interview || parsed.action === TicketAction.Claim) {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            const result = await perform(context, ticket, parsed.action, interaction.user, null);
            await interaction.editReply(asEdit(ephemeral(panel(Accent.Success, result))));
            return;
        }
        await interaction.showModal(noteForm(parsed.action, ticket));
    }
};

export const ticketNoteHandler: ComponentHandler = {
    prefix: ticketNotePrefix,
    async handle(interaction: ComponentInteraction, context: BotContext): Promise<void> {
        const parsed = parseIds(interaction.customId);
        if (!interaction.isModalSubmit() || parsed === null) {
            return;
        }
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const ticket = await context.api.getTicket(parsed.ticketId);
        await requireActor(context, ticket, parsed.action, interaction);
        const note = interaction.fields.getTextInputValue(noteInputId).trim();
        const result = await perform(context, ticket, parsed.action, interaction.user, note.length === 0 ? null : note);
        await interaction.editReply(asEdit(ephemeral(panel(Accent.Success, result))));
    }
};

async function ticketInChannel(interaction: ChatInputCommandInteraction, context: BotContext): Promise<TicketDto> {
    const channel = interaction.channel;
    if (channel === null || !channel.isThread()) {
        throw new UserFacingError("Run this inside a ticket thread.");
    }
    const ticket = await context.api.getTicketByThread(channel.id);
    if (ticket === null) {
        throw new UserFacingError("This thread is not a ticket.");
    }
    return ticket;
}

export const ticketCommand: SlashCommand = {
    definition: new SlashCommandBuilder()
        .setName("ticket")
        .setDescription("Work with tickets")
        .addSubcommand((subcommand) =>
            subcommand
                .setName("add")
                .setDescription("Add someone to the ticket in this thread")
                .addUserOption((option) => option.setName("member").setDescription("Who to add").setRequired(true))
        )
        .addSubcommand((subcommand) => subcommand.setName("claim").setDescription("Take the ticket in this thread"))
        .addSubcommand((subcommand) =>
            subcommand
                .setName("close")
                .setDescription("Close the ticket in this thread")
                .addStringOption((option) => option.setName("reason").setDescription("Why it is being closed").setMaxLength(1000))
        )
        .addSubcommand((subcommand) =>
            subcommand.setName("refresh").setDescription("Re-post the ticket hubs and resync channels, roles and members")
        )
        .toJSON(),
    async execute(interaction: ChatInputCommandInteraction, context: BotContext): Promise<void> {
        const subcommand = interaction.options.getSubcommand();
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const done = async (text: string): Promise<void> => {
            await interaction.editReply(asEdit(ephemeral(panel(Accent.Success, text))));
        };
        if (subcommand === "refresh") {
            if (interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) !== true || interaction.guild === null) {
                throw new UserFacingError("You need the Manage Server permission to do that.");
            }
            await context.tickets.syncDirectory(interaction.guild);
            await context.tickets.republish();
            await done("Ticket hubs refreshed.");
            return;
        }
        const ticket = await ticketInChannel(interaction, context);
        if (subcommand === "close") {
            await requireActor(context, ticket, TicketAction.Close, interaction);
            await done(
                await perform(
                    context,
                    ticket,
                    TicketAction.Close,
                    interaction.user,
                    interaction.options.getString("reason")?.trim() ?? null
                )
            );
            return;
        }
        await requireStaff(context, ticket, interaction);
        if (subcommand === "claim") {
            await done(await perform(context, ticket, TicketAction.Claim, interaction.user, null));
            return;
        }
        const member = interaction.options.getUser("member", true);
        await context.api.addTicketMember(ticket.id, { member: personOf(member), actor: personOf(interaction.user) });
        await done(`Adding <@${member.id}> to this ticket.`);
    }
};
