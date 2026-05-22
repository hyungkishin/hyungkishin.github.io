import React from "react"
import styled from "styled-components"
import { Link } from "gatsby"

const Wrapper = styled.div`
  margin-top: 32px;
  display: flex;
  flex-direction: column;
  gap: 14px;
`

const Row = styled(Link)`
  display: grid;
  grid-template-columns: 48px 1fr auto;
  align-items: start;
  gap: 18px;
  padding: 22px 24px;
  border-radius: 16px;
  background: ${(props) => props.theme.colors.cardBackground};
  border: 1px solid ${(props) => props.theme.colors.cardBorder};
  text-decoration: none;
  color: inherit;
  transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 24px rgba(15, 23, 42, 0.08);
    border-color: ${(props) => props.theme.colors.cardBorderHover};
  }

  @media (max-width: 600px) {
    grid-template-columns: 40px 1fr;
    grid-template-areas:
      "num title"
      "num excerpt"
      "num tags"
      ".   date";
    gap: 6px 14px;
    padding: 18px 18px;
  }
`

const Number = styled.div`
  grid-row: span 2;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  background: ${(props) => props.accent}15;
  color: ${(props) => props.accent};
  font-weight: 700;
  font-size: 15px;
  letter-spacing: 0;

  @media (max-width: 600px) {
    grid-area: num;
    grid-row: span 1;
  }
`

const Body = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;

  @media (max-width: 600px) {
    grid-column: span 1;
  }
`

const Title = styled.h2`
  margin: 0;
  font-size: 17px;
  font-weight: 700;
  line-height: 1.45;
  letter-spacing: -0.01em;
  color: ${(props) => props.theme.colors.text};
  word-break: keep-all;
  overflow-wrap: break-word;

  @media (max-width: 600px) {
    grid-area: title;
  }
`

const Excerpt = styled.p`
  margin: 0;
  font-size: 14px;
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

const TagRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 4px;

  @media (max-width: 600px) {
    grid-area: tags;
  }
`

const TagChip = styled.span`
  display: inline-block;
  padding: 2px 8px;
  border-radius: 5px;
  background: ${(props) => props.theme.colors.chipBackground};
  color: ${(props) => props.theme.colors.chipText};
  font-size: 11.5px;
  font-weight: 500;
`

const DateText = styled.div`
  align-self: start;
  font-size: 12.5px;
  letter-spacing: 0.02em;
  color: ${(props) => props.theme.colors.tertiaryText};
  white-space: nowrap;
  padding-top: 4px;

  @media (max-width: 600px) {
    grid-area: date;
    padding-top: 6px;
  }
`

const truncateExcerpt = (excerpt, maxLength = 120) => {
  if (!excerpt) return ""
  if (excerpt.length <= maxLength) return excerpt
  return excerpt.slice(0, maxLength).trimEnd() + "…"
}

const SeriesPostList = ({ posts, accent = "#3182f6" }) => {
  return (
    <Wrapper>
      {posts.map((post, idx) => {
        const { title, date, tags } = post.frontmatter
        const { slug } = post.fields
        const { excerpt } = post
        return (
          <Row key={slug} to={slug}>
            <Number accent={accent}>{String(idx + 1).padStart(2, "0")}</Number>
            <Body>
              <Title>{title}</Title>
              <Excerpt>{truncateExcerpt(excerpt)}</Excerpt>
              {tags && tags.length > 0 && (
                <TagRow>
                  {tags.slice(0, 4).map((tag) => (
                    <TagChip key={tag}>{tag}</TagChip>
                  ))}
                </TagRow>
              )}
            </Body>
            <DateText>{date}</DateText>
          </Row>
        )
      })}
    </Wrapper>
  )
}

export default SeriesPostList
