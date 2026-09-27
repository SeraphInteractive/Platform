import { getPickWeight, PollType, type ScoringScheme } from "./ScoringScheme.js";
import { RaidFlag, RaidSeverity, type EntryScoreBreakdown, type RaidTelemetry } from "./Types.js";

export const minimumAppearancesForRaidFlag = 10;

export const raidSeverityThresholds = Object.freeze({
    suspicious: 0.4,
    critical: 0.75
});

const defaultSkewEpsilon = 1;
const velocityOnlyWeight = 0.6;
const windowsPerHour = 12;

export interface RaidAnalysisOptions {
    readonly minimumAppearances?: number;
    readonly skewEpsilon?: number;
}

export function calculateSkewRatio(breakdown: EntryScoreBreakdown, scheme: ScoringScheme, epsilon: number = defaultSkewEpsilon): number {
    const safeEpsilon = Math.max(1e-6, Number.isFinite(epsilon) ? epsilon : defaultSkewEpsilon);
    const { topRankPoints, lowerRankPoints } = splitPoints(breakdown, scheme);
    return (topRankPoints + safeEpsilon) / (lowerRankPoints + safeEpsilon);
}

export function calculateRankEntropy(breakdown: EntryScoreBreakdown): number {
    const positions = breakdown.rankCounts.length;
    if (breakdown.appearanceCount === 0 || positions < 2) {
        return 1;
    }

    const smoothing = 0.01;
    const smoothed = breakdown.rankCounts.map((count) => count + smoothing);
    const total = smoothed.reduce((sum, value) => sum + value, 0);
    const entropy =
        -smoothed.reduce((sum, value) => {
            const probability = value / total;
            return sum + probability * Math.log(probability);
        }, 0) / Math.log(positions);

    return Math.min(1, Math.max(0, entropy));
}

export function analyzeRaidRisk(
    breakdown: EntryScoreBreakdown,
    velocityZScore: number,
    scheme: ScoringScheme,
    options: RaidAnalysisOptions = {}
): RaidTelemetry {
    const minimumAppearances = options.minimumAppearances ?? minimumAppearancesForRaidFlag;
    const velocity = Number.isFinite(velocityZScore) ? velocityZScore : 0;
    const isRanked = scheme.pollType === PollType.RankedChoice;
    const skewRatio = isRanked ? calculateSkewRatio(breakdown, scheme, options.skewEpsilon) : 1;
    const rankEntropy = isRanked ? calculateRankEntropy(breakdown) : 1;
    const { topRankPoints, lowerRankPoints } = splitPoints(breakdown, scheme);
    const topRankCount = breakdown.rankCounts[0] ?? 0;
    const topRankShare = breakdown.appearanceCount > 0 ? topRankCount / breakdown.appearanceCount : 0;
    const summary = { topRankPoints, lowerRankPoints, topRankShare };

    if (breakdown.appearanceCount < minimumAppearances) {
        return {
            entryId: breakdown.entryId,
            skewRatio,
            rankEntropy,
            velocityZScore: velocity,
            compositeScore: 0,
            severity: RaidSeverity.Normal,
            flags: [RaidFlag.InsufficientSampleSize],
            breakdown: summary
        };
    }

    const flags: RaidFlag[] = [];
    const velocityComponent = velocity > 1 ? Math.min(1, (velocity - 1) / 3) : 0;
    let compositeScore = velocityOnlyWeight * velocityComponent;

    if (isRanked) {
        const skewComponent = skewRatio > 1.5 ? Math.min(1, (skewRatio - 1.5) / 3.5) : 0;
        const entropyComponent = Math.max(0, 1 - rankEntropy);
        compositeScore = Math.min(1, 0.45 * skewComponent + 0.35 * entropyComponent + 0.2 * velocityComponent);
        if (skewRatio >= 3) {
            flags.push(RaidFlag.UnnaturalRank1HyperSkew);
        }
        if (rankEntropy < 0.65 && topRankShare > 0.7) {
            flags.push(RaidFlag.CollapsedRankEntropy);
        }
    }

    if (velocity >= 2.5) {
        flags.push(RaidFlag.AnomalousVelocityBurst);
    }

    return {
        entryId: breakdown.entryId,
        skewRatio,
        rankEntropy,
        velocityZScore: velocity,
        compositeScore,
        severity: classifySeverity(compositeScore),
        flags,
        breakdown: summary
    };
}

export function calculateVelocityZScore(recentCount: number, trailingHourCount: number): number {
    const baselinePerWindow = Math.max(0, trailingHourCount - recentCount) / (windowsPerHour - 1);
    if (baselinePerWindow === 0) {
        // no preceding baseline history to evaluate velocity burst against
        return 0;
    }
    return (recentCount - baselinePerWindow) / Math.max(1, Math.sqrt(baselinePerWindow));
}

function classifySeverity(compositeScore: number): RaidSeverity {
    if (compositeScore >= raidSeverityThresholds.critical) {
        return RaidSeverity.CriticalRaid;
    }
    if (compositeScore >= raidSeverityThresholds.suspicious) {
        return RaidSeverity.Suspicious;
    }
    return RaidSeverity.Normal;
}

function splitPoints(breakdown: EntryScoreBreakdown, scheme: ScoringScheme): { topRankPoints: number; lowerRankPoints: number } {
    let topRankPoints = 0;
    let lowerRankPoints = 0;
    breakdown.rankCounts.forEach((count, position) => {
        const points = count * getPickWeight(scheme, position);
        if (position === 0) {
            topRankPoints += points;
        } else {
            lowerRankPoints += points;
        }
    });
    return { topRankPoints, lowerRankPoints };
}
