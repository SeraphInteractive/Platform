import { inflateSync } from "node:zlib";

export interface AiDetectionResult {
    readonly flagged: boolean;
    readonly flags: readonly string[];
    readonly snippet: string | null;
}

interface KeywordRule {
    readonly pattern: RegExp;
    readonly flagName: string;
}

const aiTextRules: readonly KeywordRule[] = [
    // automatic1111 / stable diffusion parameters
    { pattern: /\b(?:Steps:\s*\d+,\s*Sampler:\s*[^,\n]+,\s*CFG scale:\s*[\d.]+)/iu, flagName: "Stable Diffusion generation parameters" },
    { pattern: /\bNegative prompt:\s*[^,\n]+/iu, flagName: "Negative prompt parameter" },
    { pattern: /\bModel hash:\s*[0-9a-f]{8,12}\b/iu, flagName: "Model hash parameter" },
    { pattern: /\bCivitai resources:\s*\[/iu, flagName: "Civitai resource tag" },

    // comfyui graph metadata
    { pattern: /"(?:class_type|type)":\s*"(?:KSampler|VAEDecode|CLIPTextEncode|CheckpointLoaderSimple|LoraLoader)"/iu, flagName: "ComfyUI workflow graph" },
    { pattern: /"client_id":\s*"[^"]+",\s*"prompt":\s*\{/iu, flagName: "ComfyUI prompt payload" },

    // midjourney / dall-e / novelai / fooocus / invokeai signatures
    { pattern: /\b(?:Midjourney|niji(?:journey)?)\b/iu, flagName: "Midjourney signature" },
    { pattern: /\bDALL[-·]E(?:\s*[23])?\b/iu, flagName: "DALL-E signature" },
    { pattern: /\bNovelAI\b/iu, flagName: "NovelAI signature" },
    { pattern: /\bFooocus\b/iu, flagName: "Fooocus signature" },
    { pattern: /\bInvokeAI\b/iu, flagName: "InvokeAI signature" },
    { pattern: /\bAdobe Firefly\b/iu, flagName: "Adobe Firefly signature" },
    { pattern: /\bFlux(?:\.1)?\s*(?:\[dev\]|\[schnell\]|\[pro\])?\b/iu, flagName: "Flux generation signature" },
    { pattern: /\bLeonardo(?:\.Ai)?\b/iu, flagName: "Leonardo.Ai signature" },
    { pattern: /\bIdeogram\b/iu, flagName: "Ideogram signature" },

    // c2pa and provenance assertions for generative ai
    { pattern: /c2pa\.(?:actions\.created|trainedAlgorithmicData|claim_generator)/iu, flagName: "C2PA algorithmic data assertion" },
    { pattern: /trainedAlgorithmicMedia/iu, flagName: "IPTC trained algorithmic media declaration" },
    { pattern: /"digitalSourceType":\s*"[^"]*trainedAlgorithmicMedia"/iu, flagName: "Digital source type: algorithmic media" },

    // generative ai video tools
    { pattern: /\b(?:Runway(?:ML)?|Gen-2|Gen-3(?:\s*Alpha)?)\b/iu, flagName: "Runway AI video signature" },
    { pattern: /\bPika(?:\s*Labs)?\b/iu, flagName: "Pika video signature" },
    { pattern: /\bOpenAI\s*Sora\b|\bSora(?:\s*Video)?\b/iu, flagName: "Sora video signature" },
    { pattern: /\bLuma(?:\s*Dream\s*Machine|\s*AI)\b/iu, flagName: "Luma Dream Machine signature" },
    { pattern: /\bKling(?:\s*AI)?\b/iu, flagName: "Kling AI video signature" },
    { pattern: /\bHaiper(?:\s*AI)?\b/iu, flagName: "Haiper AI video signature" },
    { pattern: /\bAnimateDiff\b/iu, flagName: "AnimateDiff video signature" },
    { pattern: /\bCogVideoX?\b/iu, flagName: "CogVideo signature" },
    { pattern: /\bStable Video Diffusion\b|\bSVD[-_]xt\b/iu, flagName: "Stable Video Diffusion signature" }
];

const pngKeywords = new Set([
    "parameters",
    "prompt",
    "workflow",
    "generation_data",
    "sd-metadata",
    "software",
    "comment",
    "description",
    "xml:com.adobe.xmp",
    "civitai"
]);

function extractSnippet(text: string): string | null {
    const trimmed = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/gu, " ").trim();
    if (trimmed.length === 0) {
        return null;
    }
    // pull out first meaningful prompt sentence or json segment
    const sdMatch = /^(.*?)(?:Negative prompt:|Steps:|$)/su.exec(trimmed);
    const candidate = sdMatch !== null && sdMatch[1]?.trim() ? sdMatch[1].trim() : trimmed;
    return candidate.length > 280 ? `${candidate.slice(0, 277)}...` : candidate;
}

function scanText(content: string, flags: Set<string>, snippetRef: { current: string | null }): void {
    for (const rule of aiTextRules) {
        if (rule.pattern.test(content)) {
            flags.add(rule.flagName);
            if (snippetRef.current === null) {
                const match = rule.pattern.exec(content);
                if (match !== null) {
                    const start = Math.max(0, match.index - 40);
                    const end = Math.min(content.length, match.index + 240);
                    snippetRef.current = extractSnippet(content.slice(start, end));
                }
            }
        }
    }
}

