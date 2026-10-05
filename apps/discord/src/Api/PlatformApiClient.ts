import {
    actingUserHeader,
    ballotSchema,
    dataEnvelope,
    entrySchema,
    leaderboardSchema,
    moderatedUserSchema,
    pageEnvelope,
    presignedUploadSchema,
    problemSchema,
    raidTelemetrySchema,
    reclaimResultSchema,
    reviewQueueItemSchema,
    roundDetailSchema,
    roundResultSchema,
    roundSchema,
    shotDetailSchema,
    shotSchema,
    shotThreadMapSchema,
    submissionSchema,
    userSchema,
    type DeliverableKind,
    type DifficultyTier,
    type EntryDto,
    type LeaderboardDto,
    type ModeratedUserDto,
    type PaginationMeta,
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
    type ShotThreadMapDto,
    type Specialty,
    type SubmissionDto,
    type UserDto
} from "@platform/contracts";
import type { Logger } from "pino";
import { z } from "zod";

export interface DiscordIdentity {
    readonly id: string;
    readonly username: string;
    readonly avatar: string | null;
}

export interface Page<T> {
    readonly data: readonly T[];
    readonly meta: PaginationMeta;
}

export class PlatformApiError extends Error {
    public constructor(
        public readonly status: number,
        public readonly code: string,
        message: string
    ) {
        super(message);
        this.name = "PlatformApiError";
    }
}

interface RequestOptions {
    readonly method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
    readonly body?: unknown;
    readonly query?: Readonly<Record<string, string | number | undefined>>;
    readonly actingUser?: string;
}

const requestTimeoutMs = 10_000;
const profileSyncTtlMs = 10 * 60 * 1000;
const emptySchema = z.unknown();

export class PlatformApiClient {
    private readonly syncedProfiles = new Map<string, number>();

    public constructor(
        private readonly baseUrl: string,
        private readonly serviceToken: string,
        private readonly logger: Logger
    ) {}

    public as(identity: DiscordIdentity): ActingApiClient {
        return new ActingApiClient(this, identity);
    }

    public async ensureProfile(identity: DiscordIdentity): Promise<void> {
        const syncedAt = this.syncedProfiles.get(identity.id);
        if (syncedAt !== undefined && Date.now() - syncedAt < profileSyncTtlMs) {
            return;
        }
        await this.send(`/users/by-discord/${identity.id}/profile`, dataEnvelope(userSchema), {
            method: "PUT",
            body: {
                username: identity.username.slice(0, 64),
                avatar: identity.avatar !== null && /^(?:a_)?[a-f0-9]{32}$/u.test(identity.avatar) ? identity.avatar : null
            }
        });
        this.syncedProfiles.set(identity.id, Date.now());
    }

    public async getUserByDiscordId(discordId: string): Promise<ModeratedUserDto | null> {
        try {
            return (await this.send(`/users/by-discord/${discordId}`, dataEnvelope(moderatedUserSchema))).data;
        } catch (error: unknown) {
            if (error instanceof PlatformApiError && error.status === 404) {
                return null;
            }
            throw error;
        }
    }

    public async listThreadMaps(): Promise<readonly ShotThreadMapDto[]> {
        return (await this.send("/shot-thread-maps", dataEnvelope(z.array(shotThreadMapSchema)))).data;
    }

    public async getThreadMapByThread(discordThreadId: string): Promise<ShotThreadMapDto | null> {
        try {
            return (await this.send(`/shot-thread-maps/by-thread/${discordThreadId}`, dataEnvelope(shotThreadMapSchema))).data;
        } catch (error: unknown) {
            if (error instanceof PlatformApiError && error.status === 404) {
                return null;
            }
            throw error;
        }
    }

    public async bindThread(shotId: string, discordThreadId: string): Promise<void> {
        await this.send(`/shot-thread-maps/${shotId}`, dataEnvelope(shotThreadMapSchema), { method: "PUT", body: { discordThreadId } });
    }

    public async unbindThread(shotId: string): Promise<void> {
        await this.send(`/shot-thread-maps/${shotId}`, emptySchema, { method: "DELETE" });
    }

    public async listAllShots(): Promise<readonly ShotDto[]> {
        const shots: ShotDto[] = [];
        for (let page = 1; page <= 100; page++) {
            const result = await this.send("/shots", pageEnvelope(shotSchema), { query: { page, perPage: 100 } });
            shots.push(...result.data);
            if (page >= result.meta.totalPages) {
                break;
            }
        }
        return shots;
    }

