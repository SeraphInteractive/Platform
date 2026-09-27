"use client";

import { Role, ShotStatus, SubmissionStatus, type ShotDetailDto, type SubmissionDto, type UserDto } from "@platform/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, ExternalLink, Lock } from "lucide-react";
import { usePathname } from "next/navigation";
import { useId, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { ApiError } from "@/Api/ApiClient";
import { platformApi } from "@/Api/PlatformApi";
import { queryKeys } from "@/Api/QueryKeys";
import { ConfirmButton } from "@/Components/Common/ConfirmButton";
import { PageHeader } from "@/Components/Common/PageHeader";
import { RelativeTime } from "@/Components/Common/RelativeTime";
import { Section } from "@/Components/Common/Section";
import { EmptyState, ErrorState, LoadingRows } from "@/Components/Common/States";
import { ShotStatusBadge, SubmissionStatusBadge } from "@/Components/Common/StatusBadge";
import { useBreadcrumbLabel } from "@/Components/Layout/Breadcrumbs";
import { discordThreadUrl, useSiteConfig } from "@/Components/SiteConfig";
import { Button } from "@/Components/Ui/button";
import { Card, CardContent } from "@/Components/Ui/card";
import { Checkbox } from "@/Components/Ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/Components/Ui/dialog";
import { Label } from "@/Components/Ui/label";
import { useNow } from "@/Hooks/UseNow";
import { loginHref, useSession } from "@/Hooks/UseSession";
import { difficultyLabels, formatDateTime, pluralize } from "@/Lib/Format";
import { hasAtLeast } from "@/Lib/Roles";
import { safeHttpUrl } from "@/Lib/SafeUrl";
import { SubmitWorkForm } from "./SubmitWorkForm";

function ClaimDialog({ shot }: { readonly shot: ShotDetailDto }): ReactNode {
    const checkboxId = useId();
    const queryClient = useQueryClient();
    const [open, setOpen] = useState(false);
    const [committed, setCommitted] = useState(false);
    const now = useNow(60_000);
    const deadline = new Date(now + shot.tierDays * 86_400_000).toISOString();
    const claim = useMutation({
        mutationFn: () => platformApi.claimShot(shot.id),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: queryKeys.shot(shot.id) });
            void queryClient.invalidateQueries({ queryKey: queryKeys.shotsAll });
            toast.success(`Claimed ${shot.shotCode}.`);
            setOpen(false);
        }
    });
    return (
        <Dialog
            open={open}
            onOpenChange={(next) => {
                setOpen(next);
                if (!next) {
                    setCommitted(false);
                }
            }}
        >
            <DialogTrigger asChild>
                <Button>Claim this task</Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Claim {shot.shotCode}?</DialogTitle>
                    <DialogDescription>
                        You&apos;ll have {pluralize(shot.tierDays, "day")}, until {formatDateTime(deadline)}. While it&apos;s yours, nobody
                        else can work on it.
                    </DialogDescription>
                </DialogHeader>
                <ul className="text-muted-foreground list-inside list-[square] space-y-1.5 text-sm">
                    <li>Deliver a rendered video, and the .blend file if you can, before the deadline.</li>
                    <li>Follow the brief. Ask in the task&apos;s Discord thread if something is unclear.</li>
                    <li>If you get blocked, release the task so someone else can pick it up.</li>
                </ul>
                <div className="flex items-start gap-2">
                    <Checkbox
                        id={checkboxId}
                        checked={committed}
                        onCheckedChange={(value) => {
                            setCommitted(value === true);
                        }}
                    />
                    <Label htmlFor={checkboxId} className="leading-snug">
                        I can commit to this.
                    </Label>
                </div>
                <DialogFooter>
                    <Button
                        disabled={!committed || claim.isPending}
                        onClick={() => {
                            claim.mutate();
                        }}
                    >
                        {claim.isPending ? "Claiming…" : "Claim task"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function ReleaseButton({ shot, isClaimant }: { readonly shot: ShotDetailDto; readonly isClaimant: boolean }): ReactNode {
    const queryClient = useQueryClient();
    const release = useMutation({
        mutationFn: () => platformApi.releaseShot(shot.id, null),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: queryKeys.shot(shot.id) });
            void queryClient.invalidateQueries({ queryKey: queryKeys.shotsAll });
            toast.success(`Released ${shot.shotCode}.`);
        }
    });
    return (
        <ConfirmButton
            title={isClaimant ? "Hand this task back?" : `Release ${shot.shotCode} from ${shot.claimer?.username ?? "its claimant"}?`}
            description={isClaimant ? "It goes back into the grab-box." : "The claimant loses the task and it returns to the grab-box."}
            confirmLabel="Release"
            destructive
            disabled={release.isPending}
            onConfirm={() => {
                release.mutate();
            }}
        >
            Release
        </ConfirmButton>
    );
}

