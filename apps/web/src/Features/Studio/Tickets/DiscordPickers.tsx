"use client";

import {
    DiscordChannelKind,
    type DiscordDirectoryChannelDto,
    type DiscordDirectoryDto,
    type DiscordDirectoryMemberDto,
    type DiscordDirectoryRoleDto,
    type TicketPersonDto
} from "@platform/contracts";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronsUpDown, Hash, Megaphone, X } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { platformApi } from "@/Api/PlatformApi";
import { queryKeys } from "@/Api/QueryKeys";
import { Avatar, AvatarFallback, AvatarImage } from "@/Components/Ui/avatar";
import { Badge } from "@/Components/Ui/badge";
import { Button } from "@/Components/Ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/Components/Ui/command";
import { Input } from "@/Components/Ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/Components/Ui/popover";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/Components/Ui/select";
import { cn } from "@/Lib/Utils";

const noChannel = "none";
const snowflakePattern = /^\d{17,20}$/u;
const messageChannelKinds: readonly DiscordChannelKind[] = [DiscordChannelKind.Text, DiscordChannelKind.Announcement];

export function useDiscordDirectory(): DiscordDirectoryDto | undefined {
    return useQuery({ queryKey: queryKeys.discordDirectory, queryFn: () => platformApi.discordDirectory(), staleTime: 60_000 }).data;
}

export function roleColor(role: DiscordDirectoryRoleDto): string {
    return role.color === 0 ? "var(--muted-foreground)" : `#${role.color.toString(16).padStart(6, "0")}`;
}

interface ChannelGroup {
    readonly name: string;
    readonly channels: readonly DiscordDirectoryChannelDto[];
}

function groupChannels(directory: DiscordDirectoryDto, kinds: readonly DiscordChannelKind[]): ChannelGroup[] {
    const categories = directory.channels
        .filter((channel) => channel.kind === DiscordChannelKind.Category)
        .sort((left, right) => left.position - right.position);
    const usable = directory.channels
        .filter((channel) => kinds.includes(channel.kind))
        .sort((left, right) => left.position - right.position);
    const groups: ChannelGroup[] = [{ name: "No category", channels: usable.filter((channel) => channel.parentId === null) }];
    for (const category of categories) {
        groups.push({ name: category.name, channels: usable.filter((channel) => channel.parentId === category.id) });
    }
    return groups.filter((group) => group.channels.length > 0);
}

function RawIdInput({
    id,
    value,
    onChange,
    placeholder
}: {
    readonly id?: string;
    readonly value: string | null;
    readonly onChange: (value: string | null) => void;
    readonly placeholder: string;
}): ReactNode {
    const [draft, setDraft] = useState(value ?? "");
    return (
        <Input
            id={id}
            value={draft}
            placeholder={placeholder}
            inputMode="numeric"
            aria-invalid={(draft.length > 0 && !snowflakePattern.test(draft)) || undefined}
            onChange={(event) => {
                const next = event.target.value.trim();
                setDraft(next);
                if (next.length === 0) {
                    onChange(null);
                } else if (snowflakePattern.test(next)) {
                    onChange(next);
                }
            }}
        />
    );
}

interface ChannelSelectProps {
    readonly id?: string;
    readonly value: string | null;
    readonly onChange: (value: string | null) => void;
    readonly kinds?: readonly DiscordChannelKind[];
    readonly placeholder?: string;
    readonly noneLabel?: string;
}

