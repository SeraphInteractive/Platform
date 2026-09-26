export type EntryId = string;

export type VoterId = string;

export interface Ballot {
    readonly voterId: VoterId;
    readonly picks: readonly EntryId[];
}

export interface EntryScoreBreakdown {
    readonly entryId: EntryId;
    readonly rankCounts: readonly number[];
    readonly appearanceCount: number;
    readonly rawScore: number;
    readonly voteSharePercentage: number;
}

export interface EntryMoments {
    readonly entryId: EntryId;
    readonly rankProbabilities: readonly number[];
    readonly omissionProbability: number;
    readonly expectedScorePerVoter: number;
    readonly secondMoment: number;
    readonly singleBallotVariance: number;
    readonly totalVariance: number;
    readonly standardDeviation: number;
}

export enum SeparationStatus {
    DecisiveLead = "DECISIVE_LEAD",
    StatisticalTie = "STATISTICAL_TIE"
}

export enum SeparationAction {
    DeclareWinner = "DECLARE_WINNER",
    TieredRunoff = "TIERED_RUNOFF"
}

export interface PairwiseSeparation {
    readonly entryA: EntryId;
    readonly entryB: EntryId;
    readonly deltaScore: number;
    readonly varianceA: number;
    readonly varianceB: number;
    readonly covarianceAB: number;
    readonly deltaVariance: number;
    readonly standardError: number;
    readonly zScore: number;
    readonly pValue: number;
    readonly status: SeparationStatus;
    readonly recommendedAction: SeparationAction;
}

export interface BayesianShrinkageResult {
    readonly entryId: EntryId;
    readonly rawScore: number;
    readonly appearances: number;
    readonly priorK: number;
    readonly globalMean: number;
    readonly regularizedMeanScore: number;
    readonly regularizedTotalScore: number;
}

export enum RaidSeverity {
    Normal = "NORMAL",
    Suspicious = "SUSPICIOUS",
    CriticalRaid = "CRITICAL_RAID"
}

export enum RaidFlag {
    InsufficientSampleSize = "INSUFFICIENT_SAMPLE_SIZE",
    UnnaturalRank1HyperSkew = "UNNATURAL_RANK1_HYPER_SKEW",
    CollapsedRankEntropy = "COLLAPSED_RANK_ENTROPY",
    AnomalousVelocityBurst = "ANOMALOUS_VELOCITY_BURST"
}

export interface RaidTelemetry {
    readonly entryId: EntryId;
    readonly skewRatio: number;
    readonly rankEntropy: number;
    readonly velocityZScore: number;
    readonly compositeScore: number;
    readonly severity: RaidSeverity;
    readonly flags: readonly RaidFlag[];
    readonly breakdown: {
        readonly topRankPoints: number;
        readonly lowerRankPoints: number;
        readonly topRankShare: number;
    };
}
