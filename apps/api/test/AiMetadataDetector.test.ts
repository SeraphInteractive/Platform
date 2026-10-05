import { deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { inspectMediaAiSignatures } from "../src/Modules/Uploads/AiMetadataDetector.js";

function createPngWithChunk(type: string, data: Buffer): Buffer {
    const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    // IHDR chunk
    const ihdrData = Buffer.alloc(13);
    ihdrData.writeUInt32BE(100, 0); // width
    ihdrData.writeUInt32BE(100, 4); // height
    ihdrData[8] = 8; // bit depth
    ihdrData[9] = 2; // color type (RGB)
    const ihdrLen = Buffer.alloc(4);
    ihdrLen.writeUInt32BE(13, 0);
    const ihdrType = Buffer.from("IHDR", "ascii");
    const ihdrCrc = Buffer.alloc(4);
    const ihdrChunk = Buffer.concat([ihdrLen, ihdrType, ihdrData, ihdrCrc]);

    // Custom chunk
    const chunkLen = Buffer.alloc(4);
    chunkLen.writeUInt32BE(data.length, 0);
    const chunkType = Buffer.from(type, "ascii");
    const chunkCrc = Buffer.alloc(4);
    const customChunk = Buffer.concat([chunkLen, chunkType, data, chunkCrc]);

    // IEND chunk
    const iendLen = Buffer.alloc(4);
    const iendType = Buffer.from("IEND", "ascii");
    const iendCrc = Buffer.alloc(4);
    const iendChunk = Buffer.concat([iendLen, iendType, iendCrc]);

    return Buffer.concat([signature, ihdrChunk, customChunk, iendChunk]);
}

function createJpegWithApp1(content: string): Buffer {
    const soi = Buffer.from([0xff, 0xd8]);
    const payload = Buffer.from(content, "utf-8");
    const segLen = Buffer.alloc(2);
    segLen.writeUInt16BE(payload.length + 2, 0);
    const app1 = Buffer.concat([Buffer.from([0xff, 0xe1]), segLen, payload]);
    const eoi = Buffer.from([0xff, 0xd9]);
    return Buffer.concat([soi, app1, eoi]);
}

function createMp4WithAtom(atomType: string, content: string): Buffer {
    const payload = Buffer.from(content, "utf-8");
    const atomLen = Buffer.alloc(4);
    atomLen.writeUInt32BE(payload.length + 8, 0);
    const typeBuf = Buffer.from(atomType, "ascii");
    const ftyp = Buffer.concat([Buffer.from([0x00, 0x00, 0x00, 0x14]), Buffer.from("ftypisom", "ascii"), Buffer.alloc(8)]);
    return Buffer.concat([ftyp, atomLen, typeBuf, payload]);
}

describe("AiMetadataDetector", () => {
    it("handles null and empty buffers safely", () => {
        expect(inspectMediaAiSignatures(null)).toEqual({ flagged: false, flags: [], snippet: null });
        expect(inspectMediaAiSignatures(undefined)).toEqual({ flagged: false, flags: [], snippet: null });
        expect(inspectMediaAiSignatures(Buffer.alloc(0))).toEqual({ flagged: false, flags: [], snippet: null });
        expect(inspectMediaAiSignatures(Buffer.alloc(5))).toEqual({ flagged: false, flags: [], snippet: null });
    });

    it("detects Stable Diffusion Automatic1111 parameters in PNG tEXt chunk", () => {
        const prompt = "A cinematic view of a floating castle, 8k\nNegative prompt: blurry, bad anatomy\nSteps: 25, Sampler: DPM++ 2M Karras, CFG scale: 7, Seed: 998822, Size: 512x512, Model: realisticVision";
        const textPayload = Buffer.concat([
            Buffer.from("parameters", "latin1"),
            Buffer.from([0x00]),
            Buffer.from(prompt, "utf-8")
        ]);
        const png = createPngWithChunk("tEXt", textPayload);
        const result = inspectMediaAiSignatures(png);

        expect(result.flagged).toBe(true);
        expect(result.flags).toContain("PNG parameters chunk (Stable Diffusion / WebUI)");
        expect(result.flags).toContain("Stable Diffusion generation parameters");
        expect(result.flags).toContain("Negative prompt parameter");
        expect(result.snippet).toBe("A cinematic view of a floating castle, 8k");
    });

    it("detects ComfyUI workflow in PNG tEXt chunk", () => {
        const workflowJson = JSON.stringify({
            nodes: [
                { id: 1, type: "KSampler", class_type: "KSampler" },
                { id: 2, type: "CLIPTextEncode", class_type: "CLIPTextEncode" }
            ]
        });
        const textPayload = Buffer.concat([
            Buffer.from("workflow", "latin1"),
            Buffer.from([0x00]),
            Buffer.from(workflowJson, "utf-8")
        ]);
        const png = createPngWithChunk("tEXt", textPayload);
        const result = inspectMediaAiSignatures(png);

        expect(result.flagged).toBe(true);
        expect(result.flags).toContain("PNG workflow chunk");
        expect(result.flags).toContain("ComfyUI workflow graph");
    });

    it("detects compressed zTXt parameters chunk", () => {
        const prompt = "Stunning landscape\nSteps: 30, Sampler: Euler, CFG scale: 6.5";
        const compressed = deflateSync(Buffer.from(prompt, "utf-8"));
        const textPayload = Buffer.concat([
            Buffer.from("parameters", "latin1"),
            Buffer.from([0x00]),
            Buffer.from([0x00]), // compression method 0
            compressed
        ]);
        const png = createPngWithChunk("zTXt", textPayload);
        const result = inspectMediaAiSignatures(png);

        expect(result.flagged).toBe(true);
        expect(result.flags).toContain("PNG parameters chunk (Stable Diffusion / WebUI)");
        expect(result.flags).toContain("Stable Diffusion generation parameters");
    });

    it("detects Midjourney in JPEG EXIF/XMP APP1 segment", () => {
        const xmp = `<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/">
      <dc:description>Midjourney prompt: a retro stairway in neon lighting --v 6.0</dc:description>
    </rdf:Description>
  </rdf:RDF>
</x:xmpmeta>`;
        const jpeg = createJpegWithApp1(xmp);
        const result = inspectMediaAiSignatures(jpeg);

        expect(result.flagged).toBe(true);
        expect(result.flags).toContain("Midjourney signature");
        expect(result.snippet).toContain("Midjourney prompt");
    });

    it("detects C2PA digital source algorithmic media in JPEG XMP", () => {
        const c2paXmp = `<rdf:Description digitalSourceType="http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia" c2pa.actions.created="true"/>`;
        const jpeg = createJpegWithApp1(c2paXmp);
        const result = inspectMediaAiSignatures(jpeg);

        expect(result.flagged).toBe(true);
        expect(result.flags).toContain("IPTC trained algorithmic media declaration");
        expect(result.flags).toContain("C2PA algorithmic data assertion");
    });

    it("detects AI video engines in MP4 metadata atoms", () => {
        const mp4 = createMp4WithAtom("moov", "Created with Runway Gen-3 Alpha video generator");
        const result = inspectMediaAiSignatures(mp4);

        expect(result.flagged).toBe(true);
        expect(result.flags).toContain("Runway AI video signature");
    });

    it("passes clean non-AI media without false positives", () => {
        const cleanText = Buffer.concat([
            Buffer.from("Author", "latin1"),
            Buffer.from([0x00]),
            Buffer.from("Seraph Studio Artist", "utf-8")
        ]);
        const cleanPng = createPngWithChunk("tEXt", cleanText);
        expect(inspectMediaAiSignatures(cleanPng)).toEqual({ flagged: false, flags: [], snippet: null });

        const cleanJpeg = createJpegWithApp1("Exif\0\0Camera Model: Canon EOS 5D Mark IV");
        expect(inspectMediaAiSignatures(cleanJpeg)).toEqual({ flagged: false, flags: [], snippet: null });

        const cleanMp4 = createMp4WithAtom("moov", "Hand-crafted Blender 3D animation render");
        expect(inspectMediaAiSignatures(cleanMp4)).toEqual({ flagged: false, flags: [], snippet: null });
    });
});