export function ChannelSelect({
    id,
    value,
    onChange,
    kinds = messageChannelKinds,
    placeholder = "Choose a channel",
    noneLabel = "Not set"
}: ChannelSelectProps): ReactNode {
    const directory = useDiscordDirectory();
    const groups = useMemo(() => (directory === undefined ? [] : groupChannels(directory, kinds)), [directory, kinds]);
    if (directory === undefined || directory.channels.length === 0) {
        return <RawIdInput id={id} value={value} onChange={onChange} placeholder="Channel ID" />;
    }
    const known = value === null || directory.channels.some((channel) => channel.id === value);
    return (
        <Select value={value ?? noChannel} onValueChange={(next) => onChange(next === noChannel ? null : next)}>
            <SelectTrigger id={id} className="w-full">
                <SelectValue placeholder={placeholder} />
            </SelectTrigger>
            <SelectContent>
                <SelectItem value={noChannel}>{noneLabel}</SelectItem>
                {!known && value !== null && <SelectItem value={value}>Unknown channel ({value})</SelectItem>}
                {groups.map((group) => (
                    <SelectGroup key={group.name}>
                        <SelectLabel>{group.name}</SelectLabel>
                        {group.channels.map((channel) => (
                            <SelectItem key={channel.id} value={channel.id}>
                                {channel.kind === DiscordChannelKind.Announcement ? (
                                    <Megaphone className="size-3.5" />
                                ) : (
                                    <Hash className="size-3.5" />
                                )}
                                {channel.name}
                            </SelectItem>
                        ))}
                    </SelectGroup>
                ))}
            </SelectContent>
        </Select>
    );
}

interface RoleMultiSelectProps {
    readonly id?: string;
    readonly value: readonly string[];
    readonly onChange: (value: string[]) => void;
    readonly placeholder?: string;
}

