"use client";

import type { TicketPersonDto } from "@platform/contracts";
import { useQuery } from "@tanstack/react-query";
import { AtSign, Eye, Send, UserPlus, X } from "lucide-react";
import { useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { platformApi } from "@/Api/PlatformApi";
import { queryKeys } from "@/Api/QueryKeys";
import { MarkdownText } from "@/Components/Common/MarkdownText";
import { Section } from "@/Components/Common/Section";
import { RichTextField } from "@/Components/Editor/RichTextField";
import { Badge } from "@/Components/Ui/badge";
import { Button } from "@/Components/Ui/button";
import { Card } from "@/Components/Ui/card";
import { Input } from "@/Components/Ui/input";
import { Label } from "@/Components/Ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/Components/Ui/select";
import { MemberAvatar, MemberPicker, RoleMultiSelect, useDiscordDirectory } from "@/Features/Studio/Tickets/DiscordPickers";
import { useSession } from "@/Hooks/UseSession";
import { cn } from "@/Lib/Utils";

export function AnnouncementPublisher(): ReactNode {
    const { user } = useSession();
    const directory = useDiscordDirectory();
    const [target, setTarget] = useState<string>("global");
    const [title, setTitle] = useState<string>("");
    const [content, setContent] = useState<string>("");
    const [pingEveryone, setPingEveryone] = useState<boolean>(false);
    const [pingHere, setPingHere] = useState<boolean>(false);
    const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>([]);
    const [selectedMembers, setSelectedMembers] = useState<TicketPersonDto[]>([]);
    const [isPending, startTransition] = useTransition();

    const departments = useQuery({
        queryKey: queryKeys.departments,
        queryFn: () => platformApi.departments()
    });

    const canPublish = title.trim().length > 0 && content.trim().length > 0 && !isPending;
    const hasPings = pingEveryone || pingHere || selectedRoleIds.length > 0 || selectedMembers.length > 0;

    const handlePublish = (): void => {
        if (!canPublish) return;

        startTransition(async () => {
            try {
                const result = await platformApi.publishAnnouncement({
                    target,
                    title: title.trim(),
                    content: content.trim(),
                    pings: hasPings
                        ? {
                              everyone: pingEveryone || undefined,
                              here: pingHere || undefined,
                              roleIds: selectedRoleIds.length > 0 ? selectedRoleIds : undefined,
                              userIds: selectedMembers.length > 0 ? selectedMembers.map((m) => m.discordId) : undefined
                          }
                        : undefined
                });

                if (result.channels.length > 0) {
                    toast.success(`Published announcement to: ${result.channels.join(", ")}`);
                    setTitle("");
                    setContent("");
                    setPingEveryone(false);
                    setPingHere(false);
                    setSelectedRoleIds([]);
                    setSelectedMembers([]);
                } else {
                    toast.warning("Announcement was sent, but no channels received it.");
                }
            } catch (err: unknown) {
                const message = err instanceof Error ? err.message : "Failed to publish announcement.";
                toast.error(message);
            }
        });
    };

    return (
        <Section title="Announcements">
            <Card className="p-5">
                <div className="grid gap-6 lg:grid-cols-2">
                    <div className="space-y-4">
                        <div className="space-y-1.5">
                            <Label htmlFor="target">Broadcast Target</Label>
                            <Select value={target} onValueChange={setTarget}>
                                <SelectTrigger id="target" className="w-full">
                                    <SelectValue placeholder="Select broadcast destination" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="global">Global Announcements (#announcements)</SelectItem>
                                    <SelectItem value="all_departments">All Departments (all *-info channels)</SelectItem>
                                    {departments.data?.map((dept) => (
                                        <SelectItem key={dept.id} value={`department:${dept.slug}`}>
                                            {dept.name} ({dept.slug}-info)
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2 rounded-lg border bg-neutral-900/40 p-3">
                            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                                <AtSign className="size-3.5" />
                                <span>Audience Pings</span>
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                                <Button
                                    type="button"
                                    size="sm"
                                    variant={pingEveryone ? "default" : "outline"}
                                    className={cn("h-7 text-xs", pingEveryone && "bg-amber-600 hover:bg-amber-700 text-white")}
                                    onClick={() => setPingEveryone(!pingEveryone)}
                                >
                                    @everyone
                                </Button>
                                <Button
                                    type="button"
                                    size="sm"
                                    variant={pingHere ? "default" : "outline"}
                                    className={cn("h-7 text-xs", pingHere && "bg-amber-600 hover:bg-amber-700 text-white")}
                                    onClick={() => setPingHere(!pingHere)}
                                >
                                    @here
                                </Button>
                                <MemberPicker
                                    trigger={
                                        <Button type="button" size="sm" variant="outline" className="h-7 gap-1 text-xs">
                                            <UserPlus className="size-3" />
                                            <span>Mention member</span>
                                        </Button>
                                    }
                                    onPick={(person) => {
                                        if (!selectedMembers.some((m) => m.discordId === person.discordId)) {
                                            setSelectedMembers([...selectedMembers, person]);
                                        }
                                    }}
                                />
                            </div>

                            <div className="space-y-1">
                                <RoleMultiSelect value={selectedRoleIds} onChange={setSelectedRoleIds} placeholder="Mention roles..." />
                            </div>

                            {selectedMembers.length > 0 && (
                                <div className="flex flex-wrap gap-1.5 pt-1">
                                    {selectedMembers.map((member) => (
                                        <Badge key={member.discordId} variant="outline" className="gap-1.5 pr-1 text-xs">
                                            <MemberAvatar name={member.username} className="size-3.5" />
                                            <span>{member.username}</span>
                                            <button
                                                type="button"
                                                className="hover:bg-muted rounded-sm p-0.5"
                                                aria-label={`Remove ${member.username}`}
                                                onClick={() =>
                                                    setSelectedMembers(selectedMembers.filter((m) => m.discordId !== member.discordId))
                                                }
                                            >
                                                <X className="size-3" />
                                            </button>
                                        </Badge>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="space-y-1.5">
                            <div className="flex items-center justify-between">
                                <Label htmlFor="announcement-title">Title</Label>
                                <span className="text-muted-foreground text-xs">{title.length} / 200</span>
                            </div>
                            <Input
                                id="announcement-title"
                                placeholder="e.g. Scene 4 Production Round Opening"
                                maxLength={200}
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                            />
                        </div>

                        <div className="space-y-1.5">
                            <div className="flex items-center justify-between">
                                <Label htmlFor="announcement-content">Message Content (Markdown)</Label>
                                <span className="text-muted-foreground text-xs">{content.length} / 4000</span>
                            </div>
                            <RichTextField
                                id="announcement-content"
                                placeholder="Write announcement in standard markdown..."
                                value={content}
                                maxLength={4000}
                                onChange={setContent}
                            />
                        </div>

                        <Button onClick={handlePublish} disabled={!canPublish} className="gap-2">
                            {isPending ? (
                                "Publishing..."
                            ) : (
                                <>
                                    <Send className="h-4 w-4" />
                                    Publish Announcement
                                </>
                            )}
                        </Button>
                    </div>

                    <div className="space-y-2">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                            <Eye className="h-3.5 w-3.5" />
                            <span>Discord Preview</span>
                        </div>
                        <div className="rounded-lg border bg-neutral-950 p-4 font-sans text-neutral-100">
                            <div className="flex items-center gap-2 mb-3">
                                <div className="relative size-6 shrink-0 overflow-hidden rounded-full bg-[#5865F2]">
                                    <img
                                        src="/branding/bot-pfp.png"
                                        alt="Project Stairway Bot"
                                        className="size-full object-cover"
                                        onError={(e) => {
                                            // fallback to initials if image fails to load
                                            e.currentTarget.style.display = "none";
                                        }}
                                    />
                                    <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-white -z-10">
                                        PS
                                    </span>
                                </div>
                                <div>
                                    <span className="text-xs font-semibold text-white">Project Stairway</span>
                                    <span className="ml-1.5 text-[10px] bg-[#5865F2] text-white px-1 py-0.5 rounded font-mono font-bold">
                                        BOT
                                    </span>
                                </div>
                            </div>

                            {hasPings && (
                                <div className="mb-2 flex flex-wrap items-center gap-1.5 text-xs">
                                    {pingEveryone && (
                                        <span className="rounded bg-[#5865F2]/20 px-1.5 py-0.5 font-medium text-[#c9cdfb]">@everyone</span>
                                    )}
                                    {pingHere && (
                                        <span className="rounded bg-[#5865F2]/20 px-1.5 py-0.5 font-medium text-[#c9cdfb]">@here</span>
                                    )}
                                    {selectedRoleIds.map((roleId) => {
                                        const role = directory?.roles.find((r) => r.id === roleId);
                                        return (
                                            <span key={roleId} className="rounded bg-[#5865F2]/20 px-1.5 py-0.5 font-medium text-[#c9cdfb]">
                                                @{role?.name ?? roleId}
                                            </span>
                                        );
                                    })}
                                    {selectedMembers.map((member) => (
                                        <span
                                            key={member.discordId}
                                            className="rounded bg-[#5865F2]/20 px-1.5 py-0.5 font-medium text-[#c9cdfb]"
                                        >
                                            @{member.username}
                                        </span>
                                    ))}
                                </div>
                            )}

                            <div className="rounded border-l-4 border-[#3498db] bg-neutral-900/90 p-3.5 space-y-2">
                                <h4 className="text-sm font-semibold text-white">
                                    {title.trim().length > 0 ? title : "Announcement Title"}
                                </h4>
                                <div className="text-xs text-neutral-300 leading-relaxed">
                                    {content.trim().length > 0 ? (
                                        <MarkdownText>{content}</MarkdownText>
                                    ) : (
                                        <span className="text-neutral-500 italic">
                                            Announcement content will appear here in Discord embed format.
                                        </span>
                                    )}
                                </div>
                                <div className="pt-2 border-t border-neutral-800 text-[10px] text-neutral-400">
                                    ~ {user?.username ?? "Studio"}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </Card>
        </Section>
    );
}