function ActionPanel({ shot, user }: { readonly shot: ShotDetailDto; readonly user: UserDto | null }): ReactNode {
    const pathname = usePathname();
    const [showForm, setShowForm] = useState(false);
    const isClaimant = user !== null && shot.claimer?.id === user.id;
    const isStaff = hasAtLeast(user, Role.Supervisor);
    const latest = shot.submissions[0];

    if (shot.status === ShotStatus.Approved) {
        return <p className="text-sm">Approved.</p>;
    }
    if (shot.status === ShotStatus.Submitted) {
        return <p className="text-sm">{isClaimant ? "Submitted. Waiting for review." : "Waiting for review."}</p>;
    }
    if (shot.status === ShotStatus.Claimed) {
        if (!isClaimant) {
            return (
                <div className="space-y-3">
                    <p className="text-sm">
                        {shot.claimer?.username ?? "Someone"} is working on this
                        {shot.deadlineAt !== null && (
                            <>
                                {", "}
                                <RelativeTime value={shot.deadlineAt} prefix="due" />
                            </>
                        )}
                        .
                    </p>
                    {isStaff && <ReleaseButton shot={shot} isClaimant={false} />}
                </div>
            );
        }
        return (
            <div className="space-y-4">
                <p className="text-sm">
                    This task is yours
                    {shot.deadlineAt !== null && (
                        <>
                            {", "}
                            <RelativeTime value={shot.deadlineAt} prefix="due" />
                        </>
                    )}
                    .{latest?.status === SubmissionStatus.RevisionRequested && " Your reviewer asked for changes; their notes are below."}
                </p>
                {showForm ? (
                    <SubmitWorkForm
                        shot={shot}
                        onSubmitted={() => {
                            setShowForm(false);
                        }}
                    />
                ) : (
                    <div className="flex flex-wrap gap-2">
                        <Button
                            onClick={() => {
                                setShowForm(true);
                            }}
                        >
                            Submit your work
                        </Button>
                        <ReleaseButton shot={shot} isClaimant />
                    </div>
                )}
            </div>
        );
    }
    if (user === null) {
        return (
            <div className="space-y-3">
                <p className="text-sm">Sign in to claim this task.</p>
                <Button asChild>
                    <a href={loginHref(pathname)}>Sign in with Discord</a>
                </Button>
            </div>
        );
    }
    if (!hasAtLeast(user, Role.Contributor)) {
        return <p className="text-sm">Tasks are claimed by contributors. Ask in the Discord if you&apos;d like to become one.</p>;
    }
    if (user.isBlacklisted) {
        return <p className="text-sm">Your account can&apos;t claim tasks right now. Reach out to a moderator on Discord.</p>;
    }
    if (shot.isSeniorLocked && !hasAtLeast(user, Role.SeniorContributor)) {
        return (
            <p className="flex items-center gap-2 text-sm">
                <Lock className="size-4" />
                Senior contributors get first pick.
                {shot.seniorPriorityUntil !== null && <RelativeTime value={shot.seniorPriorityUntil} prefix="Opens to everyone" />}
            </p>
        );
    }
    return (
        <div className="space-y-3">
            <p className="text-muted-foreground text-sm">One active task per contributor.</p>
            <ClaimDialog shot={shot} />
        </div>
    );
}

function DownloadLink({ href, label }: { readonly href: string | null; readonly label: string }): ReactNode {
    const url = safeHttpUrl(href);
    if (url === null) {
        return null;
    }
    return (
        <Button asChild size="xs" variant="outline">
            <a href={url} target="_blank" rel="noopener noreferrer">
                <Download />
                {label}
            </a>
        </Button>
    );
}

