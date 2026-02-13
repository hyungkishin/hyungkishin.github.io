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
    margin-bottom: 20px;
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
    margin: 3rem 0 1rem 0;
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
    margin-top: 3.5rem;
    margin-bottom: 1.2rem;
    line-height: 1.2;
  }

  & h3 {
    font-size: 1.4rem;
    margin-top: 2rem;
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

  & blockquote blockquote {
    margin-top: 1rem;
  }

  & blockquote > p > code.language-text {
    background-color: ${props => props.theme.colors.inlineCodeBackgroundDarker};
  }

  & table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 2rem;
  }

  & th {
    background-color: ${props => props.theme.colors.background};
    border-bottom: 2px solid ${props => props.theme.colors.border};
    font-weight: 700;
    text-align: left;
  }

  & td {
    border-bottom: 1px solid ${props => props.theme.colors.divider};
  }

  & td,
  th {
    padding: 12px 15px;
  }

  & tr:last-child td {
    border-bottom: none;
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
    margin: 4rem 0;
    opacity: 0.6;
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
`

export default StyledMarkdown
