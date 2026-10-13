import { describe, it, expect } from "vitest";
import { exportToFdx } from "./fdx";
import { exportToFountain, parseFountain } from "./fountain";
import type { JSONContent } from "@tiptap/react";

describe("Screenplay Formats", () => {
  const sampleDoc: JSONContent = {
    type: "doc",
    content: [
      {
        type: "sceneHeading",
        content: [{ type: "text", text: "INT. WORKSHOP - NIGHT" }]
      },
      {
        type: "action",
        content: [{ type: "text", text: "The fluorescent tubes flicker above the work bench." }]
      },
      {
        type: "character",
        content: [{ type: "text", text: "MARCUS" }]
      },
      {
        type: "parenthetical",
        content: [{ type: "text", text: "(whispering)" }]
      },
      {
        type: "dialogue",
        content: [{ type: "text", text: "Is the render queue finished?" }]
      },
      {
        type: "transition",
        content: [{ type: "text", text: "CUT TO:" }]
      }
    ]
  };

  it("exports valid Final Draft XML (.fdx)", () => {
    const fdx = exportToFdx(sampleDoc, "Episode 1");
    expect(fdx).toContain('<?xml version="1.0"');
    expect(fdx).toContain('<FinalDraft DocumentType="Script"');
    expect(fdx).toContain('<Paragraph Type="Scene Heading">');
    expect(fdx).toContain("<Text>INT. WORKSHOP - NIGHT</Text>");
    expect(fdx).toContain('<Paragraph Type="Character">');
    expect(fdx).toContain("<Text>MARCUS</Text>");
    expect(fdx).toContain('<Paragraph Type="Parenthetical">');
    expect(fdx).toContain("<Text>(whispering)</Text>");
    expect(fdx).toContain('<Paragraph Type="Dialogue">');
    expect(fdx).toContain("<Text>Is the render queue finished?</Text>");
    expect(fdx).toContain('<Paragraph Type="Transition">');
    expect(fdx).toContain("<Text>CUT TO:</Text>");
  });

  it("exports and round-trips Fountain format", () => {
    const fountain = exportToFountain(sampleDoc, "Episode 1");
    expect(fountain).toContain("INT. WORKSHOP - NIGHT");
    expect(fountain).toContain("MARCUS");
    expect(fountain).toContain("(whispering)");
    expect(fountain).toContain("Is the render queue finished?");

    const parsed = parseFountain(fountain);
    expect(parsed.content).toBeDefined();
    expect(parsed.content?.length).toBeGreaterThan(0);
    const sceneNode = parsed.content?.find((n) => n.type === "sceneHeading");
    expect(sceneNode).toBeDefined();
  });
});

describe("Page Theme Storage", () => {
  it("defaults to dark and preserves light mode in storage", async () => {
    const store = new Map<string, string>();
    const originalWindow = globalThis.window;
    const originalLocalStorage = globalThis.localStorage;

    (globalThis as Record<string, unknown>).window = {};
    (globalThis as Record<string, unknown>).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
      removeItem: (k: string) => store.delete(k)
    };

    try {
      const { getStoredPageTheme, setStoredPageTheme } = await import("../../lib/ScriptStorage");
      expect(getStoredPageTheme()).toBe("dark");

      setStoredPageTheme("light");
      expect(getStoredPageTheme()).toBe("light");

      setStoredPageTheme("dark");
      expect(getStoredPageTheme()).toBe("dark");
    } finally {
      (globalThis as Record<string, unknown>).window = originalWindow;
      (globalThis as Record<string, unknown>).localStorage = originalLocalStorage;
    }
  });
});
