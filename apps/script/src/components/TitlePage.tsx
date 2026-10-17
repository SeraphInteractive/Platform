"use client";

import React from "react";

export interface TitlePageData {
    title: string;
    author: string;
    basedOn?: string;
    contact?: string;
    draftInfo?: string;
}

interface TitlePageProps {
    data: TitlePageData;
    onChange: (updates: Partial<TitlePageData>) => void;
    isContinuous: boolean;
    theme?: "dark" | "light";
    readOnly?: boolean;
}

export function TitlePage({ data, onChange, isContinuous, theme = "dark", readOnly = false }: TitlePageProps) {
    const isLight = theme === "light";

    return (
        <div
            className={`screenplay-title-page select-text flex flex-col justify-between w-full ${
                isLight ? "text-neutral-900" : "text-[#e2e8f0]"
            } ${isContinuous ? "max-w-[720px] mx-auto py-12 min-h-[500px]" : "h-full min-h-[9in]"}`}
            style={{ fontFamily: "var(--courier-font)" }}
        >
            {/* Top spacer */}
            <div className={isContinuous ? "h-8" : "h-20"} />

            {/* Center Title & Byline Stack */}
            <div className="text-center space-y-4 my-auto">
                <input
                    type="text"
                    value={data.title}
                    readOnly={readOnly}
                    onChange={(e) => !readOnly && onChange({ title: e.target.value.toUpperCase() })}
                    placeholder="UNTITLED SCREENPLAY"
                    className={`w-full bg-transparent text-center font-bold text-2xl tracking-widest uppercase focus:outline-none border-none py-1 ${
                        isLight ? "text-neutral-900 placeholder:text-neutral-300" : "text-[#e2e8f0] placeholder-zinc-600"
                    } ${readOnly ? "cursor-default" : ""}`}
                    style={{ fontFamily: "var(--courier-font)" }}
                />

                {data.author && <div className={`text-xs italic ${isLight ? "text-neutral-500" : "text-zinc-400"}`}>written by</div>}

                <input
                    type="text"
                    value={data.author}
                    readOnly={readOnly}
                    onChange={(e) => !readOnly && onChange({ author: e.target.value })}
                    placeholder="Writer"
                    className={`w-full bg-transparent text-center text-sm font-semibold tracking-wider focus:outline-none border-none py-1 ${
                        isLight ? "text-neutral-900 placeholder:text-neutral-300" : "text-[#e2e8f0] placeholder-zinc-600"
                    } ${readOnly ? "cursor-default" : ""}`}
                    style={{ fontFamily: "var(--courier-font)" }}
                />

                <input
                    type="text"
                    value={data.basedOn || ""}
                    readOnly={readOnly}
                    onChange={(e) => !readOnly && onChange({ basedOn: e.target.value })}
                    placeholder="Based on..."
                    className={`w-full bg-transparent text-center text-xs focus:outline-none border-none py-1 ${
                        isLight ? "text-neutral-600 placeholder:text-neutral-300" : "text-zinc-400 placeholder-zinc-600"
                    } ${readOnly ? "cursor-default" : ""}`}
                    style={{ fontFamily: "var(--courier-font)" }}
                />
            </div>

            {/* Bottom Contact & Draft Metadata Stack */}
            <div
                className={`flex items-end justify-between pt-16 text-[11px] leading-relaxed ${
                    isLight ? "text-neutral-600" : "text-zinc-400"
                }`}
            >
                <div className="w-1/2 pr-4">
                    <textarea
                        rows={3}
                        value={data.contact || ""}
                        readOnly={readOnly}
                        onChange={(e) => !readOnly && onChange({ contact: e.target.value })}
                        placeholder="Contact"
                        className={`w-full bg-transparent resize-none focus:outline-none border-none p-0 text-[11px] ${
                            isLight ? "text-neutral-700 placeholder:text-neutral-300" : "text-zinc-300 placeholder-zinc-600"
                        } ${readOnly ? "cursor-default" : ""}`}
                        style={{ fontFamily: "var(--courier-font)" }}
                    />
                </div>

                <div className="text-right w-1/2 pl-4">
                    <input
                        type="text"
                        value={data.draftInfo || ""}
                        readOnly={readOnly}
                        onChange={(e) => !readOnly && onChange({ draftInfo: e.target.value })}
                        placeholder="Draft / Date"
                        className={`w-full bg-transparent text-right focus:outline-none border-none py-1 text-[11px] ${
                            isLight ? "text-neutral-700 placeholder:text-neutral-300" : "text-zinc-300 placeholder-zinc-600"
                        } ${readOnly ? "cursor-default" : ""}`}
                        style={{ fontFamily: "var(--courier-font)" }}
                    />
                </div>
            </div>
        </div>
    );
}
