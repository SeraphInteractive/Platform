import {
    ballotSchema,
    PresenceStatus,
    shotThreadMapSchema,
    dataEnvelope,
    documentRevisionSchema,
    documentRevisionSummarySchema,
    documentSchema,
    legalAcceptanceSchema,
    emailVerificationSchema,
    entrySchema,
    leaderboardSchema,
    ledgerBallotSchema,
    moderatedUserSchema,
    pageEnvelope,
    pipelineProgressSchema,
    presignedUploadSchema,
    raidTelemetrySchema,
    reclaimResultSchema,
    reviewQueueItemSchema,
    roundDetailSchema,
    roundResultSchema,
    roundSchema,
    shotDetailSchema,
    shotSchema,
    submissionSchema,
    userSchema,
    type BallotDto,
    type DeliverableKind,
    type DifficultyTier,
    type DocumentDto,
    type DocumentRevisionDto,
    type DocumentRevisionSummaryDto,
    type DocumentSlug,
    type DocumentUpdateDto,
    type EmailVerificationDto,
    type EntryDto,
    type EntryStatus,
    type LeaderboardDto,
    type LedgerBallotDto,
    type MediaContentType,
    type ModeratedUserDto,
    type PaginationMeta,
    type PipelineProgressDto,
    type PollType,
    type PresignedUploadDto,
    type RaidTelemetryDto,
    type ReclaimResultDto,
    type ReviewDecision,
    type ReviewQueueItemDto,
    type Role,
    type RoundDetailDto,
    type RoundDto,
    type RoundResultDto,
    type RoundStatus,
    type ShotDetailDto,
    type ShotDto,
    type ShotStatus,
    type Specialty,
    type SubmissionDto,
    type ShotThreadMapDto,
    type UserDto
} from "@platform/contracts";
import { z } from "zod";
import { request, requestNoContent } from "./ApiClient";

export interface Page<T> {
    readonly data: T[];
    readonly meta: PaginationMeta;
}

export interface PageQuery {
    readonly page?: number;
    readonly perPage?: number;
}

export interface CreateRoundInput {
    readonly title: string;
    readonly pollType: PollType;
    readonly opensAt: string | null;
    readonly closesAt: string | null;
}

export interface UpdateRoundInput {
    readonly title?: string;
    readonly pollType?: PollType;
    readonly status?: RoundStatus;
    readonly opensAt?: string | null;
    readonly closesAt?: string | null;
}

export interface EntryInput {
    readonly title: string;
    readonly description: string | null;
    readonly mediaKey: string | null;
}

export interface UpdateEntryInput {
    readonly title?: string;
    readonly description?: string | null;
    readonly mediaKey?: string | null;
}

export type UpdateShotInput = Partial<Omit<CreateShotInput, "seniorPriorityHours">>;

export interface CreateShotInput {
    readonly roundId: string | null;
    readonly sceneNumber: number;
    readonly shotCode: string;
    readonly title: string;
    readonly description: string | null;
    readonly difficultyTier: DifficultyTier;
    readonly seniorPriorityHours: number;
    readonly imageKeys?: readonly string[];
}

export interface ShotQuery extends PageQuery {
    readonly status?: ShotStatus;
    readonly difficultyTier?: DifficultyTier;
    readonly sceneNumber?: number;
}

export interface SubmitWorkInput {
    readonly videoKey: string;
    readonly blendKey: string | null;
    readonly notes: string | null;
}

export interface DeliverableUploadInput {
    readonly kind: DeliverableKind;
    readonly fileName: string;
    readonly contentType: string;
    readonly sizeBytes: number;
}

export type PipelineUpdateInput = Omit<PipelineProgressDto, "updatedAt">;

function segment(value: string): string {
    return encodeURIComponent(value);
}

export class PlatformApi {
    public async pipeline(): Promise<PipelineProgressDto> {
        return (await request("/pipeline", dataEnvelope(pipelineProgressSchema))).data;
    }

