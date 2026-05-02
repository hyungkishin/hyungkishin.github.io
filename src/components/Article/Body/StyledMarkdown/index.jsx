import styled from "styled-components"

const StyledMarkdown = styled.div`
  & {
    font-size: 17px;
    color: ${props => props.theme.colors.text};
    line-height: 1.7;
    overflow: hidden;
    letter-spacing: -0.01em;

    @media (max-width: 768px) {
      padding: 0 20px;
    }
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

  & p {
    overflow-x: auto;
    word-break: break-word;

    ::-webkit-scrollbar {
      display: none;
    }
  }

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
    font-size: 1.8rem;
    border-left: 5px solid ${props => props.theme.colors.accent};
    padding-left: 1rem;
    margin-top: 2.5rem;
    margin-bottom: 1rem;
    line-height: 1.2;
  }

  & h3 {
    font-size: 1.4rem;
    margin-top: 1.8rem;
    color: ${props => props.theme.colors.secondaryText};
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
      font-style: italic;
    }
  }

  /* TL;DR — blockquote 첫 줄이 **TL;DR** 일 때 자동 강조 */
  & blockquote:has(> p:first-child > strong:first-child:only-child) {
    background-color: ${props => props.theme.colors.tldrBackground};
    border-left: 6px solid ${props => props.theme.colors.tldrBorder};
    border-radius: 8px;
    padding: 1.25rem 1.5rem;

    & p {
      color: ${props => props.theme.colors.tldrText};
      font-style: normal;
    }

    & p:first-child > strong {
      display: inline-block;
      font-size: 0.78rem;
      letter-spacing: 0.12em;
      font-weight: 800;
      color: ${props => props.theme.colors.tldrBorder};
      margin-bottom: 0.4rem;
    }

    & strong {
      color: ${props => props.theme.colors.tldrText};
    }
  }

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

  & table {
    width: 100%;
    border-collapse: separate;
    border-spacing: 0;
    margin: 1.5rem 0 2rem;
    border: 1px solid ${props => props.theme.colors.border};
    border-radius: 10px;
    overflow: hidden;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.04);
  }

  & th {
    background-color: ${props => props.theme.colors.background};
    border-bottom: 1px solid ${props => props.theme.colors.border};
    font-weight: 700;
    text-align: left;
    font-size: 0.92em;
    letter-spacing: 0.01em;
  }

  & td {
    border-bottom: 1px solid ${props => props.theme.colors.divider};
  }

  & td,
  th {
    padding: 12px 16px;
  }

  & tr:last-child td {
    border-bottom: none;
  }

  & tbody tr:hover {
    background-color: ${props => props.theme.colors.background};
  }

  & *:not(pre) > code.language-text,
  & table code.language-text {
    position: relative;
    top: -1px;
    margin: 0 4px;
    padding: 0.2rem 0.4rem;
    font-size: 0.95em;
    background-color: ${props => props.theme.colors.inlineCodeBackground};
    border-radius: 4px;
    font-weight: 500;
    color: ${props => props.theme.colors.inlineCode};
    font-family: 'Source Code Pro', monospace;
  }

  & h2 > code.language-text,
  & h3 > code.language-text,
  & h4 > code.language-text {
    font-size: inherit;
  }

  & tr:nth-child(even) code.language-text {
    background-color: ${props => props.theme.colors.inlineCodeBackgroundDarker};
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

  & pre {
    position: relative;
    margin: 2rem 0;
    border-radius: 8px;
    overflow: hidden;

    ::-webkit-scrollbar {
      height: 8px;
    }
    ::-webkit-scrollbar-track {
      background: ${props => props.theme.colors.background};
    }

    ::-webkit-scrollbar-thumb {
      background: ${props => props.theme.colors.scrollHandle};
      border-radius: 4px;
    }
  }

  /* 코드 블록 언어 배지 */
  & div.gatsby-highlight {
    position: relative;
    margin: 2rem 0;
  }
  & div.gatsby-highlight::before {
    position: absolute;
    top: 8px;
    right: 12px;
    z-index: 1;
    padding: 2px 9px;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    background-color: ${props => props.theme.colors.codeLangBadgeBackground};
    color: ${props => props.theme.colors.codeLangBadgeText};
    pointer-events: none;
  }
  & div.gatsby-highlight[data-language]::before { content: attr(data-language); }
  & div.gatsby-highlight:not([data-language])::before { display: none; }

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

  & figcaption {
    margin-top: 0.8rem;
    margin-bottom: 2rem;
    text-align: center;
    color: ${props => props.theme.colors.secondaryText};
    font-size: 1.15rem;
    font-style: italic;
    line-height: 1.5;
    font-weight: 500;
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
    text-decoration: none;
    font-weight: 500;
    border-bottom: 1px solid transparent;
    transition: all 0.2s;

    & a:hover {
      border-bottom: 1px solid ${props => props.theme.colors.accent};
      opacity: 0.8;
    }
  }

  & .mermaid-diagram {
    margin-top: 0;
    margin-bottom: 32px;
    text-align: center;
    overflow-x: auto;

    svg {
      max-width: 100%;
      height: auto;
    }
  }
`

export default StyledMarkdown
