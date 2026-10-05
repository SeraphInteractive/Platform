"use client";

import { problemOf } from "@platform/contracts";
import { useState, type ComponentProps, type ReactNode } from "react";
import type { z } from "zod";
import { RichTextField } from "@/Components/Editor/RichTextField";
import { Input } from "@/Components/Ui/input";
import { Label } from "@/Components/Ui/label";
import { cn } from "@/Lib/Utils";

interface FieldFrameProps {
    readonly id: string;
    readonly label: string;
    readonly length: number;
    readonly limit: number;
    readonly problem: string | null;
    readonly hint?: string;
    readonly children: ReactNode;
}

function FieldFrame({ id, label, length, limit, problem, hint, children }: FieldFrameProps): ReactNode {
    return (
        <div className="space-y-1.5">
            <Label htmlFor={id}>{label}</Label>
            {children}
            <div className="flex justify-between gap-3 text-xs">
                <p id={`${id}-message`} className={cn("min-w-0", problem === null ? "text-muted-foreground" : "text-destructive")}>
                    {problem ?? hint}
                </p>
                <span className={cn("shrink-0 tabular-nums", length > limit ? "text-destructive" : "text-muted-foreground")}>
                    {length}/{limit}
                </span>
            </div>
        </div>
    );
}

function useVisibleProblem(rule: z.ZodType, value: string, invalidWhenEmpty: boolean): { problem: string | null; touch: () => void } {
    const [touched, setTouched] = useState(false);
    const problem = problemOf(rule, value);
    const visible = problem !== null && (touched || value.length > 0 || invalidWhenEmpty) ? problem : null;
    return {
        problem: visible,
        touch: () => {
            setTouched(true);
        }
    };
}

interface TextInputFieldProps extends Omit<ComponentProps<typeof Input>, "id" | "value" | "onChange" | "maxLength"> {
    readonly id: string;
    readonly label: string;
    readonly value: string;
    readonly rule: z.ZodType;
    readonly limit: number;
    readonly hint?: string;
    readonly onValueChange: (value: string) => void;
}

export function TextInputField({ id, label, value, rule, limit, hint, onValueChange, onBlur, ...props }: TextInputFieldProps): ReactNode {
    const { problem, touch } = useVisibleProblem(rule, value, false);
    return (
        <FieldFrame id={id} label={label} length={value.trim().length} limit={limit} problem={problem} hint={hint}>
            <Input
                {...props}
                id={id}
                value={value}
                maxLength={limit}
                aria-invalid={problem !== null || undefined}
                aria-describedby={`${id}-message`}
                onBlur={(event) => {
                    touch();
                    onBlur?.(event);
                }}
                onChange={(event) => {
                    onValueChange(event.target.value);
                }}
            />
        </FieldFrame>
    );
}

interface RichTextInputFieldProps {
    readonly id: string;
    readonly label: string;
    readonly value: string;
    readonly rule: z.ZodType;
    readonly limit: number;
    readonly hint?: string;
    readonly placeholder?: string;
    readonly disabled?: boolean;
    readonly forceInvalid?: string | null;
    readonly onValueChange: (value: string) => void;
}

export function RichTextInputField({
    id,
    label,
    value,
    rule,
    limit,
    hint,
    placeholder,
    disabled,
    forceInvalid = null,
    onValueChange
}: RichTextInputFieldProps): ReactNode {
    const { problem } = useVisibleProblem(rule, value, false);
    const shown = forceInvalid ?? problem;
    return (
        <FieldFrame id={id} label={label} length={value.length} limit={limit} problem={shown} hint={hint}>
            <RichTextField
                id={id}
                value={value}
                placeholder={placeholder}
                disabled={disabled}
                invalid={shown !== null}
                onChange={onValueChange}
            />
        </FieldFrame>
    );
}
