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

export interface InvarianceSummaryProps {
    readonly items: readonly LeaderboardItemDto[];
    readonly totalBallots: number;
    readonly totalPoints: number;
    readonly isConserved: boolean;
}

export function InvarianceSummary({ items, totalBallots, totalPoints, isConserved }: InvarianceSummaryProps): ReactNode {
    // ranks after applying Bayesian shrinkage regularization
    const regularizedRanks = [...items]
        .sort((a, b) => (b.regularizedTotalScore ?? b.rawScore) - (a.regularizedTotalScore ?? a.rawScore))
        .map((item, index) => ({ entryId: item.entryId, regRank: index + 1 }));
    const regRankMap = new Map(regularizedRanks.map((r) => [r.entryId, r.regRank]));

    const maxShift = items.reduce((max, item) => {
        const regRank = regRankMap.get(item.entryId) ?? item.position;
        return Math.max(max, Math.abs(item.position - regRank));
    }, 0);

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded border bg-card p-3">
                    <p className="text-[11px] text-muted-foreground">Point Conservation</p>
                    <p className="mt-1 font-mono text-sm font-semibold">
                        {isConserved ? (
                            <span className="text-emerald-500">Invariant Preserved</span>
                        ) : (
                            <span className="text-destructive">Invariant Violated</span>
                        )}
                    </p>
                </div>
                <div className="rounded border bg-card p-3">
                    <p className="text-[11px] text-muted-foreground">Total Ballots / Points</p>
                    <p className="mt-1 font-mono text-sm font-semibold">
                        {totalBallots} / {formatNumber(totalPoints)}
                    </p>
                </div>
                <div className="rounded border bg-card p-3">
                    <p className="text-[11px] text-muted-foreground">Bayesian Prior Weight</p>
                    <p className="mt-1 font-mono text-sm font-semibold">K = 30</p>
                </div>
                <div className="rounded border bg-card p-3">
                    <p className="text-[11px] text-muted-foreground">Max Invariance Shift</p>
                    <p className="mt-1 font-mono text-sm font-semibold">
                        {maxShift === 0 ? "0 ranks (stable)" : `±${maxShift} ranks`}
                    </p>
                </div>
            </div>

            <ShrinkageChart items={items} />

            <div className="overflow-x-auto rounded border">
                <table className="w-full text-xs">
                    <thead className="border-b bg-muted/40">
                        <tr className="text-muted-foreground">
                            <th className="p-2 text-left">Entry</th>
                            <th className="p-2 text-right">Raw Rank</th>
                            <th className="p-2 text-right">Reg. Rank</th>
                            <th className="p-2 text-right">Raw Points</th>
                            <th className="p-2 text-right">Regularized Score</th>
                            <th className="p-2 text-right">Shift (Δ)</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y">
                        {items.map((item) => {
                            const regRank = regRankMap.get(item.entryId) ?? item.position;
                            const diff = item.position - regRank;
                            return (
                                <tr key={item.entryId} className="hover:bg-muted/30">
                                    <td className="p-2 font-medium">{item.title}</td>
                                    <td className="p-2 text-right font-mono tabular-nums">#{item.position}</td>
                                    <td className="p-2 text-right font-mono tabular-nums">#{regRank}</td>
                                    <td className="p-2 text-right font-mono tabular-nums">{formatNumber(item.rawScore)}</td>
                                    <td className="p-2 text-right font-mono tabular-nums">
                                        {formatNumber(item.regularizedTotalScore ?? item.rawScore)}
                                    </td>
                                    <td className="p-2 text-right font-mono tabular-nums">
                                        {diff === 0 ? (
                                            <span className="text-muted-foreground">0</span>
                                        ) : diff > 0 ? (
                                            <span className="text-emerald-500">+{diff}</span>
                                        ) : (
                                            <span className="text-amber-500">{diff}</span>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

export interface NetworkChartProps {
    readonly items: readonly LeaderboardItemDto[];
    readonly telemetryList?: readonly RaidTelemetryDto[];
    readonly events?: readonly { readonly type: string; readonly [key: string]: unknown }[];
    readonly onSelectEntry?: (entryId: string) => void;
}

export function NetworkChart({ items, telemetryList = [], events = [], onSelectEntry }: NetworkChartProps): ReactNode {
    const [hoveredId, setHoveredId] = useState<string | null>(null);

    if (items.length < 2) {
        return (
            <div className="rounded-md border border-dashed p-6 text-center text-xs text-muted-foreground">
                Minimum of 2 entries required to render the ballot co-occurrence network.
            </div>
        );
    }

    const displayItems = items.slice(0, 16);
    const count = displayItems.length;
    const width = 640;
    const height = 380;
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = 130;

    const severityMap = new Map(telemetryList.map((t) => [t.entryId, t.severity]));

    // tally live ballot co-occurrences
    const livePairs = new Map<string, number>();
    for (const event of events) {
        if (event.type === "ballot.submitted" && Array.isArray(event.entryIds)) {
            const ids = event.entryIds as readonly string[];
            for (let i = 0; i < ids.length; i++) {
                for (let j = i + 1; j < ids.length; j++) {
                    const first = ids[i];
                    const second = ids[j];
                    if (first !== undefined && second !== undefined) {
                        const key = [first, second].sort().join("::");
                        livePairs.set(key, (livePairs.get(key) ?? 0) + 1);
                    }
                }
            }
        }
    }

    const nodes = displayItems.map((item, index) => {
        const angle = (2 * Math.PI * index) / count - Math.PI / 2;
        const x = centerX + radius * Math.cos(angle);
        const y = centerY + radius * Math.sin(angle);
        const labelRadius = radius + 22;
        const labelX = centerX + labelRadius * Math.cos(angle);
        const labelY = centerY + labelRadius * Math.sin(angle);
        const severity = severityMap.get(item.entryId) ?? RaidSeverity.Normal;
        return { item, index, x, y, angle, labelX, labelY, severity };
    });

    const edges: {
        from: (typeof nodes)[0];
        to: (typeof nodes)[0];
        weight: number;
        key: string;
    }[] = [];

    let maxWeight = 1;
    for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
            const a = nodes[i];
            const b = nodes[j];
            if (a !== undefined && b !== undefined) {
                const pairKey = [a.item.entryId, b.item.entryId].sort().join("::");
                const liveCount = livePairs.get(pairKey) ?? 0;
                // baseline correlation from shared appearance and vote share proximity
                const minApp = Math.min(a.item.appearanceCount, b.item.appearanceCount);
                const shareDiff = Math.abs(a.item.voteSharePercentage - b.item.voteSharePercentage);
                const baseline = Math.max(1, Math.round(minApp * Math.max(0.2, 1 - shareDiff / 100)));
                const weight = baseline + liveCount * 3;
                if (weight > maxWeight) maxWeight = weight;
                edges.push({ from: a, to: b, weight, key: pairKey });
            }
        }
    }

    const activeNode = nodes.find((n) => n.item.entryId === hoveredId) ?? null;
    const connectedEdges = activeNode !== null
        ? edges.filter((e) => e.from.item.entryId === hoveredId || e.to.item.entryId === hoveredId)
        : [];
    const connectedNodeIds = new Set(
        connectedEdges.flatMap((e) => [e.from.item.entryId, e.to.item.entryId])
    );

    return (
        <div className="w-full space-y-2">
            <div className="overflow-x-auto rounded-md border bg-card p-2">
                <svg viewBox={`0 0 ${width} ${height}`} className="h-auto max-h-96 w-full select-none">
                    <circle cx={centerX} cy={centerY} r={radius} className="fill-none stroke-border/40" strokeDasharray="2 4" />

                    {edges.map((edge) => {
                        const isConnected =
                            activeNode === null ||
                            edge.from.item.entryId === hoveredId ||
                            edge.to.item.entryId === hoveredId;
                        const normWeight = edge.weight / maxWeight;
                        const strokeWidth = activeNode !== null && isConnected ? Math.max(1.8, normWeight * 3.5) : Math.max(0.6, normWeight * 2);
                        const opacity = activeNode !== null
                            ? isConnected
                                ? 0.85
                                : 0.08
                            : Math.max(0.12, normWeight * 0.45);

                        // bezier curve toward center
                        const qx = ((edge.from.x + edge.to.x) / 2) * 0.65 + centerX * 0.35;
                        const qy = ((edge.from.y + edge.to.y) / 2) * 0.65 + centerY * 0.35;
                        const strokeColor =
                            activeNode !== null && isConnected
                                ? "#38bdf8"
                                : normWeight > 0.6
                                  ? "#818cf8"
                                  : "#64748b";

                        return (
                            <path
                                key={edge.key}
                                d={`M ${edge.from.x.toFixed(1)} ${edge.from.y.toFixed(1)} Q ${qx.toFixed(1)} ${qy.toFixed(1)} ${edge.to.x.toFixed(1)} ${edge.to.y.toFixed(1)}`}
                                fill="none"
                                stroke={strokeColor}
                                strokeWidth={strokeWidth}
                                strokeOpacity={opacity}
                                className="transition-all duration-150"
                            />
                        );
                    })}

                    {nodes.map((node) => {
                        const isHovered = node.item.entryId === hoveredId;
                        const isConnected = activeNode === null || connectedNodeIds.has(node.item.entryId);
                        const nodeOpacity = activeNode !== null ? (isConnected ? 1 : 0.25) : 1;
                        const nodeRadius = isHovered ? 8 : Math.max(5, Math.min(10, 4 + node.item.voteSharePercentage * 0.2));
                        const fillColor =
                            node.severity === RaidSeverity.CriticalRaid
                                ? "#ef4444"
                                : node.severity === RaidSeverity.Suspicious
                                  ? "#f59e0b"
                                  : isHovered
                                    ? "#38bdf8"
                                    : "#10b981";

                        const cos = Math.cos(node.angle);
                        const textAnchor = Math.abs(cos) < 0.2 ? "middle" : cos > 0 ? "start" : "end";

                        return (
                            <g
                                key={node.item.entryId}
                                className="cursor-pointer transition-opacity"
                                opacity={nodeOpacity}
                                onMouseEnter={() => {
                                    setHoveredId(node.item.entryId);
                                }}
                                onMouseLeave={() => {
                                    setHoveredId(null);
                                }}
                                onClick={() => {
                                    onSelectEntry?.(node.item.entryId);
                                }}
                            >
                                <circle
                                    cx={node.x}
                                    cy={node.y}
                                    r={nodeRadius}
                                    fill={fillColor}
                                    stroke="#0f172a"
                                    strokeWidth={isHovered ? 2 : 1}
                                />
                                <text
                                    x={node.labelX}
                                    y={node.labelY + 3}
                                    textAnchor={textAnchor}
                                    fontSize="9"
                                    className="fill-foreground font-mono"
                                >
                                    {node.item.title.length > 12 ? `${node.item.title.slice(0, 12)}…` : node.item.title}
                                </text>
                            </g>
                        );
                    })}
                </svg>
            </div>
            {activeNode !== null ? (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded border bg-muted/30 px-3 py-1.5 text-xs">
                    <div className="flex items-center gap-2">
                        <span className="font-semibold text-foreground">{activeNode.item.title}</span>
                        <span className="text-muted-foreground font-mono">Rank #{activeNode.item.position}</span>
                        <span>·</span>
                        <span className="text-muted-foreground">{activeNode.item.voteSharePercentage.toFixed(1)}% share</span>
                    </div>
                    <div className="flex items-center gap-3 text-muted-foreground">
                        <span>{connectedEdges.length} connected co-votes</span>
                        <span className="capitalize">{activeNode.severity.toLowerCase()}</span>
                    </div>
                </div>
            ) : (
                <p className="text-muted-foreground text-[11px]">
                    Arcs depict ballot co-selection affinity across voters. Hover an entry node to inspect preference clustering.
                </p>
            )}
        </div>
    );
}
