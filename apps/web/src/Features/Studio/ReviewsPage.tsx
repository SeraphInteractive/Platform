"use client";

import { fieldRules, problemOf, ReviewDecision, type ReviewQueueItemDto, Role, SubmissionStatus, textLimits } from "@platform/contracts";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { useId, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { platformApi } from "@/Api/PlatformApi";
import { queryKeys } from "@/Api/QueryKeys";
import { PageHeader } from "@/Components/Common/PageHeader";
import { Pagination } from "@/Components/Common/Pagination";
import { RelativeTime } from "@/Components/Common/RelativeTime";
import { EmptyState, ErrorState, LoadingRows, RequireRole } from "@/Components/Common/States";
import { RichTextInputField } from "@/Components/Common/FormField";
import { MarkdownText } from "@/Components/Common/MarkdownText";
import { Button } from "@/Components/Ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/Components/Ui/card";
import { useSession } from "@/Hooks/UseSession";
import { safeHttpUrl } from "@/Lib/SafeUrl";

function ReviewCard({ item, reviewerId }: { readonly item: ReviewQueueItemDto; readonly reviewerId: string | null }): ReactNode {
    const notesId = useId();
    const queryClient = useQueryClient();
    const [notes, setNotes] = useState("");
    const notesProblem = problemOf(fieldRules.reviewNotes, notes);
    const review = useMutation({
        mutationFn: (decision: ReviewDecision) => {
            const trimmed = notes.trim();
            return platformApi.reviewSubmission(item.id, decision, trimmed.length === 0 ? null : trimmed);
        },
        onSuccess: (submission) => {
            void queryClient.invalidateQueries({ queryKey: queryKeys.reviewsAll });
            void queryClient.invalidateQueries({ queryKey: queryKeys.shot(item.shotId) });
            void queryClient.invalidateQueries({ queryKey: queryKeys.shotsAll });
            toast.success(
                submission.status === SubmissionStatus.Approved
                    ? `Approved ${item.shot.shotCode}.`
                    : `Revision requested for ${item.shot.shotCode}.`
            );
        }
    });
    const video = safeHttpUrl(item.videoUrl);
    const blend = safeHttpUrl(item.blendUrl);
    const isOwn = reviewerId !== null && item.contributor?.id === reviewerId;

    return (
        <Card>
            <CardHeader className="gap-1">
                <CardTitle className="text-sm">
                    <Link href={`/grabbox/${item.shotId}` as Route} className="hover:underline">
                        {item.shot.shotCode} · {item.shot.title}
                    </Link>
                </CardTitle>
                <p className="text-muted-foreground text-xs">
                    v{item.version} · {item.contributor?.username ?? "Unknown"} · <RelativeTime value={item.createdAt} />
                </p>
            </CardHeader>
            <CardContent className="grid gap-6 lg:grid-cols-[1fr_20rem]">
                <div className="space-y-3">
                    {video !== null ? (
                        <video src={video} controls preload="metadata" playsInline className="bg-muted aspect-video w-full border" />
                    ) : (
                        <div className="bg-muted text-muted-foreground flex aspect-video items-center justify-center border text-xs">
                            No preview
                        </div>
                    )}
                    <div className="flex flex-wrap gap-2">
                        {video !== null && (
                            <Button asChild size="xs" variant="outline">
                                <a href={video} target="_blank" rel="noopener noreferrer">
                                    <Download />
                                    Video
                                </a>
                            </Button>
                        )}
                        {blend !== null && (
                            <Button asChild size="xs" variant="outline">
                                <a href={blend} target="_blank" rel="noopener noreferrer">
                                    <Download />
                                    .blend
                                </a>
                            </Button>
                        )}
                    </div>
                    {item.notes !== null && (
                        <MarkdownText className="text-muted-foreground border-l-2 pl-3 text-sm">{item.notes}</MarkdownText>
                    )}
                </div>
                <div className="space-y-3">
                    <RichTextInputField
                        id={notesId}
                        label="Feedback"
                        value={notes}
                        rule={fieldRules.reviewNotes}
                        limit={textLimits.reviewNotes}
                        disabled={isOwn}
                        placeholder="Required for revisions"
                        onValueChange={setNotes}
                    />
                    {isOwn && <p className="text-muted-foreground text-xs">You can&apos;t review your own submission.</p>}
                    <div className="grid grid-cols-2 gap-2">
                        <Button
                            variant="outline"
                            disabled={review.isPending || isOwn || notes.trim().length === 0 || notesProblem !== null}
                            onClick={() => {
                                review.mutate(ReviewDecision.RevisionRequested);
                            }}
                        >
                            Request changes
                        </Button>
                        <Button
                            disabled={review.isPending || isOwn || notesProblem !== null}
                            onClick={() => {
                                review.mutate(ReviewDecision.Approved);
                            }}
                        >
                            Approve
                        </Button>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}

function ReviewQueue(): ReactNode {
    const { user } = useSession();
    const [page, setPage] = useState(1);
    const query = { page, perPage: 10 };
    const queue = useQuery({
        queryKey: queryKeys.reviewQueue(query),
        queryFn: () => platformApi.reviewQueue(query),
        placeholderData: keepPreviousData
    });

    if (queue.isPending) {
        return <LoadingRows rows={3} />;
    }
    if (queue.isError) {
        return <ErrorState error={queue.error} onRetry={() => void queue.refetch()} />;
    }
    if (queue.data.data.length === 0) {
        return <EmptyState title="Queue is empty" />;
    }
    return (
        <div className="space-y-4">
            {queue.data.data.map((item) => (
                <ReviewCard key={item.id} item={item} reviewerId={user?.id ?? null} />
            ))}
            <Pagination meta={queue.data.meta} onPageChange={setPage} />
        </div>
    );
}

export function ReviewsPage(): ReactNode {
    return (
        <RequireRole role={Role.Supervisor}>
            <PageHeader title="Reviews" description="Oldest first" />
            <ReviewQueue />
        </RequireRole>
    );
}
