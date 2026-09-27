"use client";

import { Role, type ShotDto, type UserDto } from "@platform/contracts";
import { ArrowRight } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { PageHeader } from "@/Components/Common/PageHeader";
import { RelativeTime } from "@/Components/Common/RelativeTime";
import { Section } from "@/Components/Common/Section";
import { ErrorState, LoadingRows, SignInPrompt } from "@/Components/Common/States";
import { ShotStatusBadge, Tone, ToneBadge } from "@/Components/Common/StatusBadge";
import { Alert, AlertDescription, AlertTitle } from "@/Components/Ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/Components/Ui/avatar";
import { Button } from "@/Components/Ui/button";
import { Card, CardContent } from "@/Components/Ui/card";
import { useMyShots } from "@/Features/Grabbox/UseMyShots";
import { useSession } from "@/Hooks/UseSession";
import { formatDate, specialtyLabel } from "@/Lib/Format";
import { hasAtLeast, roleLabels } from "@/Lib/Roles";
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
                    <span className="block truncate text-sm">
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
                                    <p className="text-muted-foreground text-sm">
                                        <RelativeTime value={myShots.active.deadlineAt} prefix="Due" />
                                    </p>
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
                {hasAtLeast(user, Role.Contributor) ? (
                    <ContributorWork user={user} />
                ) : (
                    <Section title="Want to help make the film?">
                        <Card>
                            <CardContent className="space-y-3 text-sm">
                                <p>
                                    Right now you can vote in every open round and pitch your own ideas. If you&apos;d like to animate,
                                    model, design sound or anything else, ask in the Discord to become a contributor.
                                </p>
                                <div className="flex flex-wrap gap-2">
                                    <Button asChild size="sm">
                                        <Link href="/voting">Go vote</Link>
                                    </Button>
                                    <Button asChild size="sm" variant="outline">
                                        <Link href="/guidelines#grab-box">How contributing works</Link>
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    </Section>
                )}
            </div>
        </>
    );
}