    public async updatePipeline(input: PipelineUpdateInput): Promise<PipelineProgressDto> {
        return (await request("/pipeline/progress", dataEnvelope(pipelineProgressSchema), { method: "POST", body: input })).data;
    }

    public async rounds(query: PageQuery & { readonly status?: RoundStatus }): Promise<Page<RoundDto>> {
        return request("/rounds", pageEnvelope(roundSchema), { query: { ...query } });
    }

    public async round(roundId: string): Promise<RoundDetailDto> {
        return (await request(`/rounds/${segment(roundId)}`, dataEnvelope(roundDetailSchema))).data;
    }

    public async createRound(input: CreateRoundInput): Promise<RoundDto> {
        return (await request("/rounds", dataEnvelope(roundSchema), { method: "POST", body: input })).data;
    }

    public async updateRound(roundId: string, input: UpdateRoundInput): Promise<RoundDto> {
        return (await request(`/rounds/${segment(roundId)}`, dataEnvelope(roundSchema), { method: "PATCH", body: input })).data;
    }

    public async deleteRound(roundId: string): Promise<void> {
        await requestNoContent(`/rounds/${segment(roundId)}`, { method: "DELETE" });
    }

    public async finalizeRound(roundId: string): Promise<RoundResultDto> {
        return (await request(`/rounds/${segment(roundId)}/finalize`, dataEnvelope(roundResultSchema), { method: "POST" })).data;
    }

    public async leaderboard(roundId: string): Promise<LeaderboardDto> {
        return (await request(`/rounds/${segment(roundId)}/leaderboard`, dataEnvelope(leaderboardSchema))).data;
    }

    public async results(roundId: string): Promise<RoundResultDto> {
        return (await request(`/rounds/${segment(roundId)}/results`, dataEnvelope(roundResultSchema))).data;
    }

    public async entries(roundId: string, query: PageQuery & { readonly status?: EntryStatus }): Promise<Page<EntryDto>> {
        return request(`/rounds/${segment(roundId)}/entries`, pageEnvelope(entrySchema), { query: { ...query } });
    }

    public async createEntry(roundId: string, input: EntryInput): Promise<EntryDto> {
        return (await request(`/rounds/${segment(roundId)}/entries`, dataEnvelope(entrySchema), { method: "POST", body: input })).data;
    }

    public async entry(roundId: string, entryId: string): Promise<EntryDto> {
        return (await request(`/rounds/${segment(roundId)}/entries/${segment(entryId)}`, dataEnvelope(entrySchema))).data;
    }

    public async updateEntry(roundId: string, entryId: string, input: UpdateEntryInput): Promise<EntryDto> {
        const path = `/rounds/${segment(roundId)}/entries/${segment(entryId)}`;
        return (await request(path, dataEnvelope(entrySchema), { method: "PATCH", body: input })).data;
    }

    public async reviewEntry(roundId: string, entryId: string, status: EntryStatus): Promise<EntryDto> {
        const path = `/rounds/${segment(roundId)}/entries/${segment(entryId)}/status`;
        return (await request(path, dataEnvelope(entrySchema), { method: "PATCH", body: { status } })).data;
    }

    public async reinstateEntry(roundId: string, entryId: string): Promise<EntryDto> {
        const path = `/rounds/${segment(roundId)}/entries/${segment(entryId)}/reinstate`;
        return (await request(path, dataEnvelope(entrySchema), { method: "POST" })).data;
    }

    public async deleteEntry(roundId: string, entryId: string): Promise<void> {
        await requestNoContent(`/rounds/${segment(roundId)}/entries/${segment(entryId)}`, { method: "DELETE" });
    }

    public async myBallot(roundId: string): Promise<BallotDto> {
        return (await request(`/rounds/${segment(roundId)}/ballots/me`, dataEnvelope(ballotSchema))).data;
    }

    public async myEntries(): Promise<readonly EntryDto[]> {
        return (await request("/users/me/entries", dataEnvelope(z.array(entrySchema)))).data;
    }

