import { describe, expect, it } from "vitest";
import { matchesContentType, matchesDeliverableKind } from "../src/Modules/Uploads/MagicBytes.js";

describe("MagicBytes", () => {
    it("recognizes uncompressed .blend files", () => {
        const rawBlend = Buffer.from("BLENDER-v300SUBM");
        expect(matchesDeliverableKind(rawBlend, "blend")).toBe(true);
    });

    it("recognizes zstandard compressed .blend files (Blender 3.0+ default)", () => {
        const zstdBlend = Buffer.from([0x28, 0xb5, 0x2f, 0xfd, 0x00, 0x00, 0x12, 0x34]);
        expect(matchesDeliverableKind(zstdBlend, "blend")).toBe(true);
    });

    it("recognizes gzip compressed .blend files (Blender 2.x)", () => {
        const gzipBlend = Buffer.from([0x1f, 0x8b, 0x08, 0x00, 0x00, 0x00, 0x00, 0x00]);
        expect(matchesDeliverableKind(gzipBlend, "blend")).toBe(true);
    });

    it("rejects invalid or corrupted blend files", () => {
        expect(matchesDeliverableKind(Buffer.from("NOT-A-BLEND-FILE"), "blend")).toBe(false);
        expect(matchesDeliverableKind(Buffer.from([0x00, 0x01, 0x02]), "blend")).toBe(false);
        expect(matchesDeliverableKind(null, "blend")).toBe(false);
    });

    it("recognizes valid video formats", () => {
        const mp4 = Buffer.from([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32]);
        expect(matchesDeliverableKind(mp4, "video")).toBe(true);
        expect(matchesContentType(mp4, "video/mp4")).toBe(true);
    });
});
