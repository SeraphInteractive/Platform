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
    children
}: ConfirmButtonProps): ReactNode {
    const [open, setOpen] = useState(false);
    return (
        <AlertDialog open={open} onOpenChange={setOpen}>
            <AlertDialogTrigger asChild>
                <Button size={size} variant={variant} disabled={disabled}>
                    {children}
                </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>{title}</AlertDialogTitle>
                    <AlertDialogDescription>{description}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                        className={destructive ? "bg-destructive hover:bg-destructive/90 text-white" : undefined}
                        onClick={() => {
                            setOpen(false);
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
