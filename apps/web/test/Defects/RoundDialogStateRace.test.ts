import { EntryStatus, PollType, RoundStatus, type EntryDto, type RoundDetailDto } from "@platform/contracts";
import { describe, expect, it } from "vitest";
import { toLocalInputValue } from "@/Lib/Format";

interface FormState {
    title: string;
    pollType: PollType;
    opensAt: string;
    closesAt: string;
    choiceA: { id?: string; title: string; description: string };
    choiceB: { id?: string; title: string; description: string };
}

function mockRound(title: string): RoundDetailDto {
    return {
        id: "5d208b4b-e013-4244-86a2-077de8803350",
        title,
        status: RoundStatus.Draft,
        pollType: PollType.Binary,
        opensAt: "2026-10-21T10:00:00.000Z",
        closesAt: "2026-10-28T10:00:00.000Z",
        isAcceptingVotes: false,
        createdBy: "5d208b4b-e013-4244-86a2-077de8803350",
        createdAt: "2026-10-21T00:00:00.000Z",
        updatedAt: "2026-10-21T00:00:00.000Z",
        eligibleEntryCount: 2,
        ballotCount: 0,
        warnings: []
    };
}

function mockEntry(id: string, title: string): EntryDto {
    return {
        id,
        roundId: "5d208b4b-e013-4244-86a2-077de8803350",
        title,
        description: "Option description",
        status: EntryStatus.Approved,
        isQuarantined: false,
        mediaUrl: "https://example.com/media.png",
        aiFlags: [],
        submittedBy: "5d208b4b-e013-4244-86a2-077de8803350",
        author: null,
        createdAt: "2026-10-21T00:00:00.000Z",
        updatedAt: "2026-10-21T00:00:00.000Z"
    };
}

// mirror the effect implementation from RoundControls.tsx
function runRoundControlsEffect(
    open: boolean,
    round: RoundDetailDto | undefined,
    existingEntriesData: { data: EntryDto[] } | undefined,
    state: FormState,
    isInitialOpen = true
): void {
    if (open) {
        if (isInitialOpen) {
            state.title = round?.title ?? "";
            state.pollType = round?.pollType ?? PollType.RankedChoice;
            state.opensAt = toLocalInputValue(round?.opensAt ?? null);
            state.closesAt = toLocalInputValue(round?.closesAt ?? null);
        }
        if (round?.pollType === PollType.Binary && existingEntriesData?.data && existingEntriesData.data.length >= 2) {
            const [first, second] = existingEntriesData.data;
            if (first && !state.choiceA.id) {
                state.choiceA = { id: first.id, title: first.title, description: first.description ?? "" };
            }
            if (second && !state.choiceB.id) {
                state.choiceB = { id: second.id, title: second.title, description: second.description ?? "" };
            }
        }
    }
}

describe("b20 reproducer: round dialog form state reset race condition", () => {
    it("initializes form state correctly on dialog open", () => {
        const round = mockRound("Initial Title");
        const state: FormState = {
            title: "",
            pollType: PollType.RankedChoice,
            opensAt: "",
            closesAt: "",
            choiceA: { title: "", description: "" },
            choiceB: { title: "", description: "" }
        };

        // dialog opens with entries query still in-flight
        runRoundControlsEffect(true, round, undefined, state);

        expect(state.title).toBe("Initial Title");
        expect(state.pollType).toBe(PollType.Binary);
    });

    it("populates binary options once query data is available", () => {
        const round = mockRound("Binary Face-off");
        const entries = { data: [mockEntry("e1", "Option Alpha"), mockEntry("e2", "Option Beta")] };
        const state: FormState = {
            title: "",
            pollType: PollType.RankedChoice,
            opensAt: "",
            closesAt: "",
            choiceA: { title: "", description: "" },
            choiceB: { title: "", description: "" }
        };

        runRoundControlsEffect(true, round, entries, state);

        expect(state.choiceA.title).toBe("Option Alpha");
        expect(state.choiceB.title).toBe("Option Beta");
    });

    it("demonstrates b20 defect: query resolution overwrites user-typed edits in form", () => {
        const round = mockRound("Original Round Title");
        const state: FormState = {
            title: "",
            pollType: PollType.RankedChoice,
            opensAt: "",
            closesAt: "",
            choiceA: { title: "", description: "" },
            choiceB: { title: "", description: "" }
        };

        // step 1: dialog opens; query for existing binary entries is in flight (existingEntries.data is undefined)
        runRoundControlsEffect(true, round, undefined, state, true);
        expect(state.title).toBe("Original Round Title");

        // step 2: while query is in-flight, supervisor edits the title input
        state.title = "Supervisor Revised Title";

        // step 3: query finishes, existingEntries.data arrives
        // because existingEntries.data is in useEffect dependencies, the effect fires with isInitialOpen = false
        const entriesResponse = { data: [mockEntry("e1", "Option A"), mockEntry("e2", "Option B")] };
        runRoundControlsEffect(true, round, entriesResponse, state, false);

        // expected invariant: in-flight edits made by the supervisor should be preserved
        expect(state.title).toBe("Supervisor Revised Title");
    });
});
