// ---- Accent (light/dark 공유) ----
const ACCENT = "#2455df"
const ACCENT_HOVER = "#153daf"

// ---- Light ----
const LIGHT_BG = "#ffffff"
const LIGHT_BG_SOFT = "#f1f6ff"
const LIGHT_CARD = "#ffffff"
const LIGHT_BORDER = "#dce5f2"
const LIGHT_BORDER_SOFT = "#e2eaf5"
const LIGHT_DIVIDER = "#e2eaf5"

const LIGHT_TEXT = "#101d35"
const LIGHT_TEXT_BODY = "#33445e"
const LIGHT_TEXT_MUTED = "#576984"
const LIGHT_TEXT_FAINT = "#667790"

// ---- Dark ----
const DARK_BG = "#101929"
const DARK_BG_SOFT = "#1b2a44"
const DARK_BORDER = "#3c4e6c"
const DARK_BORDER_SOFT = "#2d405e"
const DARK_DIVIDER = "#2d405e"

const DARK_TEXT = "#f4f7ff"
const DARK_TEXT_BODY = "#cfdbef"
const DARK_TEXT_MUTED = "#a5b6d1"
const DARK_TEXT_FAINT = "#92a3bf"

const DARK_ACCENT = "#9ab8ff"

export const light = {
  name: "light",
  colors: {
    bodyBackground: LIGHT_BG,
    text: LIGHT_TEXT,
    secondaryText: LIGHT_TEXT_BODY,
    tertiaryText: LIGHT_TEXT_MUTED,
    mutedText: LIGHT_TEXT_FAINT,
    hoveredLinkText: LIGHT_BG,
    border: LIGHT_BORDER,
    activatedBorder: LIGHT_TEXT_MUTED,
    background: LIGHT_BG_SOFT,
    cardBackground: LIGHT_CARD,
    cardBorder: LIGHT_BORDER_SOFT,
    cardBorderHover: LIGHT_BORDER,
    seriesCardBackground: LIGHT_BG_SOFT,
    dividerSoft: LIGHT_DIVIDER,
    chipBackground: LIGHT_BG_SOFT,
    chipText: LIGHT_TEXT_BODY,
    icon: LIGHT_TEXT_BODY,
    divider: LIGHT_DIVIDER,
    headerBackground: "rgba(255, 255, 255, 0.92)",
    headerShadow: "rgba(0, 0, 0, 0.04)",
    inlineCodeBackground: LIGHT_BG_SOFT,
    inlineCodeBackgroundDarker: LIGHT_BORDER,
    tagBackground: LIGHT_BG_SOFT,
    selectedTagBackground: ACCENT,
    hoveredTagBackground: LIGHT_BORDER_SOFT,
    hoveredSelectedTagBackground: ACCENT_HOVER,
    nextPostButtonBackground: LIGHT_BG_SOFT,
    hoveredNextPostButtonBackground: LIGHT_BORDER_SOFT,
    seriesBackground: LIGHT_BG_SOFT,
    tagText: LIGHT_TEXT_BODY,
    selectedTagText: LIGHT_BG,
    spinner: ACCENT,
    scrollTrack: LIGHT_BG_SOFT,
    scrollHandle: LIGHT_BORDER,
    blockQuoteBorder: ACCENT,
    blockQuoteBackground: LIGHT_BG_SOFT,
    textFieldBorder: LIGHT_BORDER,
    textFieldActivatedBorder: ACCENT,
    tableBackground: LIGHT_BG_SOFT,
    accent: ACCENT,
    inlineCode: "#244dba",
    zoomBackground: "rgba(255, 255, 255, 0.95)",
    tldrBackground: "#fefce8",
    tldrBorder: "#eab308",
    tldrText: "#713f12",
    calloutNoteBackground: "#eff6ff",
    calloutNoteBorder: ACCENT,
    calloutNoteText: "#1e3a8a",
    calloutWarnBackground: "#fefce8",
    calloutWarnBorder: "#eab308",
    calloutWarnText: "#713f12",
    calloutGoodBackground: "#f0fdf4",
    calloutGoodBorder: "#22c55e",
    calloutGoodText: "#14532d",
    calloutDangerBackground: "#fef2f2",
    calloutDangerBorder: "#ef4444",
    calloutDangerText: "#7f1d1d",
    codeLangBadgeBackground: LIGHT_BG_SOFT,
    codeLangBadgeText: LIGHT_TEXT_BODY,
    accentMustard: ACCENT,
    accentTerracotta: ACCENT,
    accentForest: ACCENT,
    accentNavy: ACCENT,
  },
}

