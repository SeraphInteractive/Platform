import { describe, expect, it } from "vitest";
import ShotPage from "@/app/grabbox/[shotId]/page";

describe("b22 reproducer: grabbox route params uuid-only restriction", () => {
    it("accepts valid canonical uuid route parameters", async () => {
        const canonicalUuid = "5d208b4b-e013-4244-86a2-077de8803350";
        // should resolve without throwing notFound()
        const element = await ShotPage({
            params: Promise.resolve({ shotId: canonicalUuid }),
            searchParams: Promise.resolve({})
        });
        expect(element).toBeDefined();
    });

    it("rejects malformed or malicious route parameters with notFound", async () => {
        const invalidParam = "../evil/path";
        // invalid params should trigger notFound() which throws NEXT_NOT_FOUND in next.js
        await expect(
            ShotPage({
                params: Promise.resolve({ shotId: invalidParam }),
                searchParams: Promise.resolve({})
            })
        ).rejects.toThrow();
    });

    it("demonstrates b22 defect: human-readable shotCode urls are rejected with 404", async () => {
        // in project stairway, tasks are identified and shared by shotCode (e.g. SC01-010)
        // page.tsx line 11 checks only z.uuid().safeParse(shotId), rejecting valid shot codes with notFound()
        const businessShotCode = "SC01-010";

        // expected invariant: grabbox route must accept human-readable business shot codes
        // failing assertion against current code: z.uuid().safeParse fails and calls notFound(), rejecting the promise
        await expect(
            ShotPage({
                params: Promise.resolve({ shotId: businessShotCode }),
                searchParams: Promise.resolve({})
            })
        ).resolves.toBeDefined();
    });
});
