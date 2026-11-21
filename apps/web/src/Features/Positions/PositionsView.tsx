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
import { Badge } from "@/Components/Ui/badge";
import { Button } from "@/Components/Ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/Components/Ui/card";
import { formatDateTime } from "@/Lib/Format";
import { safeHttpUrl } from "@/Lib/SafeUrl";

const availabilityTones: Readonly<Record<TicketAvailability, Tone>> = {
    [TicketAvailability.Available]: Tone.Info,
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
    const isOpen = position.availability === TicketAvailability.Available;

    return (
        <Card id={position.id} className="transition-colors hover:border-border/80">
            <CardHeader className="gap-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                            <CardTitle className="text-base font-semibold">{position.name}</CardTitle>
                            <Badge variant="outline" className="border-border/60 text-muted-foreground text-[10px] font-normal">
                                {position.categoryName}
                            </Badge>
                        </div>
                        {position.description !== null && (
                            <p className="text-muted-foreground text-xs leading-relaxed">{position.description}</p>
                        )}
                    </div>
                    {isOpen ? (
                        <Badge
                            variant="secondary"
                            className="border-primary/30 bg-primary/10 text-primary h-5.5 rounded-sm border px-2 text-[11px] font-medium"
                        >
                            Open
                        </Badge>
                    ) : (
                        <ToneBadge tone={availabilityTones[position.availability]}>
                            {ticketAvailabilityLabels[position.availability]}
                        </ToneBadge>
                    )}
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                {listing !== null && (
                    <div className="space-y-3.5 divide-y divide-border/60">
                        {listing.overview && <TextSection title="Position overview" body={listing.overview} />}
                        {listing.requirements.length > 0 && <ListSection title="Requirements" items={listing.requirements} />}
                        {listing.responsibilities.length > 0 && <ListSection title="Responsibilities" items={listing.responsibilities} />}
                        {listing.process && <TextSection title="Application process" body={listing.process} />}
                        {listing.about && <TextSection title="About Project Stairway" body={listing.about} />}
                    </div>
                )}
                <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3.5">
                    <p className="text-muted-foreground text-xs">
                        {[window, position.openings === null ? null : `${position.filledCount} of ${position.openings} filled`]
                            .filter((part): part is string => part !== null)
                            .join(" · ") || "Apply through a ticket on our Discord server."}
                    </p>
                    {canApply && (
                        <Button asChild size="sm">
                            <a href={applyUrl} target="_blank" rel="noopener noreferrer">
                                Apply on Discord
                                <ExternalLink className="size-3.5" />
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
