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
                    <p className="mt-1 font-mono text-sm font-semibold">{maxShift === 0 ? "0 ranks (stable)" : `±${maxShift} ranks`}</p>
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

import {
    Activity,
    CheckCircle2,
    AlertTriangle,
    XCircle,
    Play,
    Pause,
    RefreshCw,
    Server,
    Database,
    Layers,
    Radio,
    Vote,
    Briefcase,
    ShieldCheck,
    FileText
} from "lucide-react";
import { useEffect, useRef, useCallback } from "react";
import { Button } from "@/Components/Ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/Components/Ui/card";

export type EndpointHealthStatus = "operational" | "degraded" | "down" | "probing";

export interface LatencySample {
    readonly timestamp: number;
    readonly latencyMs: number;
    readonly statusCode: number | null;
    readonly ok: boolean;
}

export interface MonitoredEndpoint {
    readonly id: string;
    readonly name: string;
    readonly group: "infrastructure" | "public";
    readonly path: string;
    readonly tag: string;
    readonly description: string;
    readonly icon: typeof Server;
    readonly history: readonly LatencySample[];
    readonly currentLatency: number | null;
    readonly avgLatency: number | null;
    readonly minLatency: number | null;
    readonly maxLatency: number | null;
    readonly lastStatusCode: number | null;
    readonly status: EndpointHealthStatus;
}

const INITIAL_ENDPOINTS: readonly Omit<
    MonitoredEndpoint,
    "history" | "currentLatency" | "avgLatency" | "minLatency" | "maxLatency" | "lastStatusCode" | "status"
>[] = [
    {
        id: "core-liveness",
        name: "API Core Gateway",
        group: "infrastructure",
        path: "/api/v1/health/live",
        tag: "CORE CONTAINER",
        description: "HTTP event loop & container liveness probe",
        icon: Server
    },
    {
        id: "postgres-db",
        name: "PostgreSQL Database",
        group: "infrastructure",
        path: "/api/v1/health/detailed",
        tag: "PRIMARY DATASTORE",
        description: "Connection pool & query execution latency",
        icon: Database
    },
    {
        id: "redis-cache",
        name: "Redis Store",
        group: "infrastructure",
        path: "/api/v1/health/detailed",
        tag: "KEY-VALUE CACHE",
        description: "In-memory sessions & rate-limit buckets",
        icon: Layers
    },
    {
        id: "cluster-ready",
        name: "Cluster Readiness",
        group: "infrastructure",
        path: "/api/v1/health/ready",
        tag: "BACKEND READINESS",
        description: "Service mesh & backend health probe",
        icon: Radio
    },
    {
        id: "voting-rounds",
        name: "Voting Rounds Feed",
        group: "public",
        path: "/api/v1/rounds?page=1&perPage=1",
        tag: "PUBLIC VOTING",
        description: "Active election & balloting queries",
        icon: Vote
    },
    {
        id: "grabbox-tasks",
        name: "Grab-Box Tasks Feed",
        group: "public",
        path: "/api/v1/shots?status=available&page=1&perPage=1",
        tag: "PUBLIC WORK",
        description: "Available contributor task queue",
        icon: Briefcase
    },
    {
        id: "auth-session",
        name: "Session Gateway",
        group: "public",
        path: "/api/session",
        tag: "AUTH & IDENTITY",
        description: "Cookie token validation & user profile",
        icon: ShieldCheck
    },
    {
        id: "legal-docs",
        name: "Legal Documents",
        group: "public",
        path: "/api/v1/documents/terms",
        tag: "STATIC CACHE",
        description: "Guidelines & terms publication outlet",
        icon: FileText
    }
];

