import { createGlobalStyle } from "styled-components"
import reset from "styled-reset"

const GlobalStyles = createGlobalStyle`
  ${reset}
  *, *::before, *::after { box-sizing: border-box; }
  html { scroll-padding-top: 24px; }
  body {
    --ink: ${p => p.theme.colors.text};
    --body: ${p => p.theme.colors.secondaryText};
    --muted: ${p => p.theme.colors.tertiaryText};
    --paper: ${p => p.theme.colors.bodyBackground};
    --line: ${p => p.theme.colors.border};
    --surface: ${p => p.theme.colors.background};
    --accent: ${p => p.theme.colors.accent};
    --on-accent: ${p => p.theme.name === "dark" ? "#101929" : "#ffffff"};
    color-scheme: ${p => p.theme.name};
    margin: 0;
    background: var(--paper);
    color: var(--ink);
    font-family: 'Pretendard', -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif;
    -webkit-font-smoothing: antialiased;
    word-break: keep-all;
    overflow-wrap: anywhere;
  }
  button, input, select, summary { font: inherit; }
  button { cursor: pointer; }
  :focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
  [id] { scroll-margin-top: 16px; }
`
export default GlobalStyles
