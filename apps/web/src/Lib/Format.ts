import { DifficultyTier, EntryStatus, PollType, RoundStatus, ShotStatus, SubmissionStatus, type Specialty } from "@platform/contracts";

const timeFormat = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" });
const dayFormat = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" });
const dateFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });
const dayNames: Readonly<Record<number, string>> = { [-1]: "Yesterday", 0: "Today", 1: "Tomorrow" };

function calendarDayOffset(date: Date, now: Date): number {
    const start = (value: Date): number => new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
    return Math.round((start(date) - start(now)) / (24 * 3600 * 1000));
}

const relativeFormat = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

const relativeUnits: readonly [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 365 * 24 * 3600],
    ["month", 30 * 24 * 3600],
    ["week", 7 * 24 * 3600],
    ["day", 24 * 3600],
    ["hour", 3600],
    ["minute", 60],
    ["second", 1]
];

export function formatDate(value: string | null): string {
    return value === null ? "Not set" : dateFormat.format(new Date(value));
}

export function formatDateTime(value: string | null, now: Date = new Date()): string {
    if (value === null) {
        return "Not set";
    }
    const date = new Date(value);
    const time = timeFormat.format(date);
    const named = dayNames[calendarDayOffset(date, now)];
    if (named !== undefined) {
        return `${named}, ${time}`;
    }
    return `${date.getFullYear() === now.getFullYear() ? dayFormat.format(date) : dateFormat.format(date)}, ${time}`;
}

export function formatRelative(value: string, now: number = Date.now()): string {
    const seconds = Math.round((new Date(value).getTime() - now) / 1000);
    for (const [unit, size] of relativeUnits) {
        if (Math.abs(seconds) >= size || unit === "second") {
            return relativeFormat.format(Math.round(seconds / size), unit);
        }
    }
    return relativeFormat.format(0, "second");
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
    return `${count.toLocaleString("en-US")} ${count === 1 ? singular : plural}`;
}

export function formatPercent(value: number, digits = 1): string {
    return `${value.toFixed(digits)}%`;
}

export function formatNumber(value: number, digits = 2): string {
    return Number.isInteger(value) ? value.toLocaleString("en-US") : value.toFixed(digits);
}

export function formatBytes(bytes: number): string {
    const units = ["B", "KB", "MB", "GB"];
    let size = bytes;
    let index = 0;
    while (size >= 1024 && index < units.length - 1) {
        size /= 1024;
        index++;
    }
    return `${size.toFixed(index === 0 ? 0 : 1)} ${units[index] ?? "B"}`;
}

export function toLocalInputValue(value: string | null): string {
    if (value === null) {
        return "";
    }
    const date = new Date(value);
    const offsetMs = date.getTimezoneOffset() * 60_000;
    return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

export function fromLocalInputValue(value: string): string | null {
    if (value.trim().length === 0) {
        return null;
    }
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export const pollTypeLabels: Readonly<Record<PollType, string>> = {
    [PollType.RankedChoice]: "Ranked choice",
    [PollType.Binary]: "Binary"
};

export const roundStatusLabels: Readonly<Record<RoundStatus, string>> = {
    [RoundStatus.Draft]: "Draft",
    [RoundStatus.Open]: "Open",
    [RoundStatus.Closed]: "Closed",
    [RoundStatus.Finalized]: "Finalized"
};

export const entryStatusLabels: Readonly<Record<EntryStatus, string>> = {
    [EntryStatus.PendingReview]: "Pending review",
    [EntryStatus.Approved]: "Approved",
    [EntryStatus.Rejected]: "Rejected",
    [EntryStatus.Flagged]: "Flagged"
};

export const shotStatusLabels: Readonly<Record<ShotStatus, string>> = {
    [ShotStatus.Available]: "Available",
    [ShotStatus.Claimed]: "Claimed",
    [ShotStatus.Submitted]: "Submitted",
    [ShotStatus.Approved]: "Approved"
};

export const submissionStatusLabels: Readonly<Record<SubmissionStatus, string>> = {
    [SubmissionStatus.PendingReview]: "Pending review",
    [SubmissionStatus.RevisionRequested]: "Revision requested",
    [SubmissionStatus.Approved]: "Approved"
};

export const difficultyLabels: Readonly<Record<DifficultyTier, string>> = {
    [DifficultyTier.Easy]: "Easy",
    [DifficultyTier.Medium]: "Medium",
    [DifficultyTier.Hard]: "Hard",
    [DifficultyTier.Complex]: "Complex"
};

export function specialtyLabel(specialty: Specialty): string {
    const words = specialty.split("_").map((word) => (word === "3d" ? "3D" : `${word.charAt(0).toUpperCase()}${word.slice(1)}`));
    return words.join(" ");
}
