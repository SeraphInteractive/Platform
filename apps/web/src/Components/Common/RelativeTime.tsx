"use client";

import type { ReactNode } from "react";
import { useNow } from "@/Hooks/UseNow";
import { formatDateTime, formatRelative } from "@/Lib/Format";

export function RelativeTime({ value, prefix }: { readonly value: string; readonly prefix?: string }): ReactNode {
    const now = useNow();
    return (
        <time dateTime={value} title={formatDateTime(value)}>
            {prefix === undefined ? "" : `${prefix} `}
            {formatRelative(value, now)}
        </time>
    );
}
