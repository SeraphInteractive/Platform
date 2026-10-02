"use client";

import { RaidSeverity, type LeaderboardItemDto, type RaidTelemetryDto } from "@platform/contracts";
import { Bot, Database, Layers, Pause, Play, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/Components/Ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/Components/Ui/table";
import { formatNumber } from "@/Lib/Format";
import { cn } from "@/Lib/Utils";

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
interface HealthProbeResponse {
    readonly status: "ok" | "degraded" | "unavailable";
    readonly uptimeSeconds: number;
    readonly database: {
        readonly status: "ok" | "error";
        readonly latencyMs: number;
    };
    readonly redis: {
        readonly status: "ok" | "error";
        readonly latencyMs: number;
    };
    readonly discord: {
        readonly status: "ok" | "error";
        readonly latencyMs: number | null;
    };
    readonly timestamp: string;
}

interface ServiceMetricState {
    readonly history: readonly number[];
    readonly currentLatency: number | null;
    readonly status: "operational" | "degraded" | "down" | "probing";
}

function formatUptime(seconds: number): string {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (days > 0) return `${days}d ${hours}h ${minutes}m`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m ${seconds % 60}s`;
}

export function NetworkMonitor(): ReactNode {
    const [isStreaming, setIsStreaming] = useState<boolean>(true);
    const [isPinging, setIsPinging] = useState<boolean>(false);
    const [uptime, setUptime] = useState<number | null>(null);
    const [overallStatus, setOverallStatus] = useState<"ok" | "degraded" | "unavailable" | "probing">("probing");
    const [lastChecked, setLastChecked] = useState<Date | null>(null);

    const [dbState, setDbState] = useState<ServiceMetricState>({
        history: [],
        currentLatency: null,
        status: "probing"
    });
    const [redisState, setRedisState] = useState<ServiceMetricState>({
        history: [],
        currentLatency: null,
        status: "probing"
    });
    const [discordState, setDiscordState] = useState<ServiceMetricState>({
        history: [],
        currentLatency: null,
        status: "probing"
    });

    const isPingingRef = useRef(false);

    const runProbe = useCallback(async () => {
        if (isPingingRef.current) return;
        isPingingRef.current = true;
        setIsPinging(true);

        try {
            const response = await fetch("/api/v1/health/detailed", {
                method: "GET",
                headers: { Accept: "application/json" },
                credentials: "same-origin",
                cache: "no-store",
                signal: AbortSignal.timeout(5000)
            });

            if (!response.ok && response.status !== 503) {
                throw new Error(`health probe returned ${response.status}`);
            }

            const data = (await response.json()) as HealthProbeResponse;
            setUptime(data.uptimeSeconds);
            setOverallStatus(data.status);
            setLastChecked(new Date());

            // update rolling stats for each service
            const updateMetric = (
                item: { status: "ok" | "error"; latencyMs: number | null },
                degradedThreshold: number
            ) => (prev: ServiceMetricState): ServiceMetricState => {
                const latency = item.status === "ok" && item.latencyMs !== null ? item.latencyMs : null;
                const nextHistory = latency !== null ? [...prev.history, latency].slice(-30) : prev.history;
                let status: ServiceMetricState["status"] = "down";
                if (item.status === "ok" && latency !== null) {
                    status = latency > degradedThreshold ? "degraded" : "operational";
                }
                return {
                    history: nextHistory,
                    currentLatency: latency,
                    status
                };
            };

            setDbState(updateMetric(data.database, 100));
            setRedisState(updateMetric(data.redis, 50));
            setDiscordState(updateMetric(data.discord, 250));
        } catch {
            setOverallStatus("unavailable");
            setDbState((prev) => ({ ...prev, currentLatency: null, status: "down" }));
            setRedisState((prev) => ({ ...prev, currentLatency: null, status: "down" }));
            setDiscordState((prev) => ({ ...prev, currentLatency: null, status: "down" }));
        } finally {
            setIsPinging(false);
            isPingingRef.current = false;
        }
    }, []);

    useEffect(() => {
        void runProbe();
    }, [runProbe]);

    useEffect(() => {
        if (!isStreaming) return;
        const interval = setInterval(() => {
            void runProbe();
        }, 3000);
        return () => clearInterval(interval);
    }, [isStreaming, runProbe]);

    const services = [
        {
            id: "database",
            name: "Database",
            icon: Database,
            state: dbState
        },
        {
            id: "redis",
            name: "Redis",
            icon: Layers,
            state: redisState
        },
        {
            id: "discord",
            name: "Discord WebSocket",
            icon: Bot,
            state: discordState
        }
    ];

    const overallLabel =
        overallStatus === "ok"
            ? "All Systems Operational"
            : overallStatus === "degraded"
              ? "Service Degraded"
              : overallStatus === "unavailable"
                ? "Service Outage Detected"
                : "Probing Cluster…";

    const overallColor =
        overallStatus === "ok"
            ? "bg-emerald-500"
            : overallStatus === "degraded"
              ? "bg-amber-500"
              : "bg-destructive";

    return (
        <div className="space-y-4">
            <div className="flex flex-col gap-3 rounded-lg border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                    <span className="relative flex size-3">
                        {isStreaming && (
                            <span className={cn("absolute inline-flex h-full w-full animate-ping rounded-full opacity-75", overallColor)} />
                        )}
                        <span className={cn("relative inline-flex size-3 rounded-full", overallColor)} />
                    </span>
                    <div>
                        <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-foreground">{overallLabel}</span>
                            <span className="rounded-full border px-2 py-0.5 text-[10px] font-mono text-muted-foreground">
                                3 TARGETS
                            </span>
                        </div>
                        {uptime !== null && (
                            <div className="text-muted-foreground text-xs font-mono">
                                Uptime: {formatUptime(uptime)}
                            </div>
                        )}
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    {lastChecked !== null && (
                        <span className="text-muted-foreground text-xs font-mono hidden sm:inline mr-2">
                            Updated {lastChecked.toLocaleTimeString()}
                        </span>
                    )}
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
                        onClick={() => void runProbe()}
                        className="gap-1 text-xs"
                    >
                        <RefreshCw className={cn("size-3", isPinging && "animate-spin")} />
                        <span>Ping Now</span>
                    </Button>
                </div>
            </div>

            <div className="overflow-x-auto border rounded-md">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Target</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Latency</TableHead>
                            <TableHead className="text-right">Avg</TableHead>
                            <TableHead className="text-right">Min / Max</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {services.map((service) => {
                            const Icon = service.icon;
                            const hist = service.state.history;
                            const avg = hist.length > 0 ? Math.round((hist.reduce((a, b) => a + b, 0) / hist.length) * 10) / 10 : null;
                            const min = hist.length > 0 ? Math.min(...hist) : null;
                            const max = hist.length > 0 ? Math.max(...hist) : null;

                            const statusColor =
                                service.state.status === "operational"
                                    ? "text-emerald-500"
                                    : service.state.status === "degraded"
                                      ? "text-amber-500"
                                      : "text-destructive";

                            const statusBadge =
                                service.state.status === "operational"
                                    ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                                    : service.state.status === "degraded"
                                      ? "bg-amber-500/10 text-amber-500 border-amber-500/20"
                                      : "bg-destructive/10 text-destructive border-destructive/20";

                            return (
                                <TableRow key={service.id}>
                                    <TableCell>
                                        <div className="flex items-center gap-2">
                                            <Icon className="text-muted-foreground size-4 shrink-0" />
                                            <span className="font-medium text-foreground text-sm">{service.name}</span>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-mono uppercase font-medium", statusBadge)}>
                                            {service.state.status}
                                        </span>
                                    </TableCell>
                                    <TableCell className="text-right font-mono font-semibold tabular-nums">
                                        {service.state.currentLatency !== null ? (
                                            <span className={statusColor}>{service.state.currentLatency} ms</span>
                                        ) : (
                                            <span className="text-muted-foreground">–</span>
                                        )}
                                    </TableCell>
                                    <TableCell className="text-right font-mono text-xs tabular-nums text-muted-foreground">
                                        {avg !== null ? `${avg} ms` : "–"}
                                    </TableCell>
                                    <TableCell className="text-right font-mono text-xs tabular-nums text-muted-foreground">
                                        {min !== null && max !== null ? `${min} / ${max} ms` : "–"}
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}
