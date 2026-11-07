"use client";

import {
    ApplicationStage,
    applicationStageLabels,
    applicationStageTransitions,
    effectiveStaffRoleIds,
    Role,
    TicketEventKind,
    TicketKind,
    ticketLimits,
    TicketMessageSource,
    TicketStatus,
    type TicketConfigDto,
    type TicketDetailDto,
    type TicketDto,
    type TicketEventDto,
    type TicketMessageDto,
    type TicketPersonDto
} from "@platform/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ExternalLink, FileText, Lock, MessageSquare, StickyNote, UserMinus, UserPlus, UserRound } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { describeError } from "@/Api/ApiClient";
import { platformApi } from "@/Api/PlatformApi";
import { queryKeys } from "@/Api/QueryKeys";
import { MarkdownText } from "@/Components/Common/MarkdownText";
import { RelativeTime } from "@/Components/Common/RelativeTime";
import { EmptyState, ErrorState, LoadingRows, RequireRole } from "@/Components/Common/States";
import { Tone, ToneBadge } from "@/Components/Common/StatusBadge";
import { Button } from "@/Components/Ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/Components/Ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/Components/Ui/tabs";
import { Textarea } from "@/Components/Ui/textarea";
import { useSession } from "@/Hooks/UseSession";
import { formatDateTime } from "@/Lib/Format";
import { cn } from "@/Lib/Utils";
import { MemberAvatar, MemberPicker, useDiscordDirectory } from "./DiscordPickers";
import { discordThreadLink, TicketStateBadge } from "./TicketBadges";

type TimelineItem =
    | { readonly kind: "message"; readonly at: string; readonly message: TicketMessageDto }
    | { readonly kind: "event"; readonly at: string; readonly event: TicketEventDto };

interface ActionDialogProps {
    readonly trigger: ReactNode;
    readonly title: string;
    readonly description: ReactNode;
    readonly confirmLabel: string;
    readonly noteLabel: string;
    readonly destructive?: boolean;
    readonly pending: boolean;
    readonly onConfirm: (note: string | null) => void;
}

