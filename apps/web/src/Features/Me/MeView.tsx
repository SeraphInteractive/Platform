"use client";

import { type EntryDto, type ShotDto, type UserDto } from "@platform/contracts";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Sparkles } from "lucide-react";
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
import { EntryStatusBadge, ShotStatusBadge, Tone, ToneBadge } from "@/Components/Common/StatusBadge";
import { Alert, AlertDescription, AlertTitle } from "@/Components/Ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/Components/Ui/avatar";
import { Button } from "@/Components/Ui/button";
import { Card, CardContent } from "@/Components/Ui/card";
import { useMyShots } from "@/Features/Grabbox/UseMyShots";
import { EntryMedia } from "@/Features/Voting/EntryMedia";
import { useSession } from "@/Hooks/UseSession";
import { formatDate, specialtyLabel } from "@/Lib/Format";
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

function UserEntriesSection(): ReactNode {
    const myEntries = useQuery({
        queryKey: queryKeys.myEntries,
        queryFn: () => platformApi.myEntries()
    });

    if (myEntries.isPending) {
        return <LoadingRows rows={2} />;
    }
    if (myEntries.isError || myEntries.data.length === 0) {
        return null;
    }

    return (
        <Section title="My proposed round entries">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {myEntries.data.map((entry: EntryDto) => (
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
                ))}
            </div>
        </Section>
    );
}

function ContributorWork({ user }: { readonly user: UserDto }): ReactNode {
    const myShots = useMyShots(user.id);
    if (myShots.isPending) {
        return <LoadingRows rows={3} />;
    }
    if (myShots.error !== null) {
        return <ErrorState error={myShots.error} onRetry={myShots.refetch} />;
    }
    return (
        <div className="space-y-10">
            <Section title="In progress">
                {myShots.active === null ? (
                    <Card>
                        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <p className="text-sm">No active task.</p>
                            <Button asChild size="sm">
                                <Link href="/grabbox">
                                    Find a task
                                    <ArrowRight />
                                </Link>
                            </Button>
                        </CardContent>
                    </Card>
                ) : (
                    <Card className="border-foreground/40">
                        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div className="min-w-0">
                                <p className="truncate font-semibold">
                                    {myShots.active.shotCode} · {myShots.active.title}
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
                                    <ArrowRight />
                                </Link>
                            </Button>
                        </CardContent>
                    </Card>
                )}
            </Section>
            <Section title="Waiting for review">
                {myShots.submitted.length === 0 ? (
                    <p className="text-muted-foreground text-sm">None.</p>
                ) : (
                    <ul className="divide-y border">
                        {myShots.submitted.map((shot) => (
                            <ShotRow key={shot.id} shot={shot} />
                        ))}
                    </ul>
                )}
            </Section>
            <Section title="Approved">
                {myShots.approved.length === 0 ? (
                    <p className="text-muted-foreground text-sm">None yet.</p>
                ) : (
                    <ul className="divide-y border">
                        {myShots.approved.map((shot) => (
                            <ShotRow key={shot.id} shot={shot} />
                        ))}
                    </ul>
                )}
            </Section>
            <UserEntriesSection />
        </div>
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
                {user.isBlacklisted && (
                    <Alert variant="destructive">
                        <AlertTitle>Voting is paused on your account</AlertTitle>
                        <AlertDescription>
                            Your ballots aren&apos;t counted. If you think this is a mistake, talk to a moderator on Discord.
                        </AlertDescription>
                    </Alert>
                )}
                <ContributorWork user={user} />
            </div>
        </>
    );
}
