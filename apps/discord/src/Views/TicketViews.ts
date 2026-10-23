import {
    ApplicationStage,
    applicationStageLabels,
    TicketAvailability,
    ticketAvailabilityLabels,
    TicketHubStyle,
    TicketKind,
    TicketStatus,
    type TicketCategoryDto,
    type TicketDto,
    type TicketHubDto,
    type TicketListingDto,
    type TicketTypeDto
} from "@platform/contracts";
import {
    ActionRowBuilder,
    ButtonStyle,
    MessageFlags,
    StringSelectMenuBuilder,
    type APIMessageComponentEmoji,
    type ButtonBuilder,
    type MessageActionRowComponentBuilder
} from "discord.js";
import {
    Accent,
    actionButton,
    buttons,
    divider,
    ephemeral,
    linkButton,
    message,
    panel,
    plain,
    pluralize,
    quote,
    truncate,
    when,
    type Block,
    type TopLevelComponent,
    type V2Message
} from "../Discord/Ui.js";

export const ticketCategoryPrefix = "tkcat";
export const ticketHubPrefix = "tkhub";
export const ticketTypePrefix = "tktype";
export const ticketApplyPrefix = "tkapply";
export const ticketFormPrefix = "tkform";
export const ticketJoinPrefix = "tkjoin";
export const ticketActionPrefix = "tkact";
export const ticketNotePrefix = "tknote";

export enum TicketAction {
    Interview = "interview",
    Accept = "accept",
    Reject = "reject",
    Close = "close",
    Claim = "claim"
}

const customEmojiPattern = /^<(a?):(\w{2,32}):(\d{17,20})>$/u;
const pictographPattern = /\p{Extended_Pictographic}|\p{Regional_Indicator}/u;
const listingBudget = 3300;

export function componentEmoji(value: string | null): APIMessageComponentEmoji | undefined {
    if (value === null) {
        return undefined;
    }
    const custom = customEmojiPattern.exec(value);
    if (custom !== null) {
        return { id: custom[3], name: custom[2], animated: custom[1] === "a" };
    }
    return pictographPattern.test(value) && value.length <= 16 ? { name: value } : undefined;
}

function prefixEmoji(value: string | null): string {
    return componentEmoji(value) === undefined || value === null ? "" : `${value} `;
}

function row(...components: MessageActionRowComponentBuilder[]): ActionRowBuilder<MessageActionRowComponentBuilder> {
    return new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(...components);
}

function chunk<T>(items: readonly T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let index = 0; index < items.length; index += size) {
        chunks.push(items.slice(index, index + size));
    }
    return chunks;
}

export function hubCategories(hub: TicketHubDto, categories: readonly TicketCategoryDto[]): TicketCategoryDto[] {
    const enabled = categories.filter((category) => category.isEnabled);
    if (hub.categoryIds.length === 0) {
        return enabled;
    }
    return hub.categoryIds.flatMap((id) => enabled.filter((category) => category.id === id));
}

function categoryLine(category: TicketCategoryDto): string {
    const heading = `**${prefixEmoji(category.emoji)}${plain(category.name, 80)}**`;
    return category.description === null ? heading : `${heading}\n${plain(category.description, 300)}`;
}

export function hubMessage(hub: TicketHubDto, categories: readonly TicketCategoryDto[]): V2Message {
    const visible = hubCategories(hub, categories).slice(0, 20);
    const accent = hub.color ?? Accent.Info;
    const blocks: Block[] = [`## ${plain(hub.title, 100)}`];
    if (hub.description.trim().length > 0) {
        blocks.push(hub.description.trim());
    }
    if (visible.length === 0) {
        blocks.push("-# Tickets are not open right now.");
        return message(panel(accent, ...blocks));
    }
    blocks.push(divider(), visible.map(categoryLine).join("\n\n"));
    if (hub.style === TicketHubStyle.Menu) {
        const menu = new StringSelectMenuBuilder()
            .setCustomId(`${ticketHubPrefix}:${hub.id}`)
            .setPlaceholder("Choose a category")
            .addOptions(
                visible.map((category) => ({
                    label: truncate(category.name, 100),
                    value: category.id,
                    description: category.description === null ? undefined : truncate(category.description, 100),
                    emoji: componentEmoji(category.emoji)
                }))
            );
        blocks.push(row(menu));
        return message(panel(accent, ...blocks));
    }
    for (const group of chunk(visible, 5)) {
        blocks.push(
            row(
                ...group.map((category) => {
                    const button = actionButton(`${ticketCategoryPrefix}:${category.id}`, truncate(category.name, 80), ButtonStyle.Primary);
                    const emoji = componentEmoji(category.emoji);
                    return emoji === undefined ? button : button.setEmoji(emoji);
                })
            )
        );
    }
    return message(panel(accent, ...blocks));
}

