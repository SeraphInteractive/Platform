import { z } from "zod";
import { ClaActorKind, ClaEventType, ClaStatus, GuardianDecision, GuardianRelationship } from "./Enums.js";
import { timestampSchema, uuidSchema } from "./Http.js";
import { userSummarySchema } from "./Resources.js";
import { fieldRules, singleLineText, textLimits } from "./Validation.js";

export const defaultAgeOfMajority = 18;
export const minimumClaAge = 13;
export const guardianConsentDays = 14;

// TODO: figure this out
export const claCountries = [
    "AD",
    "AE",
    "AF",
    "AG",
    "AI",
    "AL",
    "AM",
    "AO",
    "AR",
    "AS",
    "AT",
    "AU",
    "AW",
    "AX",
    "AZ",
    "BA",
    "BB",
    "BD",
    "BE",
    "BF",
    "BG",
    "BH",
    "BI",
    "BJ",
    "BL",
    "BM",
    "BN",
    "BO",
    "BQ",
    "BR",
    "BS",
    "BT",
    "BW",
    "BY",
    "BZ",
    "CA",
    "CC",
    "CD",
    "CF",
    "CG",
    "CH",
    "CI",
    "CK",
    "CL",
    "CM",
    "CN",
    "CO",
    "CR",
    "CU",
    "CV",
    "CW",
    "CX",
    "CY",
    "CZ",
    "DE",
    "DJ",
    "DK",
    "DM",
    "DO",
    "DZ",
    "EC",
    "EE",
    "EG",
    "EH",
    "ER",
    "ES",
    "ET",
    "FI",
    "FJ",
    "FK",
    "FM",
    "FO",
    "FR",
    "GA",
    "GB",
    "GD",
    "GE",
    "GF",
    "GG",
    "GH",
    "GI",
    "GL",
    "GM",
    "GN",
    "GP",
    "GQ",
    "GR",
    "GT",
    "GU",
    "GW",
    "GY",
    "HK",
    "HN",
    "HR",
    "HT",
    "HU",
    "ID",
    "IE",
    "IL",
    "IM",
    "IN",
    "IQ",
    "IR",
    "IS",
    "IT",
    "JE",
    "JM",
    "JO",
    "JP",
    "KE",
    "KG",
    "KH",
    "KI",
    "KM",
    "KN",
    "KP",
    "KR",
    "KW",
    "KY",
    "KZ",
    "LA",
    "LB",
    "LC",
    "LI",
    "LK",
    "LR",
    "LS",
    "LT",
    "LU",
    "LV",
    "LY",
    "MA",
    "MC",
    "MD",
    "ME",
    "MF",
    "MG",
    "MH",
    "MK",
    "ML",
    "MM",
    "MN",
    "MO",
    "MP",
    "MQ",
    "MR",
    "MS",
    "MT",
    "MU",
    "MV",
    "MW",
    "MX",
    "MY",
    "MZ",
    "NA",
    "NC",
    "NE",
    "NF",
    "NG",
    "NI",
    "NL",
    "NO",
    "NP",
    "NR",
    "NU",
    "NZ",
    "OM",
    "PA",
    "PE",
    "PF",
    "PG",
    "PH",
    "PK",
    "PL",
    "PM",
    "PN",
    "PR",
    "PS",
    "PT",
    "PW",
    "PY",
    "QA",
    "RE",
    "RO",
    "RS",
    "RU",
    "RW",
    "SA",
    "SB",
    "SC",
    "SD",
    "SE",
    "SG",
    "SH",
    "SI",
    "SJ",
    "SK",
    "SL",
    "SM",
    "SN",
    "SO",
    "SR",
    "SS",
    "ST",
    "SV",
    "SX",
    "SY",
    "SZ",
    "TC",
    "TD",
    "TG",
    "TH",
    "TJ",
    "TK",
    "TL",
    "TM",
    "TN",
    "TO",
    "TR",
    "TT",
    "TV",
    "TW",
    "TZ",
    "UA",
    "UG",
    "US",
    "UY",
    "UZ",
    "VA",
    "VC",
    "VE",
    "VG",
    "VI",
    "VN",
    "VU",
    "WF",
    "WS",
    "XK",
    "YE",
    "YT",
    "ZA",
    "ZM",
    "ZW"
] as const;

export type ClaCountry = (typeof claCountries)[number];

export interface ClaRegion {
    readonly code: string;
    readonly name: string;
    readonly ageOfMajority: number;
}