export function RoleMultiSelect({ id, value, onChange, placeholder = "Choose roles" }: RoleMultiSelectProps): ReactNode {
    const directory = useDiscordDirectory();
    const [open, setOpen] = useState(false);
    const [rawRole, setRawRole] = useState("");
    const roles = useMemo(
        () => (directory?.roles ?? []).filter((role) => !role.isManaged).sort((left, right) => right.position - left.position),
        [directory]
    );
    const byId = new Map(roles.map((role) => [role.id, role]));
    const toggle = (roleId: string): void => {
        onChange(value.includes(roleId) ? value.filter((item) => item !== roleId) : [...value, roleId]);
    };

    return (
        <div className="space-y-2">
            {roles.length === 0 ? (
                <div className="flex gap-2">
                    <Input
                        id={id}
                        value={rawRole}
                        placeholder="Role ID"
                        inputMode="numeric"
                        onChange={(event) => setRawRole(event.target.value.trim())}
                    />
                    <Button
                        type="button"
                        variant="outline"
                        disabled={!snowflakePattern.test(rawRole) || value.includes(rawRole)}
                        onClick={() => {
                            onChange([...value, rawRole]);
                            setRawRole("");
                        }}
                    >
                        Add
                    </Button>
                </div>
            ) : (
                <Popover open={open} onOpenChange={setOpen}>
                    <PopoverTrigger asChild>
                        <Button
                            id={id}
                            type="button"
                            variant="outline"
                            role="combobox"
                            aria-expanded={open}
                            className="w-full justify-between font-normal"
                        >
                            <span className="text-muted-foreground truncate">
                                {value.length === 0 ? placeholder : `${value.length} selected`}
                            </span>
                            <ChevronsUpDown className="size-4 opacity-50" />
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
                        <Command>
                            <CommandInput placeholder="Search roles..." />
                            <CommandList>
                                <CommandEmpty>No roles found.</CommandEmpty>
                                <CommandGroup>
                                    {roles.map((role) => (
                                        <CommandItem key={role.id} value={`${role.name} ${role.id}`} onSelect={() => toggle(role.id)}>
                                            <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: roleColor(role) }} />
                                            <span className="truncate">{role.name}</span>
                                            <Check
                                                className={cn("ml-auto size-4", value.includes(role.id) ? "opacity-100" : "opacity-0")}
                                            />
                                        </CommandItem>
                                    ))}
                                </CommandGroup>
                            </CommandList>
                        </Command>
                    </PopoverContent>
                </Popover>
            )}
            {value.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                    {value.map((roleId) => {
                        const role = byId.get(roleId);
                        return (
                            <Badge key={roleId} variant="outline" className="gap-1.5 pr-1">
                                {role !== undefined && (
                                    <span className="size-2 rounded-full" style={{ backgroundColor: roleColor(role) }} />
                                )}
                                {role?.name ?? roleId}
                                <button
                                    type="button"
                                    className="hover:bg-muted rounded-sm p-0.5"
                                    aria-label={`Remove ${role?.name ?? roleId}`}
                                    onClick={() => toggle(roleId)}
                                >
                                    <X className="size-3" />
                                </button>
                            </Badge>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

export function MemberAvatar({
    member,
    name,
    className
}: {
    readonly member?: DiscordDirectoryMemberDto;
    readonly name: string;
    readonly className?: string;
}): ReactNode {
    return (
        <Avatar className={cn("size-6", className)}>
            {member?.avatarUrl !== null && member?.avatarUrl !== undefined && <AvatarImage src={member.avatarUrl} alt="" />}
            <AvatarFallback className="text-[10px]">{name.slice(0, 2).toUpperCase()}</AvatarFallback>
        </Avatar>
    );
}

interface MemberPickerProps {
    readonly trigger: ReactNode;
    readonly onPick: (person: TicketPersonDto) => void;
    readonly roleIds?: readonly string[];
    readonly exclude?: readonly string[];
    readonly heading?: string;
}

export function MemberPicker({ trigger, onPick, roleIds, exclude = [], heading = "Members" }: MemberPickerProps): ReactNode {
    const directory = useDiscordDirectory();
    const [open, setOpen] = useState(false);
    const members = useMemo(() => {
        const all = directory?.members ?? [];
        const filtered = roleIds === undefined ? all : all.filter((member) => member.roleIds.some((roleId) => roleIds.includes(roleId)));
        return filtered
            .filter((member) => !exclude.includes(member.id))
            .sort((left, right) => left.displayName.localeCompare(right.displayName));
    }, [directory, roleIds, exclude]);
    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>{trigger}</PopoverTrigger>
            <PopoverContent className="w-72 p-0" align="end">
                <Command>
                    <CommandInput placeholder="Search members..." />
                    <CommandList>
                        <CommandEmpty>
                            {directory?.syncedAt === null ? "The bot has not synced members yet." : "No members found."}
                        </CommandEmpty>
                        <CommandGroup heading={heading}>
                            {members.slice(0, 200).map((member) => (
                                <CommandItem
                                    key={member.id}
                                    value={`${member.displayName} ${member.username} ${member.id}`}
                                    onSelect={() => {
                                        onPick({ discordId: member.id, username: member.displayName });
                                        setOpen(false);
                                    }}
                                >
                                    <MemberAvatar member={member} name={member.displayName} />
                                    <span className="truncate">{member.displayName}</span>
                                    <span className="text-muted-foreground ml-auto truncate text-xs">@{member.username}</span>
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}

export function RoleNames({ roleIds, empty = "No roles" }: { readonly roleIds: readonly string[]; readonly empty?: string }): ReactNode {
    const directory = useDiscordDirectory();
    if (roleIds.length === 0) {
        return <span className="text-muted-foreground">{empty}</span>;
    }
    const byId = new Map((directory?.roles ?? []).map((role) => [role.id, role]));
    return (
        <span className="inline-flex flex-wrap gap-x-2 gap-y-1">
            {roleIds.map((roleId) => {
                const role = byId.get(roleId);
                return (
                    <span key={roleId} className="inline-flex items-center gap-1">
                        {role !== undefined && <span className="size-2 rounded-full" style={{ backgroundColor: roleColor(role) }} />}
                        {role?.name ?? roleId}
                    </span>
                );
            })}
        </span>
    );
}

export function ChannelName({ channelId, empty = "Not set" }: { readonly channelId: string | null; readonly empty?: string }): ReactNode {
    const directory = useDiscordDirectory();
    if (channelId === null) {
        return <span className="text-muted-foreground">{empty}</span>;
    }
    const channel = directory?.channels.find((candidate) => candidate.id === channelId);
    return <span>#{channel?.name ?? channelId}</span>;
}
