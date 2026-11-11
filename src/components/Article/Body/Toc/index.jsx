import React, { useEffect, useRef } from "react"
import styled from "styled-components"

const Contents = styled.nav`
  margin: 0 0 26px;
  min-width: 0;
  font-size: 14px;
  color: ${props => props.theme.colors.secondaryText};
  summary {
    padding: 9px 0;
    color: ${props => props.theme.colors.text};
    font-weight: 650;
    cursor: pointer;
  }
  ol { margin: 0; padding: 2px 0 12px 14px; border-left: 1px solid ${props => props.theme.colors.border}; list-style: none; }
  li + li { margin-top: 2px; }
  a {
    display: block;
    padding: 4px 0;
    color: inherit;
    text-decoration: none;
    line-height: 1.55;
    overflow-wrap: anywhere;
    word-break: keep-all;
  }
  a:hover, a:focus-visible { color: ${props => props.theme.colors.accent}; text-decoration: underline; }
  li[data-depth="3"] { padding-left: 12px; }

  @media (min-width: 1340px) {
    position: absolute;
    inset: 0 auto 0 calc(100% + 38px);
    width: 194px;
    margin: 0;
    details { position: sticky; top: 90px; overflow: auto; max-height: calc(100vh - 112px); }
  }
`

const Toc = ({ items }) => {
  const disclosure = useRef(null)
  useEffect(() => {
    const details = disclosure.current
    if (!details) return
    const desktop = window.matchMedia("(min-width: 1340px)")
    const sync = () => { details.open = desktop.matches }
    sync()
    desktop.addEventListener("change", sync)
    return () => desktop.removeEventListener("change", sync)
  }, [items])

  if (!items.length) return null
  return (
    <Contents aria-label="글의 목차">
      <details ref={disclosure}>
        <summary>글 목차</summary>
        <ol>
          {items.map(({ id, text, depth }) => (
            <li key={id} data-depth={depth}><a href={`#${id}`}>{text}</a></li>
          ))}
        </ol>
      </details>
    </Contents>
  )
}

export default Toc
