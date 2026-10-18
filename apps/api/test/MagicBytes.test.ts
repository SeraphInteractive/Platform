import { describe, expect, it } from "vitest";
import { matchesContentType, matchesDeliverableKind } from "../src/Modules/Uploads/MagicBytes.js";

describe("MagicBytes", () => {
    it("accepts any non-empty buffer for .blend files", () => {
        expect(matchesDeliverableKind(Buffer.from("BLENDER-v300SUBM"), "blend")).toBe(true);
        expect(matchesDeliverableKind(Buffer.from([0x28, 0xb5, 0x2f, 0xfd, 0x00]), "blend")).toBe(true);
        expect(matchesDeliverableKind(Buffer.from([0x1f, 0x8b, 0x08, 0x00]), "blend")).toBe(true);
        expect(matchesDeliverableKind(Buffer.from([0x01, 0x02, 0x03]), "blend")).toBe(true);
    });

    it("rejects empty or null blend files", () => {
        expect(matchesDeliverableKind(Buffer.alloc(0), "blend")).toBe(false);
        expect(matchesDeliverableKind(null, "blend")).toBe(false);
    });

    it("recognizes valid video formats", () => {
        const mp4 = Buffer.from([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32]);
        expect(matchesDeliverableKind(mp4, "video")).toBe(true);
        expect(matchesContentType(mp4, "video/mp4")).toBe(true);
    });
});