export const countryAgesOfMajority: Readonly<Partial<Record<ClaCountry, number>>> = {
    AE: 21,
    BH: 21,
    CM: 21,
    DZ: 19,
    EG: 21,
    GA: 21,
    ID: 21,
    KR: 19,
    KW: 21,
    LS: 21,
    NI: 21,
    NZ: 20,
    PR: 21,
    SG: 21,
    SZ: 21,
    TH: 20,
    WS: 21
};

function regions(entries: readonly (readonly [string, string, number?])[]): readonly ClaRegion[] {
    return entries.map(([code, name, age]) => ({ code, name, ageOfMajority: age ?? defaultAgeOfMajority }));
}

export const countryRegions: Readonly<Partial<Record<ClaCountry, readonly ClaRegion[]>>> = {
    US: regions([
        ["AL", "Alabama", 19],
        ["AK", "Alaska"],
        ["AZ", "Arizona"],
        ["AR", "Arkansas"],
        ["CA", "California"],
        ["CO", "Colorado"],
        ["CT", "Connecticut"],
        ["DE", "Delaware"],
        ["DC", "District of Columbia"],
        ["FL", "Florida"],
        ["GA", "Georgia"],
        ["HI", "Hawaii"],
        ["ID", "Idaho"],
        ["IL", "Illinois"],
        ["IN", "Indiana"],
        ["IA", "Iowa"],
        ["KS", "Kansas"],
        ["KY", "Kentucky"],
        ["LA", "Louisiana"],
        ["ME", "Maine"],
        ["MD", "Maryland"],
        ["MA", "Massachusetts"],
        ["MI", "Michigan"],
        ["MN", "Minnesota"],
        ["MS", "Mississippi", 21],
        ["MO", "Missouri"],
        ["MT", "Montana"],
        ["NE", "Nebraska", 19],
        ["NV", "Nevada"],
        ["NH", "New Hampshire"],
        ["NJ", "New Jersey"],
        ["NM", "New Mexico"],
        ["NY", "New York"],
        ["NC", "North Carolina"],
        ["ND", "North Dakota"],
        ["OH", "Ohio"],
        ["OK", "Oklahoma"],
        ["OR", "Oregon"],
        ["PA", "Pennsylvania"],
        ["RI", "Rhode Island"],
        ["SC", "South Carolina"],
        ["SD", "South Dakota"],
        ["TN", "Tennessee"],
        ["TX", "Texas"],
        ["UT", "Utah"],
        ["VT", "Vermont"],
        ["VA", "Virginia"],
        ["WA", "Washington"],
        ["WV", "West Virginia"],
        ["WI", "Wisconsin"],
        ["WY", "Wyoming"]
    ]),
    CA: regions([
        ["AB", "Alberta"],
        ["BC", "British Columbia", 19],
        ["MB", "Manitoba"],
        ["NB", "New Brunswick", 19],
        ["NL", "Newfoundland and Labrador", 19],
        ["NS", "Nova Scotia", 19],
        ["NT", "Northwest Territories", 19],
        ["NU", "Nunavut", 19],
        ["ON", "Ontario"],
        ["PE", "Prince Edward Island"],
        ["QC", "Quebec"],
        ["SK", "Saskatchewan"],
        ["YT", "Yukon", 19]
    ]),
    GB: regions([
        ["ENG", "England"],
        ["NIR", "Northern Ireland"],
        ["SCT", "Scotland", 16],
        ["WLS", "Wales"]
    ])
};

export function regionsOf(country: string): readonly ClaRegion[] | null {
    return countryRegions[country as ClaCountry] ?? null;
}

export function isClaCountry(country: string): country is ClaCountry {
    return (claCountries as readonly string[]).includes(country);
}

export function ageOfMajorityFor(country: string, region: string | null): number | null {
    if (!isClaCountry(country)) {
        return null;
    }
    const known = regionsOf(country);
    if (known === null) {
        return region === null ? (countryAgesOfMajority[country] ?? defaultAgeOfMajority) : null;
    }
    return known.find((candidate) => candidate.code === region)?.ageOfMajority ?? null;
}

export function ageOn(dateOfBirth: string, today: Date): number | null {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(dateOfBirth);
    if (match === null) {
        return null;
    }
    const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
    const birth = new Date(Date.UTC(year, month - 1, day));
    if (birth.getUTCFullYear() !== year || birth.getUTCMonth() !== month - 1 || birth.getUTCDate() !== day) {
        return null;
    }
    const currentMonth = today.getUTCMonth() + 1;
    const hadBirthday = currentMonth > month || (currentMonth === month && today.getUTCDate() >= day);
    return today.getUTCFullYear() - year - (hadBirthday ? 0 : 1);
}

