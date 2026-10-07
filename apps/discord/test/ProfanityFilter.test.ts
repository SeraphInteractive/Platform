import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { detectProfanity, normalizeContent } from "../src/Services/ProfanityFilter.js";
import { WarningStore } from "../src/State/WarningStore.js";

describe("ProfanityFilter pattern matching", () => {
    it("detects direct profanity and severe slurs", () => {
        expect(detectProfanity("what the fuck is this").matched).toBe(true);
        expect(detectProfanity("you are a motherfucker").matched).toBe(true);
        expect(detectProfanity("this is absolute shit").matched).toBe(true);
        expect(detectProfanity("stop being a bitch").matched).toBe(true);
        expect(detectProfanity("you dumbass asshole").matched).toBe(true);
        expect(detectProfanity("go kys right now").matched).toBe(true);
        expect(detectProfanity("shut up you retard").matched).toBe(true);
    });

    it("detects leetspeak and obfuscated profanity", () => {
        expect(detectProfanity("what the f*ck").matched).toBe(true);
        expect(detectProfanity("f u c k you").matched).toBe(true);
        expect(detectProfanity("b!tch please").matched).toBe(true);
        expect(detectProfanity("what the f0ck").matched).toBe(true);
        expect(detectProfanity("total sh!t").matched).toBe(true);
        expect(detectProfanity("you a$$hole").matched).toBe(true);
    });

    it("avoids false positives on benign words containing sub-strings", () => {
        expect(detectProfanity("this is a classic animation").matched).toBe(false);
        expect(detectProfanity("please pass the blend file").matched).toBe(false);
        expect(detectProfanity("the grass is green").matched).toBe(false);
        expect(detectProfanity("contact the production assistant").matched).toBe(false);
        expect(detectProfanity("check the airplane cockpit").matched).toBe(false);
        expect(detectProfanity("read the guidelines document").matched).toBe(false);
        expect(detectProfanity("scrap this shot").matched).toBe(false);
        expect(detectProfanity("shift the keyframes").matched).toBe(false);
        expect(detectProfanity("hello everyone, welcome!").matched).toBe(false);
    });

    it("normalizes special unicode and accents", () => {
        expect(normalizeContent("fück")).toBe("fuck");
        expect(normalizeContent("bítch")).toBe("bitch");
    });
});

describe("WarningStore progressive discipline", () => {
    let tempDir: string;
    let store: WarningStore;

    beforeEach(async () => {
        tempDir = await mkdtemp(join(tmpdir(), "warnings-test-"));
        store = new WarningStore(tempDir);
        await store.load();
    });

    afterEach(async () => {
        await store.flush();
        await rm(tempDir, { recursive: true, force: true });
    });

    it("progresses from 5 warnings (24h) to 3 warnings (1w) to 1 warning (ban)", () => {
        const userId = "user12345";

        // Stage 0: 4 warnings
        for (let i = 1; i <= 4; i++) {
            const result = store.addWarning(userId, "test reason", "channel1", "bad word");
            expect(result.type).toBe("warning");
            if (result.type === "warning") {
                expect(result.current).toBe(i);
                expect(result.max).toBe(5);
                expect(result.offenceLevel).toBe(0);
            }
        }

        // 5th warning triggers 1st offence (24h timeout)
        const firstOffence = store.addWarning(userId, "test reason", "channel1", "bad word 5");
        expect(firstOffence.type).toBe("first_offence_24h");
        if (firstOffence.type === "first_offence_24h") {
            expect(firstOffence.durationMs).toBe(24 * 60 * 60 * 1000);
        }

        // Stage 1: 2 warnings
        for (let i = 1; i <= 2; i++) {
            const result = store.addWarning(userId, "test reason", "channel1", "bad word again");
            expect(result.type).toBe("warning");
            if (result.type === "warning") {
                expect(result.current).toBe(i);
                expect(result.max).toBe(3);
                expect(result.offenceLevel).toBe(1);
            }
        }

        // 3rd warning in stage 1 triggers 2nd offence (1-week timeout)
        const secondOffence = store.addWarning(userId, "test reason", "channel1", "bad word 8");
        expect(secondOffence.type).toBe("second_offence_1w");
        if (secondOffence.type === "second_offence_1w") {
            expect(secondOffence.durationMs).toBe(7 * 24 * 60 * 60 * 1000);
        }

        // Stage 2: 1 warning triggers 3rd offence (ban)
        const thirdOffence = store.addWarning(userId, "test reason", "channel1", "final bad word");
        expect(thirdOffence.type).toBe("third_offence_ban");
        if (thirdOffence.type === "third_offence_ban") {
            expect(thirdOffence.durationMs).toBe(30 * 24 * 60 * 60 * 1000);
        }

        const record = store.getRecord(userId);
        expect(record?.offenceLevel).toBe(3);
    });

    it("handles ban apology review submission and approval with automatic reset", () => {
        const userId = "bannedUser999";

        // trigger up to ban
        for (let i = 0; i < 9; i++) {
            store.addWarning(userId, "profanity", "ch1", "bad");
        }
        expect(store.getRecord(userId)?.offenceLevel).toBe(3);

        // submit apology
        store.submitApology(userId, "I am deeply sorry for using prohibited language and promise to follow the rules.");
        expect(store.getRecord(userId)?.apology.status).toBe("pending");

        // approve apology by supervisor
        const updated = store.reviewApology(userId, true, "supervisor123");
        expect(updated.offenceLevel).toBe(0);
        expect(updated.stageWarnings).toBe(0);
        expect(updated.infractions.length).toBe(0);
        expect(updated.apology.status).toBe("approved");
        expect(updated.apology.reviewedBy).toBe("supervisor123");
    });

    it("handles ban apology rejection without resetting offences", () => {
        const userId = "bannedUser888";

        // trigger up to ban
        for (let i = 0; i < 9; i++) {
            store.addWarning(userId, "profanity", "ch1", "bad");
        }

        store.submitApology(userId, "Unban me please.");
        const updated = store.reviewApology(userId, false, "supervisor123");
        expect(updated.offenceLevel).toBe(3);
        expect(updated.apology.status).toBe("rejected");
    });
});