function availabilityNote(type: TicketTypeDto): string {
    switch (type.availability) {
        case TicketAvailability.Upcoming:
            return type.opensAt === null ? "opens soon" : `opens ${when(type.opensAt)}`;
        case TicketAvailability.Available:
            return type.closesAt === null ? "" : `closes ${when(type.closesAt)}`;
        default:
            return ticketAvailabilityLabels[type.availability].toLowerCase();
    }
}

function seats(type: TicketTypeDto): string | null {
    return type.openings === null ? null : `${type.filledCount}/${pluralize(type.openings, "seat")} filled`;
}

export function typePicker(category: TicketCategoryDto): V2Message {
    const listed = category.types.filter((type) => type.availability !== TicketAvailability.Disabled);
    const available = listed.filter((type) => type.availability === TicketAvailability.Available);
    const blocks: Block[] = [`### ${prefixEmoji(category.emoji)}${plain(category.name, 80)}`];
    if (listed.length === 0) {
        blocks.push("Nothing here is open right now.");
        return ephemeral(panel(null, ...blocks));
    }
    blocks.push(
        listed
            .map((type) => {
                const notes = [type.kind === TicketKind.Application ? "application" : null, availabilityNote(type), seats(type)]
                    .filter((note): note is string => note !== null && note.length > 0)
                    .join(", ");
                const label = `${prefixEmoji(type.emoji)}**${plain(type.name, 80)}**`;
                const shown = type.availability === TicketAvailability.Available ? label : `~~${label}~~`;
                return notes.length === 0 ? `• ${shown}` : `• ${shown}: ${notes}`;
            })
            .join("\n")
    );
    if (available.length === 0) {
        blocks.push("-# None of these are taking requests right now.");
        return ephemeral(panel(null, ...blocks));
    }
    const menu = new StringSelectMenuBuilder()
        .setCustomId(`${ticketTypePrefix}:${category.id}`)
        .setPlaceholder("What do you need?")
        .addOptions(
            available.slice(0, 25).map((type) => ({
                label: truncate(type.name, 100),
                value: type.id,
                description: type.description === null ? undefined : truncate(type.description, 100),
                emoji: componentEmoji(type.emoji)
            }))
        );
    blocks.push(row(menu));
    return ephemeral(panel(null, ...blocks));
}

function bulletList(items: readonly string[]): string {
    return items.map((item) => `• ${plain(item, 200)}`).join("\n");
}

function listingText(name: string, listing: TicketListingDto): string {
    return [
        `## ${plain(name, 80)}`,
        listing.overview.trim().length === 0 ? null : `### Position overview\n${listing.overview.trim()}`,
        listing.requirements.length === 0 ? null : `### Requirements\n${bulletList(listing.requirements)}`,
        listing.responsibilities.length === 0 ? null : `### Responsibilities\n${bulletList(listing.responsibilities)}`,
        listing.process.trim().length === 0 ? null : `### Application process\n${listing.process.trim()}`,
        listing.about.trim().length === 0 ? null : `### About Project Stairway\n${listing.about.trim()}`
    ]
        .filter((section): section is string => section !== null)
        .join("\n");
}

export function listingView(type: TicketTypeDto, fullListingUrl: string): V2Message {
    const listing = type.listing ?? { overview: "", requirements: [], responsibilities: [], process: "", about: "" };
    const text = listingText(type.name, listing);
    const facts = [availabilityNote(type), seats(type)].filter((fact): fact is string => fact !== null && fact.length > 0);
    const blocks: Block[] = [text.length <= listingBudget ? text : `${text.slice(0, listingBudget).trimEnd()}…`];
    if (facts.length > 0) {
        blocks.push(`-# ${facts.join(" | ")}`);
    }
    const apply = actionButton(
        `${ticketApplyPrefix}:${type.id}`,
        type.kind === TicketKind.Application ? "Apply" : "Open ticket",
        ButtonStyle.Success,
        type.availability !== TicketAvailability.Available
    );
    blocks.push(divider(), buttons(apply, linkButton("Full listing", fullListingUrl)));
    return ephemeral(panel(Accent.Info, ...blocks));
}

