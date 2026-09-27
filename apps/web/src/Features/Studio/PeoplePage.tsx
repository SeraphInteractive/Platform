"use client";

import { maximumSpecialties, PresenceStatus, Role, Specialty, type ModeratedUserDto, type UserDto } from "@platform/contracts";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { platformApi } from "@/Api/PlatformApi";
import { queryKeys } from "@/Api/QueryKeys";
import { ConfirmButton } from "@/Components/Common/ConfirmButton";
import { Toolbar } from "@/Components/Common/DataList";
import { PageHeader } from "@/Components/Common/PageHeader";
import { Pagination } from "@/Components/Common/Pagination";
import { EmptyState, ErrorState, LoadingRows, RequireRole } from "@/Components/Common/States";
import { Tone, ToneBadge } from "@/Components/Common/StatusBadge";
import { Avatar, AvatarFallback, AvatarImage } from "@/Components/Ui/avatar";
import { Button } from "@/Components/Ui/button";
import { Checkbox } from "@/Components/Ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/Components/Ui/dialog";
import { Label } from "@/Components/Ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/Components/Ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/Components/Ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/Components/Ui/table";
import { Textarea } from "@/Components/Ui/textarea";
import { useSession } from "@/Hooks/UseSession";
import { formatDateTime, specialtyLabel } from "@/Lib/Format";
import { hasAtLeast, isGrantable, outranks, roleLabels, rolesByRank } from "@/Lib/Roles";
import { safeHttpUrl } from "@/Lib/SafeUrl";
import { cn } from "@/Lib/Utils";

const anyRole = "any";

function grantableRoles(actor: UserDto): Role[] {
    return rolesByRank.filter((role) => isGrantable(role) && (hasAtLeast(actor, Role.Admin) || outranks(actor.role, role)));
}

function canManage(actor: UserDto, target: ModeratedUserDto): boolean {
    return actor.id !== target.id && hasAtLeast(actor, Role.Supervisor) && outranks(actor.role, target.role);
}

function BlacklistDialog({ target, onDone }: { readonly target: ModeratedUserDto; readonly onDone: () => void }): ReactNode {
    const reasonId = useId();
    const [open, setOpen] = useState(false);
    const [reason, setReason] = useState("");
    const blacklist = useMutation({
        mutationFn: () => {
            const trimmed = reason.trim();
            return platformApi.blacklist(target.id, trimmed.length === 0 ? null : trimmed);
        },
        onSuccess: () => {
            onDone();
            toast.success(`${target.username} can no longer vote.`);
            setOpen(false);
            setReason("");
        }
    });
    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button size="xs" variant="ghost">
                    Blacklist
                </Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Blacklist {target.username}?</DialogTitle>
                    <DialogDescription>Their ballots stop counting in every round.</DialogDescription>
                </DialogHeader>
                <div className="space-y-1.5">
                    <Label htmlFor={reasonId}>Reason (optional)</Label>
                    <Textarea
                        id={reasonId}
                        rows={3}
                        maxLength={500}
                        value={reason}
                        onChange={(event) => {
                            setReason(event.target.value);
                        }}
                    />
                </div>
                <DialogFooter>
                    <Button
                        variant="destructive"
                        disabled={blacklist.isPending}
                        onClick={() => {
                            blacklist.mutate();
                        }}
                    >
                        Blacklist
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

const presenceClasses: Readonly<Record<PresenceStatus, string>> = {
    [PresenceStatus.Online]: "bg-success",
    [PresenceStatus.Idle]: "bg-warning",
    [PresenceStatus.DoNotDisturb]: "bg-destructive",
    [PresenceStatus.Offline]: "bg-muted-foreground/40"
};

function SpecialtiesEditor({ target, disabled }: { readonly target: ModeratedUserDto; readonly disabled: boolean }): ReactNode {
    const queryClient = useQueryClient();
    const [selected, setSelected] = useState<Specialty[]>(target.specialties);
    const save = useMutation({
        mutationFn: () => platformApi.setRole(target.id, target.role, selected),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: queryKeys.usersAll });
            toast.success(`Updated ${target.username}'s specialties.`);
        }
    });
    const changed = selected.length !== target.specialties.length || selected.some((item) => !target.specialties.includes(item));
    return (
        <Popover
            onOpenChange={(open) => {
                if (!open) {
                    setSelected(target.specialties);
                }
            }}
        >
            <PopoverTrigger asChild>
                <button
                    type="button"
                    disabled={disabled}
                    className="text-muted-foreground block max-w-56 truncate text-left text-xs hover:underline disabled:no-underline"
                >
                    {target.specialties.map(specialtyLabel).join(", ") || (disabled ? "–" : "Add specialties")}
                </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-72 p-0">
                <p className="text-muted-foreground border-b px-3 py-2 text-xs">Up to {maximumSpecialties}</p>
                <div className="max-h-64 overflow-y-auto py-1">
                    {Object.values(Specialty).map((specialty) => {
                        const checked = selected.includes(specialty);
                        return (
                            <label key={specialty} className="hover:bg-accent flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm">
                                <Checkbox
                                    checked={checked}
                                    disabled={!checked && selected.length >= maximumSpecialties}
                                    onCheckedChange={(value) => {
                                        setSelected((current) =>
                                            value === true ? [...current, specialty] : current.filter((item) => item !== specialty)
                                        );
                                    }}
                                />
                                {specialtyLabel(specialty)}
                            </label>
                        );
                    })}
                </div>
                <div className="flex justify-end border-t px-3 py-2">
                    <Button
                        size="xs"
                        disabled={!changed || save.isPending}
                        onClick={() => {
                            save.mutate();
                        }}
                    >
                        Save
                    </Button>
                </div>
            </PopoverContent>
        </Popover>
    );
}