    public async castBallot(roundId: string, picks: readonly string[]): Promise<BallotDto> {
        return (await request(`/rounds/${segment(roundId)}/ballots/me`, dataEnvelope(ballotSchema), { method: "PUT", body: { picks } }))
            .data;
    }

    public async ledger(roundId: string, query: PageQuery): Promise<Page<LedgerBallotDto>> {
        return request(`/rounds/${segment(roundId)}/ballots`, pageEnvelope(ledgerBallotSchema), { query: { ...query } });
    }

    public async requestMediaUpload(contentType: MediaContentType, sizeBytes: number): Promise<PresignedUploadDto> {
        return (await request("/uploads/media", dataEnvelope(presignedUploadSchema), { method: "POST", body: { contentType, sizeBytes } }))
            .data;
    }

    public async shots(query: ShotQuery): Promise<Page<ShotDto>> {
        return request("/shots", pageEnvelope(shotSchema), { query: { ...query } });
    }

    public async shot(shotId: string): Promise<ShotDetailDto> {
        return (await request(`/shots/${segment(shotId)}`, dataEnvelope(shotDetailSchema))).data;
    }

    public async createShot(input: CreateShotInput): Promise<ShotDto> {
        return (await request("/shots", dataEnvelope(shotSchema), { method: "POST", body: input })).data;
    }

    public async updateShot(shotId: string, input: UpdateShotInput): Promise<ShotDto> {
        return (await request(`/shots/${segment(shotId)}`, dataEnvelope(shotSchema), { method: "PATCH", body: input })).data;
    }

    public async deleteShot(shotId: string): Promise<void> {
        await requestNoContent(`/shots/${segment(shotId)}`, { method: "DELETE" });
    }

    public async claimShot(shotId: string): Promise<ShotDto> {
        return (await request(`/shots/${segment(shotId)}/claim`, dataEnvelope(shotSchema), { method: "POST" })).data;
    }

    public async releaseShot(shotId: string, reason: string | null): Promise<ShotDto> {
        return (await request(`/shots/${segment(shotId)}/release`, dataEnvelope(shotSchema), { method: "POST", body: { reason } })).data;
    }

    public async requestDeliverableUpload(shotId: string, input: DeliverableUploadInput): Promise<PresignedUploadDto> {
        return (await request(`/shots/${segment(shotId)}/uploads`, dataEnvelope(presignedUploadSchema), { method: "POST", body: input }))
            .data;
    }

    public async submitWork(shotId: string, input: SubmitWorkInput): Promise<SubmissionDto> {
        return (await request(`/shots/${segment(shotId)}/submissions`, dataEnvelope(submissionSchema), { method: "POST", body: input }))
            .data;
    }

    public async reclaimExpired(): Promise<ReclaimResultDto> {
        return (await request("/shots/reclaim-expired", dataEnvelope(reclaimResultSchema), { method: "POST" })).data;
    }

    public async reviewQueue(query: PageQuery): Promise<Page<ReviewQueueItemDto>> {
        return request("/reviews", pageEnvelope(reviewQueueItemSchema), { query: { ...query } });
    }

    public async reviewSubmission(submissionId: string, decision: ReviewDecision, notes: string | null): Promise<SubmissionDto> {
        const path = `/submissions/${segment(submissionId)}/review`;
        return (await request(path, dataEnvelope(submissionSchema), { method: "POST", body: { decision, notes } })).data;
    }

    public async users(query: PageQuery & { readonly role?: Role }): Promise<Page<ModeratedUserDto>> {
        return request("/users", pageEnvelope(moderatedUserSchema), { query: { ...query } });
    }

    public async setRole(userId: string, role: Role, specialties?: readonly Specialty[]): Promise<UserDto> {
        return (await request(`/users/${segment(userId)}/role`, dataEnvelope(userSchema), { method: "PATCH", body: { role, specialties } }))
            .data;
    }

    public async document(slug: DocumentSlug): Promise<DocumentDto> {
        return (await request(`/documents/${segment(slug)}`, dataEnvelope(documentSchema))).data;
    }