function inspectPng(buffer: Buffer, flags: Set<string>, snippetRef: { current: string | null }): void {
    let offset = 8;
    while (offset + 8 <= buffer.length) {
        const length = buffer.readUInt32BE(offset);
        const type = buffer.subarray(offset + 4, offset + 8).toString("ascii");
        const dataStart = offset + 8;
        const dataEnd = Math.min(dataStart + length, buffer.length);
        const data = buffer.subarray(dataStart, dataEnd);

        if (type === "tEXt" || type === "zTXt" || type === "iTXt") {
            try {
                const nullIdx = data.indexOf(0);
                if (nullIdx !== -1) {
                    const keyword = data.subarray(0, nullIdx).toString("latin1").toLowerCase();
                    let textContent = "";

                    if (type === "tEXt") {
                        textContent = data.subarray(nullIdx + 1).toString("utf-8");
                    } else if (type === "zTXt" && data.length > nullIdx + 2) {
                        // skip 1 byte compression method
                        const compressed = data.subarray(nullIdx + 2);
                        textContent = inflateSync(compressed).toString("utf-8");
                    } else if (type === "iTXt" && data.length > nullIdx + 3) {
                        const compFlag = data[nullIdx + 1];
                        const nullIdx2 = data.indexOf(0, nullIdx + 3); // language tag
                        if (nullIdx2 !== -1) {
                            const nullIdx3 = data.indexOf(0, nullIdx2 + 1); // trans keyword
                            if (nullIdx3 !== -1) {
                                const textRaw = data.subarray(nullIdx3 + 1);
                                textContent = compFlag === 1 ? inflateSync(textRaw).toString("utf-8") : textRaw.toString("utf-8");
                            }
                        }
                    }

                    if (pngKeywords.has(keyword)) {
                        if (keyword === "parameters") {
                            flags.add("PNG parameters chunk (Stable Diffusion / WebUI)");
                            if (snippetRef.current === null && textContent.length > 0) {
                                snippetRef.current = extractSnippet(textContent);
                            }
                        } else if (keyword === "workflow" || keyword === "prompt") {
                            flags.add(`PNG ${keyword} chunk`);
                        }
                    }

                    if (textContent.length > 0) {
                        scanText(textContent, flags, snippetRef);
                    }
                }
            } catch {
                // skip corrupted chunks gracefully
            }
        }

        if (type === "IEND") {
            break;
        }

        offset += 12 + length;
        if (length < 0 || offset > buffer.length + 1024 * 1024) {
            break;
        }
    }
}

function inspectJpeg(buffer: Buffer, flags: Set<string>, snippetRef: { current: string | null }): void {
    let offset = 2;
    while (offset + 4 <= buffer.length) {
        if (buffer[offset] !== 0xff) {
            break;
        }
        const marker = buffer[offset + 1];
        if (marker === undefined || marker === 0xda || marker === 0xd9) {
            break; // start of scan or end of image
        }
        if (marker === 0x00 || (marker >= 0xd0 && marker <= 0xd7)) {
            offset += 2;
            continue;
        }

        const segLen = buffer.readUInt16BE(offset + 2);
        const segData = buffer.subarray(offset + 4, Math.min(offset + 2 + segLen, buffer.length));

        // app1 (exif/xmp), app2 (c2pa/flashpix), app13 (iptc), com (comment)
        if (marker === 0xe1 || marker === 0xe2 || marker === 0xed || marker === 0xfe) {
            const segStr = segData.toString("latin1");
            scanText(segStr, flags, snippetRef);
            try {
                const utf8Str = segData.toString("utf-8");
                scanText(utf8Str, flags, snippetRef);
            } catch {
                // ignore invalid utf8 sequences
            }
        }

        offset += 2 + segLen;
    }
}

function inspectQuickTimeOrMp4(buffer: Buffer, flags: Set<string>, snippetRef: { current: string | null }): void {
    // scan atoms for metadata tags
    let offset = 0;
    while (offset + 8 <= buffer.length) {
        const atomSize = buffer.readUInt32BE(offset);

        if (atomSize === 0) {
            break;
        }

        const effectiveSize = atomSize === 1 && offset + 16 <= buffer.length ? Number(buffer.readBigUInt64BE(offset + 8)) : atomSize;
        if (effectiveSize < 8) {
            break;
        }

        const atomData = buffer.subarray(offset, Math.min(offset + effectiveSize, buffer.length));
        const atomStr = atomData.toString("latin1");
        scanText(atomStr, flags, snippetRef);

        offset += effectiveSize;
    }
}

export function inspectMediaAiSignatures(buffer: Buffer | null | undefined): AiDetectionResult {
    if (buffer === null || buffer === undefined || buffer.length < 12) {
        return { flagged: false, flags: [], snippet: null };
    }

    const flags = new Set<string>();
    const snippetRef: { current: string | null } = { current: null };

    try {
        const isPng = buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
        const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8;
        const isRiffWebp = buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP";
        const isMp4 = buffer.subarray(4, 8).toString("ascii") === "ftyp" || buffer.subarray(4, 8).toString("ascii") === "moov";

        if (isPng) {
            inspectPng(buffer, flags, snippetRef);
        } else if (isJpeg) {
            inspectJpeg(buffer, flags, snippetRef);
        } else if (isRiffWebp) {
            const rawStr = buffer.toString("latin1");
            scanText(rawStr, flags, snippetRef);
        } else if (isMp4) {
            inspectQuickTimeOrMp4(buffer, flags, snippetRef);
        } else {
            // fallback raw text search for other containers / formats
            const rawStr = buffer.subarray(0, Math.min(buffer.length, 65536)).toString("latin1");
            scanText(rawStr, flags, snippetRef);
        }
    } catch {
        // keep upload flow resilient against parser anomalies
    }

    const flagArray = Array.from(flags);
    return {
        flagged: flagArray.length > 0,
        flags: flagArray,
        snippet: snippetRef.current
    };
}