interface UserRowProps {
    readonly actor: UserDto;
    readonly target: ModeratedUserDto;
    readonly presence: PresenceStatus | undefined;
}

function UserRow({ actor, target, presence }: UserRowProps): ReactNode {
    const queryClient = useQueryClient();
    const refresh = (): void => {
        void queryClient.invalidateQueries({ queryKey: queryKeys.usersAll });
    };
    const setRole = useMutation({
        mutationFn: (role: Role) => platformApi.setRole(target.id, role),
        onSuccess: (updated) => {
            refresh();
            toast.success(`${updated.username} is now ${roleLabels[updated.role]}.`);
        }
    });
    const promote = useMutation({
        mutationFn: () => platformApi.promote(target.id),
        onSuccess: (updated) => {
            refresh();
            toast.success(`${updated.username} promoted.`);
        }
    });
    const lift = useMutation({
        mutationFn: () => platformApi.liftBlacklist(target.id),
        onSuccess: (updated) => {
            refresh();
            toast.success(`${updated.username} can vote again.`);
        }
    });
    const manageable = canManage(actor, target);
    const busy = setRole.isPending || promote.isPending || lift.isPending;
    const avatar = safeHttpUrl(target.avatarUrl);

    return (
        <TableRow>
            <TableCell>
                <div className="flex items-center gap-2">
                    <span className="relative">
                        <Avatar className="size-7">
                            {avatar !== null && <AvatarImage src={avatar} alt="" />}
                            <AvatarFallback className="text-[10px]">{target.username.slice(0, 2).toUpperCase()}</AvatarFallback>
                        </Avatar>
                        {presence !== undefined && (
                            <span
                                className={cn(
                                    "ring-card absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full ring-2",
                                    presenceClasses[presence]
                                )}
                                title={presence}
                            />
                        )}
                    </span>
                    <div className="min-w-0">
                        <p className="truncate font-medium">{target.username}</p>
                        <SpecialtiesEditor key={target.specialties.join(",")} target={target} disabled={!manageable} />
                    </div>
                </div>
            </TableCell>
            <TableCell>
                {manageable ? (
                    <Select
                        value={target.role}
                        disabled={busy}
                        onValueChange={(value) => {
                            const next = value as Role;
                            if (next !== target.role) {
                                setRole.mutate(next);
                            }
                        }}
                    >
                        <SelectTrigger size="sm" className="w-44" aria-label={`Role for ${target.username}`}>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {grantableRoles(actor).map((role) => (
                                <SelectItem key={role} value={role}>
                                    {roleLabels[role]}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                ) : (
                    roleLabels[target.role]
                )}
            </TableCell>
            <TableCell>
                {target.isBlacklisted ? (
                    <span className="space-y-0.5">
                        <ToneBadge tone={Tone.Negative}>Blacklisted</ToneBadge>
                        {target.blacklistReason !== null && (
                            <span className="text-muted-foreground block text-xs">{target.blacklistReason}</span>
                        )}
                    </span>
                ) : (
                    <ToneBadge tone={Tone.Neutral}>Active</ToneBadge>
                )}
            </TableCell>
            <TableCell className="text-muted-foreground text-xs whitespace-nowrap">{formatDateTime(target.createdAt)}</TableCell>
            <TableCell>
                {manageable && (
                    <div className="flex flex-wrap justify-end gap-1.5">
                        {target.role === Role.Contributor && (
                            <ConfirmButton
                                title={`Promote ${target.username}?`}
                                description="Senior contributors get first pick of hard tasks."
                                confirmLabel="Promote"
                                size="xs"
                                disabled={busy}
                                onConfirm={() => {
                                    promote.mutate();
                                }}
                            >
                                Promote
                            </ConfirmButton>
                        )}
                        {target.isBlacklisted ? (
                            <Button
                                size="xs"
                                variant="outline"
                                disabled={busy}
                                onClick={() => {
                                    lift.mutate();
                                }}
                            >
                                Lift blacklist
                            </Button>
                        ) : (
                            <BlacklistDialog target={target} onDone={refresh} />
                        )}
                    </div>
                )}
            </TableCell>
        </TableRow>
    );
}

function PeopleTable({ actor }: { readonly actor: UserDto }): ReactNode {
    const [role, setRole] = useState<Role | typeof anyRole>(anyRole);
    const [page, setPage] = useState(1);
    const query = { page, perPage: 20, role: role === anyRole ? undefined : role };
    const users = useQuery({
        queryKey: queryKeys.users(query),
        queryFn: () => platformApi.users(query),
        placeholderData: keepPreviousData
    });
    const discordIds = (users.data?.data ?? []).map((user) => user.discordId);
    const presence = useQuery({
        queryKey: queryKeys.presence(discordIds),
        queryFn: () => platformApi.presence(discordIds),
        enabled: discordIds.length > 0,
        staleTime: 90_000,
        refetchOnWindowFocus: false,
        retry: false
    });

    return (
        <>
            <Toolbar
                trailing={
                    users.data === undefined ? undefined : (
                        <span className="text-muted-foreground text-xs">{users.data.meta.total} people</span>
                    )
                }
            >
                <Select
                    value={role}
                    onValueChange={(value) => {
                        setRole(value as Role | typeof anyRole);
                        setPage(1);
                    }}
                >
                    <SelectTrigger size="sm" className="w-44" aria-label="Role">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value={anyRole}>Any role</SelectItem>
                        {rolesByRank.map((item) => (
                            <SelectItem key={item} value={item}>
                                {roleLabels[item]}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </Toolbar>
            {users.isPending ? (
                <LoadingRows rows={6} />
            ) : users.isError ? (
                <ErrorState error={users.error} onRetry={() => void users.refetch()} />
            ) : users.data.data.length === 0 ? (
                <EmptyState title="No people" />
            ) : (
                <>
                    <div className="bg-card overflow-x-auto rounded-md border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Person</TableHead>
                                    <TableHead className="w-48">Role</TableHead>
                                    <TableHead className="w-40">Voting</TableHead>
                                    <TableHead className="w-40">Joined</TableHead>
                                    <TableHead className="w-44" />
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {users.data.data.map((target) => (
                                    <UserRow key={target.id} actor={actor} target={target} presence={presence.data?.[target.discordId]} />
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                    <Pagination meta={users.data.meta} onPageChange={setPage} />
                </>
            )}
        </>
    );
}

function PeopleContent(): ReactNode {
    const { user } = useSession();
    return user === null ? null : <PeopleTable actor={user} />;
}

export function PeoplePage(): ReactNode {
    return (
        <RequireRole role={Role.Moderator}>
            <PageHeader title="People" />
            <PeopleContent />
        </RequireRole>
    );
}
