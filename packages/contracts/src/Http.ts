import { z } from "zod";

export const actingUserHeader = "x-platform-acting-user";

export const uuidSchema = z.uuid();

export const snowflakeSchema = z.string().regex(/^\d{17,20}$/u, "must be a Discord snowflake");

export const timestampSchema = z.iso.datetime({ offset: true });

export const problemSchema = z
    .object({
        type: z.string(),
        title: z.string(),
        status: z.number().int(),
        detail: z.string(),
        instance: z.string(),
        code: z.string(),
        traceId: z.string(),
        errors: z.array(z.object({ path: z.string().optional(), code: z.string().optional(), message: z.string() })).optional()
    })
    .meta({ id: "Problem" });

export const paginationMetaSchema = z.object({
    page: z.number().int(),
    perPage: z.number().int(),
    total: z.number().int(),
    totalPages: z.number().int()
});

export function dataEnvelope<T extends z.ZodType>(schema: T): z.ZodObject<{ data: T }> {
    return z.object({ data: schema });
}

export function pageEnvelope<T extends z.ZodType>(schema: T): z.ZodObject<{ data: z.ZodArray<T>; meta: typeof paginationMetaSchema }> {
    return z.object({ data: z.array(schema), meta: paginationMetaSchema });
}

export type Problem = z.infer<typeof problemSchema>;
export type PaginationMeta = z.infer<typeof paginationMetaSchema>;