    public async publishDocument(slug: DocumentSlug, update: DocumentUpdateDto): Promise<DocumentDto> {
        return (await request(`/documents/${segment(slug)}`, dataEnvelope(documentSchema), { method: "PUT", body: update })).data;
    }

    public async documentRevisions(slug: DocumentSlug): Promise<DocumentRevisionSummaryDto[]> {
        return (await request(`/documents/${segment(slug)}/revisions`, dataEnvelope(z.array(documentRevisionSummarySchema)))).data;
    }

    public async documentRevision(slug: DocumentSlug, revision: number): Promise<DocumentRevisionDto> {
        return (await request(`/documents/${segment(slug)}/revisions/${revision}`, dataEnvelope(documentRevisionSchema))).data;
    }

    public async legalAcceptance(): Promise<string> {
        return (await request("/legal/acceptance", dataEnvelope(legalAcceptanceSchema))).data.version;
    }

    public async acceptTerms(version: string): Promise<UserDto> {
        return (await request("/users/me/terms", dataEnvelope(userSchema), { method: "PUT", body: { version } })).data;
    }

    public async startEmailVerification(email: string, captchaToken: string): Promise<EmailVerificationDto> {
        return (
            await request("/verification/email", dataEnvelope(emailVerificationSchema), { method: "POST", body: { email, captchaToken } })
        ).data;
    }

    public async confirmEmailVerification(code: string): Promise<UserDto> {
        return (await request("/verification/email/confirm", dataEnvelope(userSchema), { method: "POST", body: { code } })).data;
    }

    public async chooseSpecialties(specialties: readonly Specialty[]): Promise<UserDto> {
        return (await request("/users/me/specialties", dataEnvelope(userSchema), { method: "PUT", body: { specialties } })).data;
    }

    public async setRoleByDiscord(
        discordId: string,
        input: { readonly role: Role; readonly specialties?: readonly Specialty[]; readonly discordUsername?: string }
    ): Promise<UserDto> {
        return (
            await request(`/users/by-discord/${segment(discordId)}/role`, dataEnvelope(userSchema), {
                method: "PUT",
                body: input
            })
        ).data;
    }
    public async promote(userId: string): Promise<UserDto> {
        return (await request(`/users/${segment(userId)}/promote`, dataEnvelope(userSchema), { method: "POST" })).data;
    }

    public async blacklist(userId: string, reason: string | null): Promise<ModeratedUserDto> {
        return (
            await request(`/users/${segment(userId)}/blacklist`, dataEnvelope(moderatedUserSchema), { method: "PUT", body: { reason } })
        ).data;
    }

    public async liftBlacklist(userId: string): Promise<ModeratedUserDto> {
        return (await request(`/users/${segment(userId)}/blacklist`, dataEnvelope(moderatedUserSchema), { method: "DELETE" })).data;
    }

    public async entryTelemetry(roundId: string, entryId: string, limit = 100): Promise<RaidTelemetryDto[]> {
        const path = `/rounds/${segment(roundId)}/entries/${segment(entryId)}/telemetry`;
        return (await request(path, dataEnvelope(z.array(raidTelemetrySchema)), { query: { limit } })).data;
    }

    public async presence(discordIds: readonly string[]): Promise<Record<string, PresenceStatus>> {
        const query = { ids: discordIds.slice(0, 20).join(",") };
        return (await request("/users/presence", dataEnvelope(z.record(z.string(), z.enum(PresenceStatus))), { query })).data;
    }

    public async threadMaps(): Promise<ShotThreadMapDto[]> {
        return (await request("/shot-thread-maps", dataEnvelope(z.array(shotThreadMapSchema)))).data;
    }

    public async unbindThread(shotId: string): Promise<void> {
        await requestNoContent(`/shot-thread-maps/${segment(shotId)}`, { method: "DELETE" });
    }

    public async telemetry(roundId: string): Promise<RaidTelemetryDto[]> {
        return (await request(`/rounds/${segment(roundId)}/telemetry`, dataEnvelope(z.array(raidTelemetrySchema)))).data;
    }
}

export const platformApi = new PlatformApi();
