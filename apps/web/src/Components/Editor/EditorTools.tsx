"use client";

import type { Editor } from "@tiptap/react";
import { Link2, type LucideIcon } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button } from "@/Components/Ui/button";
import { Input } from "@/Components/Ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/Components/Ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/Components/Ui/tooltip";
import { cn } from "@/Lib/Utils";

export const safeLink = /^(?:https?:\/\/|mailto:|\/(?![/\\])|#)/iu;

interface ToolProps {
    readonly label: string;
    readonly icon: LucideIcon;
    readonly active?: boolean;
    readonly disabled?: boolean;
    readonly onClick: () => void;
}

export function Tool({ label, icon: Icon, active = false, disabled = false, onClick }: ToolProps): ReactNode {
    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className={cn("size-7", active && "bg-accent text-accent-foreground")}
                    aria-label={label}
                    aria-pressed={active}
                    disabled={disabled}
                    onMouseDown={(event) => {
                        event.preventDefault();
                    }}
                    onClick={onClick}
                >
                    <Icon />
                </Button>
            </TooltipTrigger>
            <TooltipContent>{label}</TooltipContent>
        </Tooltip>
    );
}

export function LinkTool({ editor, active }: { readonly editor: Editor; readonly active: boolean }): ReactNode {
    const [open, setOpen] = useState(false);
    const [href, setHref] = useState("");
    const valid = safeLink.test(href.trim());

    const apply = (): void => {
        if (!valid) {
            return;
        }
        editor.chain().focus().extendMarkRange("link").setLink({ href: href.trim() }).run();
        setOpen(false);
    };

    return (
        <Popover
            open={open}
            onOpenChange={(next) => {
                setOpen(next);
                if (next) {
                    setHref((editor.getAttributes("link").href as string | undefined) ?? "");
                }
            }}
        >
            <PopoverTrigger asChild>
                <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className={cn("size-7", active && "bg-accent text-accent-foreground")}
                    aria-label="Link"
                >
                    <Link2 />
                </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-80 space-y-2 p-3">
                <form
                    className="flex gap-2"
                    onSubmit={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        apply();
                    }}
                >
                    <Input
                        autoFocus
                        value={href}
                        placeholder="https://… or /page"
                        aria-label="Link address"
                        onChange={(event) => {
                            setHref(event.target.value);
                        }}
                    />
                    <Button type="submit" size="sm" disabled={!valid}>
                        Apply
                    </Button>
                </form>
                <p className="text-muted-foreground text-xs">Use https://, mailto: or a site path like /grabbox.</p>
            </PopoverContent>
        </Popover>
    );
}
