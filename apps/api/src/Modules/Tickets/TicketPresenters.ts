import type {
    TicketCategoryDto,
    TicketDto,
    TicketEventDto,
    TicketHubDto,
    TicketMessageDto,
    TicketPersonDto,
    TicketSettingsDto,
    TicketTypeDto
} from "@platform/contracts";
import { TicketEventKind } from "@platform/contracts";
import { toIso } from "../../Common/Http/Schemas.js";
import type {
    TicketEventRecord,
    TicketHubRecord,
    TicketMessageRecord,
    TicketRecord,
    TicketSettingsRecord
} from "../../Infrastructure/Database/Schema.js";
import type { CategoryView, TypeView } from "./TicketConfigService.js";

export const defaultLogEvents: readonly TicketEventKind[] = [
    TicketEventKind.Opened,
    TicketEventKind.StageChanged,
    TicketEventKind.Closed,
    TicketEventKind.Reopened
];

function person(discordId: string | null, username: string | null): TicketPersonDto | null {
    return discordId === null ? null : { discordId, username: username ?? "Unknown" };
}

export function presentSettings(record: TicketSettingsRecord | null): TicketSettingsDto {
    return {
        guildId: record?.guildId ?? null,
        logChannelId: record?.logChannelId ?? null,
        logEvents: record?.logEvents ?? [...defaultLogEvents],
        transcriptOnClose: record?.transcriptOnClose ?? true,
        dmApplicants: record?.dmApplicants ?? true,
        maxOpenPerUser: record?.maxOpenPerUser ?? 3,
        updatedAt: record === null ? null : toIso(record.updatedAt)
    };
}

export function presentHub(record: TicketHubRecord): TicketHubDto {
    return {
        id: record.id,
        name: record.name,
        channelId: record.channelId,
        messageId: record.messageId,
        title: record.title,
        description: record.description,
        color: record.color,
        style: record.style,
        categoryIds: record.categoryIds,
        isEnabled: record.isEnabled,
        departmentId: record.departmentId,
        createdAt: toIso(record.createdAt),
        updatedAt: toIso(record.updatedAt)
    };
}

export function presentType({ record, availability, openTicketCount }: TypeView): TicketTypeDto {
    return {
        id: record.id,
        categoryId: record.categoryId,
        name: record.name,
        description: record.description,
        emoji: record.emoji,
        kind: record.kind,
        position: record.position,
        isEnabled: record.isEnabled,
        staffRoleIds: record.staffRoleIds,
        threadChannelId: record.threadChannelId,
        mentionStaff: record.mentionStaff,
        questions: record.questions,
        positionStatus: record.positionStatus,
        openings: record.openings,
        filledCount: record.filledCount,
        opensAt: toIso(record.opensAt),
        closesAt: toIso(record.closesAt),
        listing: record.listing ?? null,
        messages: record.messages,
        availability,
        openTicketCount,
        createdAt: toIso(record.createdAt),
        updatedAt: toIso(record.updatedAt)
    };
}

export function presentCategory({ record, types }: CategoryView): TicketCategoryDto {
    return {
        id: record.id,
        name: record.name,
        description: record.description,
        emoji: record.emoji,
        position: record.position,
        isEnabled: record.isEnabled,
        departmentId: record.departmentId,
        threadChannelId: record.threadChannelId,
        notificationChannelId: record.notificationChannelId,
        logChannelId: record.logChannelId,
        staffRoleIds: record.staffRoleIds,
        mentionStaff: record.mentionStaff,
        types: types.map(presentType),
        createdAt: toIso(record.createdAt),
        updatedAt: toIso(record.updatedAt)
    };
}

export function presentTicket(record: TicketRecord): TicketDto {
    return {
        id: record.id,
        number: record.number,
        typeId: record.typeId,
        categoryId: record.categoryId,
        typeName: record.typeName,
        categoryName: record.categoryName,
        kind: record.kind,
        status: record.status,
        stage: record.stage,
        opener: { discordId: record.openerDiscordId, username: record.openerUsername },
        assignee: person(record.assigneeDiscordId, record.assigneeUsername),
        threadId: record.threadId,
        introMessageId: record.introMessageId,
        notificationChannelId: record.notificationChannelId,
        notificationMessageId: record.notificationMessageId,
        answers: record.answers,
        decidedBy: person(record.decidedByDiscordId, record.decidedByUsername),
        decidedAt: toIso(record.decidedAt),
        decisionNote: record.decisionNote,
        closedBy: person(record.closedByDiscordId, record.closedByUsername),
        closedAt: toIso(record.closedAt),
        closeReason: record.closeReason,
        lastActivityAt: toIso(record.lastActivityAt),
        createdAt: toIso(record.createdAt),
        updatedAt: toIso(record.updatedAt)
    };
}

export function presentEvent(record: TicketEventRecord): TicketEventDto {
    return {
        id: record.id,
        ticketId: record.ticketId,
        kind: record.kind,
        actor: person(record.actorDiscordId, record.actorUsername),
        stage: record.stage,
        target: person(record.targetDiscordId, record.targetUsername),
        note: record.note,
        createdAt: toIso(record.createdAt)
    };
}

export function presentMessage(record: TicketMessageRecord): TicketMessageDto {
    return {
        id: record.id,
        ticketId: record.ticketId,
        discordMessageId: record.discordMessageId,
        source: record.source,
        author: { discordId: record.authorDiscordId, username: record.authorUsername },
        authorAvatarUrl: record.authorAvatarUrl,
        content: record.deletedAt === null ? record.content : "",
        attachments: record.deletedAt === null ? record.attachments : [],
        editedAt: toIso(record.editedAt),
        deletedAt: toIso(record.deletedAt),
        createdAt: toIso(record.createdAt)
    };
}