export const guardianRelationshipLabels: Readonly<Record<GuardianRelationship, string>> = {
    [GuardianRelationship.Parent]: "Parent",
    [GuardianRelationship.LegalGuardian]: "Legal guardian",
    [GuardianRelationship.Other]: "Other responsible adult"
};

const regionDisplayNames = new Intl.DisplayNames(["en"], { type: "region" });

export function countryName(code: string): string {
    try {
        return regionDisplayNames.of(code) ?? code;
    } catch {
        return code;
    }
}

export function regionName(country: string, region: string | null): string | null {
    if (region === null) {
        return null;
    }
    return regionsOf(country)?.find((candidate) => candidate.code === region)?.name ?? region;
}

const emailField = z.string().trim().min(1, "Email is required.").max(textLimits.email);
const phoneField = singleLineText(textLimits.phone, "Phone", false)
    .pipe(z.string().regex(/^[+0-9 ()-]*$/u, "Use digits, spaces, brackets, dashes and an optional leading +."))
    .nullable()
    .transform((value) => (value === null || value.length === 0 ? null : value));

export const guardianInputSchema = z
    .object({
        legalName: fieldRules.legalName,
        relationship: z.enum(GuardianRelationship),
        email: emailField,
        phone: phoneField.default(null)
    })
    .meta({ id: "GuardianInput" });

export const claSignInputSchema = z
    .object({
        revision: z.number().int().positive(),
        legalName: fieldRules.legalName,
        email: emailField,
        dateOfBirth: z.iso.date(),
        country: z.enum(claCountries),
        region: z.string().max(8).nullable().default(null),
        accepted: z.literal(true, "You must accept the agreement."),
        guardian: guardianInputSchema.nullable().default(null)
    })
    .meta({ id: "ClaSignInput" });

export const guardianDecisionInputSchema = z
    .object({
        decision: z.enum(GuardianDecision),
        legalName: fieldRules.legalName,
        accepted: z.boolean().default(false)
    })
    .refine((value) => value.decision !== GuardianDecision.Approve || value.accepted, {
        message: "You must accept the agreement to give consent.",
        path: ["accepted"]
    })
    .meta({ id: "GuardianDecisionInput" });

export const claRevokeInputSchema = z.object({ reason: fieldRules.reason.default(null) }).meta({ id: "ClaRevokeInput" });

export const claStaffRevokeInputSchema = z
    .object({ reason: singleLineText(textLimits.reason, "Reason") })
    .meta({ id: "ClaStaffRevokeInput" });

export const claPiiRequestSchema = z.object({ reason: singleLineText(textLimits.reason, "Reason") }).meta({ id: "ClaPiiRequest" });

export const claDocumentSummarySchema = z
    .object({
        revision: z.number().int().nonnegative(),
        title: z.string()
    })
    .meta({ id: "ClaDocumentSummary" });

export const claGuardianStateSchema = z
    .object({
        requestedAt: timestampSchema.nullable(),
        expiresAt: timestampSchema.nullable(),
        decidedAt: timestampSchema.nullable()
    })
    .meta({ id: "ClaGuardianState" });

export const claAgreementSchema = z
    .object({
        id: uuidSchema,
        status: z.enum(ClaStatus),
        revision: z.number().int().positive(),
        isMinor: z.boolean(),
        signedAt: timestampSchema,
        activatedAt: timestampSchema.nullable(),
        revokedAt: timestampSchema.nullable(),
        guardian: claGuardianStateSchema.nullable()
    })
    .meta({ id: "ClaAgreement" });

export const myClaSchema = z
    .object({
        document: claDocumentSummarySchema,
        current: claAgreementSchema.nullable()
    })
    .meta({ id: "MyCla" });

export const claDocumentSectionSchema = z.object({ id: z.string(), title: z.string(), html: z.string() });

export const claReceiptSchema = z
    .object({
        signatureId: uuidSchema,
        status: z.enum(ClaStatus),
        document: z.object({
            title: z.string(),
            revision: z.number().int().positive(),
            hash: z.string(),
            sections: z.array(claDocumentSectionSchema)
        }),
        contributor: z.object({
            legalName: z.string(),
            username: z.string(),
            email: z.string(),
            dateOfBirth: z.string(),
            country: z.string(),
            region: z.string().nullable(),
            signedAt: timestampSchema
        }),
        guardian: z
            .object({
                legalName: z.string(),
                relationship: z.enum(GuardianRelationship),
                email: z.string(),
                phone: z.string().nullable(),
                consentedAt: timestampSchema.nullable()
            })
            .nullable(),
        isMinor: z.boolean(),
        ageOfMajority: z.number().int(),
        activatedAt: timestampSchema.nullable(),
        issuedAt: timestampSchema
    })
    .meta({ id: "ClaReceipt" });

