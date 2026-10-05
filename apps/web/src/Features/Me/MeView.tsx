"use client";

import { RoundStatus, type EntryDto, type RoundDto, type ShotDto, type UserDto } from "@platform/contracts";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Mail, Sparkles } from "lucide-react";
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

function Profile({ user }: { readonly user: UserDto }): ReactNode {
    const avatar = safeHttpUrl(user.avatarUrl);
    return (
        <div className="flex items-center gap-4">
            <Avatar className="size-14">
                {avatar !== null && <AvatarImage src={avatar} alt="" />}
                <AvatarFallback>{user.username.slice(0, 2).toUpperCase()}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 space-y-1">
                <p className="truncate text-lg font-semibold">{user.username}</p>
                <div className="flex flex-wrap items-center gap-1.5">
                    <ToneBadge tone={Tone.Info}>{roleLabels[user.role]}</ToneBadge>
                    {user.specialties.map((specialty) => (
                        <ToneBadge key={specialty} tone={Tone.Neutral}>
                            {specialtyLabel(specialty)}
                        </ToneBadge>
                    ))}
                </div>
                <p className="text-muted-foreground text-xs">Member since {formatDate(user.createdAt)}</p>
            </div>
        </div>
    );
}

function ShotRow({ shot }: { readonly shot: ShotDto }): ReactNode {
    return (
        <li>
            <Link href={`/grabbox/${shot.id}` as Route} className="hover:bg-accent/50 flex items-center justify-between gap-4 px-4 py-3">
                <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">
                        {shot.shotCode} · {shot.title}
                    </span>
                    <span className="text-muted-foreground text-xs">
                        {shot.latestSubmission === null ? "No submissions" : `Version ${shot.latestSubmission.version}`}
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
                                <p className="text-xs text-muted-foreground">Claim an available task from the grab-box to start contributing.</p>
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
                                <p className="truncate text-base font-semibold text-foreground">
                                    {myShots.active.title}
                                </p>
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
                                    <EntryMedia url={entry.mediaUrl} title={entry.title} controls={false} className="size-full object-cover" />
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
                                        <span className="truncate font-medium text-primary">
                                            {parentRound.title}
                                        </span>
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
                            <CardTitle className="line-clamp-1 text-base font-semibold mt-2">
                                {round.title}
                            </CardTitle>
                            <CardDescription className="text-xs">
                                {pollTypeLabels[round.pollType]}
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="pt-0">
                            <Button asChild size="sm" className="w-full">
                                <Link href={`/voting/${round.id}` as Route}>
                                    {round.status === RoundStatus.Voting ? "Vote now" : round.status === RoundStatus.Open ? "Propose idea" : "View round"}
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

export function MeView(): ReactNode {
    const { user, isLoading } = useSession();
    if (isLoading) {
        return <LoadingRows rows={4} />;
    }
    if (user === null) {
        return <SignInPrompt message="Sign in to see your role, your tasks and your submissions." />;
    }
    return (
        <>
            <PageHeader title="My work" />
            <div className="space-y-10">
                <Profile user={user} />
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
                            Your ballots aren&apos;t counted. If you think this is a mistake, talk to a moderator on Discord.
                        </AlertDescription>
                    </Alert>
                )}
                <TasksSection user={user} />
                <UserEntriesSection />
                <ActiveAndUpcomingRoundsSection />
            </div>
        </>
    );
}

