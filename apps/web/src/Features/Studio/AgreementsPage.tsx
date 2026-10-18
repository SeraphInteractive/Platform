"use client";

import {
    ClaActorKind,
    ClaStatus,
    countryName,
    guardianRelationshipLabels,
    openClaStatuses,
    regionName,
    Role,
    textLimits,
    type ClaPiiDto,
    type ClaSignatureSummaryDto
} from "@platform/contracts";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { describeError } from "@/Api/ApiClient";
import { platformApi } from "@/Api/PlatformApi";
import { queryKeys } from "@/Api/QueryKeys";
import { Toolbar } from "@/Components/Common/DataList";
import { PageHeader } from "@/Components/Common/PageHeader";
import { Pagination } from "@/Components/Common/Pagination";
import { Section } from "@/Components/Common/Section";
import { EmptyState, ErrorState, LoadingRows, RequireRole } from "@/Components/Common/States";
import { Tone, ToneBadge } from "@/Components/Common/StatusBadge";
import { Button } from "@/Components/Ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/Components/Ui/dialog";
import { Input } from "@/Components/Ui/input";
import { Label } from "@/Components/Ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/Components/Ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/Components/Ui/table";
import { useSession } from "@/Hooks/UseSession";
import { formatDate, formatDateTime } from "@/Lib/Format";
import { hasAtLeast } from "@/Lib/Roles";

const anyStatus = "any";

const statusLabels: Readonly<Record<ClaStatus, string>> = {
    [ClaStatus.PendingGuardian]: "Awaiting guardian",
    [ClaStatus.Active]: "Active",
    [ClaStatus.GuardianRejected]: "Guardian declined",
    [ClaStatus.GuardianExpired]: "Guardian expired",
    [ClaStatus.Superseded]: "Superseded",
    [ClaStatus.Revoked]: "Revoked"
};

const statusTones: Readonly<Record<ClaStatus, Tone>> = {
    [ClaStatus.PendingGuardian]: Tone.Warning,
    [ClaStatus.Active]: Tone.Positive,
    [ClaStatus.GuardianRejected]: Tone.Negative,
    [ClaStatus.GuardianExpired]: Tone.Neutral,
    [ClaStatus.Superseded]: Tone.Neutral,
    [ClaStatus.Revoked]: Tone.Negative
};

const actorLabels: Readonly<Record<ClaActorKind, string>> = {
    [ClaActorKind.Contributor]: "Contributor",
    [ClaActorKind.Guardian]: "Guardian",
    [ClaActorKind.Staff]: "Staff",
    [ClaActorKind.System]: "System"
};

function residenceOf(signature: Pick<ClaSignatureSummaryDto, "country" | "region">): string {
    const region = regionName(signature.country, signature.region);
    return region === null ? countryName(signature.country) : `${region}, ${countryName(signature.country)}`;
}

function eventLabel(type: string): string {
    const text = type.replace(/_/gu, " ");
    return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}

function ReasonForm({
    label,
    submitLabel,
    isPending,
    destructive = false,
    onSubmit
}: {
    readonly label: string;
    readonly submitLabel: string;
    readonly isPending: boolean;
    readonly destructive?: boolean;
    readonly onSubmit: (reason: string) => void;
}): ReactNode {
    const id = useId();
    const [reason, setReason] = useState("");
    return (
        <form
            className="flex flex-col gap-2 sm:flex-row sm:items-end"
            onSubmit={(event) => {
                event.preventDefault();
                if (reason.trim().length > 0 && !isPending) {
                    onSubmit(reason.trim());
                }
            }}
        >
            <div className="flex-1 space-y-1.5">
                <Label htmlFor={id}>{label}</Label>
                <Input
                    id={id}
                    maxLength={textLimits.reason}
                    value={reason}
                    onChange={(event) => {
                        setReason(event.target.value);
                    }}
                />
            </div>
            <Button
                type="submit"
                size="sm"
                variant={destructive ? "destructive" : "outline"}
                disabled={reason.trim().length === 0 || isPending}
            >
                {submitLabel}
            </Button>
        </form>
    );
}