function SubmissionTimeline({ submissions }: { readonly submissions: readonly SubmissionDto[] }): ReactNode {
    if (submissions.length === 0) {
        return <p className="text-muted-foreground text-sm">No submissions.</p>;
    }
    return (
        <ol className="border-border space-y-6 border-l pl-6">
            {submissions.map((submission) => (
                <li key={submission.id} className="relative space-y-2">
                    <span
                        className="bg-background border-foreground absolute top-1 -left-[1.8rem] size-2.5 rounded-full border"
                        aria-hidden="true"
                    />
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold">Version {submission.version}</span>
                        <SubmissionStatusBadge status={submission.status} />
                    </div>
                    <p className="text-muted-foreground text-xs">
                        {submission.contributor?.username ?? "Unknown"} · <RelativeTime value={submission.createdAt} />
                    </p>
                    {submission.notes !== null && <p className="text-sm whitespace-pre-line">{submission.notes}</p>}
                    {submission.supervisorNotes !== null && (
                        <div className="bg-muted/50 border-l-2 px-3 py-2 text-sm">
                            <p className="text-muted-foreground mb-1 text-xs">
                                Feedback from {submission.reviewer?.username ?? "the reviewer"}
                            </p>
                            <p className="whitespace-pre-line">{submission.supervisorNotes}</p>
                        </div>
                    )}
                    <div className="flex flex-wrap gap-2">
                        <DownloadLink href={submission.videoUrl} label="Video" />
                        <DownloadLink href={submission.blendUrl} label="Project file" />
                    </div>
                </li>
            ))}
        </ol>
    );
}

function Fact({ label, children }: { readonly label: string; readonly children: ReactNode }): ReactNode {
    return (
        <div className="space-y-0.5">
            <dt className="text-muted-foreground text-xs">{label}</dt>
            <dd className="text-sm">{children}</dd>
        </div>
    );
}

function ShotDetail({ shot }: { readonly shot: ShotDetailDto }): ReactNode {
    const { user } = useSession();
    const siteConfig = useSiteConfig();
    useBreadcrumbLabel(shot.id, shot.shotCode);
    const threads = useQuery({ queryKey: queryKeys.threadMaps, queryFn: () => platformApi.threadMaps(), staleTime: 300_000 });
    const threadId = threads.data?.find((map) => map.shotId === shot.id)?.discordThreadId;
    const threadUrl = threadId === undefined ? null : discordThreadUrl(siteConfig, threadId);

    return (
        <>
            <PageHeader
                eyebrow={`${shot.shotCode} · Scene ${shot.sceneNumber}`}
                title={shot.title}
                description={<ShotStatusBadge status={shot.status} />}
                actions={
                    threadUrl === null ? undefined : (
                        <Button asChild variant="outline" size="sm">
                            <a href={threadUrl} target="_blank" rel="noopener noreferrer">
                                <ExternalLink />
                                Discord thread
                            </a>
                        </Button>
                    )
                }
            />
            <div className="grid gap-10 lg:grid-cols-[1fr_18rem]">
                <div className="space-y-10">
                    <Section title="The brief">
                        {shot.description === null ? (
                            <p className="text-muted-foreground text-sm">No brief.</p>
                        ) : (
                            <p className="max-w-[70ch] text-sm leading-relaxed whitespace-pre-line">{shot.description}</p>
                        )}
                    </Section>
                    <Section title="Submissions">
                        <SubmissionTimeline submissions={shot.submissions} />
                    </Section>
                </div>
                <aside className="space-y-6 lg:sticky lg:top-20 lg:self-start">
                    <Card>
                        <CardContent>
                            <ActionPanel shot={shot} user={user} />
                        </CardContent>
                    </Card>
                    <dl className="grid grid-cols-2 gap-4">
                        <Fact label="Difficulty">{difficultyLabels[shot.difficultyTier]}</Fact>
                        <Fact label="Time to deliver">{pluralize(shot.tierDays, "day")}</Fact>
                        <Fact label="Claimed by">{shot.claimer?.username ?? "Nobody yet"}</Fact>
                        <Fact label="Due">{shot.deadlineAt === null ? "—" : <RelativeTime value={shot.deadlineAt} />}</Fact>
                    </dl>
                </aside>
            </div>
        </>
    );
}

export function ShotView({ shotId }: { readonly shotId: string }): ReactNode {
    const shot = useQuery({ queryKey: queryKeys.shot(shotId), queryFn: () => platformApi.shot(shotId) });
    if (shot.isPending) {
        return <LoadingRows rows={5} />;
    }
    if (shot.isError) {
        return shot.error instanceof ApiError && shot.error.status === 404 ? (
            <EmptyState title="Task not found">It may have been removed from the grab-box.</EmptyState>
        ) : (
            <ErrorState error={shot.error} onRetry={() => void shot.refetch()} />
        );
    }
    return <ShotDetail shot={shot.data} />;
}
