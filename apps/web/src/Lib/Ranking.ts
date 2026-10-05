export function togglePick(picks: readonly string[], entryId: string, required: number): string[] {
    if (picks.includes(entryId)) {
        return picks.filter((pick) => pick !== entryId);
    }
    if (required === 1) {
        return [entryId];
    }
    return picks.length >= required ? [...picks] : [...picks, entryId];
}

export function movePick(picks: readonly string[], index: number, offset: number): string[] {
    const target = index + offset;
    if (index < 0 || index >= picks.length || target < 0 || target >= picks.length) {
        return [...picks];
    }
    const next = [...picks];
    const [moved] = next.splice(index, 1);
    if (moved !== undefined) {
        next.splice(target, 0, moved);
    }
    return next;
}

export function insertPickAt(picks: readonly string[], entryId: string, targetIndex: number, maxPicks: number): string[] {
    // remove existing occurrence if already picked
    const withoutEntry = picks.filter((pick) => pick !== entryId);
    const clampedIndex = Math.max(0, Math.min(targetIndex, withoutEntry.length));
    const next = [...withoutEntry];
    next.splice(clampedIndex, 0, entryId);
    return next.slice(0, maxPicks);
}

export function samePicks(left: readonly string[] | null, right: readonly string[]): boolean {
    return left !== null && left.length === right.length && left.every((pick, index) => right[index] === pick);
}