function PersonalData({ pii }: { readonly pii: ClaPiiDto }): ReactNode {
    const rows: [string, string][] = [
        ["Legal name", pii.contributor.legalName],
        ["Email", pii.contributor.email],
        ["Date of birth", pii.contributor.dateOfBirth],
        ["Signing IP", pii.contributor.ipAddress],
        ["Signing browser", pii.contributor.userAgent ?? "Unknown"]
    ];
    if (pii.guardian !== null) {
        rows.push(
            ["Guardian", `${pii.guardian.legalName} (${guardianRelationshipLabels[pii.guardian.relationship]})`],
            ["Guardian email", pii.guardian.email],
            ["Guardian phone", pii.guardian.phone ?? "Not given"]
        );
    }
    if (pii.guardianDecision !== null) {
        rows.push(
            ["Guardian signed as", pii.guardianDecision.legalName],
            ["Guardian IP", pii.guardianDecision.ipAddress],
            ["Guardian browser", pii.guardianDecision.userAgent ?? "Unknown"]
        );
    }
    return (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            {rows.map(([label, value]) => (
                <div key={label} className="contents">
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd className="min-w-0 break-words">{value}</dd>
                </div>
            ))}
        </dl>
    );
}

function SignatureDetail({ signature, onClose }: { readonly signature: ClaSignatureSummaryDto; readonly onClose: () => void }): ReactNode {
    const queryClient = useQueryClient();
    const trail = useQuery({ queryKey: queryKeys.claAuditTrail(signature.id), queryFn: () => platformApi.claAuditTrail(signature.id) });
    const reveal = useMutation({
        mutationFn: (reason: string) => platformApi.revealClaPii(signature.id, reason),
        onError: (error) => {
            toast.error(describeError(error));
        }
    });
    const revoke = useMutation({
        mutationFn: (reason: string) => platformApi.revokeClaByStaff(signature.id, reason),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: queryKeys.claSignaturesAll });
            toast.success("Agreement revoked.");
            onClose();
        },
        onError: (error) => {
            toast.error(describeError(error));
        }
    });

    return (
        <div className="space-y-6">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                <dt className="text-muted-foreground">Status</dt>
                <dd>
                    <ToneBadge tone={statusTones[signature.status]}>{statusLabels[signature.status]}</ToneBadge>
                </dd>
                <dt className="text-muted-foreground">Revision</dt>
                <dd>{signature.revision}</dd>
                <dt className="text-muted-foreground">Residence</dt>
                <dd>
                    {residenceOf(signature)} · majority at {signature.ageOfMajority}
                </dd>
                <dt className="text-muted-foreground">Data retention</dt>
                <dd>
                    {signature.piiPurgedAt !== null
                        ? `Purged ${formatDate(signature.piiPurgedAt)}`
                        : signature.purgeAfter !== null
                          ? `Purged after ${formatDate(signature.purgeAfter)}`
                          : "Kept while contributions depend on it"}
                </dd>
            </dl>

            <Section
                title="Audit trail"
                description={trail.data === undefined ? undefined : trail.data.isIntact ? "Hash chain intact." : "Hash chain broken."}
            >
                {trail.isPending ? (
                    <LoadingRows rows={3} />
                ) : trail.error !== null ? (
                    <ErrorState error={trail.error} onRetry={trail.refetch} />
                ) : (
                    <ol className="divide-y border text-sm">
                        {trail.data.events.map((event) => (
                            <li key={event.id} className="flex flex-wrap items-baseline justify-between gap-2 px-3 py-2">
                                <span>
                                    {eventLabel(event.type)}
                                    <span className="text-muted-foreground">
                                        {" "}
                                        · {event.actor?.username ?? actorLabels[event.actorKind]}
                                    </span>
                                </span>
                                <span className="text-muted-foreground text-xs tabular-nums">{formatDateTime(event.occurredAt)}</span>
                            </li>
                        ))}
                    </ol>
                )}
            </Section>

            {signature.piiPurgedAt === null && (
                <Section title="Personal data" description="Decrypting is logged with your reason.">
                    {reveal.data === undefined ? (
                        <ReasonForm
                            label="Reason"
                            submitLabel="Show"
                            isPending={reveal.isPending}
                            onSubmit={(reason) => {
                                reveal.mutate(reason);
                            }}
                        />
                    ) : (
                        <PersonalData pii={reveal.data} />
                    )}
                </Section>
            )}

            {openClaStatuses.includes(signature.status) && (
                <Section title="Revoke" description="The contributor can't claim or submit work until they sign again.">
                    <ReasonForm
                        label="Reason"
                        submitLabel="Revoke"
                        destructive
                        isPending={revoke.isPending}
                        onSubmit={(reason) => {
                            revoke.mutate(reason);
                        }}
                    />
                </Section>
            )}
        </div>
    );
}

