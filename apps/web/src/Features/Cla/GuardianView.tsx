"use client";

import {
    ClaStatus,
    fieldRules,
    GuardianDecision,
    guardianRelationshipLabels,
    textLimits,
    type GuardianDecisionResultDto,
    type GuardianReviewDto
} from "@platform/contracts";
import { useMutation, useQuery } from "@tanstack/react-query";
import { BadgeCheck } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { ApiError, describeError } from "@/Api/ApiClient";
import { platformApi } from "@/Api/PlatformApi";
import { queryKeys } from "@/Api/QueryKeys";
import { TextInputField } from "@/Components/Common/FormField";
import { PageHeader } from "@/Components/Common/PageHeader";
import { EmptyState, ErrorState, LoadingRows } from "@/Components/Common/States";
import { Button } from "@/Components/Ui/button";
import { Checkbox } from "@/Components/Ui/checkbox";
import { DocumentSections } from "@/Features/Documents/DocumentView";
import { formatDateTime } from "@/Lib/Format";
import { downloadReceipt } from "./ClaReceiptDownload";

function Decided({ result }: { readonly result: GuardianDecisionResultDto }): ReactNode {
    if (result.status !== ClaStatus.Active || result.receipt === null) {
        return <p className="text-sm">You declined. The agreement is not in effect, and we let them know.</p>;
    }
    const receipt = result.receipt;
    return (
        <div className="space-y-4">
            <p className="flex items-center gap-2 text-sm">
                <BadgeCheck className="text-success size-4" />
                Thanks. The agreement is now in effect. We emailed you both a copy.
            </p>
            <Button
                size="sm"
                onClick={() => {
                    downloadReceipt(receipt);
                }}
            >
                Download your copy
            </Button>
        </div>
    );
}

function Review({ token, review }: { readonly token: string; readonly review: GuardianReviewDto }): ReactNode {
    const id = useId();
    const [legalName, setLegalName] = useState("");
    const [accepted, setAccepted] = useState(false);
    const decide = useMutation({
        mutationFn: (decision: GuardianDecision) => platformApi.guardianDecide(token, { decision, legalName, accepted }),
        onError: (error) => {
            toast.error(describeError(error));
        }
    });

    if (decide.data !== undefined) {
        return <Decided result={decide.data} />;
    }
    const hasName = legalName.trim().length > 0;
    return (
        <div className="space-y-8">
            <div className="text-muted-foreground max-w-prose space-y-2 text-sm">
                <p>
                    {review.contributor.legalName} ({review.contributor.username}) signed the {review.document.title} on{" "}
                    {formatDateTime(review.signedAt)} and named you, {review.guardian.legalName}, as their{" "}
                    {guardianRelationshipLabels[review.guardian.relationship].toLowerCase()}.
                </p>
                <p>
                    They are under the age of majority where they live, so the agreement needs your consent. This link expires{" "}
                    {formatDateTime(review.expiresAt)}.
                </p>
            </div>
            <div className="max-h-[28rem] overflow-y-auto border p-4">
                <DocumentSections document={review.document} />
            </div>
            <form
                className="max-w-md space-y-4"
                onSubmit={(event) => {
                    event.preventDefault();
                    if (hasName && accepted && !decide.isPending) {
                        decide.mutate(GuardianDecision.Approve);
                    }
                }}
            >
                <TextInputField
                    id={`${id}-name`}
                    label="Your full legal name"
                    hint="Typing your name here is your signature."
                    value={legalName}
                    rule={fieldRules.legalName}
                    limit={textLimits.legalName}
                    autoComplete="name"
                    onValueChange={setLegalName}
                />
                <label className="flex cursor-pointer items-start gap-2 text-sm">
                    <Checkbox
                        className="mt-0.5"
                        checked={accepted}
                        onCheckedChange={(value) => {
                            setAccepted(value === true);
                        }}
                    />
                    I am {review.contributor.legalName}&apos;s parent or legal guardian, I have read the {review.document.title} (revision{" "}
                    {review.document.revision}), and I consent to it on their behalf.
                </label>
                <div className="flex flex-wrap gap-2">
                    <Button type="submit" disabled={!hasName || !accepted || decide.isPending}>
                        Give consent
                    </Button>
                    <Button
                        type="button"
                        variant="outline"
                        disabled={!hasName || decide.isPending}
                        onClick={() => {
                            decide.mutate(GuardianDecision.Reject);
                        }}
                    >
                        Decline
                    </Button>
                </div>
            </form>
        </div>
    );
}

export function GuardianView({ token }: { readonly token: string }): ReactNode {
    const review = useQuery({
        queryKey: queryKeys.guardianReview(token),
        queryFn: () => platformApi.guardianReview(token),
        retry: false,
        staleTime: Infinity
    });

    let body: ReactNode;
    if (review.isPending) {
        body = <LoadingRows rows={4} />;
    } else if (review.error instanceof ApiError && (review.error.status === 404 || review.error.status === 409)) {
        body = (
            <EmptyState title="This link isn't valid anymore">
                It may have expired, been replaced by a newer email, or already been answered.
            </EmptyState>
        );
    } else if (review.error !== null) {
        body = <ErrorState error={review.error} onRetry={review.refetch} />;
    } else {
        body = <Review token={token} review={review.data} />;
    }
    return (
        <div className="max-w-3xl">
            <PageHeader title="Guardian consent" />
            {body}
        </div>
    );
}
