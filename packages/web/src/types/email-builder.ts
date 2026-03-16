// ---------------------------------------------------------------------------
// Email Builder – Type definitions
// ---------------------------------------------------------------------------

export type SectionType =
  | "header"
  | "text"
  | "image"
  | "button"
  | "divider"
  | "columns"
  | "social"
  | "footer"
  | "spacer";

// -- Section style -----------------------------------------------------------

export interface SectionStyle {
  backgroundColor?: string;
  paddingTop?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  paddingRight?: number;
}

// -- Per-type data -----------------------------------------------------------

export interface HeaderData {
  type: "header";
  logoUrl?: string;
  logoWidth?: number;
  companyName?: string;
  alignment: "left" | "center" | "right";
  html: string;
}

export interface TextData {
  type: "text";
  html: string;
}

export interface ImageData {
  type: "image";
  src: string;
  alt: string;
  width: "full" | number;
  alignment: "left" | "center" | "right";
  linkUrl?: string;
}

export interface ButtonData {
  type: "button";
  text: string;
  url: string;
  alignment: "left" | "center" | "right";
  buttonColor: string;
  textColor: string;
  borderRadius: number;
  size: "sm" | "md" | "lg";
}

export interface DividerData {
  type: "divider";
  color: string;
  thickness: number;
  style: "solid" | "dashed" | "dotted";
  width: number; // percentage 1-100
}

export interface ColumnsData {
  type: "columns";
  layout: "50-50" | "33-67" | "67-33" | "33-33-33";
  columns: { html: string }[];
  gap: number;
}

export interface SocialData {
  type: "social";
  alignment: "left" | "center" | "right";
  iconSize: number;
  links: { platform: string; url: string }[];
}

export interface FooterData {
  type: "footer";
  html: string;
  alignment: "center" | "left" | "right";
}

export interface SpacerData {
  type: "spacer";
  height: number;
}

export type SectionData =
  | HeaderData
  | TextData
  | ImageData
  | ButtonData
  | DividerData
  | ColumnsData
  | SocialData
  | FooterData
  | SpacerData;

// -- Section -----------------------------------------------------------------

export interface EmailSection {
  id: string;
  type: SectionType;
  style: SectionStyle;
  data: SectionData;
}

// -- Global style ------------------------------------------------------------

export interface GlobalStyle {
  bodyBackgroundColor: string;
  contentWidth: number;
  contentBackgroundColor: string;
  fontFamily: string;
  fontSize: string;
  textColor: string;
  linkColor: string;
}

// -- Document ----------------------------------------------------------------

export interface EmailDocument {
  sections: EmailSection[];
  globalStyle: GlobalStyle;
}

// -- Defaults ----------------------------------------------------------------

export const DEFAULT_GLOBAL_STYLE: GlobalStyle = {
  bodyBackgroundColor: "#f4f4f5",
  contentWidth: 600,
  contentBackgroundColor: "#ffffff",
  fontFamily: "Arial, Helvetica, sans-serif",
  fontSize: "16px",
  textColor: "#333333",
  linkColor: "#2563eb",
};
