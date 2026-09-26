import { problemSchema, type PaginationMeta } from "@platform/contracts";
import { z } from "zod";

export {
    dataEnvelope,
    pageEnvelope,
    paginationMetaSchema,
    problemSchema,
    snowflakeSchema,
    timestampSchema,
    uuidSchema,
    type PaginationMeta
} from "@platform/contracts";

export const trimmedText = (maximum: number, minimum = 1): z.ZodString => z.string().trim().min(minimum).max(maximum);

export const paginationQuerySchema = z.object({
    page: z.coerce.number().int().min(1).max(10_000).default(1),
    perPage: z.coerce.number().int().min(1).max(100).default(25)
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export interface Page<T> {
    readonly data: readonly T[];
    readonly meta: PaginationMeta;
}

export function createPage<T>(data: readonly T[], total: number, query: PaginationQuery): Page<T> {
    return {
        data,
        meta: {
            page: query.page,
            perPage: query.perPage,
            total,
            totalPages: Math.max(1, Math.ceil(total / query.perPage))
        }
    };
}

export function offsetOf(query: PaginationQuery): number {
    return (query.page - 1) * query.perPage;
}

export function toIso(date: Date): string;
export function toIso(date: Date | null): string | null;
export function toIso(date: Date | null): string | null {
    return date === null ? null : date.toISOString();
}

export const errorResponses = {
    400: problemSchema,
    401: problemSchema,
    403: problemSchema,
    404: problemSchema,
    409: problemSchema,
    422: problemSchema,
    429: problemSchema,
    503: problemSchema
} as const;