function ActionDialog({
    trigger,
    title,
    description,
    confirmLabel,
    noteLabel,
    destructive = false,
    pending,
    onConfirm
}: ActionDialogProps): ReactNode {
    const [open, setOpen] = useState(false);
    const [note, setNote] = useState("");
    return (
        <Dialog
            open={open}
            onOpenChange={(next) => {
                setOpen(next);
                if (next) {
                    setNote("");
                }
            }}
        >
            <DialogTrigger asChild>{trigger}</DialogTrigger>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                    <DialogDescription>{description}</DialogDescription>
                </DialogHeader>
                <Textarea
                    rows={4}
                    value={note}
                    maxLength={ticketLimits.note}
                    placeholder={noteLabel}
                    aria-label={noteLabel}
                    onChange={(event) => setNote(event.target.value)}
                />
                <DialogFooter>
                    <Button variant="outline" onClick={() => setOpen(false)}>
                        Cancel
                    </Button>
                    <Button
                        variant={destructive ? "destructive" : "default"}
                        disabled={pending}
                        onClick={() => {
                            const trimmed = note.trim();
                            onConfirm(trimmed.length === 0 ? null : trimmed);
                            setOpen(false);
                        }}
                    >
                        {confirmLabel}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function eventLine(event: TicketEventDto): ReactNode {
    const actor = <span className="text-foreground font-medium">{event.actor?.username ?? "Someone"}</span>;
    switch (event.kind) {
        case TicketEventKind.Opened:
            return <>{actor} opened the ticket</>;
        case TicketEventKind.StageChanged:
            return (
                <>
                    {actor} moved the application to{" "}
                    <span className="text-foreground font-medium">
                        {event.stage === null ? "a new stage" : applicationStageLabels[event.stage]}
                    </span>
                </>
            );
        case TicketEventKind.Closed:
            return <>{actor} closed the ticket</>;
        case TicketEventKind.Reopened:
            return <>{actor} reopened the ticket</>;
        case TicketEventKind.Assigned:
            if (event.target === null) {
                return <>{actor} cleared the assignment</>;
            }
            return event.target.discordId === event.actor?.discordId ? (
                <>{actor} claimed the ticket</>
            ) : (
                <>
                    {actor} assigned <span className="text-foreground font-medium">{event.target.username}</span>
                </>
            );
        case TicketEventKind.MemberAdded:
            return (
                <>
                    {actor} added <span className="text-foreground font-medium">{event.target?.username ?? "a member"}</span>
                </>
            );
        default:
            return actor;
    }
}

function MessageItem({ message, openerId }: { readonly message: TicketMessageDto; readonly openerId: string }): ReactNode {
    const directory = useDiscordDirectory();
    const member = directory?.members.find((candidate) => candidate.id === message.author.discordId);
    const isOpener = message.author.discordId === openerId;
    return (
        <li className="flex gap-3">
            <MemberAvatar member={member} name={message.author.username} className="mt-0.5 size-8" />
            <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-baseline gap-x-2 text-xs">
                    <span className="text-foreground text-sm font-medium">{message.author.username}</span>
                    {isOpener && <ToneBadge tone={Tone.Info}>Member</ToneBadge>}
                    {message.source === TicketMessageSource.Web && <ToneBadge tone={Tone.Neutral}>Sent from the web</ToneBadge>}
                    <span className="text-muted-foreground" title={formatDateTime(message.createdAt)}>
                        <RelativeTime value={message.createdAt} />
                    </span>
                    {message.editedAt !== null && message.deletedAt === null && <span className="text-muted-foreground">(edited)</span>}
                </div>
                {message.deletedAt !== null ? (
                    <p className="text-muted-foreground text-sm italic">This message was deleted in Discord.</p>
                ) : (
                    <>
                        {message.content.length > 0 && <MarkdownText className="text-sm">{message.content}</MarkdownText>}
                        {message.attachments.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                                {message.attachments.map((attachment) =>
                                    attachment.contentType?.startsWith("image/") === true ? (
                                        <a
                                            key={attachment.url}
                                            href={attachment.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="block overflow-hidden rounded-md border"
                                        >
                                            <img
                                                src={attachment.url}
                                                alt={attachment.name}
                                                className="max-h-48 max-w-64 object-contain"
                                                loading="lazy"
                                            />
                                        </a>
                                    ) : (
                                        <a
                                            key={attachment.url}
                                            href={attachment.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="hover:bg-muted inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs"
                                        >
                                            <FileText className="size-3.5" />
                                            {attachment.name}
                                        </a>
                                    )
                                )}
                            </div>
                        )}
                    </>
                )}
            </div>
        </li>
    );
}

function EventItem({ event }: { readonly event: TicketEventDto }): ReactNode {
    if (event.kind === TicketEventKind.Note) {
        return (
            <li className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3">
                <div className="mb-1 flex flex-wrap items-center gap-2 text-xs">
                    <StickyNote className="size-3.5 text-amber-600" />
                    <span className="font-medium">{event.actor?.username ?? "Staff"}</span>
                    <span className="text-muted-foreground">staff note | only visible here</span>
                    <span className="text-muted-foreground ml-auto">
                        <RelativeTime value={event.createdAt} />
                    </span>
                </div>
                <p className="text-sm whitespace-pre-wrap">{event.note}</p>
            </li>
        );
    }
    return (
        <li className="text-muted-foreground flex flex-wrap items-baseline gap-x-2 border-l-2 pl-3 text-xs">
            <span>{eventLine(event)}</span>
            <span>
                <RelativeTime value={event.createdAt} />
            </span>
            {event.note !== null && <p className="text-foreground/80 basis-full pt-0.5 whitespace-pre-wrap">“{event.note}”</p>}
        </li>
    );
}

function Composer({ ticket }: { readonly ticket: TicketDto }): ReactNode {
    const queryClient = useQueryClient();
    const [reply, setReply] = useState("");
    const [note, setNote] = useState("");
    const refresh = (): void => {
        void queryClient.invalidateQueries({ queryKey: queryKeys.ticket(ticket.id) });
    };
    const sendReply = useMutation({
        mutationFn: () => platformApi.replyToTicket(ticket.id, reply.trim()),
        onSuccess: () => {
            setReply("");
            refresh();
        },
        onError: (error) => {
            toast.error(describeError(error));
        }
    });
    const addNote = useMutation({
        mutationFn: () => platformApi.addTicketNote(ticket.id, note.trim()),
        onSuccess: () => {
            setNote("");
            refresh();
        },
        onError: (error) => {
            toast.error(describeError(error));
        }
    });
    const canReply = ticket.status === TicketStatus.Open && ticket.threadId !== null;
    return (
        <Tabs defaultValue={canReply ? "reply" : "note"} className="bg-card rounded-md border p-3">
            <TabsList>
                <TabsTrigger value="reply" disabled={!canReply}>
                    <MessageSquare className="size-3.5" />
                    Reply
                </TabsTrigger>
                <TabsTrigger value="note">
                    <StickyNote className="size-3.5" />
                    Staff note
                </TabsTrigger>
            </TabsList>
            <TabsContent value="reply" className="space-y-2">
                <Textarea
                    rows={3}
                    value={reply}
                    maxLength={ticketLimits.reply}
                    placeholder="Write to the member. This posts in their ticket thread under your name."
                    aria-label="Reply"
                    onChange={(event) => setReply(event.target.value)}
                    onKeyDown={(event) => {
                        if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && reply.trim().length > 0 && !sendReply.isPending) {
                            sendReply.mutate();
                        }
                    }}
                />
                <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground text-xs">Ctrl + Enter to send</span>
                    <Button size="sm" disabled={reply.trim().length === 0 || sendReply.isPending} onClick={() => sendReply.mutate()}>
                        Send to Discord
                    </Button>
                </div>
            </TabsContent>
            <TabsContent value="note" className="space-y-2">
                <Textarea
                    rows={3}
                    value={note}
                    maxLength={ticketLimits.note}
                    placeholder="Only staff on this panel see notes. Nothing is posted in Discord."
                    aria-label="Staff note"
                    onChange={(event) => setNote(event.target.value)}
                />
                <div className="flex justify-end">
                    <Button
                        size="sm"
                        variant="outline"
                        disabled={note.trim().length === 0 || addNote.isPending}
                        onClick={() => addNote.mutate()}
                    >
                        Add note
                    </Button>
                </div>
            </TabsContent>
        </Tabs>
    );
}

function SideSection({ title, children }: { readonly title: string; readonly children: ReactNode }): ReactNode {
    return (
        <section className="bg-card space-y-3 rounded-md border p-4">
            <h2 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">{title}</h2>
            {children}
        </section>
    );
}

function Actions({ ticket, config }: { readonly ticket: TicketDto; readonly config: TicketConfigDto | undefined }): ReactNode {
    const queryClient = useQueryClient();
    const { user } = useSession();
    const me: TicketPersonDto | null = user === null ? null : { discordId: user.discordId, username: user.username };
    const settle = {
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: queryKeys.ticketsAll });
            toast.success("Saved. Discord updates in a moment.");
        },
        onError: (error: unknown) => {
            toast.error(describeError(error));
        }
    };
    const stage = useMutation({
        mutationFn: (input: {
            stage: ApplicationStage.Interview | ApplicationStage.Accepted | ApplicationStage.Rejected;
            note: string | null;
        }) => platformApi.setTicketStage(ticket.id, input),
        ...settle
    });
    const assign = useMutation({
        mutationFn: (assignee: TicketPersonDto | null) => platformApi.assignTicket(ticket.id, { assignee }),
        ...settle
    });
    const addMember = useMutation({
        mutationFn: (member: TicketPersonDto) => platformApi.addTicketMember(ticket.id, { member }),
        ...settle
    });
    const close = useMutation({ mutationFn: (reason: string | null) => platformApi.closeTicket(ticket.id, { reason }), ...settle });
    const reopen = useMutation({ mutationFn: (reason: string | null) => platformApi.reopenTicket(ticket.id, { reason }), ...settle });

    const staffRoleIds = useMemo(() => {
        const category = config?.categories.find((candidate) => candidate.id === ticket.categoryId);
        if (category === undefined) {
            return undefined;
        }
        return effectiveStaffRoleIds(category, category.types.find((type) => type.id === ticket.typeId) ?? null);
    }, [config, ticket.categoryId, ticket.typeId]);

    const isOpen = ticket.status === TicketStatus.Open;
    const isOwn = me !== null && me.discordId === ticket.opener.discordId;
    const next = ticket.stage === null ? [] : applicationStageTransitions[ticket.stage];

    return (
        <div className="space-y-4">
            <SideSection title="Handled by">
                <div className="flex items-center gap-2 text-sm">
                    <UserRound className="text-muted-foreground size-4" />
                    {ticket.assignee?.username ?? <span className="text-muted-foreground">Nobody yet</span>}
                </div>
                {isOpen && (
                    <div className="flex flex-wrap gap-2">
                        {me !== null && ticket.assignee?.discordId !== me.discordId && (
                            <Button size="sm" disabled={assign.isPending} onClick={() => assign.mutate(me)}>
                                Claim
                            </Button>
                        )}
                        <MemberPicker
                            heading="Staff for this ticket"
                            roleIds={staffRoleIds}
                            exclude={ticket.assignee === null ? [] : [ticket.assignee.discordId]}
                            onPick={(person) => assign.mutate(person)}
                            trigger={
                                <Button size="sm" variant="outline">
                                    Assign
                                </Button>
                            }
                        />
                        {ticket.assignee !== null && (
                            <Button size="sm" variant="ghost" disabled={assign.isPending} onClick={() => assign.mutate(null)}>
                                <UserMinus />
                                Unassign
                            </Button>
                        )}
                    </div>
                )}
            </SideSection>

            {ticket.kind === TicketKind.Application && (
                <SideSection title="Application">
                    <TicketStateBadge ticket={ticket} />
                    {ticket.decidedBy !== null && (
                        <p className="text-muted-foreground text-xs">
                            Decided by {ticket.decidedBy.username}
                            {ticket.decidedAt !== null && <> | {formatDateTime(ticket.decidedAt)}</>}
                        </p>
                    )}
                    {ticket.decisionNote !== null && <p className="text-sm whitespace-pre-wrap">“{ticket.decisionNote}”</p>}
                    {isOpen && next.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                            {isOwn && <p className="text-muted-foreground text-xs">You cannot review your own application.</p>}
                            {!isOwn && next.includes(ApplicationStage.Interview) && (
                                <ActionDialog
                                    title="Invite to interview"
                                    description="The applicant gets the interview message in their ticket and by DM."
                                    confirmLabel="Invite"
                                    noteLabel="Add a personal note (optional)"
                                    pending={stage.isPending}
                                    onConfirm={(note) => stage.mutate({ stage: ApplicationStage.Interview, note })}
                                    trigger={<Button size="sm">Invite to interview</Button>}
                                />
                            )}
                            {!isOwn && (
                                <ActionDialog
                                    title="Accept application"
                                    description="Accepting fills a seat. When every opening is filled the position stops taking applications."
                                    confirmLabel="Accept"
                                    noteLabel="Add a personal note (optional)"
                                    pending={stage.isPending}
                                    onConfirm={(note) => stage.mutate({ stage: ApplicationStage.Accepted, note })}
                                    trigger={
                                        <Button size="sm" variant="outline" className="text-success">
                                            Accept
                                        </Button>
                                    }
                                />
                            )}
                            {!isOwn && (
                                <ActionDialog
                                    title="Reject application"
                                    description="The applicant gets the rejection message in their ticket and by DM."
                                    confirmLabel="Reject"
                                    noteLabel="Add a personal note (optional)"
                                    destructive
                                    pending={stage.isPending}
                                    onConfirm={(note) => stage.mutate({ stage: ApplicationStage.Rejected, note })}
                                    trigger={
                                        <Button size="sm" variant="outline" className="text-destructive">
                                            Reject
                                        </Button>
                                    }
                                />
                            )}
                        </div>
                    )}
                </SideSection>
            )}

            <SideSection title="Ticket">
                {isOpen && (
                    <MemberPicker
                        heading="Add to the thread"
                        onPick={(person) => addMember.mutate(person)}
                        trigger={
                            <Button size="sm" variant="outline" className="w-full justify-start" disabled={ticket.threadId === null}>
                                <UserPlus />
                                Add someone to the thread
                            </Button>
                        }
                    />
                )}
                {isOpen ? (
                    <ActionDialog
                        title={`Close #${ticket.number}`}
                        description="The thread is locked and archived. A transcript goes to the log channel if that is turned on."
                        confirmLabel="Close ticket"
                        noteLabel="Reason (optional)"
                        destructive
                        pending={close.isPending}
                        onConfirm={(reason) => close.mutate(reason)}
                        trigger={
                            <Button size="sm" variant="outline" className="w-full justify-start">
                                <Lock />
                                Close ticket
                            </Button>
                        }
                    />
                ) : (
                    <ActionDialog
                        title={`Reopen #${ticket.number}`}
                        description="The thread is unlocked so the conversation can continue."
                        confirmLabel="Reopen"
                        noteLabel="Reason (optional)"
                        pending={reopen.isPending}
                        onConfirm={(reason) => reopen.mutate(reason)}
                        trigger={
                            <Button size="sm" variant="outline" className="w-full justify-start">
                                Reopen ticket
                            </Button>
                        }
                    />
                )}
                {ticket.closedBy !== null && (
                    <p className="text-muted-foreground text-xs">
                        Closed by {ticket.closedBy.username}
                        {ticket.closeReason !== null && <>: “{ticket.closeReason}”</>}
                    </p>
                )}
            </SideSection>
        </div>
    );
}

