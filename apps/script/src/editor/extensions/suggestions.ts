import type { Editor } from "@tiptap/react";

export interface ScriptSuggestions {
    characters: string[];
    sluglines: string[];
    transitions: string[];
}

export const COMMON_PREFIXES = ["INT.", "EXT.", "INT./EXT.", "I/E."];
export const COMMON_TIMES = ["DAY", "NIGHT", "CONTINUOUS", "LATER", "MOMENTS LATER", "DAWN", "DUSK", "SAME"];
export const COMMON_TRANSITIONS = ["CUT TO:", "FADE IN:", "FADE OUT.", "DISSOLVE TO:", "MATCH CUT TO:", "SMASH CUT TO:"];
export const COMMON_CHARACTER_EXTS = ["(V.O.)", "(O.S.)", "(CONT'D)"];

export function extractScriptContext(editor: Editor): ScriptSuggestions {
    const characters = new Set<string>();
    const sluglines = new Set<string>();
    const transitions = new Set<string>(COMMON_TRANSITIONS);

    editor.state.doc.descendants((node) => {
        const text = node.textContent.trim();
        if (!text) return;

        if (node.type.name === "character") {
            // strip out (V.O.) or other parentheticals to extract pure name
            const cleanName = text.replace(/\s*\(.*?\)\s*/g, "").toUpperCase();
            if (cleanName.length >= 2) characters.add(cleanName);
        } else if (node.type.name === "sceneHeading") {
            sluglines.add(text.toUpperCase());
        } else if (node.type.name === "transition") {
            transitions.add(text.toUpperCase());
        }
    });

    return {
        characters: Array.from(characters).sort(),
        sluglines: Array.from(sluglines),
        transitions: Array.from(transitions)
    };
}