export const guardianReviewSchema = z
    .object({
        status: z.enum(ClaStatus),
        contributor: z.object({ legalName: z.string(), username: z.string() }),
        guardian: z.object({ legalName: z.string(), relationship: z.enum(GuardianRelationship) }),
        document: z.object({ title: z.string(), revision: z.number().int().positive(), sections: z.array(claDocumentSectionSchema) }),
        signedAt: timestampSchema,
        expiresAt: timestampSchema
    })
    .meta({ id: "GuardianReview" });

export const guardianDecisionResultSchema = z
    .object({
        status: z.enum(ClaStatus),
        receipt: claReceiptSchema.nullable()
    })
    .meta({ id: "GuardianDecisionResult" });

export const claSignatureSummarySchema = z
    .object({
        id: uuidSchema,
        user: userSummarySchema.nullable(),
        status: z.enum(ClaStatus),
        revision: z.number().int().positive(),
        country: z.string(),
        region: z.string().nullable(),
        isMinor: z.boolean(),
        ageOfMajority: z.number().int(),
        signedAt: timestampSchema,
        activatedAt: timestampSchema.nullable(),
        guardianRequestedAt: timestampSchema.nullable(),
        guardianExpiresAt: timestampSchema.nullable(),
        guardianDecidedAt: timestampSchema.nullable(),
        revokedAt: timestampSchema.nullable(),
        purgeAfter: timestampSchema.nullable(),
        piiPurgedAt: timestampSchema.nullable()
    })
    .meta({ id: "ClaSignatureSummary" });

export const claEventSchema = z
    .object({
        id: uuidSchema,
        sequence: z.number().int().positive(),
        type: z.enum(ClaEventType),
        actorKind: z.enum(ClaActorKind),
        actor: userSummarySchema.nullable(),
        details: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
        hash: z.string(),
        occurredAt: timestampSchema
    })
    .meta({ id: "ClaEvent" });

export const claAuditTrailSchema = z
    .object({
        events: z.array(claEventSchema),
        isIntact: z.boolean()
    })
    .meta({ id: "ClaAuditTrail" });

export const claPiiSchema = z
    .object({
        contributor: z.object({
            legalName: z.string(),
            email: z.string(),
            dateOfBirth: z.string(),
            ipAddress: z.string(),
            userAgent: z.string().nullable()
        }),
        guardian: z
            .object({
                legalName: z.string(),
                relationship: z.enum(GuardianRelationship),
                email: z.string(),
                phone: z.string().nullable()
            })
            .nullable(),
        guardianDecision: z
            .object({
                legalName: z.string(),
                ipAddress: z.string(),
                userAgent: z.string().nullable()
            })
            .nullable()
    })
    .meta({ id: "ClaPii" });

export const claAccessLogEntrySchema = z
    .object({
        id: uuidSchema,
        signatureId: uuidSchema,
        accessorKind: z.enum(ClaActorKind),
        accessor: userSummarySchema.nullable(),
        purpose: z.string(),
        fields: z.array(z.string()),
        accessedAt: timestampSchema
    })
    .meta({ id: "ClaAccessLogEntry" });

export type GuardianInputDto = z.input<typeof guardianInputSchema>;
export type ClaSignInputDto = z.input<typeof claSignInputSchema>;
export type GuardianDecisionInputDto = z.input<typeof guardianDecisionInputSchema>;
export type ClaAgreementDto = z.infer<typeof claAgreementSchema>;
export type MyClaDto = z.infer<typeof myClaSchema>;
export type ClaReceiptDto = z.infer<typeof claReceiptSchema>;
export type GuardianReviewDto = z.infer<typeof guardianReviewSchema>;
export type GuardianDecisionResultDto = z.infer<typeof guardianDecisionResultSchema>;
export type ClaSignatureSummaryDto = z.infer<typeof claSignatureSummarySchema>;
export type ClaEventDto = z.infer<typeof claEventSchema>;
export type ClaAuditTrailDto = z.infer<typeof claAuditTrailSchema>;
export type ClaPiiDto = z.infer<typeof claPiiSchema>;
export type ClaAccessLogEntryDto = z.infer<typeof claAccessLogEntrySchema>;
