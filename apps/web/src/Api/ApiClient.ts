import { problemSchema } from "@platform/contracts";
import type { z } from "zod";

export interface FieldError {
    readonly path: string | undefined;
    readonly message: string;
}

export class ApiError extends Error {
    public constructor(
        public readonly status: number,
        public readonly code: string,
        message: string,
        public readonly fieldErrors: readonly FieldError[] = []
    ) {
        super(message);
        this.name = "ApiError";
    }
}

export type QueryValue = string | number | boolean | null | undefined;

export interface RequestOptions {
    readonly method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
    readonly body?: unknown;
    readonly query?: Readonly<Record<string, QueryValue>>;
    readonly signal?: AbortSignal;
}

export function buildQuery(query: Readonly<Record<string, QueryValue>> | undefined): string {
    if (query === undefined) {
        return "";
    }
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
        if (value !== null && value !== undefined && value !== "") {
            params.set(key, String(value));
        }
    }
    const serialized = params.toString();
    return serialized.length === 0 ? "" : `?${serialized}`;
}

async function toApiError(response: Response): Promise<ApiError> {
    const payload: unknown = await response.json().catch(() => null);
    const problem = problemSchema.partial().safeParse(payload);
    if (problem.success && typeof problem.data.detail === "string") {
        return new ApiError(
            response.status,
            problem.data.code ?? "UNKNOWN",
            problem.data.detail,
            (problem.data.errors ?? []).map((error) => ({ path: error.path, message: error.message }))
        );
    }
    return new ApiError(response.status, "UNKNOWN", `The request failed with status ${response.status}.`);
}

export async function sendRequest(path: string, options: RequestOptions = {}): Promise<Response> {
    const headers: Record<string, string> = { Accept: "application/json" };
    let body: string | undefined;
    if (options.body !== undefined) {
        headers["Content-Type"] = "application/json";
        body = JSON.stringify(options.body);
    }
    let response: Response;
    try {
        response = await fetch(`/api/v1${path}${buildQuery(options.query)}`, {
            method: options.method ?? "GET",
            headers,
            body,
            credentials: "same-origin",
            cache: "no-store",
            signal: options.signal
        });
    } catch (error: unknown) {
        if (error instanceof DOMException && error.name === "AbortError") {
            throw error;
        }
        throw new ApiError(0, "NETWORK_ERROR", "Could not reach the server. Check your connection.");
    }
    if (!response.ok) {
        throw await toApiError(response);
    }
    return response;
}

export async function request<TSchema extends z.ZodType>(
    path: string,
    schema: TSchema,
    options: RequestOptions = {}
): Promise<z.infer<TSchema>> {
    const response = await sendRequest(path, options);
    const payload: unknown = await response.json().catch(() => null);
    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
        throw new ApiError(response.status, "INVALID_RESPONSE", "The server sent an unexpected response.");
    }
    return parsed.data;
}

export async function requestNoContent(path: string, options: RequestOptions = {}): Promise<void> {
    const response = await sendRequest(path, options);
    await response.body?.cancel();
}

export function describeError(error: unknown): string {
    if (error instanceof ApiError) {
        return error.message;
    }
    return "Something went wrong. Try again.";
}