function LatencySparkline({
    history,
    status
}: {
    readonly history: readonly LatencySample[];
    readonly status: EndpointHealthStatus;
}): ReactNode {
    const width = 240;
    const height = 54;
    const padding = 6;

    if (history.length < 2) {
        return (
            <div className="flex h-[54px] w-full items-center justify-center rounded border border-dashed border-border/40 text-[10px] text-muted-foreground">
                Collecting latency stream…
            </div>
        );
    }

    const latencies = history.map((s) => (s.ok ? s.latencyMs : 0));
    const maxVal = Math.max(80, ...latencies) * 1.2;
    const count = history.length;

    const scaleX = (index: number): number => padding + (index / (count - 1)) * (width - 2 * padding);
    const scaleY = (val: number): number => height - padding - (Math.min(val, maxVal) / maxVal) * (height - 2 * padding);

    const points = history.map((sample, idx) => ({
        x: scaleX(idx),
        y: sample.ok ? scaleY(sample.latencyMs) : height - padding,
        sample
    }));

    const pathD = points.reduce((acc, p, idx) => `${acc} ${idx === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`, "");
    const lastP = points.at(-1);
    const firstP = points[0];
    const areaD =
        lastP !== undefined && firstP !== undefined
            ? `${pathD} L ${lastP.x.toFixed(1)} ${(height - padding).toFixed(1)} L ${firstP.x.toFixed(1)} ${(height - padding).toFixed(1)} Z`
            : "";

    const strokeColor =
        status === "down" ? "#ef4444" : status === "degraded" ? "#f59e0b" : "#10b981";
    const gradientId = `grad-${status}-${Math.random().toString(36).slice(2, 7)}`;

    return (
        <div className="relative w-full overflow-hidden rounded bg-muted/20">
            <svg viewBox={`0 0 ${width} ${height}`} className="h-[54px] w-full select-none">
                <defs>
                    <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={strokeColor} stopOpacity="0.28" />
                        <stop offset="100%" stopColor={strokeColor} stopOpacity="0.0" />
                    </linearGradient>
                </defs>

                {/* 50ms / 100ms guide line */}
                {maxVal > 50 && (
                    <line
                        x1={padding}
                        y1={scaleY(50)}
                        x2={width - padding}
                        y2={scaleY(50)}
                        stroke="currentColor"
                        strokeOpacity="0.12"
                        strokeDasharray="2 2"
                    />
                )}

                {areaD && <path d={areaD} fill={`url(#${gradientId})`} />}
                <path d={pathD} fill="none" stroke={strokeColor} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />

                {lastP !== undefined && (
                    <g>
                        <circle cx={lastP.x} cy={lastP.y} r="3" fill={strokeColor} />
                        <circle cx={lastP.x} cy={lastP.y} r="6" fill="none" stroke={strokeColor} strokeOpacity="0.4" />
                    </g>
                )}
            </svg>
        </div>
    );
}

