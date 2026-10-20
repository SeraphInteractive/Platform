"use client";

import {
    loggableTicketEvents,
    Role,
    ticketEventLabels,
    TicketHubStyle,
    TicketKind,
    ticketLimits,
    TicketStatus,
    type TicketCategoryDto,
    type TicketConfigDto,
    type TicketEventKind,
    type TicketHubDto,
    type TicketListQuery,
    type TicketSettingsDto,
    type TicketTypeDto
} from "@platform/contracts";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, MoreHorizontal, Pencil, Plus, RefreshCw, Search } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { useEffect, useId, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { describeError } from "@/Api/ApiClient";
import { platformApi } from "@/Api/PlatformApi";
import { queryKeys } from "@/Api/QueryKeys";
import { ConfirmButton } from "@/Components/Common/ConfirmButton";
import { Toolbar } from "@/Components/Common/DataList";
import { PageHeader } from "@/Components/Common/PageHeader";
import { Pagination } from "@/Components/Common/Pagination";
import { RelativeTime } from "@/Components/Common/RelativeTime";
import { Section } from "@/Components/Common/Section";
import { EmptyState, ErrorState, LoadingRows, RequireRole } from "@/Components/Common/States";
import { StatTile } from "@/Components/Common/StatTile";
import { Tone, ToneBadge } from "@/Components/Common/StatusBadge";
import { Button } from "@/Components/Ui/button";
import { Checkbox } from "@/Components/Ui/checkbox";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger
} from "@/Components/Ui/dropdown-menu";
import { Input } from "@/Components/Ui/input";
import { Label } from "@/Components/Ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/Components/Ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/Components/Ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/Components/Ui/tabs";
import { useSession } from "@/Hooks/UseSession";
import { ChannelName, ChannelSelect, RoleNames, useDiscordDirectory } from "./DiscordPickers";
import { AvailabilityBadge, discordThreadLink, TicketStateBadge } from "./TicketBadges";
import { TicketCategoryDialog } from "./TicketCategoryDialog";
import { TicketHubDialog } from "./TicketHubDialog";
import { TicketTypeDialog } from "./TicketTypeDialog";

const anyValue = "any";
const mineValue = "mine";
const unassignedValue = "unassigned";

const starterCategories = [
    { name: "Production", emoji: "🎬", description: "Apply to a department or reach its supervisors." },
    { name: "Project", emoji: "🏗️", description: "Project and production leadership roles, HR and project management." },
    { name: "Server", emoji: "🛡️", description: "Moderation applications, reports and server help." }
] as const;

function ticketHref(ticketId: string): Route {
    return `/studio/tickets/${ticketId}` as Route;
}

function Summary(): ReactNode {
    const summaryQuery = useQuery({
        queryKey: queryKeys.ticketSummary,
        queryFn: () => platformApi.ticketSummary(),
        refetchInterval: 30_000
    });
    const summary = summaryQuery.data;
    const value = (count: number | undefined): ReactNode => (count === undefined ? "–" : count);
    return (
        <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
            <StatTile label="Open" value={value(summary?.open)} />
            <StatTile label="Awaiting review" value={value(summary?.awaitingReview)} emphasis={(summary?.awaitingReview ?? 0) > 0} />
            <StatTile label="Interviewing" value={value(summary?.interviewing)} />
            <StatTile label="Unclaimed" value={value(summary?.unassigned)} />
            <StatTile label="Mine" value={value(summary?.mine)} />
        </div>
    );
}