function AccessLog(): ReactNode {
    const [page, setPage] = useState(1);
    const log = useQuery({
        queryKey: queryKeys.claAccessLog(page),
        queryFn: () => platformApi.claAccessLog({ page, perPage: 25 }),
        placeholderData: keepPreviousData
    });
    if (log.isPending) {
        return <LoadingRows rows={4} />;
    }
    if (log.error !== null) {
        return <ErrorState error={log.error} onRetry={log.refetch} />;
    }
    if (log.data.data.length === 0) {
        return <EmptyState title="No access yet" />;
    }
    return (
        <>
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>When</TableHead>
                        <TableHead>Who</TableHead>
                        <TableHead>Why</TableHead>
                        <TableHead className="hidden md:table-cell">Fields</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {log.data.data.map((entry) => (
                        <TableRow key={entry.id}>
                            <TableCell className="whitespace-nowrap tabular-nums">{formatDateTime(entry.accessedAt)}</TableCell>
                            <TableCell>{entry.accessor?.username ?? actorLabels[entry.accessorKind]}</TableCell>
                            <TableCell className="max-w-64 truncate">{entry.purpose}</TableCell>
                            <TableCell className="text-muted-foreground hidden max-w-80 truncate text-xs md:table-cell">
                                {entry.fields.join(", ")}
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
            <Pagination meta={log.data.meta} onPageChange={setPage} />
        </>
    );
}

function Signatures(): ReactNode {
    const [status, setStatus] = useState<ClaStatus | typeof anyStatus>(anyStatus);
    const [page, setPage] = useState(1);
    const [selected, setSelected] = useState<ClaSignatureSummaryDto | null>(null);
    const query = { page, perPage: 25, ...(status === anyStatus ? {} : { status }) };
    const signatures = useQuery({
        queryKey: queryKeys.claSignatures(query),
        queryFn: () => platformApi.claSignatures(query),
        placeholderData: keepPreviousData
    });

    return (
        <>
            <Toolbar>
                <Select
                    value={status}
                    onValueChange={(value) => {
                        setStatus(value as ClaStatus | typeof anyStatus);
                        setPage(1);
                    }}
                >
                    <SelectTrigger className="w-48" aria-label="Status">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value={anyStatus}>All statuses</SelectItem>
                        {Object.values(ClaStatus).map((value) => (
                            <SelectItem key={value} value={value}>
                                {statusLabels[value]}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </Toolbar>
            {signatures.isPending ? (
                <LoadingRows />
            ) : signatures.error !== null ? (
                <ErrorState error={signatures.error} onRetry={signatures.refetch} />
            ) : signatures.data.data.length === 0 ? (
                <EmptyState title="No agreements" />
            ) : (
                <>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Contributor</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="hidden sm:table-cell">Residence</TableHead>
                                <TableHead className="hidden md:table-cell">Signed</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {signatures.data.data.map((signature) => (
                                <TableRow
                                    key={signature.id}
                                    className="cursor-pointer"
                                    onClick={() => {
                                        setSelected(signature);
                                    }}
                                >
                                    <TableCell>
                                        {signature.user?.username ?? "Unknown"}
                                        {signature.isMinor && <span className="text-muted-foreground"> · minor</span>}
                                    </TableCell>
                                    <TableCell>
                                        <ToneBadge tone={statusTones[signature.status]}>{statusLabels[signature.status]}</ToneBadge>
                                    </TableCell>
                                    <TableCell className="hidden sm:table-cell">{residenceOf(signature)}</TableCell>
                                    <TableCell className="hidden tabular-nums md:table-cell">{formatDate(signature.signedAt)}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                    <Pagination meta={signatures.data.meta} onPageChange={setPage} />
                </>
            )}
            <Dialog
                open={selected !== null}
                onOpenChange={(open) => {
                    if (!open) {
                        setSelected(null);
                    }
                }}
            >
                <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>{selected?.user?.username ?? "Agreement"}</DialogTitle>
                        <DialogDescription>Signed {formatDateTime(selected?.signedAt ?? null)}</DialogDescription>
                    </DialogHeader>
                    {selected !== null && (
                        <SignatureDetail
                            key={selected.id}
                            signature={selected}
                            onClose={() => {
                                setSelected(null);
                            }}
                        />
                    )}
                </DialogContent>
            </Dialog>
        </>
    );
}

export function AgreementsPage(): ReactNode {
    const { user } = useSession();
    return (
        <RequireRole role={Role.Admin}>
            <PageHeader title="Agreements" description="Contributor license agreements and guardian consent." />
            <div className="space-y-10">
                <Signatures />
                {hasAtLeast(user, Role.SuperAdmin) && (
                    <Section title="Personal data access log">
                        <AccessLog />
                    </Section>
                )}
            </div>
        </RequireRole>
    );
}