export function NetworkMonitor(): ReactNode {
    const [endpoints, setEndpoints] = useState<readonly MonitoredEndpoint[]>(() =>
        INITIAL_ENDPOINTS.map((ep) => ({
            ...ep,
            history: [],
            currentLatency: null,
            avgLatency: null,
            minLatency: null,
            maxLatency: null,
            lastStatusCode: null,
            status: "probing"
        }))
    );

    const [isStreaming, setIsStreaming] = useState<boolean>(true);
    const [isPinging, setIsPinging] = useState<boolean>(false);
    const [lastPingTime, setLastPingTime] = useState<Date | null>(null);
    const isPingingRef = useRef(false);

    const runProbeCycle = useCallback(async () => {
        if (isPingingRef.current) return;
        isPingingRef.current = true;
        setIsPinging(true);

        const now = Date.now();
        const timeoutMs = 3000;

        // concurrent probe dispatch
        const probeResults = new Map<string, { latencyMs: number; statusCode: number | null; ok: boolean }>();

        await Promise.allSettled(
            INITIAL_ENDPOINTS.map(async (endpoint) => {
                const controller = new AbortController();
                const timer = setTimeout(() => controller.abort(), timeoutMs);
                const startTime = performance.now();

                try {
                    const response = await fetch(endpoint.path, {
                        method: "GET",
                        headers: { Accept: "application/json" },
                        credentials: "same-origin",
                        cache: "no-store",
                        signal: controller.signal
                    });
                    clearTimeout(timer);
                    const elapsed = Math.round((performance.now() - startTime) * 10) / 10;

                    // extract internal server-side probe latencies when detailed health is fetched
                    if (endpoint.id === "postgres-db" || endpoint.id === "redis-cache") {
                        try {
                            const json = await response.clone().json();
                            if (endpoint.id === "postgres-db" && json?.database?.status === "ok") {
                                probeResults.set(endpoint.id, {
                                    latencyMs: Number(json.database.latencyMs) || elapsed,
                                    statusCode: response.status,
                                    ok: true
                                });
                                return;
                            }
                            if (endpoint.id === "redis-cache" && json?.redis?.status === "ok") {
                                probeResults.set(endpoint.id, {
                                    latencyMs: Number(json.redis.latencyMs) || elapsed,
                                    statusCode: response.status,
                                    ok: true
                                });
                                return;
                            }
                        } catch {
                            // fall back to client round-trip timing
                        }
                    }

                    probeResults.set(endpoint.id, {
                        latencyMs: elapsed,
                        statusCode: response.status,
                        ok: response.ok
                    });
                } catch {
                    clearTimeout(timer);
                    const elapsed = Math.round((performance.now() - startTime) * 10) / 10;
                    probeResults.set(endpoint.id, {
                        latencyMs: elapsed,
                        statusCode: null,
                        ok: false
                    });
                }
            })
        );

        setEndpoints((prev) =>
            prev.map((ep) => {
                const res = probeResults.get(ep.id) ?? { latencyMs: 0, statusCode: null, ok: false };
                const sample: LatencySample = {
                    timestamp: now,
                    latencyMs: res.latencyMs,
                    statusCode: res.statusCode,
                    ok: res.ok
                };

                const nextHistory = [...ep.history, sample].slice(-20);
                const okSamples = nextHistory.filter((s) => s.ok);
                const currentLatency = res.ok ? res.latencyMs : null;
                const avgLatency =
                    okSamples.length > 0
                        ? Math.round((okSamples.reduce((sum, s) => sum + s.latencyMs, 0) / okSamples.length) * 10) / 10
                        : null;
                const minLatency = okSamples.length > 0 ? Math.min(...okSamples.map((s) => s.latencyMs)) : null;
                const maxLatency = okSamples.length > 0 ? Math.max(...okSamples.map((s) => s.latencyMs)) : null;

                let status: EndpointHealthStatus = "operational";
                if (!res.ok) {
                    status = "down";
                } else if (res.latencyMs > 350) {
                    status = "degraded";
                }

                return {
                    ...ep,
                    history: nextHistory,
                    currentLatency,
                    avgLatency,
                    minLatency,
                    maxLatency,
                    lastStatusCode: res.statusCode,
                    status
                };
            })
        );

        setLastPingTime(new Date());
        setIsPinging(false);
        isPingingRef.current = false;
    }, []);

    useEffect(() => {
        void runProbeCycle();
    }, [runProbeCycle]);

    useEffect(() => {
        if (!isStreaming) return;
        const interval = setInterval(() => {
            void runProbeCycle();
        }, 2500);
        return () => clearInterval(interval);
    }, [isStreaming, runProbeCycle]);

    const activeEndpoints = endpoints.filter((ep) => ep.currentLatency !== null);
    const globalAvgLatency =
        activeEndpoints.length > 0
            ? Math.round((activeEndpoints.reduce((sum, ep) => sum + (ep.currentLatency ?? 0), 0) / activeEndpoints.length) * 10) /
              10
            : null;

    const downCount = endpoints.filter((ep) => ep.status === "down").length;
    const degradedCount = endpoints.filter((ep) => ep.status === "degraded").length;

    const overallTone = downCount > 0 ? "text-destructive" : degradedCount > 0 ? "text-amber-500" : "text-emerald-500";
    const overallBadgeBg =
        downCount > 0
            ? "bg-destructive/10 text-destructive border-destructive/20"
            : degradedCount > 0
              ? "bg-amber-500/10 text-amber-500 border-amber-500/20"
              : "bg-emerald-500/10 text-emerald-500 border-emerald-500/20";
    const overallLabel =
        downCount > 0
            ? `${downCount} Service Outage Detected`
            : degradedCount > 0
              ? `${degradedCount} Endpoint Degraded`
              : "All Systems Operational";

    const infrastructureList = endpoints.filter((ep) => ep.group === "infrastructure");
    const publicList = endpoints.filter((ep) => ep.group === "public");

    return (
        <div className="space-y-6">
            {/* master telemetry status banner */}
            <div className="flex flex-col gap-3 rounded-lg border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                    <span className="relative flex size-3">
                        {isStreaming && (
                            <span
                                className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${
                                    downCount > 0 ? "bg-destructive" : degradedCount > 0 ? "bg-amber-500" : "bg-emerald-500"
                                }`}
                            />
                        )}
                        <span
                            className={`relative inline-flex size-3 rounded-full ${
                                downCount > 0 ? "bg-destructive" : degradedCount > 0 ? "bg-amber-500" : "bg-emerald-500"
                            }`}
                        />
                    </span>
                    <div>
                        <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-foreground">{overallLabel}</span>
                            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-mono font-medium ${overallBadgeBg}`}>
                                {endpoints.length} OUTLETS
                            </span>
                        </div>
                        <p className="text-muted-foreground text-xs">
                            Continuous 2.5s streaming diagnostic of cluster infrastructure and public HTTP outlets.
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    {globalAvgLatency !== null && (
                        <div className="text-right">
                            <div className="text-muted-foreground text-[10px] uppercase tracking-wider">Cluster Avg</div>
                            <div className="font-mono text-sm font-semibold text-foreground">{globalAvgLatency} ms</div>
                        </div>
                    )}

                    <div className="flex items-center gap-1.5 border-l pl-3">
                        <Button
                            variant="outline"
                            size="xs"
                            onClick={() => setIsStreaming((prev) => !prev)}
                            className="gap-1 text-xs"
                        >
                            {isStreaming ? (
                                <>
                                    <Pause className="size-3" />
                                    <span>Pause</span>
                                </>
                            ) : (
                                <>
                                    <Play className="size-3" />
                                    <span>Resume</span>
                                </>
                            )}
                        </Button>
                        <Button
                            variant="outline"
                            size="xs"
                            disabled={isPinging}
                            onClick={() => void runProbeCycle()}
                            className="gap-1 text-xs"
                        >
                            <RefreshCw className={`size-3 ${isPinging ? "animate-spin" : ""}`} />
                            <span>Ping All</span>
                        </Button>
                    </div>
                </div>
            </div>

            {/* group 1: deep infrastructure */}
            <div className="space-y-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Database className="text-muted-foreground size-4" />
                        <h3 className="text-sm font-semibold text-foreground">Deep Infrastructure</h3>
                    </div>
                    <span className="text-muted-foreground text-xs font-mono">Kernel, Datastore & Cache</span>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {infrastructureList.map((ep) => {
                        const IconComp = ep.icon;
                        const statusColor =
                            ep.status === "down"
                                ? "text-destructive"
                                : ep.status === "degraded"
                                  ? "text-amber-500"
                                  : "text-emerald-500";
                        const statusBg =
                            ep.status === "down"
                                ? "bg-destructive/10 text-destructive border-destructive/20"
                                : ep.status === "degraded"
                                  ? "bg-amber-500/10 text-amber-500 border-amber-500/20"
                                  : "bg-emerald-500/10 text-emerald-500 border-emerald-500/20";

                        return (
                            <Card key={ep.id} className="overflow-hidden">
                                <CardHeader className="p-3 pb-2">
                                    <div className="flex items-center justify-between gap-1">
                                        <div className="flex items-center gap-1.5 truncate">
                                            <IconComp className="text-muted-foreground size-3.5 shrink-0" />
                                            <CardTitle className="truncate text-xs font-semibold">{ep.name}</CardTitle>
                                        </div>
                                        <span
                                            className={`shrink-0 rounded-full border px-1.5 py-0.2 text-[9px] font-mono uppercase ${statusBg}`}
                                        >
                                            {ep.status}
                                        </span>
                                    </div>
                                    <p className="text-muted-foreground line-clamp-1 text-[10px]">{ep.description}</p>
                                </CardHeader>
                                <CardContent className="space-y-2.5 p-3 pt-0">
                                    <div className="flex items-baseline justify-between border-t border-border/40 pt-2">
                                        <div>
                                            <span className="text-muted-foreground text-[10px]">Latency</span>
                                            <div className="font-mono text-base font-bold tabular-nums">
                                                {ep.currentLatency !== null ? (
                                                    <span className={statusColor}>{ep.currentLatency} ms</span>
                                                ) : (
                                                    <span className="text-muted-foreground">–</span>
                                                )}
                                            </div>
                                        </div>
                                        <div className="text-right font-mono text-[10px] text-muted-foreground">
                                            <div>
                                                avg:{" "}
                                                <span className="text-foreground">{ep.avgLatency !== null ? `${ep.avgLatency}ms` : "–"}</span>
                                            </div>
                                            <div>
                                                http:{" "}
                                                <span className="text-foreground">
                                                    {ep.lastStatusCode !== null ? `${ep.lastStatusCode}` : "–"}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    <LatencySparkline history={ep.history} status={ep.status} />

                                    <div className="text-muted-foreground flex items-center justify-between text-[10px] font-mono">
                                        <span className="truncate">{ep.tag}</span>
                                        <span>
                                            {ep.minLatency !== null && ep.maxLatency !== null
                                                ? `${ep.minLatency} / ${ep.maxLatency} ms`
                                                : ""}
                                        </span>
                                    </div>
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>
            </div>

            {/* group 2: public outlets */}
            <div className="space-y-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Radio className="text-muted-foreground size-4" />
                        <h3 className="text-sm font-semibold text-foreground">Public Outlets & Gateways</h3>
                    </div>
                    <span className="text-muted-foreground text-xs font-mono">Client-facing HTTP Endpoints</span>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {publicList.map((ep) => {
                        const IconComp = ep.icon;
                        const statusColor =
                            ep.status === "down"
                                ? "text-destructive"
                                : ep.status === "degraded"
                                  ? "text-amber-500"
                                  : "text-emerald-500";
                        const statusBg =
                            ep.status === "down"
                                ? "bg-destructive/10 text-destructive border-destructive/20"
                                : ep.status === "degraded"
                                  ? "bg-amber-500/10 text-amber-500 border-amber-500/20"
                                  : "bg-emerald-500/10 text-emerald-500 border-emerald-500/20";

                        return (
                            <Card key={ep.id} className="overflow-hidden">
                                <CardHeader className="p-3 pb-2">
                                    <div className="flex items-center justify-between gap-1">
                                        <div className="flex items-center gap-1.5 truncate">
                                            <IconComp className="text-muted-foreground size-3.5 shrink-0" />
                                            <CardTitle className="truncate text-xs font-semibold">{ep.name}</CardTitle>
                                        </div>
                                        <span
                                            className={`shrink-0 rounded-full border px-1.5 py-0.2 text-[9px] font-mono uppercase ${statusBg}`}
                                        >
                                            {ep.status}
                                        </span>
                                    </div>
                                    <p className="text-muted-foreground line-clamp-1 text-[10px]">{ep.description}</p>
                                </CardHeader>
                                <CardContent className="space-y-2.5 p-3 pt-0">
                                    <div className="flex items-baseline justify-between border-t border-border/40 pt-2">
                                        <div>
                                            <span className="text-muted-foreground text-[10px]">Latency</span>
                                            <div className="font-mono text-base font-bold tabular-nums">
                                                {ep.currentLatency !== null ? (
                                                    <span className={statusColor}>{ep.currentLatency} ms</span>
                                                ) : (
                                                    <span className="text-muted-foreground">–</span>
                                                )}
                                            </div>
                                        </div>
                                        <div className="text-right font-mono text-[10px] text-muted-foreground">
                                            <div>
                                                avg:{" "}
                                                <span className="text-foreground">{ep.avgLatency !== null ? `${ep.avgLatency}ms` : "–"}</span>
                                            </div>
                                            <div>
                                                http:{" "}
                                                <span className="text-foreground">
                                                    {ep.lastStatusCode !== null ? `${ep.lastStatusCode}` : "–"}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    <LatencySparkline history={ep.history} status={ep.status} />

                                    <div className="text-muted-foreground flex items-center justify-between text-[10px] font-mono">
                                        <span className="truncate">{ep.tag}</span>
                                        <span>
                                            {ep.minLatency !== null && ep.maxLatency !== null
                                                ? `${ep.minLatency} / ${ep.maxLatency} ms`
                                                : ""}
                                        </span>
                                    </div>
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
