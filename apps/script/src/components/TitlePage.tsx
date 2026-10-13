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
}

export function TitlePage({ data, onChange, isContinuous, theme = "dark" }: TitlePageProps) {
  const isLight = theme === "light";

  return (
    <div
      className={`screenplay-title-page select-text flex flex-col justify-between w-full ${
        isLight ? "text-neutral-900" : "text-[#e2e8f0]"
      } ${
        isContinuous ? "max-w-[720px] mx-auto py-12 min-h-[500px]" : "h-full min-h-[9in]"
      }`}
      style={{ fontFamily: "var(--courier-font)" }}
    >
      {/* Top spacer */}
      <div className={isContinuous ? "h-8" : "h-20"} />

      {/* Center Title & Byline Stack */}
      <div className="text-center space-y-4 my-auto">
        <input
          type="text"
          value={data.title}
          onChange={(e) => onChange({ title: e.target.value.toUpperCase() })}
          placeholder="UNTITLED SCREENPLAY"
          className={`w-full bg-transparent text-center font-bold text-2xl tracking-widest uppercase focus:outline-none border-none py-1 ${
            isLight ? "text-neutral-900 placeholder:text-neutral-300" : "text-[#e2e8f0] placeholder-slate-600"
          }`}
          style={{ fontFamily: "var(--courier-font)" }}
        />

        <div className={`text-xs italic ${isLight ? "text-neutral-500" : "text-slate-400"}`}>
          written by
        </div>

        <input
          type="text"
          value={data.author}
          onChange={(e) => onChange({ author: e.target.value })}
          placeholder="Writer Name"
          className={`w-full bg-transparent text-center text-sm font-semibold tracking-wider focus:outline-none border-none py-1 ${
            isLight ? "text-neutral-900 placeholder:text-neutral-300" : "text-[#e2e8f0] placeholder-slate-600"
          }`}
          style={{ fontFamily: "var(--courier-font)" }}
        />

        <input
          type="text"
          value={data.basedOn || ""}
          onChange={(e) => onChange({ basedOn: e.target.value })}
          placeholder="Based on an original story for Project Stairway"
          className={`w-full bg-transparent text-center text-xs focus:outline-none border-none py-1 ${
            isLight ? "text-neutral-600 placeholder:text-neutral-300" : "text-slate-400 placeholder-slate-600"
          }`}
          style={{ fontFamily: "var(--courier-font)" }}
        />
      </div>

      {/* Bottom Contact & Draft Metadata Stack */}
      <div
        className={`flex items-end justify-between pt-16 text-[11px] leading-relaxed ${
          isLight ? "text-neutral-600" : "text-slate-400"
        }`}
      >
        <div className="w-1/2 pr-4">
          <textarea
            rows={3}
            value={data.contact || ""}
            onChange={(e) => onChange({ contact: e.target.value })}
            placeholder="Contact information&#10;studio@projectstairway.net&#10;Discord: /project-stairway"
            className={`w-full bg-transparent resize-none focus:outline-none border-none p-0 text-[11px] ${
              isLight ? "text-neutral-700 placeholder:text-neutral-300" : "text-slate-300 placeholder-slate-600"
            }`}
            style={{ fontFamily: "var(--courier-font)" }}
          />
        </div>

        <div className="text-right w-1/2 pl-4">
          <input
            type="text"
            value={data.draftInfo || ""}
            onChange={(e) => onChange({ draftInfo: e.target.value })}
            placeholder="First Draft"
            className={`w-full bg-transparent text-right focus:outline-none border-none py-1 text-[11px] ${
              isLight ? "text-neutral-700 placeholder:text-neutral-300" : "text-slate-300 placeholder-slate-600"
            }`}
            style={{ fontFamily: "var(--courier-font)" }}
          />
          <div
            className={`text-[10px] mt-1 uppercase tracking-wider ${
              isLight ? "text-neutral-400" : "text-slate-500"
            }`}
          >
            Project Stairway Production Vault
          </div>
        </div>
      </div>
    </div>
  );
}
