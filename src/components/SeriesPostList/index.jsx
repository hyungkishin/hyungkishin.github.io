import React from "react"
import styled from "styled-components"
import { Link } from "gatsby"

const Wrapper = styled.div`
  margin-top: 32px;
  display: flex;
  flex-direction: column;
`

const Row = styled(Link)`
  display: grid;
  grid-template-columns: 56px 1fr auto;
  align-items: start;
  gap: 24px;
  padding: 24px 4px;
  border-bottom: 1px solid ${(props) => props.theme.colors.dividerSoft};
  text-decoration: none;
  color: inherit;
  transition: opacity 0.15s ease;

  &:first-child {
    border-top: 1px solid ${(props) => props.theme.colors.dividerSoft};
  }

  &:hover h2 {
    color: ${(props) => props.theme.colors.accent};
  }

  @media (max-width: 600px) {
    grid-template-columns: 40px 1fr;
    grid-template-areas:
      "num title"
      "num excerpt"
      "num date";
    gap: 4px 14px;
    padding: 20px 4px;
  }
`

const Numeral = styled.div`
  grid-row: span 3;
  font-size: 24px;
  font-weight: 700;
  line-height: 1;
  color: ${(props) => props.theme.colors.tertiaryText};
  padding-top: 4px;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.02em;

  @media (max-width: 600px) {
    grid-area: num;
    grid-row: span 1;
    font-size: 18px;
  }
`

const Body = styled.div`
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;

  @media (max-width: 600px) {
    grid-column: span 1;
  }
`

const Title = styled.h2`
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  line-height: 1.35;
  letter-spacing: -0.015em;
  color: ${(props) => props.theme.colors.text};
  word-break: keep-all;
  overflow-wrap: break-word;
  transition: color 0.15s ease;

  @media (max-width: 600px) {
    grid-area: title;
    font-size: 18px;
  }
`

const Excerpt = styled.p`
  margin: 0;
  font-size: 14.5px;
  line-height: 1.65;
  color: ${(props) => props.theme.colors.secondaryText};
  word-break: keep-all;
  overflow-wrap: break-word;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;

  @media (max-width: 600px) {
    grid-area: excerpt;
  }
`

const Meta = styled.div`
  font-size: 12.5px;
  color: ${(props) => props.theme.colors.tertiaryText};
  margin-top: 2px;

  @media (max-width: 600px) {
    grid-area: date;
  }
`

const DateText = styled.div`
  font-size: 13px;
  color: ${(props) => props.theme.colors.tertiaryText};
  white-space: nowrap;
  padding-top: 6px;

  @media (max-width: 600px) {
    display: none;
  }
`

const truncateExcerpt = (excerpt, maxLength = 130) => {
  if (!excerpt) return ""
  if (excerpt.length <= maxLength) return excerpt
  return excerpt.slice(0, maxLength).trimEnd() + "…"
}

const SeriesPostList = ({ posts }) => {
  return (
    <Wrapper>
      {posts.map((post, idx) => {
        const { title, date, tags } = post.frontmatter
        const { slug } = post.fields
        const { excerpt } = post
        const rowKey = post.id || slug
        return (
          <Row key={rowKey} to={slug}>
            <Numeral>{String(idx + 1).padStart(2, "0")}</Numeral>
            <Body>
              <Title>{title}</Title>
              <Excerpt>{truncateExcerpt(excerpt)}</Excerpt>
              <Meta>
                {date}
                {tags && tags.length > 0 && ` · ${tags.slice(0, 3).join(", ")}`}
              </Meta>
            </Body>
            <DateText>{date}</DateText>
          </Row>
        )
      })}
    </Wrapper>
  )
}

export default SeriesPostList
