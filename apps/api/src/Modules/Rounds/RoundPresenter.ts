import { roundDetailSchema, roundSchema, type RoundDto } from "@platform/contracts";
import { toIso } from "../../Common/Http/Schemas.js";
import { RoundStatus } from "../../Domain/Enums.js";
import type { VotingRoundRecord } from "../../Infrastructure/Database/Schema.js";

export { roundDetailSchema, roundSchema };

export function isAcceptingVotes(round: Pick<VotingRoundRecord, "status" | "opensAt" | "closesAt">, now: Date = new Date()): boolean {
    return (
        round.status === RoundStatus.Voting &&
        (round.opensAt === null || round.opensAt.getTime() <= now.getTime()) &&
        (round.closesAt === null || round.closesAt.getTime() > now.getTime())
    );
}

export function toRoundResponse(round: VotingRoundRecord): RoundDto {
    return {
        id: round.id,
        title: round.title,
        status: round.status,
        pollType: round.pollType,
        opensAt: toIso(round.opensAt),
        closesAt: toIso(round.closesAt),
        isAcceptingVotes: isAcceptingVotes(round),
        createdBy: round.createdBy,
        createdAt: toIso(round.createdAt),
        updatedAt: toIso(round.updatedAt)
    };
}