function Inbox({
    config,
    visibleCategoryIds
}: {
    readonly config: TicketConfigDto;
    readonly visibleCategoryIds: readonly string[];
}): ReactNode {
    const { user } = useSession();
    const [page, setPage] = useState(1);
    const [status, setStatus] = useState<string>(TicketStatus.Open);
    const [kind, setKind] = useState<string>(anyValue);
    const [categoryId, setCategoryId] = useState<string>(anyValue);
    const [owner, setOwner] = useState<string>(anyValue);
    const [search, setSearch] = useState("");
    const [term, setTerm] = useState("");

    useEffect(() => {
        const timer = setTimeout(() => {
            setTerm(search.trim());
            setPage(1);
        }, 300);
        return () => clearTimeout(timer);
    }, [search]);

    const query: TicketListQuery = {
        page,
        perPage: 25,
        status: status === anyValue ? undefined : (status as TicketStatus),
        kind: kind === anyValue ? undefined : (kind as TicketKind),
        categoryId: categoryId === anyValue ? undefined : categoryId,
        assigneeDiscordId: owner === mineValue ? user?.discordId : undefined,
        unassigned: owner === unassignedValue ? true : undefined,
        search: term.length === 0 ? undefined : term
    };
    const ticketsQuery = useQuery({
        queryKey: queryKeys.tickets(query),
        queryFn: () => platformApi.tickets(query),
        placeholderData: keepPreviousData,
        refetchInterval: 30_000
    });
    const categories = config.categories.filter((category) => visibleCategoryIds.includes(category.id));
    const filter = (setter: (value: string) => void) => (value: string) => {
        setter(value);
        setPage(1);
    };

    return (
        <div>
            <Toolbar
                trailing={
                    <Button size="icon-sm" variant="ghost" aria-label="Refresh" onClick={() => void ticketsQuery.refetch()}>
                        <RefreshCw className={ticketsQuery.isFetching ? "animate-spin" : undefined} />
                    </Button>
                }
            >
                <div className="relative">
                    <Search className="text-muted-foreground absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
                    <Input
                        value={search}
                        placeholder="#number or member"
                        aria-label="Search tickets"
                        maxLength={ticketLimits.search}
                        onChange={(event) => setSearch(event.target.value)}
                        className="h-8 w-44 pl-8 text-xs"
                    />
                </div>
                <Select value={status} onValueChange={filter(setStatus)}>
                    <SelectTrigger size="sm" className="w-28" aria-label="Status">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value={anyValue}>Any status</SelectItem>
                        <SelectItem value={TicketStatus.Open}>Open</SelectItem>
                        <SelectItem value={TicketStatus.Closed}>Closed</SelectItem>
                    </SelectContent>
                </Select>
                <Select value={owner} onValueChange={filter(setOwner)}>
                    <SelectTrigger size="sm" className="w-32" aria-label="Owner">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value={anyValue}>Anyone</SelectItem>
                        <SelectItem value={mineValue}>Mine</SelectItem>
                        <SelectItem value={unassignedValue}>Unclaimed</SelectItem>
                    </SelectContent>
                </Select>
                <Select value={kind} onValueChange={filter(setKind)}>
                    <SelectTrigger size="sm" className="w-34" aria-label="Kind">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value={anyValue}>Any kind</SelectItem>
                        <SelectItem value={TicketKind.Application}>Applications</SelectItem>
                        <SelectItem value={TicketKind.Support}>Support</SelectItem>
                    </SelectContent>
                </Select>
                {categories.length > 1 && (
                    <Select value={categoryId} onValueChange={filter(setCategoryId)}>
                        <SelectTrigger size="sm" className="w-36" aria-label="Category">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value={anyValue}>Any category</SelectItem>
                            {categories.map((category) => (
                                <SelectItem key={category.id} value={category.id}>
                                    {category.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                )}
            </Toolbar>
            {ticketsQuery.isPending ? (
                <LoadingRows />
            ) : ticketsQuery.isError ? (
                <ErrorState error={ticketsQuery.error} onRetry={() => void ticketsQuery.refetch()} />
            ) : ticketsQuery.data.data.length === 0 ? (
                <EmptyState title="No tickets match">Tickets members open from the Discord hubs show up here.</EmptyState>
            ) : (
                <>
                    <div className="bg-card overflow-hidden rounded-md border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-14">#</TableHead>
                                    <TableHead>Ticket</TableHead>
                                    <TableHead className="hidden sm:table-cell">From</TableHead>
                                    <TableHead>State</TableHead>
                                    <TableHead className="hidden md:table-cell">Handled by</TableHead>
                                    <TableHead className="hidden lg:table-cell">Activity</TableHead>
                                    <TableHead className="w-10" />
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {ticketsQuery.data.data.map((ticket) => {
                                    const url = discordThreadLink(config.settings.guildId, ticket.threadId);
                                    return (
                                        <TableRow key={ticket.id} className="cursor-pointer">
                                            <TableCell className="text-muted-foreground tabular-nums">
                                                <Link href={ticketHref(ticket.id)} className="hover:underline">
                                                    {ticket.number}
                                                </Link>
                                            </TableCell>
                                            <TableCell>
                                                <Link href={ticketHref(ticket.id)} className="block">
                                                    <span className="font-medium hover:underline">{ticket.typeName}</span>
                                                    <span className="text-muted-foreground block text-xs">{ticket.categoryName}</span>
                                                </Link>
                                            </TableCell>
                                            <TableCell className="hidden sm:table-cell">{ticket.opener.username}</TableCell>
                                            <TableCell>
                                                <TicketStateBadge ticket={ticket} />
                                            </TableCell>
                                            <TableCell className="text-muted-foreground hidden text-xs md:table-cell">
                                                {ticket.assignee?.username ?? "Unclaimed"}
                                            </TableCell>
                                            <TableCell className="text-muted-foreground hidden text-xs lg:table-cell">
                                                <RelativeTime value={ticket.lastActivityAt} />
                                            </TableCell>
                                            <TableCell>
                                                {url !== null && (
                                                    <Button asChild size="icon-sm" variant="ghost">
                                                        <a
                                                            href={url}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            aria-label={`Open ticket ${ticket.number} in Discord`}
                                                        >
                                                            <ExternalLink />
                                                        </a>
                                                    </Button>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </div>
                    <Pagination meta={ticketsQuery.data.meta} onPageChange={setPage} />
                </>
            )}
        </div>
    );
}

function HubRow({ hub, categories }: { readonly hub: TicketHubDto; readonly categories: readonly TicketCategoryDto[] }): ReactNode {
    const queryClient = useQueryClient();
    const remove = useMutation({
        mutationFn: () => platformApi.deleteTicketHub(hub.id),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: queryKeys.ticketConfig });
            toast.success("Hub deleted. The bot will remove its message.");
        },
        onError: (error) => {
            toast.error(describeError(error));
        }
    });
    const shown =
        hub.categoryIds.length === 0
            ? "All categories"
            : hub.categoryIds
                  .map((id) => categories.find((category) => category.id === id)?.name)
                  .filter((name): name is string => name !== undefined)
                  .join(", ");
    const status =
        !hub.isEnabled || hub.channelId === null ? (
            <ToneBadge tone={Tone.Neutral}>Not posted</ToneBadge>
        ) : hub.messageId === null ? (
            <ToneBadge tone={Tone.Warning}>Waiting for bot</ToneBadge>
        ) : (
            <ToneBadge tone={Tone.Positive}>Live</ToneBadge>
        );
    return (
        <TableRow>
            <TableCell>
                <div className="flex items-center gap-2 font-medium">
                    {hub.name}
                    {hub.departmentId !== null && <ToneBadge tone={Tone.Info}>Department</ToneBadge>}
                </div>
                <div className="text-muted-foreground text-xs">{hub.title}</div>
            </TableCell>
            <TableCell className="text-xs">
                <ChannelName channelId={hub.channelId} />
            </TableCell>
            <TableCell className="text-muted-foreground hidden text-xs md:table-cell">
                {shown} | {hub.style === TicketHubStyle.Menu ? "dropdown" : "buttons"}
            </TableCell>
            <TableCell>{status}</TableCell>
            <TableCell className="text-right">
                <div className="flex justify-end gap-1">
                    <TicketHubDialog
                        hub={hub}
                        categories={categories}
                        trigger={
                            <Button size="icon-sm" variant="ghost" aria-label={`Edit ${hub.name}`}>
                                <Pencil />
                            </Button>
                        }
                    />
                    <ConfirmButton
                        title={`Delete ${hub.name}?`}
                        description="Its message is removed from Discord. Tickets are not affected."
                        confirmLabel="Delete"
                        destructive
                        variant="ghost"
                        onConfirm={() => remove.mutate()}
                    >
                        Delete
                    </ConfirmButton>
                </div>
            </TableCell>
        </TableRow>
    );
}

function Hubs({ config }: { readonly config: TicketConfigDto }): ReactNode {
    return (
        <Section
            title="Hubs"
            actions={
                <TicketHubDialog
                    categories={config.categories}
                    trigger={
                        <Button size="sm" disabled={config.hubs.length >= ticketLimits.hubs}>
                            <Plus />
                            Hub
                        </Button>
                    }
                />
            }
        >
            {config.hubs.length === 0 ? (
                <EmptyState title="No hubs yet">Create a hub and pick a channel. The bot posts it and keeps it up to date.</EmptyState>
            ) : (
                <div className="bg-card overflow-hidden rounded-md border">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Hub</TableHead>
                                <TableHead>Channel</TableHead>
                                <TableHead className="hidden md:table-cell">Shows</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="w-28" />
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {config.hubs.map((hub) => (
                                <HubRow key={hub.id} hub={hub} categories={config.categories} />
                            ))}
                        </TableBody>
                    </Table>
                </div>
            )}
        </Section>
    );
}

function Behaviour({ settings }: { readonly settings: TicketSettingsDto }): ReactNode {
    const formId = useId();
    const queryClient = useQueryClient();
    const [logChannelId, setLogChannelId] = useState(settings.logChannelId);
    const [logEvents, setLogEvents] = useState<TicketEventKind[]>(settings.logEvents);
    const [transcriptOnClose, setTranscriptOnClose] = useState(settings.transcriptOnClose);
    const [dmApplicants, setDmApplicants] = useState(settings.dmApplicants);
    const [maxOpenPerUser, setMaxOpenPerUser] = useState(String(settings.maxOpenPerUser));

    useEffect(() => {
        setLogChannelId(settings.logChannelId);
        setLogEvents(settings.logEvents);
        setTranscriptOnClose(settings.transcriptOnClose);
        setDmApplicants(settings.dmApplicants);
        setMaxOpenPerUser(String(settings.maxOpenPerUser));
    }, [settings]);

    const limit = Number(maxOpenPerUser);
    const limitValid = Number.isInteger(limit) && limit >= 1 && limit <= ticketLimits.maxOpenPerUser;
    const dirty =
        logChannelId !== settings.logChannelId ||
        transcriptOnClose !== settings.transcriptOnClose ||
        dmApplicants !== settings.dmApplicants ||
        limit !== settings.maxOpenPerUser ||
        [...logEvents].sort().join() !== [...settings.logEvents].sort().join();

    const save = useMutation({
        mutationFn: () =>
            platformApi.updateTicketSettings({ logChannelId, logEvents, transcriptOnClose, dmApplicants, maxOpenPerUser: limit }),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: queryKeys.ticketConfig });
            toast.success("Ticket settings saved.");
        },
        onError: (error) => {
            toast.error(describeError(error));
        }
    });

    return (
        <Section title="Logging and limits">
            <div className="bg-card grid gap-5 rounded-md border p-4 md:grid-cols-2">
                <div className="space-y-4">
                    <div className="space-y-1.5">
                        <Label htmlFor={`${formId}-log`}>Log channel</Label>
                        <ChannelSelect id={`${formId}-log`} value={logChannelId} noneLabel="No logging" onChange={setLogChannelId} />
                        <p className="text-muted-foreground text-xs">Categories can send their logs elsewhere.</p>
                    </div>
                    <div className="space-y-2">
                        <Label>Log these events</Label>
                        <div className="grid gap-2 sm:grid-cols-2">
                            {loggableTicketEvents.map((event) => (
                                <div key={event} className="flex items-center gap-2">
                                    <Checkbox
                                        id={`${formId}-event-${event}`}
                                        checked={logEvents.includes(event)}
                                        onCheckedChange={(checked) =>
                                            setLogEvents((current) =>
                                                checked === true ? [...current, event] : current.filter((item) => item !== event)
                                            )
                                        }
                                    />
                                    <Label htmlFor={`${formId}-event-${event}`} className="font-normal">
                                        {ticketEventLabels[event]}
                                    </Label>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
                <div className="space-y-4">
                    <div className="flex items-start gap-2">
                        <Checkbox
                            id={`${formId}-transcript`}
                            checked={transcriptOnClose}
                            onCheckedChange={(checked) => setTranscriptOnClose(checked === true)}
                        />
                        <div>
                            <Label htmlFor={`${formId}-transcript`} className="font-normal">
                                Post a transcript when a ticket closes
                            </Label>
                            <p className="text-muted-foreground text-xs">
                                A text file with the whole conversation, sent to the log channel.
                            </p>
                        </div>
                    </div>
                    <div className="flex items-start gap-2">
                        <Checkbox
                            id={`${formId}-dm`}
                            checked={dmApplicants}
                            onCheckedChange={(checked) => setDmApplicants(checked === true)}
                        />
                        <div>
                            <Label htmlFor={`${formId}-dm`} className="font-normal">
                                DM members about their tickets
                            </Label>
                            <p className="text-muted-foreground text-xs">Application received, interview, accepted, rejected and closed.</p>
                        </div>
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor={`${formId}-limit`}>Open tickets per member</Label>
                        <Input
                            id={`${formId}-limit`}
                            type="number"
                            min={1}
                            max={ticketLimits.maxOpenPerUser}
                            className="w-24"
                            value={maxOpenPerUser}
                            aria-invalid={!limitValid || undefined}
                            onChange={(event) => setMaxOpenPerUser(event.target.value)}
                        />
                    </div>
                </div>
                <div className="flex justify-end md:col-span-2">
                    <Button size="sm" disabled={!dirty || !limitValid || save.isPending} onClick={() => save.mutate()}>
                        Save
                    </Button>
                </div>
            </div>
        </Section>
    );
}

function TypeRow({ category, type }: { readonly category: TicketCategoryDto; readonly type: TicketTypeDto }): ReactNode {
    const queryClient = useQueryClient();
    const invalidate = (): void => {
        void queryClient.invalidateQueries({ queryKey: queryKeys.ticketConfig });
    };
    const remove = useMutation({
        mutationFn: () => platformApi.deleteTicketType(type.id),
        onSuccess: () => {
            invalidate();
            toast.success("Ticket type deleted.");
        },
        onError: (error) => {
            toast.error(describeError(error));
        }
    });
    const toggle = useMutation({
        mutationFn: () => platformApi.updateTicketType(type.id, { isEnabled: !type.isEnabled }),
        onSuccess: invalidate,
        onError: (error) => {
            toast.error(describeError(error));
        }
    });
    return (
        <TableRow>
            <TableCell>
                <div className="font-medium">
                    {type.emoji !== null && <span className="mr-1">{type.emoji}</span>}
                    {type.name}
                </div>
                {type.description !== null && <div className="text-muted-foreground text-xs">{type.description}</div>}
            </TableCell>
            <TableCell className="hidden sm:table-cell">{type.kind === TicketKind.Application ? "Application" : "Support"}</TableCell>
            <TableCell>
                <AvailabilityBadge availability={type.availability} />
                {type.openings !== null && (
                    <div className="text-muted-foreground mt-0.5 text-[11px]">
                        {type.filledCount}/{type.openings} filled
                    </div>
                )}
            </TableCell>
            <TableCell className="hidden tabular-nums md:table-cell">{type.openTicketCount}</TableCell>
            <TableCell className="hidden text-xs lg:table-cell">
                <RoleNames roleIds={type.staffRoleIds} empty="Category staff" />
            </TableCell>
            <TableCell className="text-right">
                <div className="flex justify-end gap-1">
                    <TicketTypeDialog
                        category={category}
                        type={type}
                        trigger={
                            <Button size="icon-sm" variant="ghost" aria-label={`Edit ${type.name}`}>
                                <Pencil />
                            </Button>
                        }
                    />
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button size="icon-sm" variant="ghost" aria-label={`More actions for ${type.name}`}>
                                <MoreHorizontal />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuItem disabled={toggle.isPending} onSelect={() => toggle.mutate()}>
                                {type.isEnabled ? "Stop accepting" : "Start accepting"}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem variant="destructive" disabled={remove.isPending} onSelect={() => remove.mutate()}>
                                Delete
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </TableCell>
        </TableRow>
    );
}

function CategoryCard({ category }: { readonly category: TicketCategoryDto }): ReactNode {
    const queryClient = useQueryClient();
    const remove = useMutation({
        mutationFn: () => platformApi.deleteTicketCategory(category.id),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: queryKeys.ticketConfig });
            toast.success("Category deleted.");
        },
        onError: (error) => {
            toast.error(describeError(error));
        }
    });
    const missing = [
        category.threadChannelId === null ? "a ticket channel" : null,
        category.staffRoleIds.length === 0 ? "staff roles" : null
    ].filter((item): item is string => item !== null);
    return (
        <div className="bg-card rounded-md border">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b p-3">
                <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold">
                            {category.emoji !== null && <span className="mr-1">{category.emoji}</span>}
                            {category.name}
                        </h3>
                        {category.departmentId !== null && <ToneBadge tone={Tone.Info}>Department desk</ToneBadge>}
                        {!category.isEnabled && <ToneBadge tone={Tone.Neutral}>Hidden</ToneBadge>}
                        {missing.length > 0 && <ToneBadge tone={Tone.Warning}>Needs {missing.join(" and ")}</ToneBadge>}
                    </div>
                    {category.description !== null && <p className="text-muted-foreground text-xs">{category.description}</p>}
                    <dl className="text-muted-foreground grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
                        <dt>Tickets</dt>
                        <dd>
                            <ChannelName channelId={category.threadChannelId} />
                        </dd>
                        <dt>Staff hub</dt>
                        <dd>
                            <ChannelName channelId={category.notificationChannelId} />
                        </dd>
                        <dt>Logs</dt>
                        <dd>
                            <ChannelName channelId={category.logChannelId} empty="Main log" />
                        </dd>
                        <dt>Staff</dt>
                        <dd>
                            <RoleNames roleIds={category.staffRoleIds} empty="Administrators only" />
                        </dd>
                    </dl>
                </div>
                <div className="flex flex-wrap gap-2">
                    <TicketTypeDialog
                        category={category}
                        trigger={
                            <Button size="sm" variant="outline" disabled={category.types.length >= ticketLimits.typesPerCategory}>
                                <Plus />
                                Ticket type
                            </Button>
                        }
                    />
                    <TicketCategoryDialog
                        category={category}
                        trigger={
                            <Button size="sm" variant="outline">
                                <Pencil />
                                Edit
                            </Button>
                        }
                    />
                    <ConfirmButton
                        title={`Delete ${category.name}?`}
                        description={
                            category.departmentId === null
                                ? "Its ticket types are removed and it disappears from every hub. Past tickets stay in the inbox."
                                : "This is a department desk. The bot sets it up again with default applications the next time it starts, so hide it from Edit instead if you want it off."
                        }
                        confirmLabel="Delete"
                        destructive
                        onConfirm={() => remove.mutate()}
                    >
                        Delete
                    </ConfirmButton>
                </div>
            </div>
            {category.types.length === 0 ? (
                <p className="text-muted-foreground p-4 text-sm">No ticket types yet. Add one so members have something to pick.</p>
            ) : (
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Type</TableHead>
                            <TableHead className="hidden sm:table-cell">Kind</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="hidden md:table-cell">Open</TableHead>
                            <TableHead className="hidden lg:table-cell">Staff</TableHead>
                            <TableHead className="w-24" />
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {category.types.map((type) => (
                            <TypeRow key={type.id} category={category} type={type} />
                        ))}
                    </TableBody>
                </Table>
            )}
        </div>
    );
}

function Setup({ config }: { readonly config: TicketConfigDto }): ReactNode {
    const queryClient = useQueryClient();
    const directory = useDiscordDirectory();
    const starter = useMutation({
        mutationFn: async () => {
            for (const [index, category] of starterCategories.entries()) {
                await platformApi.createTicketCategory({ ...category, position: index * 10 });
            }
        },
        onSettled: () => {
            void queryClient.invalidateQueries({ queryKey: queryKeys.ticketConfig });
        },
        onSuccess: () => {
            toast.success("Starter categories added. Give them channels and staff roles next.");
        },
        onError: (error) => {
            toast.error(describeError(error));
        }
    });
    return (
        <div className="space-y-8">
            {directory !== undefined && directory.syncedAt === null && (
                <p className="text-muted-foreground rounded-md border border-dashed p-3 text-xs">
                    The bot has not reported the server&apos;s channels, roles and members yet, so pickers take raw IDs. They turn into
                    lists once the bot is online, or after running /ticket refresh in Discord.
                </p>
            )}
            <Hubs config={config} />
            <Section
                title="Categories"
                actions={
                    <TicketCategoryDialog
                        trigger={
                            <Button size="sm" disabled={config.categories.length >= ticketLimits.categories}>
                                <Plus />
                                Category
                            </Button>
                        }
                    />
                }
            >
                {config.categories.length === 0 ? (
                    <EmptyState title="No categories yet">
                        <p>Start from the Production, Project and Server layout, or build your own.</p>
                        <Button size="sm" variant="outline" disabled={starter.isPending} onClick={() => starter.mutate()}>
                            Add starter categories
                        </Button>
                    </EmptyState>
                ) : (
                    <div className="space-y-4">
                        {config.categories.map((category) => (
                            <CategoryCard key={category.id} category={category} />
                        ))}
                    </div>
                )}
            </Section>
            <Behaviour settings={config.settings} />
        </div>
    );
}

function TicketsContent(): ReactNode {
    const configQuery = useQuery({ queryKey: queryKeys.ticketConfig, queryFn: () => platformApi.ticketConfig() });
    const accessQuery = useQuery({ queryKey: queryKeys.ticketAccess, queryFn: () => platformApi.ticketAccess() });
    if (configQuery.isPending || accessQuery.isPending) {
        return <LoadingRows />;
    }
    if (configQuery.isError || accessQuery.isError) {
        return (
            <ErrorState
                error={configQuery.error ?? accessQuery.error}
                onRetry={() => void Promise.all([configQuery.refetch(), accessQuery.refetch()])}
            />
        );
    }
    const access = accessQuery.data;
    if (!access.canConfigure && access.categoryIds.length === 0) {
        return (
            <EmptyState title="No tickets for you yet">
                Tickets show here once your Discord roles are set as staff on a ticket category or type.
            </EmptyState>
        );
    }
    return (
        <>
            <Summary />
            <Tabs defaultValue="inbox">
                <TabsList>
                    <TabsTrigger value="inbox">Inbox</TabsTrigger>
                    {access.canConfigure && <TabsTrigger value="setup">Setup</TabsTrigger>}
                </TabsList>
                <TabsContent value="inbox" className="pt-2">
                    <Inbox config={configQuery.data} visibleCategoryIds={access.categoryIds} />
                </TabsContent>
                {access.canConfigure && (
                    <TabsContent value="setup" className="pt-2">
                        <Setup config={configQuery.data} />
                    </TabsContent>
                )}
            </Tabs>
        </>
    );
}

export function TicketsPage(): ReactNode {
    return (
        <RequireRole role={Role.Supervisor}>
            <PageHeader title="Tickets" />
            <TicketsContent />
        </RequireRole>
    );
}
