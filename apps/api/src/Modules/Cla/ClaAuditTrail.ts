import type { ClaActorKind, ClaEventType } from "@platform/contracts";
import { desc, eq } from "drizzle-orm";
import { hmacHex } from "../../Common/Security/Secrets.js";
import type { DatabaseExecutor } from "../../Infrastructure/Database/Database.js";
import { claEvents, type ClaEventDetails, type ClaEventRecord } from "../../Infrastructure/Database/Schema.js";

export interface ClaEventInput {
    readonly type: ClaEventType;
    readonly actorKind: ClaActorKind;
    readonly actorUserId: string | null;
    readonly details?: ClaEventDetails;
}

type HashedFields = Pick<
    ClaEventRecord,
    "signatureId" | "sequence" | "type" | "actorKind" | "actorUserId" | "details" | "previousHash" | "occurredAt"
>;

export function canonicalJson(value: unknown): string {
    if (Array.isArray(value)) {
        return `[${value.map(canonicalJson).join(",")}]`;
    }
    if (value !== null && typeof value === "object") {
        const entries = Object.entries(value as Record<string, unknown>)
            .filter(([, item]) => item !== undefined)
            .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
        return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
    }
    return JSON.stringify(value);
}

export class ClaAuditTrail {
    public constructor(private readonly key: string) {}

    public async append(executor: DatabaseExecutor, signatureId: string, input: ClaEventInput): Promise<ClaEventRecord> {
        const [last] = await executor
            .select({ sequence: claEvents.sequence, hash: claEvents.hash })
            .from(claEvents)
            .where(eq(claEvents.signatureId, signatureId))
            .orderBy(desc(claEvents.sequence))
            .limit(1);
        const fields: HashedFields = {
            signatureId,
            sequence: (last?.sequence ?? 0) + 1,
            type: input.type,
            actorKind: input.actorKind,
            actorUserId: input.actorUserId,
            details: input.details ?? {},
            previousHash: last?.hash ?? null,
            occurredAt: new Date()
        };
        const [saved] = await executor
            .insert(claEvents)
            .values({ ...fields, hash: this.hashOf(fields) })
            .returning();
        if (saved === undefined) {
            throw new Error("Audit event insert returned no row.");
        }
        return saved;
    }

    public isIntact(events: readonly ClaEventRecord[]): boolean {
        let previousHash: string | null = null;
        for (const [index, event] of events.entries()) {
            if (event.sequence !== index + 1 || event.previousHash !== previousHash || event.hash !== this.hashOf(event)) {
                return false;
            }
            previousHash = event.hash;
        }
        return true;
    }

    private hashOf(fields: HashedFields): string {
        return hmacHex(
            this.key,
            canonicalJson({
                signatureId: fields.signatureId,
                sequence: fields.sequence,
                type: fields.type,
                actorKind: fields.actorKind,
                actorUserId: fields.actorUserId,
                details: fields.details,
                previousHash: fields.previousHash,
                occurredAt: fields.occurredAt.toISOString()
            })
        );
    }
}
