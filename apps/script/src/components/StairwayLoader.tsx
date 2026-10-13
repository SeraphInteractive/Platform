"use client";

import React from "react";

interface StairwayLoaderProps {
  size?: "sm" | "md" | "lg";
  className?: string;
  label?: string;
}

const sizeClasses = {
  sm: "w-24 h-24",
  md: "w-36 h-36",
  lg: "w-48 h-48"
} as const;

export function StairwayLoader({ size = "md", className = "", label }: StairwayLoaderProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-3 select-none ${className}`}
      role="status"
      aria-label={label ?? "Loading"}
    >
      <div className={`relative pointer-events-none select-none overflow-hidden ${sizeClasses[size]}`}>
        <video
          autoPlay
          loop
          muted
          playsInline
          preload="auto"
          aria-hidden="true"
          tabIndex={-1}
          className="h-full w-full object-contain invert mix-blend-multiply dark:invert-0 dark:mix-blend-screen"
        >
          <source src="/branding/stairway-loop.webm" type="video/webm" />
          <source src="/branding/stairway-loop.mp4" type="video/mp4" />
        </video>
      </div>
      {label && <p className="text-slate-400 font-mono text-xs tracking-wider uppercase">{label}</p>}
    </div>
  );
}
