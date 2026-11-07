"use client";

import { RoundStatus, type EntryDto, type RoundDto, type ShotDto, type UserDto, type UserModerationRecordDto } from "@platform/contracts";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, BadgeCheck, CheckCircle2, Clock, Mail, ShieldAlert, ShieldCheck, Sparkles } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { platformApi } from "@/Api/PlatformApi";
import { queryKeys } from "@/Api/QueryKeys";
import { CountdownTimer } from "@/Components/Common/CountdownTimer";
import { PageHeader } from "@/Components/Common/PageHeader";
import { RelativeTime } from "@/Components/Common/RelativeTime";
import { Section } from "@/Components/Common/Section";
import { ErrorState, LoadingRows, SignInPrompt } from "@/Components/Common/States";
import { EntryStatusBadge, RoundStatusBadge, ShotStatusBadge, Tone, ToneBadge } from "@/Components/Common/StatusBadge";
import { Alert, AlertDescription, AlertTitle } from "@/Components/Ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/Components/Ui/avatar";
import { Button } from "@/Components/Ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/Components/Ui/card";
import { useMyShots } from "@/Features/Grabbox/UseMyShots";
import { EntryMedia } from "@/Features/Voting/EntryMedia";
import { useSession } from "@/Hooks/UseSession";
import { formatDate, pollTypeLabels, specialtyLabel } from "@/Lib/Format";
import { roleLabels } from "@/Lib/Roles";
import { safeHttpUrl } from "@/Lib/SafeUrl";

function Identity({ user }: { readonly user: UserDto }): ReactNode {
    const avatar = safeHttpUrl(user.avatarUrl);
    return (
        <div className="flex items-center gap-4">
            <Avatar className="size-14">
                {avatar !== null && <AvatarImage src={avatar} alt="" />}
                <AvatarFallback>{user.username.slice(0, 2).toUpperCase()}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 space-y-1">
                <div className="flex items-center gap-2">
                    <p className="truncate text-lg font-semibold">{user.username}</p>
                    {user.isVerified && (
                        <span title="Email verified" className="inline-flex items-center">
                            <BadgeCheck className="text-success size-4 shrink-0" />
                        </span>
                    )}
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                    <ToneBadge tone={Tone.Info}>{roleLabels[user.role]}</ToneBadge>
                    {user.isBlacklisted ? (
                        <ToneBadge tone={Tone.Negative}>Blacklisted</ToneBadge>
                    ) : (
                        <ToneBadge tone={Tone.Positive}>Good standing</ToneBadge>
                    )}
                </div>
                <p className="text-muted-foreground text-xs">Member since {formatDate(user.createdAt)}</p>
            </div>
        </div>
    );
}

function SpecialtiesSection({ user }: { readonly user: UserDto }): ReactNode {
    return (
        <Section title="Specialties">
            <div className="space-y-2">
                {user.specialties.length > 0 ? (
                    <div className="flex flex-wrap items-center gap-1.5">
                        {user.specialties.map((specialty) => (
                            <ToneBadge key={specialty} tone={Tone.Neutral}>
                                {specialtyLabel(specialty)}
                            </ToneBadge>
                        ))}
                    </div>
                ) : (
                    <p className="text-muted-foreground text-sm">No specialties assigned.</p>
                )}
                <p className="text-muted-foreground text-xs">Specialties are assigned and managed by department supervisors.</p>
            </div>
        </Section>
    );
}

