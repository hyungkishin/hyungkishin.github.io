const GRAY9 = "#1a1c1e" // Deepest Slate
// GRAY8 removed as it was unused
const GRAY7 = "#404b4d" // Medium Dark Slate
const GRAY6 = "#636e72" // Muted Slate
const GRAY5 = "#b2bec3" // Light Muted Slate
const GRAY4 = "#dfe6e9" // Light Slate
const GRAY3 = "#e9ecef"
const GRAY2 = "#f1f3f5"
const GRAY1 = "#f8f9fa"
const GRAY0 = "#ffffff"

const PRIMARY = "#4c6ef5" // Indigo accent

export const light = {
  name: "light",
  colors: {
    bodyBackground: "#ffffff",
    text: GRAY9,
    secondaryText: GRAY7,
    tertiaryText: GRAY6,
    mutedText: GRAY5,
    hoveredLinkText: GRAY0,
    border: GRAY4,
    activatedBorder: GRAY6,
    background: GRAY1,
    icon: GRAY6,
    divider: GRAY2,
    headerBackground: "rgba(255, 255, 255, 0.9)",
    headerShadow: "rgba(0, 0, 0, 0.04)",
    inlineCodeBackground: GRAY2,
    inlineCodeBackgroundDarker: GRAY4,
    tagBackground: GRAY2,
    selectedTagBackground: PRIMARY,
    hoveredTagBackground: GRAY3,
    hoveredSelectedTagBackground: "#3b5bdb",
    nextPostButtonBackground: "rgba(0, 0, 0, 0.03)",
    hoveredNextPostButtonBackground: "rgba(0, 0, 0, 0.05)",
    seriesBackground: GRAY1,
    tagText: GRAY7,
    selectedTagText: GRAY0,
    spinner: PRIMARY,
    scrollTrack: GRAY1,
    scrollHandle: GRAY4,
    blockQuoteBorder: PRIMARY,
    blockQuoteBackground: GRAY1,
    textFieldBorder: GRAY4,
    textFieldActivatedBorder: PRIMARY,
    tableBackground: GRAY1,
    accent: PRIMARY,
    inlineCode: "#d6336c",
    zoomBackground: "rgba(255, 255, 255, 0.95)",
  },
}

export const dark = {
  name: "dark",
  colors: {
    bodyBackground: GRAY9,
    text: GRAY1,
    secondaryText: GRAY5,
    tertiaryText: GRAY6,
    mutedText: "#495057",
    hoveredLinkText: GRAY9,
    border: "#343a40",
    activatedBorder: GRAY4,
    background: "#212529",
    icon: GRAY5,
    divider: "#343a40",
    headerBackground: "rgba(26, 28, 30, 0.9)",
    headerShadow: "rgba(0, 0, 0, 0.2)",
    inlineCodeBackground: "#2c2e33",
    inlineCodeBackgroundDarker: "#3d4148",
    tagBackground: "#2c2e33",
    selectedTagBackground: PRIMARY,
    hoveredTagBackground: "#3d4148",
    hoveredSelectedTagBackground: "#3b5bdb",
    nextPostButtonBackground: "rgba(255, 255, 255, 0.03)",
    hoveredNextPostButtonBackground: "rgba(255, 255, 255, 0.06)",
    seriesBackground: "#2c2e33",
    tagText: GRAY3,
    selectedTagText: GRAY0,
    spinner: PRIMARY,
    scrollTrack: "#1a1c1e",
    scrollHandle: "#343a40",
    blockQuoteBorder: PRIMARY,
    blockQuoteBackground: "#25262b",
    textFieldBorder: "#343a40",
    textFieldActivatedBorder: PRIMARY,
    tableBackground: "#2c2e33",
    accent: PRIMARY,
    inlineCode: "#ff922b",
    zoomBackground: "rgba(26, 28, 30, 0.95)",
  },
}
