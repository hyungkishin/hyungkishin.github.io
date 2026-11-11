import React from "react"
import { Link } from "gatsby"
import styled from "styled-components"

const Tags = styled.ul`
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  margin: 0;
  padding: 0;
  list-style: none;
  a {
    display: inline-flex;
    align-items: baseline;
    gap: 6px;
    padding: 7px 12px;
    border-radius: 6px;
    border: 1px solid var(--line);
    color: var(--ink);
    background: var(--paper);
    font-size: 14px;
    line-height: 1.55;
    text-decoration: none;
    overflow-wrap: anywhere;
  }
  a:hover,
  a:focus-visible,
  a[aria-current="true"] {
    color: var(--accent);
    border-color: currentColor;
  }
  small {
    color: var(--muted);
    font-variant-numeric: tabular-nums;
    font-size: 12px;
  }
`

export default function TagList({ tagList = [], count = false, selected }) {
  if (!tagList.length) return null
  return (
    <Tags>
      {tagList.map(tag => {
        const label = count ? tag.fieldValue : tag
        const active = label === selected
        const url = active ? "/tags/" : `/tags/?q=${encodeURIComponent(label)}`
        return (
          <li key={label}>
            <Link to={url} replace={false} aria-current={active || undefined}>
              {label}
              {count && <small>{tag.totalCount}</small>}
            </Link>
          </li>
        )
      })}
    </Tags>
  )
}
