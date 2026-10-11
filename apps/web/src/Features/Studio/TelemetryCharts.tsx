"use client";

import { RaidSeverity, type LeaderboardItemDto, type RaidTelemetryDto } from "@platform/contracts";
import { Bot, Database, Layers, Pause, Play, RefreshCw, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Button } from "@/Components/Ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/Components/Ui/table";
import { formatNumber } from "@/Lib/Format";
import { cn } from "@/Lib/Utils";

interface CartesianBounds {
    readonly minX: number;
    readonly maxX: number;
    readonly minY: number;
    readonly maxY: number;
}

function generateNiceTicks(min: number, max: number, maxTicks = 5): number[] {
    const range = max - min;
    if (range <= 0 || !Number.isFinite(range)) return [min];

    const roughStep = range / Math.max(1, maxTicks - 1);
    const exponent = Math.floor(Math.log10(roughStep));
    const fraction = roughStep / Math.pow(10, exponent);

    let niceFraction: number;
    if (fraction <= 1.5) {
        niceFraction = 1;
    } else if (fraction <= 3.5) {
        niceFraction = 2;
    } else if (fraction <= 7.5) {
        niceFraction = 5;
    } else {
        niceFraction = 10;
    }

    const step = niceFraction * Math.pow(10, exponent);
    const firstTick = Math.ceil(min / step) * step;
    const lastTick = Math.floor(max / step) * step;

    const ticks: number[] = [];
    const precision = Math.max(0, -exponent + (niceFraction === 1 ? 0 : 1));
    for (let t = firstTick; t <= lastTick + step * 0.5; t += step) {
        const rounded = Number(t.toFixed(Math.min(precision + 2, 6)));
        ticks.push(rounded);
    }
    return ticks;
}

function formatTickValue(val: number): string {
    if (Math.abs(val) >= 10_000) return (val / 1000).toFixed(0) + "k";
    if (Math.abs(val) >= 1_000) return (val / 1000).toFixed(1).replace(/\.0$/, "") + "k";
    if (Number.isInteger(val)) return String(val);
    const abs = Math.abs(val);
    if (abs < 0.01) return val.toFixed(3);
    if (abs < 1) return val.toFixed(2);
    return val.toFixed(1).replace(/\.0$/, "");
}

