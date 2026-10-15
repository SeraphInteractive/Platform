import type { Editor } from "@tiptap/react";

export interface ScriptSuggestions {
    characters: string[];
    sluglines: string[];
    locations: string[];
    shots: string[];
    transitions: string[];
}

export const COMMON_PREFIXES = ["INT.", "EXT.", "INT./EXT.", "I/E."];
export const COMMON_TIMES = ["DAY", "NIGHT", "CONTINUOUS", "LATER", "MOMENTS LATER", "DAWN", "DUSK", "SAME"];
export const COMMON_TRANSITIONS = ["CUT TO:", "FADE IN:", "FADE OUT.", "DISSOLVE TO:", "MATCH CUT TO:", "SMASH CUT TO:"];
export const COMMON_CHARACTER_EXTS = ["(V.O.)", "(O.S.)", "(CONT'D)"];
export const COMMON_SHOTS = [
    "ANGLE ON",
    "CLOSE UP",
    "WIDE SHOT",
    "POV",
    "INSERT",
    "EXTREME CLOSE UP",
    "ESTABLISHING SHOT",
    "TRACKING SHOT",
    "PAN TO",
    "REVERSE ANGLE",
    "OVER THE SHOULDER",
    "AERIAL SHOT"
];

export function extractScriptContext(editor: Editor): ScriptSuggestions {
    const characters = new Set<string>();
    const sluglines = new Set<string>();
    const locations = new Set<string>();
    const shots = new Set<string>();
    const transitions = new Set<string>(COMMON_TRANSITIONS);

    const currentPos = editor.state.selection.from;

    editor.state.doc.descendants((node, pos) => {
        const text = node.textContent.trim();
        if (!text) return;

        // avoid treating partially typed text at the cursor as an existing location or shot
        const isCurrentNode = pos <= currentPos && currentPos <= pos + node.nodeSize;

        if (node.type.name === "character") {
            const cleanName = text.replace(/\s*\(.*?\)\s*/g, "").toUpperCase();
            if (cleanName.length >= 2) characters.add(cleanName);
        } else if (node.type.name === "sceneHeading") {
            sluglines.add(text.toUpperCase());
            if (!isCurrentNode) {
                let rem = text.toUpperCase();
                for (const p of COMMON_PREFIXES) {
                    if (rem.startsWith(p)) {
                        rem = rem.slice(p.length).trim();
                        break;
                    }
                }
                const dashIdx = rem.lastIndexOf("-");
                const loc = (dashIdx !== -1 ? rem.slice(0, dashIdx) : rem).trim();
                if (loc.length >= 2) {
                    locations.add(loc);
                }
            }
        } else if (node.type.name === "shot") {
            if (!isCurrentNode && text.length >= 2) {
                shots.add(text.toUpperCase());
            }
        } else if (node.type.name === "transition") {
            transitions.add(text.toUpperCase());
        }
    });

    return {
        characters: Array.from(characters).sort(),
        sluglines: Array.from(sluglines),
        locations: Array.from(locations).sort(),
        shots: Array.from(shots).sort(),
        transitions: Array.from(transitions)
    };
}
