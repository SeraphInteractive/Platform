"use client";

import { X } from "lucide-react";
import { useRef, type ReactNode } from "react";
import { Button } from "@/Components/Ui/button";
import { Input } from "@/Components/Ui/input";
import { formatBytes } from "@/Lib/Format";

interface FilePickerProps {
    readonly id: string;
    readonly file: File | null;
    readonly accept: string;
    readonly required?: boolean;
    readonly disabled?: boolean;
    readonly onChange: (file: File | null) => void;
}

export function FilePicker({ id, file, accept, required, disabled, onChange }: FilePickerProps): ReactNode {
    const inputRef = useRef<HTMLInputElement>(null);

    const clear = (): void => {
        if (inputRef.current !== null) {
            inputRef.current.value = "";
        }
        onChange(null);
    };

    return (
        <div className="space-y-1">
            <Input
                ref={inputRef}
                id={id}
                type="file"
                accept={accept}
                required={required}
                disabled={disabled}
                className={file === null ? undefined : "sr-only"}
                onChange={(event) => {
                    onChange(event.target.files?.[0] ?? null);
                }}
            />
            {file !== null && (
                <div className="flex items-center gap-2 border px-3 py-2 text-xs">
                    <span className="min-w-0 flex-1 truncate">{file.name}</span>
                    <span className="text-muted-foreground shrink-0">{formatBytes(file.size)}</span>
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-6"
                        disabled={disabled}
                        aria-label={`Remove ${file.name}`}
                        onClick={clear}
                    >
                        <X />
                    </Button>
                </div>
            )}
        </div>
    );
}
