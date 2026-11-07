import type { AutocompleteInteraction } from "discord.js";
import { describe, expect, it, vi } from "vitest";
import { takeTaskCommand } from "../../src/Commands/TaskCommands.js";

// b11: autocomplete 100-page sequential loop triggering 3-second discord interaction timeout
describe("b11: TaskCommands autocomplete pagination latency", () => {
    it("must not call unpaginated listAllShots() on every autocomplete keystroke", async () => {
        const mockInteraction = {
            options: {
                getFocused: vi.fn().mockReturnValue("lighting")
            },
            respond: vi.fn().mockResolvedValue(undefined)
        } as unknown as AutocompleteInteraction;

        const mockApi = {
            listAllShots: vi.fn().mockResolvedValue([{ id: "shot-1", shotCode: "SC01_A1", title: "Key Lighting", status: "available" }]),
            searchShots: vi.fn().mockResolvedValue([{ id: "shot-1", shotCode: "SC01_A1", title: "Key Lighting", status: "available" }])
        };

        const mockContext = {
            api: mockApi
        };

        await takeTaskCommand.autocomplete!(mockInteraction, mockContext as never);

        // autocomplete has a strict 3s deadline; it must never call listAllShots() which loops up to 100 pages
        // it must use cached data or a single filtered search query
        expect(mockApi.listAllShots).not.toHaveBeenCalled();
    });

    it("must not perform multi-page sequential http loops during autocomplete", async () => {
        const mockInteraction = {
            options: {
                getFocused: vi.fn().mockReturnValue("anim")
            },
            respond: vi.fn().mockResolvedValue(undefined)
        } as unknown as AutocompleteInteraction;

        let requestCount = 0;
        // simulate platform api client looping over pages when totalPages is high
        const mockApi = {
            listAllShots: vi.fn().mockImplementation(async () => {
                const results = [];
                for (let page = 1; page <= 50; page++) {
                    requestCount++;
                    results.push({ id: `shot-${page}`, shotCode: `SC01_${page}`, title: `Anim ${page}` });
                }
                return results;
            })
        };

        const mockContext = {
            api: mockApi
        };

        await takeTaskCommand.autocomplete!(mockInteraction, mockContext as never);

        // autocomplete interaction must complete with at most 1 network roundtrip
        expect(requestCount).toBeLessThanOrEqual(1);
    });
});
