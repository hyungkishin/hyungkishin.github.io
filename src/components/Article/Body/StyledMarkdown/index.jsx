import styled from "styled-components"

const StyledMarkdown = styled.div`
  & {
    font-size: clamp(17px, 1.3vw, 18px);
    color: ${props => props.theme.colors.secondaryText};
    line-height: 1.85;
    word-break: keep-all;
    overflow-wrap: anywhere;
    letter-spacing: -0.012em;
  }

  & h1:first-child,
  & h2:first-child,
  & h3:first-child,
  & h4:first-child {
    margin-top: 0;
  }

  & > p,
  & > ul,
  & > ol,
  & table,
  & blockquote,
  & img,
  & .katex-display {
    margin-top: 0;
    margin-bottom: 16px;
  }

  & > p { margin-bottom: 1.25em; }
  & > p:first-child, & strong { color: ${props => props.theme.colors.text}; }
  & :is(h1, h2, h3, h4) { scroll-margin-top: 90px; }

  & h1,
  & h2,
  & h3,
  & h4,
  & h5,
  & h6 {
    margin: 2rem 0 0.8rem 0;
    font-weight: 700;
    line-height: 1.3;
    color: ${props => props.theme.colors.text};
  }

  & h1 {
    font-size: 2.2rem;
  }

  & h2 {
    font-size: clamp(24px, 2.4vw, 31px);
    margin: 2.15em 0 .65em;
    text-wrap: balance;
    line-height: 1.42;
    letter-spacing: -.035em;
  }

  & h3 {
    font-size: clamp(20px, 1.7vw, 23px);
    margin: 1.65em 0 .6em;
    line-height: 1.5;
  }

  & h4 {
    font-size: 1.1rem;
    margin-top: 1.2rem;
  }

  & h5 {
    font-size: 1rem;
  }

  & h6 {
    font-size: 0.9rem;
  }

  & strong {
    font-weight: 700;
  }

  & em {
    font-style: italic;
  }

  & blockquote {
    padding: 1rem 1.5rem;
    margin: 2rem 0;
    border-left: 4px solid ${props => props.theme.colors.blockQuoteBorder};
    background-color: ${props => props.theme.colors.blockQuoteBackground};
    border-radius: 0 4px 4px 0;

    & *:last-child {
      margin-bottom: 0;
    }

    & p {
      color: ${props => props.theme.colors.secondaryText};
      font-style: normal;
    }
  }

  & blockquote:has(> p:first-child > strong:first-child:only-child) {
    padding: 1rem 1.25rem;
    margin: 1.6rem 0;
    background: ${props => props.theme.colors.background};
    border-left: 3px solid ${props => props.theme.colors.accent};
    border-radius: 0;
    p { color: ${props => props.theme.colors.text}; font-style: normal; }
    p:first-child > strong {
      color: ${props => props.theme.colors.accent};
      font-size: .8em;
      letter-spacing: .025em;
    }
  }
  & > blockquote:first-child { margin-top: 0; }

  /* Callout — markdown 안에 <div class="callout note|warn|good|danger"> 사용 */
  & .callout {
    margin: 1.5rem 0;
    padding: 1rem 1.25rem;
    border-radius: 10px;
    border-left: 5px solid;
    font-size: 0.97em;
    line-height: 1.7;

    & > *:first-child { margin-top: 0; }
    & > *:last-child { margin-bottom: 0; }

    & .callout-title {
      display: block;
      font-size: 0.78rem;
      letter-spacing: 0.1em;
      font-weight: 800;
      text-transform: uppercase;
      margin-bottom: 0.4rem;
    }
  }
  & .callout.note {
    background-color: ${props => props.theme.colors.calloutNoteBackground};
    border-left-color: ${props => props.theme.colors.calloutNoteBorder};
    color: ${props => props.theme.colors.calloutNoteText};
    & .callout-title { color: ${props => props.theme.colors.calloutNoteBorder}; }
  }
  & .callout.warn {
    background-color: ${props => props.theme.colors.calloutWarnBackground};
    border-left-color: ${props => props.theme.colors.calloutWarnBorder};
    color: ${props => props.theme.colors.calloutWarnText};
    & .callout-title { color: ${props => props.theme.colors.calloutWarnBorder}; }
  }
  & .callout.good {
    background-color: ${props => props.theme.colors.calloutGoodBackground};
    border-left-color: ${props => props.theme.colors.calloutGoodBorder};
    color: ${props => props.theme.colors.calloutGoodText};
    & .callout-title { color: ${props => props.theme.colors.calloutGoodBorder}; }
  }
  & .callout.danger {
    background-color: ${props => props.theme.colors.calloutDangerBackground};
    border-left-color: ${props => props.theme.colors.calloutDangerBorder};
    color: ${props => props.theme.colors.calloutDangerText};
    & .callout-title { color: ${props => props.theme.colors.calloutDangerBorder}; }
  }

  /* Attempts — 시도 카드. <div class="attempts"><div class="attempt">...</div></div> */
  & .attempts {
    counter-reset: attempt;
    display: grid;
    gap: 14px;
    margin: 1.5rem 0;
  }
  & .attempt {
    counter-increment: attempt;
    position: relative;
    padding: 1.25rem 1.5rem 1.25rem 4.6rem;
    border: 1px solid ${props => props.theme.colors.border};
    border-radius: 14px;
    background: ${props => props.theme.colors.background};
    transition: all 0.18s;
  }
  & .attempt::before {
    content: counter(attempt, decimal-leading-zero);
    position: absolute;
    left: 1.2rem;
    top: 1.25rem;
    width: 2.5rem;
    height: 2.5rem;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 10px;
    background: ${props => props.theme.colors.accent};
    color: #fff;
    font-size: 0.85rem;
    font-weight: 800;
    letter-spacing: 0.04em;
  }
  & .attempt:hover {
    border-color: ${props => props.theme.colors.accent};
    box-shadow: 0 6px 16px rgba(76, 110, 245, 0.1);
  }
  & .attempt > *:first-child { margin-top: 0; }
  & .attempt > *:last-child { margin-bottom: 0; }
  & .attempt h3:first-child {
    margin-top: 0;
    margin-bottom: 0.6rem;
    font-size: 1.1rem;
    color: ${props => props.theme.colors.text};
  }

  & blockquote blockquote {
    margin-top: 1rem;
  }

  & blockquote > p > code.language-text {
    background-color: ${props => props.theme.colors.inlineCodeBackgroundDarker};
  }

  & .table-scroll { overflow-x: auto; margin: 1.5rem 0 2rem; }
  & table {
    width: 100%;
    border-collapse: collapse;
    margin: 0;
    font-size: .9em;
    line-height: 1.65;
  }
  & th, & td {
    min-width: 7.5em;
    padding: .65em .9em;
    border-bottom: 1px solid ${props => props.theme.colors.border};
    text-align: left;
    vertical-align: top;
  }
  & th { font-weight: 650; background: ${props => props.theme.colors.background}; }

  & :not(pre) > code {
    padding: .09em .27em;
    font: .87em/1.5 "SFMono-Regular", Consolas, monospace;
    color: ${props => props.theme.colors.inlineCode};
    background: ${props => props.theme.colors.inlineCodeBackground};
    border-radius: 3px;
    overflow-wrap: anywhere;
    white-space: normal;
  }
  & ul,
  & ol {
    padding-left: 1.5rem;
    margin-bottom: 1rem;
  }

  & ol {
    list-style: decimal;
  }

  & ul {
    list-style: disc;
  }

  & ul ul,
  & ul ol,
  & ol ul,
  & ol ol {
    margin-top: 0.2rem;
    margin-bottom: 0.2rem;
  }

  & ul ul {
    list-style: circle;
  }

  & ul ul ul {
    list-style: square;
  }

  & li {
    margin-bottom: 0.3rem;
  }

  & li p {
    margin: 0;
  }

  & li > *:first-child {
    margin-top: 0;
  }

  & pre, & pre[class*="language-"] {
    max-width: 100%;
    overflow: auto;
    padding: 18px 20px;
    margin: 20px 0 26px;
    border: 1px solid ${props => props.theme.colors.border};
    border-radius: 7px;
    line-height: 1.72;
    tab-size: 4;
    overscroll-behavior-x: contain;
    font-size: 14px;
    color: ${props => props.theme.colors.text};
    background-color: ${props => props.theme.colors.background};
  }
  & pre code, & pre code[class*="language-"] {
    font: inherit;
    font-family: "SFMono-Regular", Consolas, monospace;
    white-space: pre;
    color: inherit;
    background: none;
  }

  & .gatsby-resp-image-figure {
    margin: 2.5rem 0;
  }

  & .gatsby-resp-image-wrapper {
    margin-left: 0 !important;
    margin-right: 0 !important;
    border-radius: 8px;
    overflow: hidden;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.05);
  }

  & img {
    display: block;
    width: 100%;
    height: auto;
    border-radius: 8px;
    cursor: zoom-in;
  }

  & :not(.diagram) > figcaption {
    margin: .55rem 0 1.7rem;
    color: ${props => props.theme.colors.tertiaryText};
    font-size: .84rem;
    line-height: 1.65;
  }

  & hr {
    border: none;
    border-bottom: 1px solid ${props => props.theme.colors.divider};
    margin: 2.5rem 0;
    opacity: 0.6;
  }

  & hr + h2 {
    margin-top: 0;
  }

  & a {
    color: ${props => props.theme.colors.accent};
    text-decoration: underline;
    text-decoration-thickness: 1px;
    text-underline-offset: .2em;
  }
  & a:hover { text-decoration-thickness: 2px; }

  & .mermaid-diagram {
    margin-top: 0;
    margin-bottom: 32px;
    padding: 14px;
    border: 1px solid ${props => props.theme.colors.border};
    border-radius: 10px;
    background: #fff;
    color-scheme: light;
    color: #101d35;
    overflow-x: auto;
    overscroll-behavior-x: contain;

    svg {
      display: block;
      min-width: var(--chart-width, 0px);
      width: 100%;
      height: auto;
      margin-inline: auto;
    }
  }
`

export default StyledMarkdown
