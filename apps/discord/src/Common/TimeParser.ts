import { UserFacingError } from "../Commands/Command.js";

const relativePattern = /(\d+)\s*([smhdw])/giu;
const absolutePattern = /^(\d{4})-(\d{2})-(\d{2})\s+(\d{1,2}):(\d{2})$/u;

const unitMs: Record<string, number> = {
    s: 1_000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
    w: 604_800_000
};

const minMs = 60_000; // 1 minute
const maxMs = 90 * 86_400_000; // 90 days

export function parseReminderTime(input: string): Date {
    const trimmed = input.trim();

    // try absolute first
    const abs = absolutePattern.exec(trimmed);
    if (abs !== null) {
        const [, year, month, day, hour, minute] = abs;
        const date = new Date(`${year}-${month}-${day}T${hour!.padStart(2, "0")}:${minute}:00Z`);
        if (Number.isNaN(date.getTime())) {
            throw new UserFacingError("Couldn't parse that date. Use `YYYY-MM-DD HH:MM` (UTC).");
        }
        const delta = date.getTime() - Date.now();
        if (delta < minMs) {
            throw new UserFacingError("That time is in the past or too soon. Must be at least 1 minute from now.");
        }
        if (delta > maxMs) {
            throw new UserFacingError("Reminders can be at most 90 days out.");
        }
        return date;
    }

    // relative: match all duration fragments
    let totalMs = 0;
    let matched = false;
    for (const match of trimmed.matchAll(relativePattern)) {
        const value = parseInt(match[1]!, 10);
        const unit = match[2]!.toLowerCase();
        totalMs += value * (unitMs[unit] ?? 0);
        matched = true;
    }

    if (!matched) {
        throw new UserFacingError("Couldn't parse the time. Use relative (`30m`, `2h`, `1d12h`) or absolute (`2024-10-15 14:00`).");
    }
    if (totalMs < minMs) {
        throw new UserFacingError("Reminder must be at least 1 minute from now.");
    }
    if (totalMs > maxMs) {
        throw new UserFacingError("Reminders can be at most 90 days out.");
    }

    return new Date(Date.now() + totalMs);
}