export function stageLine(ticket: TicketDto): string {
    if (ticket.status === TicketStatus.Closed) {
        return ticket.stage === null ? "Closed" : `Closed (${applicationStageLabels[ticket.stage].toLowerCase()})`;
    }
    return ticket.stage === null ? "Open" : applicationStageLabels[ticket.stage];
}

function accentOf(ticket: TicketDto): Accent {
    if (ticket.stage === ApplicationStage.Accepted) {
        return Accent.Success;
    }
    if (ticket.stage === ApplicationStage.Rejected) {
        return Accent.Danger;
    }
    return ticket.status === TicketStatus.Closed ? Accent.Neutral : Accent.Info;
}

export function ticketControls(ticket: TicketDto): ActionRowBuilder<MessageActionRowComponentBuilder> | null {
    if (ticket.status === TicketStatus.Closed) {
        return null;
    }
    const controls: ButtonBuilder[] = [];
    if (ticket.kind === TicketKind.Application) {
        if (ticket.stage === ApplicationStage.Submitted) {
            controls.push(
                actionButton(`${ticketActionPrefix}:${TicketAction.Interview}:${ticket.id}`, "Invite to interview", ButtonStyle.Primary)
            );
        }
        if (ticket.stage === ApplicationStage.Submitted || ticket.stage === ApplicationStage.Interview) {
            controls.push(actionButton(`${ticketActionPrefix}:${TicketAction.Accept}:${ticket.id}`, "Accept", ButtonStyle.Success));
            controls.push(actionButton(`${ticketActionPrefix}:${TicketAction.Reject}:${ticket.id}`, "Reject", ButtonStyle.Danger));
        }
    }
    if (ticket.assignee === null) {
        controls.push(actionButton(`${ticketActionPrefix}:${TicketAction.Claim}:${ticket.id}`, "Claim", ButtonStyle.Secondary));
    }
    controls.push(actionButton(`${ticketActionPrefix}:${TicketAction.Close}:${ticket.id}`, "Close ticket", ButtonStyle.Secondary));
    return buttons(...controls);
}

function answerBlocks(ticket: TicketDto, limit: number): string | null {
    if (ticket.answers.length === 0) {
        return null;
    }
    return ticket.answers.map((answer) => `**${plain(answer.label, 45)}**\n${quote(answer.value, limit)}`).join("\n");
}

function assigneeLine(ticket: TicketDto): string {
    return ticket.assignee === null ? "Unclaimed" : `<@${ticket.assignee.discordId}>`;
}

export function ticketIntro(ticket: TicketDto): V2Message {
    const blocks: Block[] = [
        `## #${ticket.number} | ${plain(ticket.typeName, 80)}`,
        [
            `Opened by <@${ticket.opener.discordId}> ${when(ticket.createdAt)} in **${plain(ticket.categoryName, 80)}**`,
            `**Status:** ${stageLine(ticket)}`,
            `**Handled by:** ${assigneeLine(ticket)}`
        ].join("\n")
    ];
    const answers = answerBlocks(ticket, 650);
    if (answers !== null) {
        blocks.push(divider(), answers);
    }
    blocks.push(
        divider(),
        ticket.status === TicketStatus.Closed
            ? "-# This ticket is closed."
            : ticket.kind === TicketKind.Application
              ? "-# Staff will review your application here. Closing the ticket withdraws it."
              : "-# Staff will reply here. Close the ticket once you are sorted."
    );
    const controls = ticketControls(ticket);
    if (controls !== null) {
        blocks.push(controls);
    }
    return message(panel(accentOf(ticket), ...blocks));
}

export interface StaffCardPayload {
    readonly flags: number;
    readonly components: TopLevelComponent[];
    readonly allowedMentions: { readonly parse: []; readonly roles: string[] };
}