function StandingSection({ user }: { readonly user: UserDto }): ReactNode {
    const moderation = useQuery({
        queryKey: queryKeys.myModeration,
        queryFn: () => platformApi.myModerationRecord(),
        enabled: Boolean(user.discordId)
    });

    if (moderation.isPending) {
        return (
            <Section title="Warning levels & standing">
                <LoadingRows rows={2} />
            </Section>
        );
    }

    const record: UserModerationRecordDto | undefined = moderation.data;
    const offenceLevel = record?.offenceLevel ?? 0;
    const stageWarnings = record?.stageWarnings ?? 0;
    const infractions = record?.infractions ?? [];
    const timeouts = record?.timeouts ?? [];
    const apology = record?.apology;

    const hasWarnings = offenceLevel > 0 || stageWarnings > 0 || infractions.length > 0 || timeouts.length > 0;

    return (
        <Section title="Warning levels & standing">
            <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <div className="rounded border bg-card p-3">
                        <p className="text-[11px] text-muted-foreground">Standing</p>
                        <div className="mt-1 flex items-center gap-1.5">
                            {user.isBlacklisted ? (
                                <>
                                    <ShieldAlert className="size-4 text-destructive" />
                                    <span className="font-semibold text-xs text-destructive">Blacklisted</span>
                                </>
                            ) : hasWarnings ? (
                                <>
                                    <AlertTriangle className="size-4 text-amber-500" />
                                    <span className="font-semibold text-xs text-amber-500">Notice active</span>
                                </>
                            ) : (
                                <>
                                    <ShieldCheck className="size-4 text-emerald-500" />
                                    <span className="font-semibold text-xs text-emerald-500">Good standing</span>
                                </>
                            )}
                        </div>
                    </div>
                    <div className="rounded border bg-card p-3">
                        <p className="text-[11px] text-muted-foreground">Offence level</p>
                        <p className="mt-1 font-mono text-sm font-semibold tabular-nums">Level {offenceLevel}</p>
                    </div>
                    <div className="rounded border bg-card p-3">
                        <p className="text-[11px] text-muted-foreground">Stage warnings</p>
                        <p className="mt-1 font-mono text-sm font-semibold tabular-nums">
                            {stageWarnings} warning{stageWarnings === 1 ? "" : "s"}
                        </p>
                    </div>
                    <div className="rounded border bg-card p-3">
                        <p className="text-[11px] text-muted-foreground">Total infractions</p>
                        <p className="mt-1 font-mono text-sm font-semibold tabular-nums">{infractions.length}</p>
                    </div>
                </div>

                {apology && apology.status !== "none" && (
                    <Alert
                        className={
                            apology.status === "approved" ? "border-emerald-500/40 bg-emerald-500/5" : "border-amber-500/40 bg-amber-500/5"
                        }
                    >
                        <AlertTitle className="capitalize">Formal apology: {apology.status}</AlertTitle>
                        <AlertDescription className="text-xs text-muted-foreground">
                            {apology.status === "pending" && "Your written apology is under review by supervisors."}
                            {apology.status === "approved" && "Your apology was accepted by staff."}
                            {apology.status === "rejected" && "Your apology was not approved. Please consult supervisors on Discord."}
                        </AlertDescription>
                    </Alert>
                )}

                {timeouts.length > 0 && (
                    <div className="space-y-2">
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Recent timeouts</h4>
                        <div className="divide-y rounded-md border bg-card text-xs">
                            {timeouts.map((t) => (
                                <div key={t.id} className="flex items-center justify-between p-3">
                                    <div className="space-y-0.5">
                                        <p className="font-medium text-foreground">{t.reason}</p>
                                        <p className="text-muted-foreground text-[11px]">
                                            Level {t.level} - {Math.round(t.durationMs / 60_000)} min duration
                                        </p>
                                    </div>
                                    <span className="text-muted-foreground font-mono text-[11px]">
                                        <RelativeTime value={t.timestamp} />
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {infractions.length > 0 ? (
                    <div className="space-y-2">
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Infraction history</h4>
                        <div className="divide-y rounded-md border bg-card text-xs">
                            {infractions.map((item) => (
                                <div key={item.id} className="space-y-1 p-3">
                                    <div className="flex items-center justify-between">
                                        <span className="font-medium text-foreground">{item.reason}</span>
                                        <span className="text-muted-foreground font-mono text-[11px]">
                                            <RelativeTime value={item.timestamp} />
                                        </span>
                                    </div>
                                    {item.messageSnippet && (
                                        <p className="text-muted-foreground font-mono text-[11px] bg-muted/30 rounded px-2 py-1 truncate">
                                            {item.messageSnippet}
                                        </p>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                ) : (
                    <div className="flex items-center gap-2 rounded-md border border-dashed px-4 py-4 text-xs text-muted-foreground">
                        <CheckCircle2 className="size-4 text-emerald-500 shrink-0" />
                        <span>No infractions or strikes recorded. Account is compliant with community guidelines.</span>
                    </div>
                )}
            </div>
        </Section>
    );
}

function ShotRow({ shot }: { readonly shot: ShotDto }): ReactNode {
    return (
        <li>
            <Link href={`/grabbox/${shot.id}` as Route} className="hover:bg-accent/50 flex items-center justify-between gap-4 px-4 py-3">
                <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">
                        {shot.shotCode} - {shot.title}
                    </span>
                    <span className="text-muted-foreground text-xs">
                        {shot.latestSubmission === null ? "No submissions" : `Version ${String(shot.latestSubmission.version)}`}
                    </span>
                </span>
                <ShotStatusBadge status={shot.status} />
            </Link>
        </li>
    );
}

function TasksSection({ user }: { readonly user: UserDto }): ReactNode {
    const myShots = useMyShots(user.id);
    if (myShots.isPending) {
        return <LoadingRows rows={2} />;
    }
    if (myShots.error !== null) {
        return <ErrorState error={myShots.error} onRetry={myShots.refetch} />;
    }

    const pastShots = [...myShots.submitted, ...myShots.approved];

    return (
        <Section title="Grab-box tasks">
            <div className="space-y-4">
                {myShots.active === null ? (
                    <Card>
                        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between py-4">
                            <div>
                                <p className="text-sm font-medium">No active task</p>
                                <p className="text-xs text-muted-foreground">
                                    Claim an available task from the grab-box to start contributing.
                                </p>
                            </div>
                            <Button asChild size="sm">
                                <Link href="/grabbox">
                                    Find a task
                                    <ArrowRight className="size-4 ml-1.5" />
                                </Link>
                            </Button>
                        </CardContent>
                    </Card>
                ) : (
                    <Card className="border-foreground/40 bg-card">
                        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between py-4">
                            <div className="min-w-0 space-y-1">
                                <div className="flex items-center gap-2">
                                    <span className="font-mono text-xs font-semibold text-primary">{myShots.active.shotCode}</span>
                                    <ShotStatusBadge status={myShots.active.status} />
                                </div>
                                <p className="truncate text-base font-semibold text-foreground">{myShots.active.title}</p>
                                {myShots.active.deadlineAt !== null && (
                                    <div className="mt-1">
                                        <CountdownTimer targetDate={myShots.active.deadlineAt} prefix="Due in" />
                                    </div>
                                )}
                            </div>
                            <Button asChild size="sm">
                                <Link href={`/grabbox/${myShots.active.id}` as Route}>
                                    Open task
                                    <ArrowRight className="size-4 ml-1.5" />
                                </Link>
                            </Button>
                        </CardContent>
                    </Card>
                )}

                {pastShots.length > 0 && (
                    <div className="space-y-2 pt-2">
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Past & submitted tasks</h4>
                        <ul className="divide-y rounded-lg border bg-card overflow-hidden">
                            {pastShots.map((shot) => (
                                <ShotRow key={shot.id} shot={shot} />
                            ))}
                        </ul>
                    </div>
                )}
            </div>
        </Section>
    );
}

function UserEntriesSection(): ReactNode {
    const myEntries = useQuery({
        queryKey: queryKeys.myEntries,
        queryFn: () => platformApi.myEntries()
    });
    const rounds = useQuery({
        queryKey: queryKeys.rounds({ page: 1, perPage: 100 }),
        queryFn: () => platformApi.rounds({ page: 1, perPage: 100 })
    });

    if (myEntries.isPending) {
        return <LoadingRows rows={2} />;
    }
    if (myEntries.isError || myEntries.data.length === 0) {
        return null;
    }

    const roundMap = new Map((rounds.data?.data ?? []).map((round: RoundDto) => [round.id, round]));

    return (
        <Section title="My proposed round entries">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {myEntries.data.map((entry: EntryDto) => {
                    const parentRound = roundMap.get(entry.roundId);
                    return (
                        <Link
                            key={entry.id}
                            href={`/voting/${entry.roundId}` as Route}
                            className="group bg-card text-card-foreground hover:border-primary/50 flex flex-col overflow-hidden rounded-xl border shadow-xs transition-all hover:shadow-md"
                        >
                            <div className="relative aspect-video w-full overflow-hidden bg-muted/40 border-b">
                                {entry.mediaUrl !== null ? (
                                    <EntryMedia
                                        url={entry.mediaUrl}
                                        title={entry.title}
                                        controls={false}
                                        className="size-full object-cover"
                                    />
                                ) : (
                                    <div className="flex size-full flex-col items-center justify-center gap-1 text-muted-foreground/40 bg-muted/20">
                                        <Sparkles className="size-6 stroke-[1.25]" aria-hidden="true" />
                                        <span className="text-[10px] font-medium">Pitch Idea</span>
                                    </div>
                                )}
                                <div className="absolute top-2 left-2">
                                    <span className="bg-primary/95 text-primary-foreground shadow-xs backdrop-blur-xs rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wide border border-primary/40">
                                        Your Submission
                                    </span>
                                </div>
                                <div className="absolute top-2 right-2">
                                    <EntryStatusBadge status={entry.status} />
                                </div>
                            </div>
                            <div className="flex flex-1 flex-col p-3 gap-1.5">
                                {parentRound !== undefined && (
                                    <div className="flex items-center justify-between gap-2 text-xs">
                                        <span className="truncate font-medium text-primary">{parentRound.title}</span>
                                        <RoundStatusBadge status={parentRound.status} />
                                    </div>
                                )}
                                <h4 className="line-clamp-2 text-sm font-semibold group-hover:text-primary transition-colors">
                                    {entry.title}
                                </h4>
                                {entry.description !== null && (
                                    <p className="line-clamp-2 text-xs text-muted-foreground/80 leading-relaxed">{entry.description}</p>
                                )}
                                <div className="mt-auto pt-2 border-t flex items-center justify-between text-xs text-muted-foreground">
                                    <span>View voting round</span>
                                    <RelativeTime value={entry.createdAt} />
                                </div>
                            </div>
                        </Link>
                    );
                })}
            </div>
        </Section>
    );
}

function ActiveAndUpcomingRoundsSection(): ReactNode {
    const rounds = useQuery({
        queryKey: queryKeys.rounds({ page: 1, perPage: 20 }),
        queryFn: () => platformApi.rounds({ page: 1, perPage: 20 })
    });

    if (rounds.isPending) {
        return <LoadingRows rows={2} />;
    }
    if (rounds.isError) {
        return null;
    }

    const relevant = (rounds.data?.data ?? []).filter(
        (r) => r.status === RoundStatus.Open || r.status === RoundStatus.Voting || r.status === RoundStatus.Draft
    );

    if (relevant.length === 0) {
        return null;
    }

    return (
        <Section title="Active & upcoming rounds">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {relevant.map((round) => (
                    <Card key={round.id} className="flex flex-col justify-between overflow-hidden">
                        <CardHeader className="pb-3">
                            <div className="flex items-center justify-between gap-2">
                                <RoundStatusBadge status={round.status} />
                                {round.status === RoundStatus.Voting && round.closesAt !== null && (
                                    <CountdownTimer targetDate={round.closesAt} prefix="Closes in" />
                                )}
                                {round.status === RoundStatus.Open && round.closesAt !== null && (
                                    <CountdownTimer targetDate={round.closesAt} prefix="Submissions in" />
                                )}
                                {round.status === RoundStatus.Draft && round.opensAt !== null && (
                                    <CountdownTimer targetDate={round.opensAt} prefix="Opens in" />
                                )}
                            </div>
                            <CardTitle className="line-clamp-1 text-base font-semibold mt-2">{round.title}</CardTitle>
                            <CardDescription className="text-xs">{pollTypeLabels[round.pollType]}</CardDescription>
                        </CardHeader>
                        <CardContent className="pt-0">
                            <Button asChild size="sm" className="w-full">
                                <Link href={`/voting/${round.id}` as Route}>
                                    {round.status === RoundStatus.Voting
                                        ? "Vote now"
                                        : round.status === RoundStatus.Open
                                          ? "Propose idea"
                                          : "View round"}
                                    <ArrowRight className="size-4 ml-1.5" />
                                </Link>
                            </Button>
                        </CardContent>
                    </Card>
                ))}
            </div>
        </Section>
    );
}

export function ProfileView(): ReactNode {
    const { user, isLoading } = useSession();
    if (isLoading) {
        return <LoadingRows rows={4} />;
    }
    if (user === null) {
        return <SignInPrompt message="Sign in to see your profile, your tasks, and your standing." />;
    }
    return (
        <>
            <PageHeader title="Profile" />
            <div className="space-y-10">
                <Identity user={user} />

                {!user.isVerified && (
                    <Alert className="border-amber-500/40 bg-amber-500/5 text-amber-900 dark:text-amber-200">
                        <Mail className="size-4 text-amber-500" />
                        <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                                <AlertTitle className="text-amber-600 dark:text-amber-400">Email verification required</AlertTitle>
                                <AlertDescription className="text-xs text-muted-foreground">
                                    Verify your email once to cast ballots in voting rounds and pitch your own scene ideas.
                                </AlertDescription>
                            </div>
                            <Button asChild size="sm" variant="outline" className="shrink-0">
                                <Link href="/verify">Verify email</Link>
                            </Button>
                        </div>
                    </Alert>
                )}

                {user.isBlacklisted && (
                    <Alert variant="destructive">
                        <AlertTitle>Voting is paused on your account</AlertTitle>
                        <AlertDescription>
                            Your ballots are not counted. If you think this is a mistake, consult a supervisor on Discord.
                        </AlertDescription>
                    </Alert>
                )}

                <SpecialtiesSection user={user} />
                <StandingSection user={user} />
                <TasksSection user={user} />
                <UserEntriesSection />
                <ActiveAndUpcomingRoundsSection />
            </div>
        </>
    );
}
