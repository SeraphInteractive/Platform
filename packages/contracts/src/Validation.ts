import { z } from "zod";

export const textLimits = {
    entryTitle: 80,
    entryDescription: 1000,
    roundTitle: 80,
    shotCode: 16,
    shotTitle: 80,
    shotDescription: 5000,
    workNotes: 2000,
    reviewNotes: 2000,
    reason: 300,
    documentTitle: 60,
    sectionTitle: 60,
    documentNote: 200,
    username: 64,
    email: 254
} as const;

const invisibleRanges: readonly (readonly [number, number])[] = [
    [0x00ad, 0x00ad],
    [0x180e, 0x180e],
    [0x200b, 0x200f],
    [0x202a, 0x202e],
    [0x2060, 0x2064],
    [0x2066, 0x206f],
    [0xfeff, 0xfeff]
];

function isStripped(codePoint: number, keep: ReadonlySet<number>): boolean {
    if (keep.has(codePoint)) {
        return false;
    }
    if (codePoint < 0x20 || (codePoint >= 0x7f && codePoint <= 0x9f)) {
        return true;
    }
    return invisibleRanges.some(([start, end]) => codePoint >= start && codePoint <= end);
}

function strip(value: string, keep: ReadonlySet<number>): string {
    let result = "";
    for (const character of value) {
        if (!isStripped(character.codePointAt(0) ?? 0, keep)) {
            result += character;
        }
    }
    return result;
}

const lineBreaks: ReadonlySet<number> = new Set([0x0a]);
const nothing: ReadonlySet<number> = new Set();

export function cleanSingleLine(value: string): string {
    return strip(value.normalize("NFC").replace(/[\r\n\t]+/gu, " "), nothing)
        .replace(/\s{2,}/gu, " ")
        .trim();
}

export function cleanMultiLine(value: string): string {
    return strip(value.normalize("NFC").replace(/\r\n?/gu, "\n").replace(/\t/gu, " "), lineBreaks)
        .replace(/[ ]+$/gmu, "")
        .replace(/\n{3,}/gu, "\n\n")
        .trim();
}

function limited(clean: (value: string) => string, maximum: number, label: string, required: boolean): z.ZodType<string, string> {
    return z
        .string()
        .max(maximum * 4, `${label} is too long.`)
        .transform(clean)
        .pipe(
            z
                .string()
                .min(required ? 1 : 0, `${label} is required.`)
                .max(maximum, `${label} must be ${maximum} characters or fewer.`)
        );
}

export function singleLineText(maximum: number, label = "This field", required = true): z.ZodType<string, string> {
    return limited(cleanSingleLine, maximum, label, required);
}

export function multiLineText(maximum: number, label = "This field", required = true): z.ZodType<string, string> {
    return limited(cleanMultiLine, maximum, label, required);
}

export function optionalMultiLineText(maximum: number, label = "This field"): z.ZodType<string | null, string | null> {
    return multiLineText(maximum, label, false)
        .nullable()
        .transform((value) => (value === null || value.length === 0 ? null : value));
}

export const shotCodeSchema = singleLineText(textLimits.shotCode, "Shot code").pipe(
    z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/u, "Shot code can only use letters, numbers, dots, dashes and underscores.")
);

export const fieldRules = {
    entryTitle: singleLineText(textLimits.entryTitle, "Title"),
    entryDescription: optionalMultiLineText(textLimits.entryDescription, "Description"),
    roundTitle: singleLineText(textLimits.roundTitle, "Title"),
    shotCode: shotCodeSchema,
    shotTitle: singleLineText(textLimits.shotTitle, "Title"),
    shotDescription: optionalMultiLineText(textLimits.shotDescription, "Brief"),
    workNotes: optionalMultiLineText(textLimits.workNotes, "Notes"),
    reviewNotes: optionalMultiLineText(textLimits.reviewNotes, "Feedback"),
    reason: optionalMultiLineText(textLimits.reason, "Reason"),
    documentTitle: singleLineText(textLimits.documentTitle, "Title"),
    sectionTitle: singleLineText(textLimits.sectionTitle, "Section title"),
    documentNote: optionalMultiLineText(textLimits.documentNote, "Note"),
    username: singleLineText(textLimits.username, "Username")
} as const;

export function problemOf(schema: z.ZodType, value: unknown): string | null {
    const result = schema.safeParse(value);
    return result.success ? null : (result.error.issues[0]?.message ?? "This value isn't valid.");
}
