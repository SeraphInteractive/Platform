"use client";

import { useState, type ComponentProps, type ReactNode } from "react";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger
} from "@/Components/Ui/alert-dialog";
import { Button } from "@/Components/Ui/button";

interface ConfirmButtonProps {
    readonly title: string;
    readonly description: ReactNode;
    readonly confirmLabel: string;
    readonly onConfirm: () => void;
    readonly disabled?: boolean;
    readonly destructive?: boolean;
    readonly size?: ComponentProps<typeof Button>["size"];
    readonly variant?: ComponentProps<typeof Button>["variant"];
    readonly requireCheckbox?: boolean;
    readonly checkboxLabel?: string;
    readonly children: ReactNode;
}

export function ConfirmButton({
    title,
    description,
    confirmLabel,
    onConfirm,
    disabled = false,
    destructive = false,
    size = "sm",
    variant = "outline",
    requireCheckbox = false,
    checkboxLabel = "I confirm that I want to finalize and certify this round. This action cannot be undone.",
    children
}: ConfirmButtonProps): ReactNode {
    const [open, setOpen] = useState(false);
    const [confirmed, setConfirmed] = useState(false);

    return (
        <AlertDialog
            open={open}
            onOpenChange={(next) => {
                setOpen(next);
                if (!next) {
                    setConfirmed(false);
                }
            }}
        >
            <AlertDialogTrigger asChild>
                <Button size={size} variant={variant} disabled={disabled}>
                    {children}
                </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>{title}</AlertDialogTitle>
                    <AlertDialogDescription asChild>
                        <div className="space-y-3">
                            <div>{description}</div>
                            {requireCheckbox && (
                                <label className="flex items-center gap-2 pt-2 text-xs cursor-pointer select-none text-foreground font-medium">
                                    <input
                                        type="checkbox"
                                        checked={confirmed}
                                        onChange={(e) => setConfirmed(e.target.checked)}
                                        className="h-4 w-4 rounded border-gray-300"
                                    />
                                    <span>{checkboxLabel}</span>
                                </label>
                            )}
                        </div>
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                        disabled={requireCheckbox && !confirmed}
                        className={destructive ? "bg-destructive hover:bg-destructive/90 text-white" : undefined}
                        onClick={() => {
                            setOpen(false);
                            setConfirmed(false);
                            onConfirm();
                        }}
                    >
                        {confirmLabel}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
