"use client";

import { RaidSeverity, type LeaderboardItemDto, type RaidTelemetryDto } from "@platform/contracts";
import { useState, type ReactNode } from "react";
import { formatNumber } from "@/Lib/Format";

interface ScatterChartProps {
    readonly telemetryList: readonly RaidTelemetryDto[];
    readonly leaderboardItems?: readonly LeaderboardItemDto[];
    readonly onHover?: (item: RaidTelemetryDto | null) => void;
    readonly hovered?: RaidTelemetryDto | null;
}

export function ScatterChart({ telemetryList, leaderboardItems = [], onHover, hovered }: ScatterChartProps): ReactNode {
    const [localHovered, setLocalHovered] = useState<RaidTelemetryDto | null>(null);
    const activeHover = hovered !== undefined ? hovered : localHovered;
    const setActiveHover = onHover ?? setLocalHovered;

    const width = 640;
    const height = 240;
    const padding = 38;
    const minX = -2;
    const maxX = 8;
    const minY = 0.0;
    const maxY = 1.0;

    const scaleX = (val: number): number => padding + ((val - minX) / (maxX - minX)) * (width - 2 * padding);
    const scaleY = (val: number): number => height - padding - ((val - minY) / (maxY - minY)) * (height - 2 * padding);

    // fallback synthetic points from leaderboard when telemetry records have not triggered yet
    const points: readonly RaidTelemetryDto[] =
        telemetryList.length > 0
            ? telemetryList
            : leaderboardItems.map((item, index) => ({
                  id: `synthetic-${index}`,
                  entryId: item.entryId,
                  roundId: "",
                  compositeScore: 0.1,
                  severity: RaidSeverity.Normal,
                  skewRatio: 1.0,
                  rankEntropy: Math.max(0.2, 0.85 - index * 0.08),
                  velocityZScore: 0.4 + index * 0.35,
                  flags: [],
                  breakdown: {
                      topRankPoints: Math.round(item.rawScore * (item.voteSharePercentage / 100)),
                      lowerRankPoints: Math.round(item.rawScore * (1 - item.voteSharePercentage / 100)),
                      topRankShare: item.voteSharePercentage / 100
                  },
                  createdAt: new Date().toISOString()
              }));

    return (
        <div className="w-full space-y-2">
            <div className="overflow-x-auto rounded-md border bg-card p-2">
                <svg viewBox={`0 0 ${width} ${height}`} className="h-auto max-h-64 w-full select-none">
                    {/* threat zone box */}
                    <rect
                        x={scaleX(2.5)}
                        y={scaleY(0.35)}
                        width={scaleX(maxX) - scaleX(2.5)}
                        height={scaleY(0.0) - scaleY(0.35)}
                        className="fill-destructive/15 stroke-destructive/40"
                        strokeDasharray="3 3"
                    />
                    <text
                        x={scaleX(maxX) - 6}
                        y={scaleY(0.0) - 8}
                        textAnchor="end"
                        fontSize="9"
                        className="fill-destructive font-mono font-semibold"
                    >
                        THREAT ZONE (Z &gt; 2.5, H &lt; 0.35)
                    </text>

                    {/* axes */}
                    <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} className="stroke-border" />
                    <line x1={padding} y1={padding} x2={padding} y2={height - padding} className="stroke-border" />

                    {/* x ticks */}
                    {[-2, 0, 2, 4, 6, 8].map((tick) => (
                        <g key={tick}>
                            <line
                                x1={scaleX(tick)}
                                y1={height - padding}
                                x2={scaleX(tick)}
                                y2={height - padding + 4}
                                className="stroke-muted-foreground/60"
                            />
                            <text
                                x={scaleX(tick)}
                                y={height - padding + 14}
                                fontSize="9"
                                textAnchor="middle"
                                className="fill-muted-foreground font-mono"
                            >
                                {tick}
                            </text>
                        </g>
                    ))}

                    {/* y ticks */}
                    {[0.0, 0.5, 1.0].map((tick) => (
                        <g key={tick}>
                            <line
                                x1={padding - 4}
                                y1={scaleY(tick)}
                                x2={padding}
                                y2={scaleY(tick)}
                                className="stroke-muted-foreground/60"
                            />
                            <text
                                x={padding - 6}
                                y={scaleY(tick) + 3}
                                fontSize="9"
                                textAnchor="end"
                                className="fill-muted-foreground font-mono"
                            >
                                {tick.toFixed(1)}
                            </text>
                        </g>
                    ))}

                    <text x={width / 2} y={height - 4} fontSize="10" textAnchor="middle" className="fill-muted-foreground">
                        Velocity Z-Score &rarr;
                    </text>
                    <text
                        x={-height / 2}
                        y={12}
                        transform="rotate(-90)"
                        fontSize="10"
                        textAnchor="middle"
                        className="fill-muted-foreground"
                    >
                        Rank Entropy (H) &rarr;
                    </text>

                    {/* points */}
                    {points.map((p) => {
                        const cx = scaleX(p.velocityZScore);
                        const cy = scaleY(p.rankEntropy);
                        const isSelected = activeHover?.entryId === p.entryId;
                        const fillColor =
                            p.severity === RaidSeverity.CriticalRaid
                                ? "#ef4444"
                                : p.severity === RaidSeverity.Suspicious
                                  ? "#f59e0b"
                                  : "#10b981";

                        return (
                            <g
                                key={p.id}
                                onMouseEnter={() => {
                                    setActiveHover(p);
                                }}
                                onMouseLeave={() => {
                                    setActiveHover(null);
                                }}
                                className="cursor-pointer transition-transform"
                            >
                                <circle
                                    cx={cx}
                                    cy={cy}
                                    r={isSelected ? 6 : 4}
                                    fill={fillColor}
                                    stroke="#1e293b"
                                    strokeWidth={isSelected ? 2 : 1}
                                />
                                <text x={cx + 7} y={cy + 3} fontSize="9" className="fill-foreground font-mono">
                                    {p.entryId.slice(0, 6)}
                                </text>
                            </g>
                        );
                    })}
                </svg>
            </div>
            {activeHover !== null && (
                <div className="flex flex-wrap items-center gap-3 rounded border bg-muted/30 px-3 py-1.5 text-xs">
                    <span className="font-mono font-medium">Entry: {activeHover.entryId.slice(0, 8)}</span>
                    <span>Z: {formatNumber(activeHover.velocityZScore)}</span>
                    <span>H: {formatNumber(activeHover.rankEntropy, 3)}</span>
                    <span>Skew: {formatNumber(activeHover.skewRatio)}</span>
                    <span className="capitalize text-muted-foreground">Severity: {activeHover.severity}</span>
                </div>
            )}
        </div>
    );
}

