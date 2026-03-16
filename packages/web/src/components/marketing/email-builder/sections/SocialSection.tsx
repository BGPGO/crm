"use client";

import React from "react";
import type {
  SocialData,
  SectionData,
  SectionStyle,
  GlobalStyle,
} from "@/types/email-builder";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface SocialSectionProps {
  data: SocialData;
  onUpdate: (data: Partial<SectionData>, style?: Partial<SectionStyle>) => void;
  globalStyle: GlobalStyle;
}

// ---------------------------------------------------------------------------
// Platform colors & letters
// ---------------------------------------------------------------------------

const PLATFORM_CONFIG: Record<string, { color: string; letter: string }> = {
  facebook: { color: "#1877F2", letter: "F" },
  instagram: { color: "#E4405F", letter: "I" },
  twitter: { color: "#1DA1F2", letter: "T" },
  x: { color: "#000000", letter: "X" },
  linkedin: { color: "#0A66C2", letter: "L" },
  youtube: { color: "#FF0000", letter: "Y" },
  tiktok: { color: "#000000", letter: "T" },
  whatsapp: { color: "#25D366", letter: "W" },
  pinterest: { color: "#BD081C", letter: "P" },
  github: { color: "#181717", letter: "G" },
};

function getPlatformConfig(platform: string) {
  const key = platform.toLowerCase();
  return PLATFORM_CONFIG[key] ?? { color: "#6b7280", letter: platform.charAt(0).toUpperCase() };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SocialSection({ data }: SocialSectionProps) {
  const alignment = data.alignment || "center";
  const iconSize = data.iconSize || 32;

  const alignClass =
    alignment === "left"
      ? "justify-start"
      : alignment === "right"
        ? "justify-end"
        : "justify-center";

  if (!data.links || data.links.length === 0) {
    return (
      <div className="flex justify-center py-2 text-sm text-gray-400 italic">
        Nenhuma rede social configurada
      </div>
    );
  }

  return (
    <div className={`flex ${alignClass} gap-3 flex-wrap`}>
      {data.links.map((link, i) => {
        const cfg = getPlatformConfig(link.platform);
        return (
          <div
            key={i}
            className="flex items-center justify-center rounded-full text-white font-bold select-none"
            style={{
              width: iconSize,
              height: iconSize,
              backgroundColor: cfg.color,
              fontSize: iconSize * 0.45,
              lineHeight: 1,
            }}
            title={link.platform}
          >
            {cfg.letter}
          </div>
        );
      })}
    </div>
  );
}