export const dark = {
  name: "dark",
  colors: {
    bodyBackground: DARK_BG,
    text: DARK_TEXT,
    secondaryText: DARK_TEXT_BODY,
    tertiaryText: DARK_TEXT_MUTED,
    mutedText: DARK_TEXT_FAINT,
    hoveredLinkText: DARK_BG,
    border: DARK_BORDER,
    activatedBorder: DARK_TEXT_MUTED,
    background: DARK_BG_SOFT,
    cardBackground: DARK_BG,
    cardBorder: DARK_BORDER_SOFT,
    cardBorderHover: DARK_BORDER,
    seriesCardBackground: DARK_BG_SOFT,
    dividerSoft: DARK_DIVIDER,
    chipBackground: DARK_BG_SOFT,
    chipText: DARK_TEXT_BODY,
    icon: DARK_TEXT_BODY,
    divider: DARK_DIVIDER,
    headerBackground: "rgba(10, 10, 10, 0.92)",
    headerShadow: "rgba(0, 0, 0, 0.4)",
    inlineCodeBackground: DARK_BG_SOFT,
    inlineCodeBackgroundDarker: DARK_BORDER,
    tagBackground: DARK_BG_SOFT,
    selectedTagBackground: DARK_ACCENT,
    hoveredTagBackground: DARK_BORDER,
    hoveredSelectedTagBackground: "#93c5fd",
    nextPostButtonBackground: "rgba(255, 255, 255, 0.04)",
    hoveredNextPostButtonBackground: "rgba(255, 255, 255, 0.08)",
    seriesBackground: DARK_BG_SOFT,
    tagText: DARK_TEXT_BODY,
    selectedTagText: DARK_BG,
    spinner: DARK_ACCENT,
    scrollTrack: DARK_BG,
    scrollHandle: DARK_BORDER,
    blockQuoteBorder: DARK_ACCENT,
    blockQuoteBackground: DARK_BG_SOFT,
    textFieldBorder: DARK_BORDER,
    textFieldActivatedBorder: DARK_ACCENT,
    tableBackground: DARK_BG_SOFT,
    accent: DARK_ACCENT,
    inlineCode: "#acc8ff",
    zoomBackground: "rgba(10, 10, 10, 0.95)",
    tldrBackground: "#422006",
    tldrBorder: "#eab308",
    tldrText: "#fde68a",
    calloutNoteBackground: "#172554",
    calloutNoteBorder: DARK_ACCENT,
    calloutNoteText: "#bfdbfe",
    calloutWarnBackground: "#422006",
    calloutWarnBorder: "#eab308",
    calloutWarnText: "#fde68a",
    calloutGoodBackground: "#14532d",
    calloutGoodBorder: "#22c55e",
    calloutGoodText: "#bbf7d0",
    calloutDangerBackground: "#450a0a",
    calloutDangerBorder: "#ef4444",
    calloutDangerText: "#fecaca",
    codeLangBadgeBackground: DARK_BG_SOFT,
    codeLangBadgeText: DARK_TEXT_BODY,
    accentMustard: DARK_ACCENT,
    accentTerracotta: DARK_ACCENT,
    accentForest: DARK_ACCENT,
    accentNavy: DARK_ACCENT,
  },
}