    public async listAllUsers(): Promise<readonly ModeratedUserDto[]> {
        const users: ModeratedUserDto[] = [];
        for (let page = 1; page <= 100; page++) {
            const result = await this.send("/users", pageEnvelope(moderatedUserSchema), { query: { page, perPage: 100 } });
            users.push(...result.data);
            if (page >= result.meta.totalPages) {
                break;
            }
        }
        return users;
    }

    public async getShot(shotId: string): Promise<ShotDetailDto> {
        return (await this.send(`/shots/${shotId}`, dataEnvelope(shotDetailSchema))).data;
    }

    public async getShotByCode(shotCode: string): Promise<ShotDto | null> {
        try {
            return (await this.send(`/shots/by-code/${encodeURIComponent(shotCode)}`, dataEnvelope(shotSchema))).data;
        } catch (error: unknown) {
            if (error instanceof PlatformApiError && error.status === 404) {
                return null;
            }
            throw error;
        }
    }

    public async isHealthy(): Promise<{ healthy: boolean; latencyMs: number }> {
        const started = performance.now();
        try {
            const origin = new URL(this.baseUrl).origin;
            const response = await fetch(`${origin}/health/ready`, { signal: AbortSignal.timeout(5000), redirect: "error" });
            await response.body?.cancel();
            return { healthy: response.ok, latencyMs: Math.round(performance.now() - started) };
        } catch {
            return { healthy: false, latencyMs: Math.round(performance.now() - started) };
        }
    }

    public async sendHeartbeat(wsPingMs: number): Promise<void> {
        try {
            await this.send("/health/bot-heartbeat", z.object({ status: z.literal("ok") }), {
                method: "POST",
                body: { wsPingMs: Math.max(0, Math.round(wsPingMs)) }
            });
        } catch (error: unknown) {
            this.logger.debug({ err: error }, "failed to send bot heartbeat");
        }
    }

    public openNotificationStream(lastEventId: string | null, signal: AbortSignal): Promise<Response> {
        const headers: Record<string, string> = { Authorization: `Bearer ${this.serviceToken}`, Accept: "text/event-stream" };
        if (lastEventId !== null) {
            headers["Last-Event-ID"] = lastEventId;
        }
        return fetch(`${this.baseUrl}/notifications/stream`, { headers, signal, redirect: "error" });
    }

    public async send<T extends z.ZodType>(path: string, schema: T, options: RequestOptions = {}): Promise<z.infer<T>> {
        const url = new URL(`${this.baseUrl}${path}`);
        for (const [key, value] of Object.entries(options.query ?? {})) {
            if (value !== undefined) {
                url.searchParams.set(key, String(value));
            }
        }
        const headers: Record<string, string> = { Authorization: `Bearer ${this.serviceToken}`, Accept: "application/json" };
        if (options.actingUser !== undefined) {
            headers[actingUserHeader] = options.actingUser;
        }
        if (options.body !== undefined) {
            headers["Content-Type"] = "application/json";
        }

        const response = await fetch(url, {
            method: options.method ?? "GET",
            headers,
            body: options.body === undefined ? undefined : JSON.stringify(options.body),
            redirect: "error",
            signal: AbortSignal.timeout(requestTimeoutMs)
        });

        if (response.status === 204) {
            return schema.parse(undefined);
        }
        const payload: unknown = await response.json().catch(() => null);
        if (!response.ok) {
            const problem = problemSchema.safeParse(payload);
            if (problem.success) {
                throw new PlatformApiError(response.status, problem.data.code, problem.data.detail);
            }
            throw new PlatformApiError(response.status, "UNKNOWN", `The platform API responded with ${response.status}.`);
        }
        const parsed = schema.safeParse(payload);
        if (!parsed.success) {
            this.logger.error({ path, issues: parsed.error.issues.slice(0, 5) }, "platform api response did not match the contract");
            throw new PlatformApiError(502, "CONTRACT_MISMATCH", "The platform API returned an unexpected response.");
        }
        return parsed.data;
    }
}

export class ActingApiClient {
    public constructor(
        private readonly client: PlatformApiClient,
        private readonly identity: DiscordIdentity
    ) {}

    public async me(): Promise<UserDto> {
        return (await this.request("/auth/me", dataEnvelope(userSchema))).data;
    }

    public async listUsers(options: { page?: number; perPage?: number; role?: Role } = {}): Promise<Page<ModeratedUserDto>> {
        return this.request("/users", pageEnvelope(moderatedUserSchema), { query: options });
    }

    public async listRounds(status?: RoundStatus): Promise<Page<RoundDto>> {
        return this.request("/rounds", pageEnvelope(roundSchema), { query: { status, perPage: 100 } });
    }

    public async getRound(roundId: string): Promise<RoundDetailDto> {
        return (await this.request(`/rounds/${roundId}`, dataEnvelope(roundDetailSchema))).data;
    }

