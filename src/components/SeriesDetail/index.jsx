import React from "react"
import styled from "styled-components"
import ReadingLink from "components/ReadingLink"
import SeriesPostList from "components/SeriesPostList"
import { sortSeriesPosts } from "utils/seriesRules"

const Collection = styled.section`
  width: min(100%, 790px);
  margin: clamp(18px, 4vw, 56px) auto 64px;
  word-break: keep-all;
  overflow-wrap: anywhere;
  > header {
    padding-bottom: 26px;
    border-bottom: 1px solid ${p => p.theme.colors.border};
  }
  > header a { color: ${p => p.theme.colors.accent}; font-size: 14px; text-underline-offset: 3px; }
  h1 {
    color: ${p => p.theme.colors.text};
    font-size: clamp(32px, 4vw, 48px);
    line-height: 1.25;
    font-weight: 750;
    letter-spacing: -.045em;
    margin: 16px 0 11px;
  }
  > header p { font-size: 17px; line-height: 1.7; color: ${p => p.theme.colors.secondaryText}; }
  small { display: block; margin-top: 15px; color: ${p => p.theme.colors.tertiaryText}; font-size: 14px; }
`

const SeriesDetail = ({ rule, posts }) => {
  const sorted = sortSeriesPosts(rule, posts)
  return (
    <Collection>
      <header>
        <ReadingLink to="/#posts">글 목록</ReadingLink>
        <h1>{rule.name}</h1>
        {rule.tagline && <p>{rule.tagline}</p>}
        <small>연재 {sorted.length}편</small>
      </header>
      {sorted.length ? <SeriesPostList posts={sorted} /> : <p>아직 등록된 글이 없습니다.</p>}
    </Collection>
  )
}
export default SeriesDetail
