import { z } from "zod";
import { timestampSchema, uuidSchema } from "./Http.js";

export const autoModRuleSchema = z
    .object({
        id: uuidSchema,
        pattern: z.string().min(1).max(255),
        isRegex: z.boolean(),
        createdAt: timestampSchema
    })
    .meta({ id: "AutoModRule" });

export type AutoModRuleDto = z.infer<typeof autoModRuleSchema>;

export const createAutoModRuleSchema = z
    .object({
        pattern: z.string().trim().min(1).max(255),
        isRegex: z.boolean()
    })
    .meta({ id: "CreateAutoModRule" });

export type CreateAutoModRuleDto = z.infer<typeof createAutoModRuleSchema>;
