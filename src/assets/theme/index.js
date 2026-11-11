// ---- Accent (light/dark 공유) ----
const ACCENT = "#126756"
const ACCENT_HOVER = "#0c5144"

// ---- Light ----
const LIGHT_BG = "#f8f9f7"
const LIGHT_BG_SOFT = "#eef1ee"
const LIGHT_CARD = "#f8f9f7"
const LIGHT_BORDER = "#cfd9d2"
const LIGHT_BORDER_SOFT = "#dbe2dd"
const LIGHT_DIVIDER = "#dbe2dd"

const LIGHT_TEXT = "#19282b"
const LIGHT_TEXT_BODY = "#364847"
const LIGHT_TEXT_MUTED = "#526661"
const LIGHT_TEXT_FAINT = "#6b7773"

// ---- Dark ----
const DARK_BG = "#142024"
const DARK_BG_SOFT = "#1e3032"
const DARK_BORDER = "#3b4f4d"
const DARK_BORDER_SOFT = "#334644"
const DARK_DIVIDER = "#334644"

const DARK_TEXT = "#fafafa"
const DARK_TEXT_BODY = "#d4d4d4"
const DARK_TEXT_MUTED = "#a3a3a3"
const DARK_TEXT_FAINT = "#737373"

const DARK_ACCENT = "#86d7ba"

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
    inlineCode: "#245b53",
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
    inlineCode: "#a3d8c8",
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
