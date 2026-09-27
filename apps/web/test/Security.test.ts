import { describe, expect, it } from "vitest";
import { isSafePath, safePathOr } from "@/Lib/SafePath";
import { safeHttpUrl } from "@/Lib/SafeUrl";
import { isProxyablePath } from "@/Server/ProxyPolicy";

describe("return paths", () => {
    it.each(["/", "/voting", "/voting/2ebf4344-8be0-450d-9b16-71df5952a8b2", "/grabbox"])("accepts %s", (path) => {
        expect(isSafePath(path)).toBe(true);
    });

    it.each([
        "//evil.example",
        "/\\evil.example",
        "https://evil.example",
        "javascript:alert(1)",
        "voting",
        "/a//b",
        "/%2F%2Fevil.example",
        "/%5Cevil",
        "/grabbox?shotId=1",
        "",
        `/${"a".repeat(600)}`
    ])("rejects %s", (path) => {
        expect(isSafePath(path)).toBe(false);
    });

    it("falls back when unsafe", () => {
        expect(safePathOr("//evil.example")).toBe("/");
        expect(safePathOr(null, "/voting")).toBe("/voting");
        expect(safePathOr("/progress")).toBe("/progress");
    });
});

describe("external urls", () => {
    it("keeps http and https links", () => {
        expect(safeHttpUrl("https://cdn.example/a.png")).toBe("https://cdn.example/a.png");
        expect(safeHttpUrl("http://localhost:3334/x")).toBe("http://localhost:3334/x");
    });

    it.each(["javascript:alert(1)", "data:text/html,<script>alert(1)</script>", "vbscript:x", "not a url", "//cdn.example/a"])(
        "drops %s",
        (value) => {
            expect(safeHttpUrl(value)).toBeNull();
        }
    );

    it("passes null through", () => {
        expect(safeHttpUrl(null)).toBeNull();
    });
});

describe("api proxy policy", () => {
    it.each([
        [["rounds"]],
        [["rounds", "2ebf4344-8be0-450d-9b16-71df5952a8b2", "ballots", "me"]],
        [["shots", "reclaim-expired"]],
        [["users", "by-discord", "200000000000000001", "role"]]
    ])("forwards %j", (segments) => {
        expect(isProxyablePath(segments)).toBe(true);
    });

    it.each([
        [[]],
        [["auth", "me"]],
        [["auth", "token"]],
        [["auth", "discord"]],
        [["notifications", "stream"]],
        [[".."]],
        [["rounds", ".."]],
        [["rounds", "a/b"]],
        [["rounds", "a%2Fb"]],
        [["rounds", "a.b"]],
        [["a", "b", "c", "d", "e", "f", "g", "h", "i"]]
    ])("blocks %j", (segments) => {
        expect(isProxyablePath(segments)).toBe(false);
    });
});