    public async listEntries(roundId: string): Promise<readonly EntryDto[]> {
        return (await this.request(`/rounds/${roundId}/entries`, pageEnvelope(entrySchema), { query: { perPage: 100 } })).data;
    }

    public async getLeaderboard(roundId: string): Promise<LeaderboardDto> {
        return (await this.request(`/rounds/${roundId}/leaderboard`, dataEnvelope(leaderboardSchema))).data;
    }

    public async getResults(roundId: string): Promise<RoundResultDto> {
        return (await this.request(`/rounds/${roundId}/results`, dataEnvelope(roundResultSchema))).data;
    }

    public async getTelemetry(roundId: string): Promise<readonly RaidTelemetryDto[]> {
        return (await this.request(`/rounds/${roundId}/telemetry`, dataEnvelope(z.array(raidTelemetrySchema)))).data;
    }

    public async getShot(shotId: string): Promise<ShotDetailDto> {
        return (await this.request(`/shots/${shotId}`, dataEnvelope(shotDetailSchema))).data;
    }

    public async createShot(input: {
        sceneNumber: number;
        shotCode: string;
        title: string;
        difficultyTier: DifficultyTier;
        description: string | null;
        seniorPriorityHours: number;
    }): Promise<ShotDto> {
        return (await this.request("/shots", dataEnvelope(shotSchema), { method: "POST", body: input })).data;
    }

    public async claimShot(shotId: string): Promise<ShotDto> {
        return (await this.request(`/shots/${shotId}/claim`, dataEnvelope(shotSchema), { method: "POST" })).data;
    }

    public async releaseShot(shotId: string, reason: string | null): Promise<ShotDto> {
        return (await this.request(`/shots/${shotId}/release`, dataEnvelope(shotSchema), { method: "POST", body: { reason } })).data;
    }

    public async requestDeliverableUpload(
        shotId: string,
        input: { kind: DeliverableKind; fileName: string; contentType: string; sizeBytes: number }
    ): Promise<PresignedUploadDto> {
        return (await this.request(`/shots/${shotId}/uploads`, dataEnvelope(presignedUploadSchema), { method: "POST", body: input })).data;
    }

    public async submitWork(shotId: string, input: { videoKey: string; blendKey: string; notes: string | null }): Promise<SubmissionDto> {
        return (await this.request(`/shots/${shotId}/submissions`, dataEnvelope(submissionSchema), { method: "POST", body: input })).data;
    }

    public async listReviewQueue(): Promise<readonly ReviewQueueItemDto[]> {
        return (await this.request("/reviews", pageEnvelope(reviewQueueItemSchema), { query: { perPage: 100 } })).data;
    }

    public async reviewSubmission(submissionId: string, decision: ReviewDecision, notes: string | null): Promise<SubmissionDto> {
        return (
            await this.request(`/submissions/${submissionId}/review`, dataEnvelope(submissionSchema), {
                method: "POST",
                body: { decision, notes }
            })
        ).data;
    }

    public async reclaimExpired(): Promise<ReclaimResultDto> {
        return (await this.request("/shots/reclaim-expired", dataEnvelope(reclaimResultSchema), { method: "POST" })).data;
    }

    public async setRole(discordId: string, role: Role, specialties: readonly Specialty[], discordUsername: string): Promise<UserDto> {
        return (
            await this.request(`/users/by-discord/${discordId}/role`, dataEnvelope(userSchema), {
                method: "PUT",
                body: { role, specialties, discordUsername: discordUsername.slice(0, 64) }
            })
        ).data;
    }

    public async blacklist(discordId: string, reason: string | null): Promise<ModeratedUserDto> {
        return (
            await this.request(`/users/by-discord/${discordId}/blacklist`, dataEnvelope(moderatedUserSchema), {
                method: "PUT",
                body: { reason }
            })
        ).data;
    }

    public async reinstate(discordId: string): Promise<ModeratedUserDto> {
        return (await this.request(`/users/by-discord/${discordId}/blacklist`, dataEnvelope(moderatedUserSchema), { method: "DELETE" }))
            .data;
    }

    public async getOwnBallot(roundId: string): Promise<z.infer<typeof ballotSchema>> {
        return (await this.request(`/rounds/${roundId}/ballots/me`, dataEnvelope(ballotSchema))).data;
    }

    private async request<T extends z.ZodType>(path: string, schema: T, options: RequestOptions = {}): Promise<z.infer<T>> {
        await this.client.ensureProfile(this.identity);
        return this.client.send(path, schema, { ...options, actingUser: this.identity.id });
    }
}
