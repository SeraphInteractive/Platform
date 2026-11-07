"use client";

import { TicketAvailability, ticketAvailabilityLabels, type PublicPositionDto } from "@platform/contracts";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";
import type { ReactNode } from "react";
import { platformApi } from "@/Api/PlatformApi";
import { queryKeys } from "@/Api/QueryKeys";
import { MarkdownText } from "@/Components/Common/MarkdownText";
import { PageHeader } from "@/Components/Common/PageHeader";
import { EmptyState, ErrorState, LoadingRows } from "@/Components/Common/States";
import { Tone, ToneBadge } from "@/Components/Common/StatusBadge";
import { Button } from "@/Components/Ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/Components/Ui/card";
import { formatDateTime } from "@/Lib/Format";
import { safeHttpUrl } from "@/Lib/SafeUrl";

const availabilityTones: Readonly<Record<TicketAvailability, Tone>> = {
    [TicketAvailability.Available]: Tone.Positive,
    [TicketAvailability.Disabled]: Tone.Neutral,
    [TicketAvailability.Upcoming]: Tone.Info,
    [TicketAvailability.WindowClosed]: Tone.Warning,
    [TicketAvailability.PositionClosed]: Tone.Warning,
    [TicketAvailability.Filled]: Tone.Neutral
};

function windowText(position: PublicPositionDto): string | null {
    if (position.availability === TicketAvailability.Upcoming && position.opensAt !== null) {
        return `Applications open ${formatDateTime(position.opensAt)}`;
    }
    if (position.availability === TicketAvailability.Available && position.closesAt !== null) {
        return `Applications close ${formatDateTime(position.closesAt)}`;
    }
    return null;
}

function ListSection({ title, items }: { readonly title: string; readonly items: readonly string[] }): ReactNode {
    if (items.length === 0) {
        return null;
    }
    return (
        <section className="space-y-1.5">
            <h3 className="text-sm font-semibold">{title}</h3>
            <ul className="list-disc space-y-0.5 pl-5 text-sm">
                {items.map((item) => (
                    <li key={item}>{item}</li>
                ))}
            </ul>
        </section>
    );
}

function TextSection({ title, body }: { readonly title: string; readonly body: string }): ReactNode {
    if (body.trim().length === 0) {
        return null;
    }
    return (
        <section className="space-y-1.5">
            <h3 className="text-sm font-semibold">{title}</h3>
            <MarkdownText className="text-sm">{body}</MarkdownText>
        </section>
    );
}

function PositionCard({ position }: { readonly position: PublicPositionDto }): ReactNode {
    const applyUrl = safeHttpUrl(position.applyUrl);
    const window = windowText(position);
    const listing = position.listing;
    const canApply = position.availability === TicketAvailability.Available && applyUrl !== null;
    return (
        <Card id={position.id}>
            <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 space-y-1">
                        <CardTitle>
                            {position.emoji !== null && <span className="mr-1.5">{position.emoji}</span>}
                            {position.name}
                        </CardTitle>
                        <CardDescription>
                            {position.categoryName}
                            {position.description !== null && ` | ${position.description}`}
                        </CardDescription>
                    </div>
                    <ToneBadge tone={availabilityTones[position.availability]}>
                        {position.availability === TicketAvailability.Available ? "Open" : ticketAvailabilityLabels[position.availability]}
                    </ToneBadge>
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                {listing !== null && (
                    <>
                        <TextSection title="Position overview" body={listing.overview} />
                        <ListSection title="Requirements" items={listing.requirements} />
                        <ListSection title="Responsibilities" items={listing.responsibilities} />
                        <TextSection title="Application process" body={listing.process} />
                        <TextSection title="About Project Stairway" body={listing.about} />
                    </>
                )}
                <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
                    <p className="text-muted-foreground text-xs">
                        {[window, position.openings === null ? null : `${position.filledCount} of ${position.openings} filled`]
                            .filter((part): part is string => part !== null)
                            .join(" | ") || "Apply through a ticket on our Discord server."}
                    </p>
                    {canApply && (
                        <Button asChild size="sm">
                            <a href={applyUrl} target="_blank" rel="noopener noreferrer">
                                Apply on Discord
                                <ExternalLink />
                            </a>
                        </Button>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}

export function PositionsView(): ReactNode {
    const positionsQuery = useQuery({ queryKey: queryKeys.positions, queryFn: () => platformApi.positions() });
    const positions = positionsQuery.data?.positions ?? [];
    const open = positions.filter((position) => position.availability === TicketAvailability.Available);
    const rest = positions.filter((position) => position.availability !== TicketAvailability.Available);

    return (
        <div>
            <PageHeader title="Positions" />
            {positionsQuery.isPending ? (
                <LoadingRows />
            ) : positionsQuery.isError ? (
                <ErrorState error={positionsQuery.error} onRetry={() => void positionsQuery.refetch()} />
            ) : positions.length === 0 ? (
                <EmptyState title="No positions listed">Check back later or keep an eye on announcements in Discord.</EmptyState>
            ) : (
                <div className="space-y-6">
                    {open.length > 0 && (
                        <div className="space-y-4">
                            {open.map((position) => (
                                <PositionCard key={position.id} position={position} />
                            ))}
                        </div>
                    )}
                    {rest.length > 0 && (
                        <div className="space-y-3">
                            <h2 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">Not taking applications</h2>
                            {rest.map((position) => (
                                <PositionCard key={position.id} position={position} />
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