function Details({ detail }: { readonly detail: TicketDetailDto }): ReactNode {
    const { ticket } = detail;
    const rows: [string, ReactNode][] = [
        ["Category", ticket.categoryName],
        ["Kind", ticket.kind === TicketKind.Application ? "Application" : "Support"],
        ["Opened by", ticket.opener.username],
        ["Opened", formatDateTime(ticket.createdAt)],
        ["Last activity", <RelativeTime key="activity" value={ticket.lastActivityAt} />]
    ];
    return (
        <SideSection title="Details">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
                {rows.map(([label, value]) => (
                    <div key={label} className="contents">
                        <dt className="text-muted-foreground">{label}</dt>
                        <dd className="min-w-0 truncate">{value}</dd>
                    </div>
                ))}
            </dl>
        </SideSection>
    );
}

function TicketDetailContent({ ticketId }: { readonly ticketId: string }): ReactNode {
    const detailQuery = useQuery({
        queryKey: queryKeys.ticket(ticketId),
        queryFn: () => platformApi.ticketDetail(ticketId),
        refetchInterval: 10_000
    });
    const configQuery = useQuery({ queryKey: queryKeys.ticketConfig, queryFn: () => platformApi.ticketConfig() });
    const timeline = useMemo<TimelineItem[]>(() => {
        if (detailQuery.data === undefined) {
            return [];
        }
        const messages = detailQuery.data.messages.map((message): TimelineItem => ({ kind: "message", at: message.createdAt, message }));
        const events = detailQuery.data.events.map((event): TimelineItem => ({ kind: "event", at: event.createdAt, event }));
        return [...messages, ...events].sort((left, right) => new Date(left.at).getTime() - new Date(right.at).getTime());
    }, [detailQuery.data]);

    if (detailQuery.isPending) {
        return <LoadingRows rows={8} />;
    }
    if (detailQuery.isError) {
        return <ErrorState error={detailQuery.error} onRetry={() => void detailQuery.refetch()} />;
    }
    const detail = detailQuery.data;
    const { ticket } = detail;
    const threadUrl = discordThreadLink(detail.guildId, ticket.threadId);

    return (
        <div>
            <Link
                href={"/studio/tickets" as Route}
                className="text-muted-foreground hover:text-foreground mb-3 inline-flex items-center gap-1 text-xs"
            >
                <ArrowLeft className="size-3.5" />
                All tickets
            </Link>
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 space-y-1">
                    <p className="text-muted-foreground text-xs tracking-wider uppercase">Ticket #{ticket.number}</p>
                    <h1 className="truncate text-lg font-semibold">{ticket.typeName}</h1>
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                        <TicketStateBadge ticket={ticket} />
                        <span className="text-muted-foreground">from {ticket.opener.username}</span>
                    </div>
                </div>
                {threadUrl !== null && (
                    <Button asChild size="sm" variant="outline">
                        <a href={threadUrl} target="_blank" rel="noopener noreferrer">
                            Open in Discord
                            <ExternalLink />
                        </a>
                    </Button>
                )}
            </div>
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
                <div className="min-w-0 space-y-4">
                    {ticket.answers.length > 0 && (
                        <section className="bg-card space-y-3 rounded-md border p-4">
                            <h2 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                                {ticket.kind === TicketKind.Application ? "Application" : "Form answers"}
                            </h2>
                            <dl className="space-y-3">
                                {ticket.answers.map((answer) => (
                                    <div key={answer.questionId}>
                                        <dt className="text-sm font-medium">{answer.label}</dt>
                                        <dd className="text-muted-foreground text-sm whitespace-pre-wrap">{answer.value}</dd>
                                    </div>
                                ))}
                            </dl>
                        </section>
                    )}
                    <section className="space-y-3">
                        <h2 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">Conversation</h2>
                        {timeline.length === 0 ? (
                            <p className="text-muted-foreground text-sm">Nothing yet.</p>
                        ) : (
                            <ol className="space-y-4">
                                {timeline.map((item) =>
                                    item.kind === "message" ? (
                                        <MessageItem
                                            key={`m-${item.message.id}`}
                                            message={item.message}
                                            openerId={ticket.opener.discordId}
                                        />
                                    ) : (
                                        <EventItem key={`e-${item.event.id}`} event={item.event} />
                                    )
                                )}
                            </ol>
                        )}
                    </section>
                    <Composer ticket={ticket} />
                </div>
                <aside className={cn("space-y-4", "lg:sticky lg:top-4 lg:self-start")}>
                    <Actions ticket={ticket} config={configQuery.data} />
                    <Details detail={detail} />
                </aside>
            </div>
        </div>
    );
}

export function TicketDetailView({ ticketId }: { readonly ticketId: string }): ReactNode {
    return (
        <RequireRole role={Role.Supervisor}>
            <TicketDetailContent ticketId={ticketId} />
        </RequireRole>
    );
}

export function TicketNotFound(): ReactNode {
    return <EmptyState title="Ticket not found">It may be outside the categories you staff.</EmptyState>;
}
