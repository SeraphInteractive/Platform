import {
    ApplicationStage,
    applicationStageLabels,
    TicketAvailability,
    ticketAvailabilityLabels,
    TicketStatus,
    type TicketDto
} from "@platform/contracts";
import type { ReactNode } from "react";
import { Tone, ToneBadge } from "@/Components/Common/StatusBadge";

export const availabilityTones: Readonly<Record<TicketAvailability, Tone>> = {
    [TicketAvailability.Available]: Tone.Positive,
    [TicketAvailability.Disabled]: Tone.Neutral,
    [TicketAvailability.Upcoming]: Tone.Info,
    [TicketAvailability.WindowClosed]: Tone.Warning,
    [TicketAvailability.PositionClosed]: Tone.Warning,
    [TicketAvailability.Filled]: Tone.Neutral
};

const stageTones: Readonly<Record<ApplicationStage, Tone>> = {
    [ApplicationStage.Submitted]: Tone.Warning,
    [ApplicationStage.Interview]: Tone.Info,
    [ApplicationStage.Accepted]: Tone.Positive,
    [ApplicationStage.Rejected]: Tone.Negative
};

export function AvailabilityBadge({ availability }: { readonly availability: TicketAvailability }): ReactNode {
    return <ToneBadge tone={availabilityTones[availability]}>{ticketAvailabilityLabels[availability]}</ToneBadge>;
}

export function TicketStateBadge({ ticket }: { readonly ticket: TicketDto }): ReactNode {
    const closed = ticket.status === TicketStatus.Closed;
    if (ticket.stage !== null) {
        return (
            <span className="inline-flex flex-wrap items-center gap-1">
                <ToneBadge tone={stageTones[ticket.stage]}>{applicationStageLabels[ticket.stage]}</ToneBadge>
                {closed && <ToneBadge tone={Tone.Neutral}>Closed</ToneBadge>}
            </span>
        );
    }
    return <ToneBadge tone={closed ? Tone.Neutral : Tone.Info}>{closed ? "Closed" : "Open"}</ToneBadge>;
}

export function discordThreadLink(guildId: string | null, threadId: string | null): string | null {
    return guildId === null || threadId === null ? null : `https://discord.com/channels/${guildId}/${threadId}`;
}
