"use client";

import {
    fieldRules,
    maximumSpecialties,
    type ModeratedUserDto,
    problemOf,
    Role,
    Specialty,
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
import { isAdminDiscordId, useSiteConfig } from "@/Components/SiteConfig";
import { Avatar, AvatarFallback, AvatarImage } from "@/Components/Ui/avatar";
import { RichTextInputField } from "@/Components/Common/FormField";
import { MarkdownText } from "@/Components/Common/MarkdownText";
import { Button } from "@/Components/Ui/button";
import { Checkbox } from "@/Components/Ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/Components/Ui/dialog";
import { Input } from "@/Components/Ui/input";
import { Label } from "@/Components/Ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/Components/Ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/Components/Ui/select";
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
}

function UserRow({ actor, target }: UserRowProps): ReactNode {
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
                    <Avatar className="size-7">
                        {avatar !== null && <AvatarImage src={avatar} alt="" />}
                        <AvatarFallback className="text-[10px]">{target.username.slice(0, 2).toUpperCase()}</AvatarFallback>
                    </Avatar>
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
                                    <UserRow key={target.id} actor={actor} target={target} />
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
    const siteConfig = useSiteConfig();
    const queryClient = useQueryClient();
    const [open, setOpen] = useState(false);
    const [discordId, setDiscordId] = useState("");
    const [discordUsername, setDiscordUsername] = useState("");
    const [role, setRole] = useState<Role>(Role.Contributor);
    const [specialties, setSpecialties] = useState<Specialty[]>([]);

    const roles = grantableRoles(actor);
    const isSuperadmin = isAdminDiscordId(siteConfig, discordId);
    const validId = /^\d{17,20}$/u.test(discordId.trim());

    const assign = useMutation({
        mutationFn: () => {
            const trimmedUsername = discordUsername.trim();
            return platformApi.setRoleByDiscord(discordId.trim(), {
                role,
                specialties,
                discordUsername: trimmedUsername.length === 0 ? undefined : trimmedUsername
            });
        },
        onSuccess: (updated) => {
            void queryClient.invalidateQueries({ queryKey: queryKeys.usersAll });
            toast.success(`Assigned ${roleLabels[updated.role]} to ${updated.username}.`);
            setOpen(false);
            setDiscordId("");
            setDiscordUsername("");
            setRole(Role.Contributor);
            setSpecialties([]);
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
                        <div className="flex items-center justify-between">
                            <Label htmlFor="discord-snowflake">Discord Snowflake ID</Label>
                            {isSuperadmin && <ToneBadge tone={Tone.Positive}>Configured Superadmin</ToneBadge>}
                        </div>
                        <Input
                            id="discord-snowflake"
                            placeholder="e.g. 965511204372086814"
                            value={discordId}
                            onChange={(e) => {
                                const val = e.target.value;
                                setDiscordId(val);
                                if (actor.role === Role.Admin && isAdminDiscordId(siteConfig, val)) {
                                    setRole(Role.Admin);
                                }
                            }}
                            maxLength={20}
                        />
                        {discordId.length > 0 && !validId && (
                            <p className="text-destructive text-xs">Must be a 17-20 digit Discord ID.</p>
                        )}
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
                        <Label>Specialties (up to {maximumSpecialties})</Label>
                        <div className="grid grid-cols-2 gap-2 rounded-md border p-2 text-xs">
                            {Object.values(Specialty).map((s) => {
                                const checked = specialties.includes(s);
                                return (
                                    <label key={s} className="hover:bg-accent flex cursor-pointer items-center gap-2 rounded px-2 py-1">
                                        <Checkbox
                                            checked={checked}
                                            disabled={!checked && specialties.length >= maximumSpecialties}
                                            onCheckedChange={(val) => {
                                                setSpecialties((current) =>
                                                    val === true ? [...current, s] : current.filter((item) => item !== s)
                                                );
                                            }}
                                        />
                                        <span>{specialtyLabel(s)}</span>
                                    </label>
                                );
                            })}
                        </div>
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
