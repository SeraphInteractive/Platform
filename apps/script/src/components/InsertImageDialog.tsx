"use client";

import React, { useState } from "react";
import { ImagePlus, X, Upload } from "lucide-react";

interface InsertImageDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onInsert: (src: string, caption?: string) => void;
}

export function InsertImageDialog({ isOpen, onClose, onInsert }: InsertImageDialogProps) {
  const [url, setUrl] = useState("");
  const [caption, setCaption] = useState("");

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;
    onInsert(url.trim(), caption.trim());
    setUrl("");
    setCaption("");
    onClose();
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // downscale to max 1600x900 and compress to jpeg to prevent localstorage quota overflow
    const reader = new FileReader();
    reader.onload = (event) => {
      const raw = event.target?.result as string;
      if (!raw) return;

      const img = new Image();
      img.onload = () => {
        const maxWidth = 1600;
        const maxHeight = 900;
        let { width, height } = img;

        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const compressed = canvas.toDataURL("image/jpeg", 0.85);
          setUrl(compressed);
        } else {
          setUrl(raw);
        }
      };
      img.onerror = () => {
        setUrl(raw);
      };
      img.src = raw;
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="no-print fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs select-none">
      <div className="w-full max-w-md bg-[#12141a] border border-[#262933] rounded-lg shadow-2xl p-5">
        <div className="flex items-center justify-between pb-3 border-b border-[#262933]">
          <div className="flex items-center gap-2">
            <ImagePlus className="w-4 h-4 text-blue-400" />
            <h3 className="text-xs font-semibold text-slate-100 uppercase tracking-wide">
              Embed Storyboard Still
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-200 hover:bg-[#1a1d26] rounded"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          <div>
            <label className="block text-[11px] font-mono text-slate-400 mb-1">
              Image URL or Local Upload:
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="https://... or upload below"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                autoFocus
                className="flex-1 bg-[#0e1015] border border-[#262933] rounded px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500 font-mono"
              />
              <label className="px-3 py-1.5 bg-[#161820] hover:bg-[#1f2330] border border-[#262933] rounded text-slate-300 cursor-pointer flex items-center gap-1.5 text-xs">
                <Upload className="w-3.5 h-3.5 text-blue-400" />
                <span>Upload</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-mono text-slate-400 mb-1">
              Optional Caption / Shot Note:
            </label>
            <input
              type="text"
              placeholder="e.g. Concept painting: The Outpost at Dawn"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              className="w-full bg-[#0e1015] border border-[#262933] rounded px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500 font-mono"
            />
          </div>

          <div className="pt-2 flex justify-end gap-2 border-t border-[#262933]">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!url.trim()}
              className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded text-xs font-medium"
            >
              Embed to Script
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
