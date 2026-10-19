"use client";

import { useQuery } from "@tanstack/react-query";
import { Eye, Megaphone, Send } from "lucide-react";
import { useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { platformApi } from "@/Api/PlatformApi";
import { queryKeys } from "@/Api/QueryKeys";
import { Section } from "@/Components/Common/Section";
import { Button } from "@/Components/Ui/button";
import { Card } from "@/Components/Ui/card";
import { Input } from "@/Components/Ui/input";
import { Label } from "@/Components/Ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/Components/Ui/select";
import { Textarea } from "@/Components/Ui/textarea";
import { useSession } from "@/Hooks/UseSession";

export function AnnouncementPublisher(): ReactNode {
    const { user } = useSession();
    const [target, setTarget] = useState<string>("global");
    const [title, setTitle] = useState<string>("");
    const [content, setContent] = useState<string>("");
    const [isPending, startTransition] = useTransition();

    const departments = useQuery({
        queryKey: queryKeys.departments,
        queryFn: () => platformApi.departments()
    });

    const canPublish = title.trim().length > 0 && content.trim().length > 0 && !isPending;

    const handlePublish = (): void => {
        if (!canPublish) return;

        startTransition(async () => {
            try {
                const result = await platformApi.publishAnnouncement({
                    target,
                    title: title.trim(),
                    content: content.trim()
                });

                if (result.channels.length > 0) {
                    toast.success(`Published announcement to: ${result.channels.join(", ")}`);
                    setTitle("");
                    setContent("");
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
        <Section
            title="Announcements"
            description="Dispatch markdown announcements directly to Discord announcement and department info channels."
        >
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
                            <p className="text-muted-foreground text-xs">
                                Posts via secure webhook. Only authorized supervisors can broadcast.
                            </p>
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
                            <Textarea
                                id="announcement-content"
                                placeholder="Write announcement in standard markdown..."
                                rows={6}
                                maxLength={4000}
                                value={content}
                                onChange={(e) => setContent(e.target.value)}
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
                                <div className="h-6 w-6 rounded-full bg-blue-600 flex items-center justify-center text-xs font-bold text-white">
                                    <Megaphone className="h-3.5 w-3.5" />
                                </div>
                                <div>
                                    <span className="text-xs font-semibold text-white">Project Stairway</span>
                                    <span className="ml-1.5 text-[10px] bg-[#5865F2] text-white px-1 py-0.5 rounded font-mono font-bold">
                                        BOT
                                    </span>
                                </div>
                            </div>
                            <div className="rounded border-l-4 border-[#3498db] bg-neutral-900/90 p-3.5 space-y-2">
                                <h4 className="text-sm font-semibold text-white">
                                    {title.trim().length > 0 ? title : "Announcement Title"}
                                </h4>
                                <div className="text-xs text-neutral-300 whitespace-pre-wrap leading-relaxed">
                                    {content.trim().length > 0 ? content : "Announcement content will appear here in Discord embed format."}
                                </div>
                                <div className="pt-2 border-t border-neutral-800 text-[10px] text-neutral-400">
                                    Published by {user?.username ?? "Studio"} - Project Stairway
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </Card>
        </Section>
    );
}
