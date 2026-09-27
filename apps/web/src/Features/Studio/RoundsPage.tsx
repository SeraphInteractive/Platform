"use client";

import { Role, RoundStatus } from "@platform/contracts";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { platformApi } from "@/Api/PlatformApi";
import { queryKeys } from "@/Api/QueryKeys";
import { PageHeader } from "@/Components/Common/PageHeader";
import { Pagination } from "@/Components/Common/Pagination";
import { RelativeTime } from "@/Components/Common/RelativeTime";
import { EmptyState, ErrorState, LoadingRows, RequireRole } from "@/Components/Common/States";
import { RoundStatusBadge } from "@/Components/Common/StatusBadge";
import { Button } from "@/Components/Ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/Components/Ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/Components/Ui/tabs";
import { useSession } from "@/Hooks/UseSession";
import { pollTypeLabels, roundStatusLabels } from "@/Lib/Format";
import { hasAtLeast } from "@/Lib/Roles";
import { RoundActions, RoundFormDialog } from "./RoundControls";

const allStatuses = "all";

function RoundsTable(): ReactNode {
    const [status, setStatus] = useState<RoundStatus | typeof allStatuses>(allStatuses);
    const [page, setPage] = useState(1);
    const query = { page, perPage: 20, status: status === allStatuses ? undefined : status };
    const rounds = useQuery({
        queryKey: queryKeys.rounds(query),
        queryFn: () => platformApi.rounds(query),
        placeholderData: keepPreviousData
    });

    return (
        <div className="space-y-4">
            <Tabs
                value={status}
                onValueChange={(value) => {
                    setStatus(value as RoundStatus | typeof allStatuses);
                    setPage(1);
                }}
            >
                <TabsList>
                    <TabsTrigger value={allStatuses}>All</TabsTrigger>
                    {Object.values(RoundStatus).map((item) => (
                        <TabsTrigger key={item} value={item}>
                            {roundStatusLabels[item]}
                        </TabsTrigger>
                    ))}
                </TabsList>
            </Tabs>
            {rounds.isPending ? (
                <LoadingRows rows={5} />
            ) : rounds.isError ? (
                <ErrorState error={rounds.error} onRetry={() => void rounds.refetch()} />
            ) : rounds.data.data.length === 0 ? (
                <EmptyState title="No rounds here">Create a round to start collecting pitches.</EmptyState>
            ) : (
                <>
                    <div className="overflow-x-auto border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Round</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Schedule</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {rounds.data.data.map((round) => (
                                    <TableRow key={round.id}>
                                        <TableCell className="max-w-72">
                                            <Link
                                                href={`/studio/rounds/${round.id}` as Route}
                                                className="block truncate font-medium hover:underline"
                                            >
                                                {round.title}
                                            </Link>
                                            <span className="text-muted-foreground text-xs">{pollTypeLabels[round.pollType]}</span>
                                        </TableCell>
                                        <TableCell>
                                            <RoundStatusBadge status={round.status} />
                                        </TableCell>
                                        <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                                            {round.opensAt === null && round.closesAt === null ? (
                                                "Manual"
                                            ) : (
                                                <span className="flex flex-col">
                                                    {round.opensAt !== null && <RelativeTime value={round.opensAt} prefix="Opens" />}
                                                    {round.closesAt !== null && <RelativeTime value={round.closesAt} prefix="Closes" />}
                                                </span>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            <RoundActions round={round} compact />
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                    <Pagination meta={rounds.data.meta} onPageChange={setPage} />
                </>
            )}
        </div>
    );
}

export function RoundsPage(): ReactNode {
    const { user } = useSession();
    return (
        <RequireRole role={Role.Moderator}>
            <PageHeader
                title="Rounds"
                actions={
                    hasAtLeast(user, Role.Supervisor) ? (
                        <RoundFormDialog
                            trigger={
                                <Button size="sm">
                                    <Plus />
                                    New round
                                </Button>
                            }
                        />
                    ) : undefined
                }
            />
            <RoundsTable />
        </RequireRole>
    );
}