function useCartesianZoom({
    width,
    height,
    padding,
    initialBounds,
    maxZoom = 16
}: {
    readonly width: number;
    readonly height: number;
    readonly padding: number;
    readonly initialBounds: CartesianBounds;
    readonly maxZoom?: number;
}) {
    const [bounds, setBounds] = useState<CartesianBounds>(initialBounds);
    const isDraggingRef = useRef(false);
    const dragStartRef = useRef<{ clientX: number; clientY: number; bounds: CartesianBounds }>({
        clientX: 0,
        clientY: 0,
        bounds: initialBounds
    });
    const [mouseDataPos, setMouseDataPos] = useState<{ x: number; y: number; px: number; py: number } | null>(null);
    const svgRef = useRef<SVGSVGElement | null>(null);

    // sync bounds when initialBounds change from external data updates
    useEffect(() => {
        setBounds(initialBounds);
    }, [initialBounds.minX, initialBounds.maxX, initialBounds.minY, initialBounds.maxY]);

    const plotW = Math.max(1, width - 2 * padding);
    const plotH = Math.max(1, height - 2 * padding);

    const projectX = useCallback(
        (val: number): number => padding + ((val - bounds.minX) / (bounds.maxX - bounds.minX)) * plotW,
        [bounds.minX, bounds.maxX, padding, plotW]
    );

    const projectY = useCallback(
        (val: number): number => height - padding - ((val - bounds.minY) / (bounds.maxY - bounds.minY)) * plotH,
        [bounds.minY, bounds.maxY, height, padding, plotH]
    );

    const invertX = useCallback(
        (screenX: number): number => bounds.minX + ((screenX - padding) / plotW) * (bounds.maxX - bounds.minX),
        [bounds.minX, bounds.maxX, padding, plotW]
    );

    const invertY = useCallback(
        (screenY: number): number => bounds.minY + ((height - padding - screenY) / plotH) * (bounds.maxY - bounds.minY),
        [bounds.minY, bounds.maxY, height, padding, plotH]
    );

    const initSpanX = initialBounds.maxX - initialBounds.minX;
    const currentSpanX = bounds.maxX - bounds.minX;
    const zoomLevel = Math.max(1, initSpanX / currentSpanX);
    const isZoomed = zoomLevel > 1.02;

    const resetZoom = useCallback(() => {
        setBounds(initialBounds);
    }, [initialBounds]);

    // non-passive wheel zoom centered directly at cursor
    useEffect(() => {
        const svg = svgRef.current;
        if (!svg) return;

        const onWheel = (e: WheelEvent) => {
            e.preventDefault();
            const rect = svg.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;
            const svgX = (mouseX / rect.width) * width;
            const svgY = (mouseY / rect.height) * height;

            if (svgX < padding || svgX > width - padding || svgY < padding || svgY > height - padding) {
                return;
            }

            const factor = e.deltaY < 0 ? 1.2 : 0.83;

            setBounds((prev) => {
                const prevSpanX = prev.maxX - prev.minX;
                const prevSpanY = prev.maxY - prev.minY;
                const nextZoom = (initSpanX / prevSpanX) * factor;

                if (nextZoom <= 1.01) {
                    return initialBounds;
                }
                if (nextZoom > maxZoom) {
                    return prev;
                }

                const ratioX = (svgX - padding) / plotW;
                const ratioY = (height - padding - svgY) / plotH;

                const pivotX = prev.minX + ratioX * prevSpanX;
                const pivotY = prev.minY + ratioY * prevSpanY;

                const nextSpanX = prevSpanX / factor;
                const nextSpanY = prevSpanY / factor;

                return {
                    minX: pivotX - ratioX * nextSpanX,
                    maxX: pivotX + (1 - ratioX) * nextSpanX,
                    minY: pivotY - ratioY * nextSpanY,
                    maxY: pivotY + (1 - ratioY) * nextSpanY
                };
            });
        };

        svg.addEventListener("wheel", onWheel, { passive: false });
        return () => svg.removeEventListener("wheel", onWheel);
    }, [width, height, padding, plotW, plotH, initSpanX, initialBounds, maxZoom]);

    const onMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
        if (e.button !== 0) return;
        isDraggingRef.current = true;
        dragStartRef.current = { clientX: e.clientX, clientY: e.clientY, bounds };
    };

    const onMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
        const svg = svgRef.current;
        if (svg) {
            const rect = svg.getBoundingClientRect();
            const svgX = ((e.clientX - rect.left) / rect.width) * width;
            const svgY = ((e.clientY - rect.top) / rect.height) * height;
            if (svgX >= padding && svgX <= width - padding && svgY >= padding && svgY <= height - padding) {
                setMouseDataPos({
                    x: invertX(svgX),
                    y: invertY(svgY),
                    px: svgX,
                    py: svgY
                });
            } else {
                setMouseDataPos(null);
            }
        }

        if (!isDraggingRef.current || !svg) return;
        const rect = svg.getBoundingClientRect();
        const scale = width / rect.width;
        const dx = (e.clientX - dragStartRef.current.clientX) * scale;
        const dy = (e.clientY - dragStartRef.current.clientY) * scale;

        const startSpanX = dragStartRef.current.bounds.maxX - dragStartRef.current.bounds.minX;
        const startSpanY = dragStartRef.current.bounds.maxY - dragStartRef.current.bounds.minY;

        const deltaDataX = -(dx / plotW) * startSpanX;
        const deltaDataY = (dy / plotH) * startSpanY;

        setBounds({
            minX: dragStartRef.current.bounds.minX + deltaDataX,
            maxX: dragStartRef.current.bounds.maxX + deltaDataX,
            minY: dragStartRef.current.bounds.minY + deltaDataY,
            maxY: dragStartRef.current.bounds.maxY + deltaDataY
        });
    };

    const onMouseUp = () => {
        isDraggingRef.current = false;
    };

    const onMouseLeave = () => {
        isDraggingRef.current = false;
        setMouseDataPos(null);
    };

    const xTicks = generateNiceTicks(bounds.minX, bounds.maxX, 5);
    const yTicks = generateNiceTicks(bounds.minY, bounds.maxY, 4);

    return {
        svgRef,
        bounds,
        projectX,
        projectY,
        invertX,
        invertY,
        zoomLevel,
        isZoomed,
        resetZoom,
        xTicks,
        yTicks,
        mouseDataPos,
        onMouseDown,
        onMouseMove,
        onMouseUp,
        onMouseLeave,
        onDoubleClick: resetZoom
    };
}

