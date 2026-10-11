"use client";

import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Shield, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { platformApi } from "@/Api/PlatformApi";
import { queryKeys } from "@/Api/QueryKeys";
import { Badge } from "@/Components/Ui/badge";
import { Button } from "@/Components/Ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/Components/Ui/dialog";
import { Input } from "@/Components/Ui/input";
import { formatDate } from "@/Lib/Format";

export function AutoModDialog(): ReactNode {
    const queryClient = useQueryClient();
    const [open, setOpen] = useState(false);
    const [pattern, setPattern] = useState("");
    const [isRegex, setIsRegex] = useState(false);
    const [search, setSearch] = useState("");

    const rulesQuery = useQuery({
        queryKey: queryKeys.automodRules,
        queryFn: () => platformApi.automodRules(),
        enabled: open
    });

    const addRule = useMutation({
        mutationFn: () => platformApi.addAutomodRule({ pattern: pattern.trim(), isRegex }),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: queryKeys.automodRules });
            toast.success("AutoMod rule added.");
            setPattern("");
        },
        onError: (err) => {
            toast.error(err instanceof Error ? err.message : "Failed to add AutoMod rule.");
        }
    });

    const deleteRule = useMutation({
        mutationFn: (id: string) => platformApi.deleteAutomodRule(id),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: queryKeys.automodRules });
            toast.success("Rule removed.");
        },
        onError: (err) => {
            toast.error(err instanceof Error ? err.message : "Failed to remove rule.");
        }
    });

    const onSubmit = (e: React.FormEvent): void => {
        e.preventDefault();
        const trimmed = pattern.trim();
        if (trimmed.length === 0 || addRule.isPending) return;
        addRule.mutate();
    };

    const rules = rulesQuery.data ?? [];
    const filteredRules = rules.filter((r) => r.pattern.toLowerCase().includes(search.toLowerCase().trim()));

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button size="sm" variant="outline">
                    <Shield className="size-4" />
                    AutoMod
                </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[85vh] sm:max-w-lg flex flex-col gap-4">
                <DialogHeader>
                    <DialogTitle>AutoMod Rules</DialogTitle>
                    <DialogDescription>Custom prohibited words and regex patterns enforced across chat.</DialogDescription>
                </DialogHeader>

                <form onSubmit={onSubmit} className="flex items-center gap-2">
                    <Input
                        placeholder={isRegex ? "e.g. \\bscamlink\\b" : "e.g. scamlink"}
                        value={pattern}
                        onChange={(e) => setPattern(e.target.value)}
                        className="flex-1"
                        maxLength={255}
                    />
                    <Button
                        type="button"
                        variant={isRegex ? "default" : "outline"}
                        size="sm"
                        onClick={() => setIsRegex(!isRegex)}
                        title="Toggle regular expression mode"
                    >
                        {isRegex ? "Regex" : "Word"}
                    </Button>
                    <Button type="submit" size="sm" disabled={pattern.trim().length === 0 || addRule.isPending}>
                        <Plus className="size-4" />
                        Add
                    </Button>
                </form>

                <div className="relative">
                    <Search className="text-muted-foreground absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
                    <Input
                        placeholder="Search rules..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="h-8 pl-8 text-xs"
                    />
                </div>

                <div className="flex-1 overflow-y-auto min-h-[160px] max-h-[320px] rounded-md border divide-y">
                    {rulesQuery.isPending ? (
                        <div className="p-4 text-center text-xs text-muted-foreground">Loading rules...</div>
                    ) : filteredRules.length === 0 ? (
                        <div className="p-4 text-center text-xs text-muted-foreground">
                            {rules.length === 0 ? "No custom rules. Default filter active." : "No matching rules found."}
                        </div>
                    ) : (
                        filteredRules.map((rule) => (
                            <div key={rule.id} className="flex items-center justify-between p-2.5 hover:bg-muted/30 text-sm">
                                <div className="flex items-center gap-2 min-w-0">
                                    <Badge
                                        variant={rule.isRegex ? "default" : "secondary"}
                                        className="text-[10px] uppercase font-mono px-1.5"
                                    >
                                        {rule.isRegex ? "regex" : "word"}
                                    </Badge>
                                    <span className="font-mono text-xs truncate max-w-[280px]" title={rule.pattern}>
                                        {rule.pattern}
                                    </span>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                    <span className="text-muted-foreground text-[11px] whitespace-nowrap">
                                        {formatDate(rule.createdAt)}
                                    </span>
                                    <Button
                                        size="xs"
                                        variant="ghost"
                                        className="text-muted-foreground hover:text-destructive size-7 p-0"
                                        disabled={deleteRule.isPending}
                                        onClick={() => deleteRule.mutate(rule.id)}
                                        aria-label={`Delete rule ${rule.pattern}`}
                                    >
                                        <Trash2 className="size-3.5" />
                                    </Button>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
