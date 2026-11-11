import React from "react"
import styled from "styled-components"

export const Archive = styled.div`
  max-width: 900px;
  margin: 0 auto;
  padding-bottom: 48px;
  color: var(--ink);
`

export const ArchiveHeader = styled.header`
  padding: clamp(24px, 5vw, 66px) 0 24px;
  h1 {
    margin: 0 0 22px;
    font-size: clamp(34px, 5vw, 58px);
    font-weight: 750;
    line-height: 1.14;
    letter-spacing: -0.055em;
  }
`

const ResultHeading = styled.h2`
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin: 25px 0 0;
  padding-bottom: 15px;
  border-bottom: 1px solid var(--ink);
  font-size: 20px;
  line-height: 1.5;
  font-weight: 650;
  letter-spacing: -0.035em;
  word-break: keep-all;
  overflow-wrap: anywhere;
  span {
    flex-shrink: 0;
    color: var(--muted);
    font-size: 14px;
    font-weight: 500;
    font-variant-numeric: tabular-nums;
  }
`

export function ResultCount({ title, count }) {
  return (
    <ResultHeading aria-live="polite" aria-atomic="true">
      {title}
      <span>{count}편</span>
    </ResultHeading>
  )
}

export const Empty = styled.p`
  margin: 0;
  padding: 32px 0;
  color: var(--muted);
  line-height: 1.7;
`