interface ScatterChartProps {
    readonly telemetryList: readonly RaidTelemetryDto[];
    readonly leaderboardItems?: readonly LeaderboardItemDto[];
    readonly titleOf?: (entryId: string) => string;
    readonly onHover?: (item: RaidTelemetryDto | null) => void;
    readonly hovered?: RaidTelemetryDto | null;
}

export function ScatterChart({ telemetryList, leaderboardItems = [], titleOf, onHover, hovered }: ScatterChartProps): ReactNode {
    const [localHovered, setLocalHovered] = useState<RaidTelemetryDto | null>(null);
    const activeHover = hovered !== undefined ? hovered : localHovered;
    const setActiveHover = onHover ?? setLocalHovered;

    const width = 640;
    const height = 240;
    const padding = 38;

    const initialBounds = useMemo(() => ({ minX: -2, maxX: 8, minY: 0.0, maxY: 1.0 }), []);
    const {
        svgRef,
        bounds,
        projectX,
        projectY,
        zoomLevel,
        isZoomed,
        resetZoom,
        xTicks,
        yTicks,
        mouseDataPos,
        onMouseDown,
        onMouseMove,
        onMouseUp,
        onMouseLeave,
        onDoubleClick
    } = useCartesianZoom({
        width,
        height,
        padding,
        initialBounds
    });

    const titlesById = new Map(leaderboardItems.map((i) => [i.entryId, i.title]));
    const getTitle = (entryId: string): string => {
        if (titleOf !== undefined) return titleOf(entryId);
        return titlesById.get(entryId) ?? `Entry #${entryId.slice(0, 6)}`;
    };

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

    // calculate dynamic threat zone rectangle in screen space
    const threatMinX = Math.max(padding, projectX(2.5));
    const threatMaxX = Math.min(width - padding, projectX(Math.max(8, bounds.maxX)));
    const threatMinY = Math.max(padding, projectY(0.35));
    const threatMaxY = Math.min(height - padding, projectY(Math.min(0.0, bounds.minY)));
    const hasThreatZone = threatMaxX > threatMinX && threatMaxY > threatMinY;

    return (
        <div className="w-full space-y-2">
            <div className="relative overflow-hidden rounded-md border bg-card p-2 bezel">
                {/* top corner toolbar with reset and active zoom indicator */}
                <div className="absolute right-3 top-3 z-10 flex items-center gap-2">
                    {isZoomed && (
                        <button
                            type="button"
                            onClick={resetZoom}
                            className="flex items-center gap-1 rounded border bg-background/90 px-2 py-0.5 text-[10px] font-mono text-muted-foreground shadow-xs backdrop-blur-xs hover:text-foreground"
                        >
                            <RotateCcw className="size-2.5" />
                            <span>{zoomLevel.toFixed(1)}x · Reset</span>
                        </button>
                    )}
                </div>

                {/* compact corner hud metric telemetry */}
                {activeHover !== null ? (
                    <div className="absolute left-3 top-3 z-10 flex max-w-[70%] items-center gap-2 rounded border bg-background/95 px-2.5 py-1 text-[11px] font-mono shadow-xs backdrop-blur-xs">
                        <span
                            className={cn(
                                "size-2 shrink-0 rounded-full",
                                activeHover.severity === RaidSeverity.CriticalRaid
                                    ? "bg-destructive"
                                    : activeHover.severity === RaidSeverity.Suspicious
                                      ? "bg-amber-500"
                                      : "bg-emerald-500"
                            )}
                        />
                        <span className="truncate font-semibold text-foreground">{getTitle(activeHover.entryId)}</span>
                        <span className="text-muted-foreground shrink-0">·</span>
                        <span className="shrink-0 text-muted-foreground">Z: {formatNumber(activeHover.velocityZScore)}</span>
                        <span className="shrink-0 text-muted-foreground">H: {formatNumber(activeHover.rankEntropy, 2)}</span>
                    </div>
                ) : mouseDataPos !== null ? (
                    <div className="absolute left-3 top-3 z-10 flex items-center gap-2 rounded border bg-background/80 px-2 py-0.5 text-[10px] font-mono text-muted-foreground backdrop-blur-xs">
                        <span>Z: {formatNumber(mouseDataPos.x, 2)}</span>
                        <span>·</span>
                        <span>H: {formatNumber(mouseDataPos.y, 2)}</span>
                    </div>
                ) : null}

                <svg
                    ref={svgRef}
                    viewBox={`0 0 ${width} ${height}`}
                    onMouseDown={onMouseDown}
                    onMouseMove={onMouseMove}
                    onMouseUp={onMouseUp}
                    onMouseLeave={onMouseLeave}
                    onDoubleClick={onDoubleClick}
                    className={cn(
                        "h-auto max-h-64 w-full select-none",
                        isZoomed ? "cursor-grab active:cursor-grabbing" : "cursor-crosshair"
                    )}
                >
                    <defs>
                        <clipPath id="scatter-plot-clip">
                            <rect x={padding} y={padding} width={width - 2 * padding} height={height - 2 * padding} />
                        </clipPath>
                    </defs>

                    {/* dynamic hairline grid lines */}
                    <g clipPath="url(#scatter-plot-clip)">
                        {xTicks.map((tick) => {
                            const x = projectX(tick);
                            return (
                                <line
                                    key={`gx-${tick}`}
                                    x1={x}
                                    y1={padding}
                                    x2={x}
                                    y2={height - padding}
                                    className="stroke-border/25"
                                    strokeDasharray="2 2"
                                />
                            );
                        })}
                        {yTicks.map((tick) => {
                            const y = projectY(tick);
                            return (
                                <line
                                    key={`gy-${tick}`}
                                    x1={padding}
                                    y1={y}
                                    x2={width - padding}
                                    y2={y}
                                    className="stroke-border/25"
                                    strokeDasharray="2 2"
                                />
                            );
                        })}

                        {/* threat zone box */}
                        {hasThreatZone && (
                            <g>
                                <rect
                                    x={threatMinX}
                                    y={threatMinY}
                                    width={threatMaxX - threatMinX}
                                    height={threatMaxY - threatMinY}
                                    className="fill-destructive/10 stroke-destructive/30"
                                    strokeDasharray="3 3"
                                />
                                <text
                                    x={threatMaxX - 6}
                                    y={threatMaxY - 8}
                                    textAnchor="end"
                                    fontSize="8"
                                    className="fill-destructive/80 font-mono font-medium pointer-events-none select-none"
                                >
                                    THREAT ZONE (Z &gt; 2.5, H &lt; 0.35)
                                </text>
                            </g>
                        )}

                        {/* hover crosshair lines */}
                        {activeHover !== null && (
                            <g>
                                <line
                                    x1={padding}
                                    y1={projectY(activeHover.rankEntropy)}
                                    x2={width - padding}
                                    y2={projectY(activeHover.rankEntropy)}
                                    className="stroke-primary/40"
                                    strokeDasharray="2 2"
                                />
                                <line
                                    x1={projectX(activeHover.velocityZScore)}
                                    y1={padding}
                                    x2={projectX(activeHover.velocityZScore)}
                                    y2={height - padding}
                                    className="stroke-primary/40"
                                    strokeDasharray="2 2"
                                />
                            </g>
                        )}

                        {/* minimal point pins */}
                        {points.map((p) => {
                            const cx = projectX(p.velocityZScore);
                            const cy = projectY(p.rankEntropy);
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
                                    onMouseEnter={() => setActiveHover(p)}
                                    onMouseLeave={() => setActiveHover(null)}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setActiveHover(p);
                                    }}
                                    className="cursor-pointer"
                                >
                                    {isSelected && (
                                        <circle cx={cx} cy={cy} r={9} fill={fillColor} fillOpacity={0.2} className="animate-pulse" />
                                    )}
                                    <circle
                                        cx={cx}
                                        cy={cy}
                                        r={isSelected ? 5.5 : 3.8}
                                        fill={fillColor}
                                        stroke="#0b0c10"
                                        strokeWidth={isSelected ? 2 : 1}
                                        className="transition-all"
                                    />
                                </g>
                            );
                        })}
                    </g>

                    {/* dynamic axes frame */}
                    <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} className="stroke-border/80" />
                    <line x1={padding} y1={padding} x2={padding} y2={height - padding} className="stroke-border/80" />

                    {/* dynamic x ticks */}
                    {xTicks.map((tick) => {
                        const x = projectX(tick);
                        if (x < padding || x > width - padding) return null;
                        return (
                            <g key={`tx-${tick}`}>
                                <line
                                    x1={x}
                                    y1={height - padding}
                                    x2={x}
                                    y2={height - padding + 4}
                                    className="stroke-muted-foreground/60"
                                />
                                <text
                                    x={x}
                                    y={height - padding + 14}
                                    fontSize="9"
                                    textAnchor="middle"
                                    className="fill-muted-foreground font-mono select-none pointer-events-none"
                                >
                                    {formatTickValue(tick)}
                                </text>
                            </g>
                        );
                    })}

                    {/* dynamic y ticks */}
                    {yTicks.map((tick) => {
                        const y = projectY(tick);
                        if (y < padding || y > height - padding) return null;
                        return (
                            <g key={`ty-${tick}`}>
                                <line x1={padding - 4} y1={y} x2={padding} y2={y} className="stroke-muted-foreground/60" />
                                <text
                                    x={padding - 6}
                                    y={y + 3}
                                    fontSize="9"
                                    textAnchor="end"
                                    className="fill-muted-foreground font-mono select-none pointer-events-none"
                                >
                                    {formatTickValue(tick)}
                                </text>
                            </g>
                        );
                    })}

                    {/* axis labels */}
                    <text x={width / 2} y={height - 4} fontSize="9" textAnchor="middle" className="fill-muted-foreground/80 font-mono">
                        Velocity Z-Score &rarr;
                    </text>
                    <text
                        x={-height / 2}
                        y={12}
                        transform="rotate(-90)"
                        fontSize="9"
                        textAnchor="middle"
                        className="fill-muted-foreground/80 font-mono"
                    >
                        Rank Entropy (H) &rarr;
                    </text>
                </svg>
            </div>

            {/* details footer when selected */}
            {activeHover !== null && (
                <div className="flex flex-wrap items-center gap-3 rounded border bg-card/60 px-3 py-1.5 text-xs font-mono bezel">
                    <span className="font-semibold text-foreground">
                        {getTitle(activeHover.entryId)} (#{activeHover.entryId.slice(0, 6)})
                    </span>
                    <span className="text-muted-foreground">·</span>
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
    const [hoveredEntryId, setHoveredEntryId] = useState<string | null>(null);
    const width = 640;
    const height = 220;
    const padding = 38;

    const maxRaw = items.length > 0 ? Math.max(...items.map((i) => i.rawScore), 10) : 10;
    const maxReg = items.length > 0 ? Math.max(...items.map((i) => i.regularizedMeanScore ?? i.rawScore), 10) : 10;
    const maxVal = Math.max(maxRaw, maxReg) * 1.15;

    const initialBounds = useMemo(() => ({ minX: 0, maxX: maxVal, minY: 0, maxY: maxVal }), [maxVal]);
    const {
        svgRef,
        bounds,
        projectX,
        projectY,
        zoomLevel,
        isZoomed,
        resetZoom,
        xTicks,
        yTicks,
        mouseDataPos,
        onMouseDown,
        onMouseMove,
        onMouseUp,
        onMouseLeave,
        onDoubleClick
    } = useCartesianZoom({
        width,
        height,
        padding,
        initialBounds
    });

    if (items.length === 0) {
        return <p className="text-muted-foreground text-xs font-mono">No entries to display.</p>;
    }

    const activeItem = items.find((i) => i.entryId === hoveredEntryId) ?? null;

    // 45-degree parity reference line coordinates in visible bounds
    const parityStart = Math.max(bounds.minX, bounds.minY);
    const parityEnd = Math.min(bounds.maxX, bounds.maxY);
    const hasParityLine = parityEnd > parityStart;

    return (
        <div className="w-full space-y-2">
            <div className="relative overflow-hidden rounded-md border bg-card p-2 bezel">
                {/* top corner toolbar with reset and active zoom indicator */}
                <div className="absolute right-3 top-3 z-10 flex items-center gap-2">
                    {isZoomed && (
                        <button
                            type="button"
                            onClick={resetZoom}
                            className="flex items-center gap-1 rounded border bg-background/90 px-2 py-0.5 text-[10px] font-mono text-muted-foreground shadow-xs backdrop-blur-xs hover:text-foreground"
                        >
                            <RotateCcw className="size-2.5" />
                            <span>{zoomLevel.toFixed(1)}x · Reset</span>
                        </button>
                    )}
                </div>

                {/* compact corner hud metric telemetry */}
                {activeItem !== null ? (
                    <div className="absolute left-3 top-3 z-10 flex max-w-[70%] items-center gap-2 rounded border bg-background/95 px-2.5 py-1 text-[11px] font-mono shadow-xs backdrop-blur-xs">
                        <span className="size-2 shrink-0 rounded-full bg-emerald-500" />
                        <span className="truncate font-semibold text-foreground">{activeItem.title}</span>
                        <span className="text-muted-foreground shrink-0">·</span>
                        <span className="shrink-0 text-muted-foreground">Raw: {formatNumber(activeItem.rawScore)}</span>
                        <span className="shrink-0 text-muted-foreground">
                            Reg: {formatNumber(activeItem.regularizedTotalScore ?? activeItem.rawScore)}
                        </span>
                    </div>
                ) : mouseDataPos !== null ? (
                    <div className="absolute left-3 top-3 z-10 flex items-center gap-2 rounded border bg-background/80 px-2 py-0.5 text-[10px] font-mono text-muted-foreground backdrop-blur-xs">
                        <span>Raw: {formatNumber(mouseDataPos.x, 1)}</span>
                        <span>·</span>
                        <span>Reg: {formatNumber(mouseDataPos.y, 1)}</span>
                    </div>
                ) : null}

                <svg
                    ref={svgRef}
                    viewBox={`0 0 ${width} ${height}`}
                    onMouseDown={onMouseDown}
                    onMouseMove={onMouseMove}
                    onMouseUp={onMouseUp}
                    onMouseLeave={onMouseLeave}
                    onDoubleClick={onDoubleClick}
                    className={cn(
                        "h-auto max-h-60 w-full select-none",
                        isZoomed ? "cursor-grab active:cursor-grabbing" : "cursor-crosshair"
                    )}
                >
                    <defs>
                        <clipPath id="shrinkage-plot-clip">
                            <rect x={padding} y={padding} width={width - 2 * padding} height={height - 2 * padding} />
                        </clipPath>
                    </defs>

                    {/* dynamic hairline grid lines */}
                    <g clipPath="url(#shrinkage-plot-clip)">
                        {xTicks.map((tick) => {
                            const x = projectX(tick);
                            return (
                                <line
                                    key={`sgx-${tick}`}
                                    x1={x}
                                    y1={padding}
                                    x2={x}
                                    y2={height - padding}
                                    className="stroke-border/25"
                                    strokeDasharray="2 2"
                                />
                            );
                        })}
                        {yTicks.map((tick) => {
                            const y = projectY(tick);
                            return (
                                <line
                                    key={`sgy-${tick}`}
                                    x1={padding}
                                    y1={y}
                                    x2={width - padding}
                                    y2={y}
                                    className="stroke-border/25"
                                    strokeDasharray="2 2"
                                />
                            );
                        })}

                        {/* 45-degree parity reference line */}
                        {hasParityLine && (
                            <line
                                x1={projectX(parityStart)}
                                y1={projectY(parityStart)}
                                x2={projectX(parityEnd)}
                                y2={projectY(parityEnd)}
                                className="stroke-muted-foreground/35"
                                strokeDasharray="3 3"
                            />
                        )}

                        {/* hover crosshair lines */}
                        {activeItem !== null && (
                            <g>
                                <line
                                    x1={padding}
                                    y1={projectY(activeItem.regularizedMeanScore ?? activeItem.rawScore)}
                                    x2={width - padding}
                                    y2={projectY(activeItem.regularizedMeanScore ?? activeItem.rawScore)}
                                    className="stroke-primary/40"
                                    strokeDasharray="2 2"
                                />
                                <line
                                    x1={projectX(activeItem.rawScore)}
                                    y1={padding}
                                    x2={projectX(activeItem.rawScore)}
                                    y2={height - padding}
                                    className="stroke-primary/40"
                                    strokeDasharray="2 2"
                                />
                            </g>
                        )}

                        {/* shrinkage connector drop lines and pins */}
                        {items.map((datum) => {
                            const raw = datum.rawScore;
                            const reg = datum.regularizedMeanScore ?? datum.rawScore;
                            const px = projectX(raw);
                            const py = projectY(reg);
                            const parityPy = projectY(raw);
                            const isSelected = hoveredEntryId === datum.entryId;

                            return (
                                <g
                                    key={datum.entryId}
                                    onMouseEnter={() => setHoveredEntryId(datum.entryId)}
                                    onMouseLeave={() => setHoveredEntryId(null)}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setHoveredEntryId(datum.entryId);
                                    }}
                                    className="cursor-pointer"
                                >
                                    {/* shrinkage drop line */}
                                    <line
                                        x1={px}
                                        y1={parityPy}
                                        x2={px}
                                        y2={py}
                                        stroke="#3b82f6"
                                        strokeWidth={isSelected ? 2 : 1.2}
                                        strokeDasharray="2 2"
                                        opacity={isSelected ? 1 : 0.6}
                                    />
                                    {isSelected && (
                                        <circle cx={px} cy={py} r={9} fill="#10b981" fillOpacity={0.2} className="animate-pulse" />
                                    )}
                                    <circle
                                        cx={px}
                                        cy={py}
                                        r={isSelected ? 5.5 : 4}
                                        fill="#10b981"
                                        stroke="#0b0c10"
                                        strokeWidth={isSelected ? 2 : 1}
                                        className="transition-all"
                                    />
                                </g>
                            );
                        })}
                    </g>

                    {/* dynamic axes frame */}
                    <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} className="stroke-border/80" />
                    <line x1={padding} y1={padding} x2={padding} y2={height - padding} className="stroke-border/80" />

                    {/* dynamic x ticks */}
                    {xTicks.map((tick) => {
                        const x = projectX(tick);
                        if (x < padding || x > width - padding) return null;
                        return (
                            <g key={`stx-${tick}`}>
                                <line
                                    x1={x}
                                    y1={height - padding}
                                    x2={x}
                                    y2={height - padding + 4}
                                    className="stroke-muted-foreground/60"
                                />
                                <text
                                    x={x}
                                    y={height - padding + 14}
                                    fontSize="9"
                                    textAnchor="middle"
                                    className="fill-muted-foreground font-mono select-none pointer-events-none"
                                >
                                    {formatTickValue(tick)}
                                </text>
                            </g>
                        );
                    })}

                    {/* dynamic y ticks */}
                    {yTicks.map((tick) => {
                        const y = projectY(tick);
                        if (y < padding || y > height - padding) return null;
                        return (
                            <g key={`sty-${tick}`}>
                                <line x1={padding - 4} y1={y} x2={padding} y2={y} className="stroke-muted-foreground/60" />
                                <text
                                    x={padding - 6}
                                    y={y + 3}
                                    fontSize="9"
                                    textAnchor="end"
                                    className="fill-muted-foreground font-mono select-none pointer-events-none"
                                >
                                    {formatTickValue(tick)}
                                </text>
                            </g>
                        );
                    })}

                    {/* axis labels */}
                    <text x={width / 2} y={height - 4} fontSize="9" textAnchor="middle" className="fill-muted-foreground/80 font-mono">
                        Raw Points &rarr;
                    </text>
                    <text
                        x={-height / 2}
                        y={12}
                        transform="rotate(-90)"
                        fontSize="9"
                        textAnchor="middle"
                        className="fill-muted-foreground/80 font-mono"
                    >
                        Regularized Score &rarr;
                    </text>
                </svg>
            </div>

            {/* details footer when selected */}
            {activeItem !== null && (
                <div className="flex flex-wrap items-center gap-3 rounded border bg-card/60 px-3 py-1.5 text-xs font-mono bezel">
                    <span className="font-semibold text-foreground">
                        {activeItem.title} (#{activeItem.entryId.slice(0, 6)})
                    </span>
                    <span className="text-muted-foreground">·</span>
                    <span>
                        Raw: {formatNumber(activeItem.rawScore)} pts (#{activeItem.position})
                    </span>
                    <span>Regularized: {formatNumber(activeItem.regularizedTotalScore ?? activeItem.rawScore)} pts</span>
                </div>
            )}
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
            const updateMetric =
                (item: { status: "ok" | "error"; latencyMs: number | null }, degradedThreshold: number) =>
                (prev: ServiceMetricState): ServiceMetricState => {
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

    const overallColor = overallStatus === "ok" ? "bg-emerald-500" : overallStatus === "degraded" ? "bg-amber-500" : "bg-destructive";

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
                            <span className="rounded-full border px-2 py-0.5 text-[10px] font-mono text-muted-foreground">3 TARGETS</span>
                        </div>
                        {uptime !== null && <div className="text-muted-foreground text-xs font-mono">Uptime: {formatUptime(uptime)}</div>}
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    {lastChecked !== null && (
                        <span className="text-muted-foreground text-xs font-mono hidden sm:inline mr-2">
                            Updated {lastChecked.toLocaleTimeString()}
                        </span>
                    )}
                    <Button variant="outline" size="xs" onClick={() => setIsStreaming((prev) => !prev)} className="gap-1 text-xs">
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
                    <Button variant="outline" size="xs" disabled={isPinging} onClick={() => void runProbe()} className="gap-1 text-xs">
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
                                        <span
                                            className={cn(
                                                "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-mono uppercase font-medium",
                                                statusBadge
                                            )}
                                        >
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
