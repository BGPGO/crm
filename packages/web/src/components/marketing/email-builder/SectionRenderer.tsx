"use client";

import React from "react";
import type {
  EmailSection,
  SectionData,
  SectionStyle,
  GlobalStyle,
  HeaderData,
  TextData,
  ImageData,
  ButtonData,
  DividerData,
  ColumnsData,
  SocialData,
  FooterData,
  SpacerData,
} from "@/types/email-builder";

import { HeaderSection } from "./sections/HeaderSection";
import { TextSection } from "./sections/TextSection";
import { ImageSection } from "./sections/ImageSection";
import { ButtonSection } from "./sections/ButtonSection";
import { DividerSection } from "./sections/DividerSection";
import { ColumnsSection } from "./sections/ColumnsSection";
import { SocialSection } from "./sections/SocialSection";
import { FooterSection } from "./sections/FooterSection";
import { SpacerSection } from "./sections/SpacerSection";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface SectionRendererProps {
  section: EmailSection;
  isSelected: boolean;
  onUpdate: (data: Partial<SectionData>, style?: Partial<SectionStyle>) => void;
  globalStyle: GlobalStyle;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SectionRenderer({
  section,
  isSelected,
  onUpdate,
  globalStyle,
}: SectionRendererProps) {
  const { data, style } = section;

  const containerStyle: React.CSSProperties = {
    backgroundColor: style.backgroundColor || undefined,
    paddingTop: style.paddingTop ?? 16,
    paddingBottom: style.paddingBottom ?? 16,
    paddingLeft: style.paddingLeft ?? 16,
    paddingRight: style.paddingRight ?? 16,
  };

  return (
    <div style={containerStyle}>
      {(() => {
        switch (data.type) {
          case "header":
            return (
              <HeaderSection
                data={data as HeaderData}
                onUpdate={onUpdate}
                globalStyle={globalStyle}
              />
            );
          case "text":
            return (
              <TextSection
                data={data as TextData}
                onUpdate={onUpdate}
                globalStyle={globalStyle}
              />
            );
          case "image":
            return (
              <ImageSection
                data={data as ImageData}
                onUpdate={onUpdate}
                globalStyle={globalStyle}
              />
            );
          case "button":
            return (
              <ButtonSection
                data={data as ButtonData}
                onUpdate={onUpdate}
                globalStyle={globalStyle}
              />
            );
          case "divider":
            return (
              <DividerSection
                data={data as DividerData}
                onUpdate={onUpdate}
                globalStyle={globalStyle}
              />
            );
          case "columns":
            return (
              <ColumnsSection
                data={data as ColumnsData}
                onUpdate={onUpdate}
                globalStyle={globalStyle}
              />
            );
          case "social":
            return (
              <SocialSection
                data={data as SocialData}
                onUpdate={onUpdate}
                globalStyle={globalStyle}
              />
            );
          case "footer":
            return (
              <FooterSection
                data={data as FooterData}
                onUpdate={onUpdate}
                globalStyle={globalStyle}
              />
            );
          case "spacer":
            return (
              <SpacerSection
                data={data as SpacerData}
                onUpdate={onUpdate}
                globalStyle={globalStyle}
                isSelected={isSelected}
              />
            );
          default:
            return (
              <div className="p-4 text-sm text-gray-400 italic">
                Tipo de secao desconhecido
              </div>
            );
        }
      })()}
    </div>
  );
}
