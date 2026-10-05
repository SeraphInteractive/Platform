"use client";

import {
    adminSpecialties,
    assignableSpecialties,
    fieldRules,
    type ModeratedUserDto,
    problemOf,
    Role,
    Specialty,
    type SpecialtyHolderDto,
    supervisorSpecialties,
    teamSpecialties,
    textLimits,
    type UserDto
} from "@platform/contracts";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { UserPlus } from "lucide-react";
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
import { RichTextInputField } from "@/Components/Common/FormField";
import { MarkdownText } from "@/Components/Common/MarkdownText";
import { Button } from "@/Components/Ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/Components/Ui/dialog";
import { Input } from "@/Components/Ui/input";
import { Label } from "@/Components/Ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/Components/Ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/Components/Ui/table";
import { useSession } from "@/Hooks/UseSession";
import { formatDate, specialtyLabel } from "@/Lib/Format";
import { hasAtLeast, isGrantable, outranks, roleLabels, rolesByRank } from "@/Lib/Roles";
import { safeHttpUrl } from "@/Lib/SafeUrl";

const anyRole = "any";

function grantableRoles(actor: UserDto): Role[] {
    return rolesByRank.filter((role) => isGrantable(role) && (hasAtLeast(actor, Role.Admin) || outranks(actor.role, role)));
}

function canManage(actor: UserDto, target: ModeratedUserDto): boolean {
    return actor.id !== target.id && hasAtLeast(actor, Role.Supervisor) && outranks(actor.role, target.role);
}

function canManageSecondary(actor: UserDto, target: ModeratedUserDto): boolean {
    return hasAtLeast(actor, Role.Admin) || canManage(actor, target);
}

interface SpecialtySelectContentProps {
    readonly holders: Record<Specialty, SpecialtyHolderDto | null>;
    readonly currentSpecialty: Specialty | null;
    readonly targetId?: string;
}