export function staffCard(ticket: TicketDto, mentionRoleIds: readonly string[]): StaffCardPayload {
    const isOpen = ticket.status === TicketStatus.Open;
    const blocks: Block[] = [
        `**${ticket.kind === TicketKind.Application ? "Application" : "Ticket"} #${ticket.number} | ${plain(ticket.typeName, 80)}**`,
        `From <@${ticket.opener.discordId}> ${when(ticket.createdAt)}\n**Status:** ${stageLine(ticket)} | **Handled by:** ${assigneeLine(ticket)}`
    ];
    const answers = answerBlocks(ticket, 200);
    if (answers !== null) {
        blocks.push(answers);
    }
    if (ticket.decidedBy !== null) {
        blocks.push(`-# Decided by <@${ticket.decidedBy.discordId}>${ticket.decidedAt === null ? "" : ` ${when(ticket.decidedAt)}`}`);
    }
    if (ticket.closedBy !== null) {
        const reason = ticket.closeReason === null ? "" : `: ${plain(ticket.closeReason, 200)}`;
        blocks.push(`-# Closed by <@${ticket.closedBy.discordId}>${reason}`);
    }
    if (mentionRoleIds.length > 0 && isOpen) {
        blocks.push(`-# ${mentionRoleIds.map((id) => `<@&${id}>`).join(" ")}`);
    }
    const controls = [
        actionButton(
            `${ticketJoinPrefix}:${ticket.id}`,
            isOpen ? "Join ticket" : "Closed",
            ButtonStyle.Primary,
            !isOpen || ticket.threadId === null
        )
    ];
    if (isOpen && ticket.assignee === null) {
        controls.push(actionButton(`${ticketActionPrefix}:${TicketAction.Claim}:${ticket.id}`, "Claim", ButtonStyle.Secondary));
    }
    blocks.push(buttons(...controls));
    return {
        flags: MessageFlags.IsComponentsV2,
        components: [panel(accentOf(ticket), ...blocks)],
        allowedMentions: { parse: [], roles: isOpen ? [...mentionRoleIds] : [] }
    };
}

export function threadEvent(accent: Accent | null, title: string, body: string | null, note: string | null): V2Message {
    const blocks: Block[] = [title];
    if (body !== null) {
        blocks.push(body);
    }
    if (note !== null) {
        blocks.push(quote(note, 1000));
    }
    return message(panel(accent, ...blocks));
}

export function fillTemplate(
    template: string,
    values: { readonly position: string; readonly user: string; readonly ticket: number }
): string {
    return template
        .replace(/\{position\}/gu, plain(values.position, 80))
        .replace(/\{user\}/gu, plain(values.user, 64))
        .replace(/\{ticket\}/gu, `#${values.ticket}`);
}

export function applicantNotice(accent: Accent, title: string, body: string, note: string | null, threadUrl: string | null): V2Message {
    const blocks: Block[] = [`**${title}**`, body];
    if (note !== null) {
        blocks.push(quote(note, 1000));
    }
    if (threadUrl !== null) {
        blocks.push(buttons(linkButton("Open your ticket", threadUrl)));
    }
    return message(panel(accent, ...blocks));
}

export function webReply(username: string, content: string): V2Message {
    return message(panel(null, `**${plain(username, 64)}** | staff`, content));
}

export interface TranscriptLine {
    readonly at: Date;
    readonly author: string;
    readonly content: string;
    readonly attachments: readonly string[];
}

export function transcriptText(ticket: TicketDto, lines: readonly TranscriptLine[]): string {
    const header = [
        `Ticket #${ticket.number} | ${ticket.typeName} (${ticket.categoryName})`,
        `Opened by ${ticket.opener.username} (${ticket.opener.discordId}) on ${new Date(ticket.createdAt).toISOString()}`,
        `Status: ${stageLine(ticket)}`,
        ticket.closedBy === null
            ? null
            : `Closed by ${ticket.closedBy.username}${ticket.closeReason === null ? "" : `: ${ticket.closeReason}`}`,
        ...ticket.answers.map((answer) => `${answer.label}: ${answer.value}`)
    ].filter((line): line is string => line !== null);
    const body = lines.map((line) => {
        const attachments = line.attachments.map((url) => `\n    attachment: ${url}`).join("");
        return `[${line.at.toISOString().replace("T", " ").slice(0, 19)}] ${line.author}: ${line.content}${attachments}`;
    });
    return `${header.join("\n")}\n${"-".repeat(60)}\n${body.join("\n")}\n`;
}