interface ShrinkageChartProps {
    readonly items: readonly LeaderboardItemDto[];
}

export function ShrinkageChart({ items }: ShrinkageChartProps): ReactNode {
    if (items.length === 0) {
        return <p className="text-muted-foreground text-xs">No entries to display.</p>;
    }

    const width = 640;
    const height = 220;
    const padding = 38;

    const maxRaw = Math.max(...items.map((i) => i.rawScore), 10);
    const maxReg = Math.max(...items.map((i) => i.regularizedMeanScore ?? i.rawScore), 10);
    const maxVal = Math.max(maxRaw, maxReg) * 1.15;

    const scaleX = (val: number): number => padding + (val / maxVal) * (width - 2 * padding);
    const scaleY = (val: number): number => height - padding - (val / maxVal) * (height - 2 * padding);

    return (
        <div className="w-full space-y-2">
            <div className="overflow-x-auto rounded-md border bg-card p-2">
                <svg viewBox={`0 0 ${width} ${height}`} className="h-auto max-h-60 w-full select-none">
                    {/* parity 45-degree line */}
                    <line
                        x1={scaleX(0)}
                        y1={scaleY(0)}
                        x2={scaleX(maxVal)}
                        y2={scaleY(maxVal)}
                        className="stroke-muted-foreground/40"
                        strokeDasharray="3 3"
                    />

                    {/* axes */}
                    <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} className="stroke-border" />
                    <line x1={padding} y1={padding} x2={padding} y2={height - padding} className="stroke-border" />

                    <text x={width / 2} y={height - 4} fontSize="10" textAnchor="middle" className="fill-muted-foreground">
                        Raw Points &rarr;
                    </text>
                    <text
                        x={-height / 2}
                        y={12}
                        transform="rotate(-90)"
                        fontSize="10"
                        textAnchor="middle"
                        className="fill-muted-foreground"
                    >
                        Regularized Score &rarr;
                    </text>

                    {items.map((item) => {
                        const x = scaleX(item.rawScore);
                        const reg = item.regularizedMeanScore ?? item.rawScore;
                        const y = scaleY(reg);
                        const parityY = scaleY(item.rawScore);

                        return (
                            <g key={item.entryId}>
                                {/* shrinkage vertical drop line to parity */}
                                <line x1={x} y1={parityY} x2={x} y2={y} stroke="#3b82f6" strokeWidth="1.5" strokeDasharray="2 2" />
                                <circle cx={x} cy={y} r={4.5} fill="#10b981" stroke="#1e293b" strokeWidth="1" />
                                <text x={x + 6} y={y + 3} fontSize="9" className="fill-foreground font-mono">
                                    {item.title.length > 14 ? `${item.title.slice(0, 14)}..` : item.title}
                                </text>
                            </g>
                        );
                    })}
                </svg>
            </div>
            <p className="text-muted-foreground text-[11px]">
                Dashed vertical lines depict Bayesian shrinkage toward the prior mean to mitigate small-sample volatility.
            </p>
        </div>
    );
}