function SpecialtySelectContent({ holders, currentSpecialty, targetId }: SpecialtySelectContentProps): ReactNode {
    const isCustomCraft = currentSpecialty !== null && !assignableSpecialties.includes(currentSpecialty);
    return (
        <SelectContent>
            <SelectItem value="__none__">None</SelectItem>
            {isCustomCraft && (
                <SelectItem value={currentSpecialty}>
                    {specialtyLabel(currentSpecialty)} (Craft)
                </SelectItem>
            )}
            <SelectGroup>
                <SelectLabel>Admin Roles</SelectLabel>
                {adminSpecialties.map((s) => {
                    const holder = holders[s];
                    const isHeldElsewhere = holder !== null && holder !== undefined && holder.id !== targetId;
                    return (
                        <SelectItem key={s} value={s}>
                            {specialtyLabel(s)}
                            {isHeldElsewhere && ` (held by @${holder.username})`}
                        </SelectItem>
                    );
                })}
            </SelectGroup>
            <SelectGroup>
                <SelectLabel>Supervisor Roles</SelectLabel>
                {supervisorSpecialties.map((s) => {
                    const holder = holders[s];
                    const isHeldElsewhere = holder !== null && holder !== undefined && holder.id !== targetId;
                    return (
                        <SelectItem key={s} value={s}>
                            {specialtyLabel(s)}
                            {isHeldElsewhere && ` (held by @${holder.username})`}
                        </SelectItem>
                    );
                })}
            </SelectGroup>
            <SelectGroup>
                <SelectLabel>Team Roles</SelectLabel>
                {teamSpecialties.map((s) => (
                    <SelectItem key={s} value={s}>
                        {specialtyLabel(s)}
                    </SelectItem>
                ))}
            </SelectGroup>
        </SelectContent>
    );
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
                <RichTextInputField
                    id={reasonId}
                    label="Reason (optional)"
                    value={reason}
                    rule={fieldRules.reason}
                    limit={textLimits.reason}
                    onValueChange={setReason}
                />
                <DialogFooter>
                    <Button
                        variant="destructive"
                        disabled={blacklist.isPending || problemOf(fieldRules.reason, reason) !== null}
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

interface UserRowProps {
    readonly actor: UserDto;
    readonly target: ModeratedUserDto;
    readonly specialtyHolders: Record<Specialty, SpecialtyHolderDto | null>;
}

function UserRow({ actor, target, specialtyHolders }: UserRowProps): ReactNode {
    const queryClient = useQueryClient();
    const [pendingTransfer, setPendingTransfer] = useState<{ specialty: Specialty; holder: SpecialtyHolderDto } | null>(null);

    const refresh = (): void => {
        void queryClient.invalidateQueries({ queryKey: queryKeys.usersAll });
        void queryClient.invalidateQueries({ queryKey: queryKeys.specialtyHolders });
    };
    const setPrimaryRole = useMutation({
        mutationFn: (role: Role) => platformApi.setRole(target.id, role, target.specialties),
        onSuccess: (updated) => {
            refresh();
            toast.success(`${updated.username} is now ${roleLabels[updated.role]}.`);
        }
    });
    const setSecondaryRole = useMutation({
        mutationFn: ({ specialties, transfer }: { specialties: Specialty[]; transfer?: boolean }) =>
            platformApi.setRole(target.id, target.role, specialties, transfer),
        onSuccess: () => {
            refresh();
            setPendingTransfer(null);
            toast.success(`Updated @${target.username}'s secondary role.`);
        },
        onError: (err) => {
            toast.error(err instanceof Error ? err.message : "Failed to update secondary role.");
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
    const manageableSecondary = canManageSecondary(actor, target);
    const busy = setPrimaryRole.isPending || setSecondaryRole.isPending || promote.isPending || lift.isPending;
    const avatar = safeHttpUrl(target.avatarUrl);
    const currentSpecialty = target.specialties[0] ?? "__none__";

    const onSecondaryRoleChange = (value: string): void => {
        if (value === "__none__") {
            setSecondaryRole.mutate({ specialties: [] });
            return;
        }
        const next = value as Specialty;
        const holder = specialtyHolders[next];
        if (holder !== null && holder !== undefined && holder.id !== target.id) {
            setPendingTransfer({ specialty: next, holder });
            return;
        }
        setSecondaryRole.mutate({ specialties: [next] });
    };

    return (
        <TableRow>
            <TableCell>
                <div className="flex items-center gap-2">
                    <Avatar className="size-7">
                        {avatar !== null && <AvatarImage src={avatar} alt="" />}
                        <AvatarFallback className="text-[10px]">{target.username.slice(0, 2).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <span className="truncate font-medium">{target.username}</span>
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
                                setPrimaryRole.mutate(next);
                            }
                        }}
                    >
                        <SelectTrigger size="sm" className="w-40" aria-label={`Primary role for ${target.username}`}>
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
                {manageableSecondary ? (
                    <>
                        <Select
                            value={currentSpecialty}
                            disabled={busy}
                            onValueChange={onSecondaryRoleChange}
                        >
                            <SelectTrigger size="sm" className="w-48" aria-label={`Secondary role for ${target.username}`}>
                                <SelectValue />
                            </SelectTrigger>
                            <SpecialtySelectContent
                                holders={specialtyHolders}
                                currentSpecialty={target.specialties[0] ?? null}
                                targetId={target.id}
                            />
                        </Select>
                        {pendingTransfer !== null && (
                            <Dialog open={true} onOpenChange={(open) => !open && setPendingTransfer(null)}>
                                <DialogContent>
                                    <DialogHeader>
                                        <DialogTitle>Transfer {specialtyLabel(pendingTransfer.specialty)}?</DialogTitle>
                                        <DialogDescription>
                                            This role is currently assigned to @{pendingTransfer.holder.username}. Transferring will remove it from them and assign it to @{target.username}.
                                        </DialogDescription>
                                    </DialogHeader>
                                    <DialogFooter>
                                        <Button variant="ghost" onClick={() => setPendingTransfer(null)} disabled={setSecondaryRole.isPending}>
                                            Cancel
                                        </Button>
                                        <Button
                                            disabled={setSecondaryRole.isPending}
                                            onClick={() => {
                                                setSecondaryRole.mutate({ specialties: [pendingTransfer.specialty], transfer: true });
                                            }}
                                        >
                                            Transfer Role
                                        </Button>
                                    </DialogFooter>
                                </DialogContent>
                            </Dialog>
                        )}
                    </>
                ) : (
                    <span className="text-muted-foreground text-xs">
                        {target.specialties[0] ? specialtyLabel(target.specialties[0]) : "None"}
                    </span>
                )}
            </TableCell>
            <TableCell>
                {target.isBlacklisted ? (
                    <span className="space-y-0.5">
                        <ToneBadge tone={Tone.Negative}>Blacklisted</ToneBadge>
                        {target.blacklistReason !== null && (
                            <MarkdownText className="text-muted-foreground text-xs">{target.blacklistReason}</MarkdownText>
                        )}
                    </span>
                ) : (
                    <ToneBadge tone={Tone.Neutral}>Active</ToneBadge>
                )}
            </TableCell>
            <TableCell className="text-muted-foreground text-xs whitespace-nowrap">{formatDate(target.createdAt)}</TableCell>
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
    const specialtyHoldersQuery = useQuery({
        queryKey: queryKeys.specialtyHolders,
        queryFn: () => platformApi.specialtyHolders()
    });
    const specialtyHolders = specialtyHoldersQuery.data ?? ({} as Record<Specialty, SpecialtyHolderDto | null>);

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
                                    <TableHead className="w-44">Primary Role</TableHead>
                                    <TableHead className="w-48">Secondary Role</TableHead>
                                    <TableHead className="w-32">Voting</TableHead>
                                    <TableHead className="w-32">Joined</TableHead>
                                    <TableHead className="w-40" />
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {users.data.data.map((target) => (
                                    <UserRow
                                        key={target.id}
                                        actor={actor}
                                        target={target}
                                        specialtyHolders={specialtyHolders}
                                    />
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

interface AssignDiscordRoleDialogProps {
    readonly actor: UserDto;
    readonly trigger: ReactNode;
}

function AssignDiscordRoleDialog({ actor, trigger }: AssignDiscordRoleDialogProps): ReactNode {
    const queryClient = useQueryClient();
    const [open, setOpen] = useState(false);
    const [discordId, setDiscordId] = useState("");
    const [discordUsername, setDiscordUsername] = useState("");
    const [role, setRole] = useState<Role>(Role.Contributor);
    const [secondaryRole, setSecondaryRole] = useState<string>("__none__");

    const specialtyHoldersQuery = useQuery({
        queryKey: queryKeys.specialtyHolders,
        queryFn: () => platformApi.specialtyHolders(),
        enabled: open
    });
    const specialtyHolders = specialtyHoldersQuery.data ?? ({} as Record<Specialty, SpecialtyHolderDto | null>);

    const roles = grantableRoles(actor);
    const validId = /^\d{17,20}$/u.test(discordId.trim());

    const assign = useMutation({
        mutationFn: () => {
            const trimmedUsername = discordUsername.trim();
            return platformApi.setRoleByDiscord(discordId.trim(), {
                role,
                specialties: secondaryRole === "__none__" ? [] : [secondaryRole as Specialty],
                discordUsername: trimmedUsername.length === 0 ? undefined : trimmedUsername
            });
        },
        onSuccess: (updated) => {
            void queryClient.invalidateQueries({ queryKey: queryKeys.usersAll });
            void queryClient.invalidateQueries({ queryKey: queryKeys.specialtyHolders });
            toast.success(`Assigned ${roleLabels[updated.role]} to ${updated.username}.`);
            setOpen(false);
            setDiscordId("");
            setDiscordUsername("");
            setRole(Role.Contributor);
            setSecondaryRole("__none__");
        }
    });

    const onSubmit = (event: React.FormEvent): void => {
        event.preventDefault();
        if (validId && !assign.isPending) {
            assign.mutate();
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>{trigger}</DialogTrigger>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Assign role by Discord</DialogTitle>
                    <DialogDescription>Pre-assign a role and specialties to a user before they log in.</DialogDescription>
                </DialogHeader>
                <form onSubmit={onSubmit} className="space-y-4">
                    <div className="space-y-1.5">
                        <Label htmlFor="discord-snowflake">Discord Snowflake ID</Label>
                        <Input
                            id="discord-snowflake"
                            placeholder="e.g. 965511204372086814"
                            value={discordId}
                            onChange={(e) => setDiscordId(e.target.value)}
                            maxLength={20}
                        />
                        {discordId.length > 0 && !validId && <p className="text-destructive text-xs">Must be a 17-20 digit Discord ID.</p>}
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="discord-username">Username (optional hint)</Label>
                        <Input
                            id="discord-username"
                            placeholder="e.g. Lunasa"
                            value={discordUsername}
                            onChange={(e) => setDiscordUsername(e.target.value)}
                            maxLength={64}
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="discord-role">Studio Role</Label>
                        <Select value={role} onValueChange={(val) => setRole(val as Role)}>
                            <SelectTrigger id="discord-role">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {roles.map((r) => (
                                    <SelectItem key={r} value={r}>
                                        {roleLabels[r]}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="discord-secondary-role">Secondary Role (Specialty)</Label>
                        <Select value={secondaryRole} onValueChange={setSecondaryRole}>
                            <SelectTrigger id="discord-secondary-role">
                                <SelectValue />
                            </SelectTrigger>
                            <SpecialtySelectContent
                                holders={specialtyHolders}
                                currentSpecialty={null}
                            />
                        </Select>
                    </div>
                    <DialogFooter>
                        <Button type="submit" disabled={!validId || assign.isPending}>
                            {assign.isPending ? "Assigning..." : "Assign role"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

function PeopleContent(): ReactNode {
    const { user } = useSession();
    return user === null ? null : <PeopleTable actor={user} />;
}

export function PeoplePage(): ReactNode {
    const { user } = useSession();
    return (
        <RequireRole role={Role.Moderator}>
            <PageHeader
                title="People"
                actions={
                    user !== null && hasAtLeast(user, Role.Supervisor) ? (
                        <AssignDiscordRoleDialog
                            actor={user}
                            trigger={
                                <Button size="sm">
                                    <UserPlus className="size-4" />
                                    Assign by Discord
                                </Button>
                            }
                        />
                    ) : undefined
                }
            />
            <PeopleContent />
        </RequireRole>
    );
}
