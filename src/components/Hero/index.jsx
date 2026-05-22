import React from "react"
import styled from "styled-components"
import { Link } from "gatsby"

import { categoryOf } from "utils/categoryRules"

const Wrapper = styled(Link)`
  display: grid;
  grid-template-columns: 6px 1fr;
  gap: 28px;
  align-items: stretch;
  margin-top: 32px;
  padding: 32px 32px 32px 26px;
  border-radius: 16px;
  background: ${(props) => props.theme.colors.cardBackground};
  border: 1px solid ${(props) => props.theme.colors.cardBorder};
  text-decoration: none;
  color: inherit;
  transition: border-color 0.15s ease;

  &:hover {
    border-color: ${(props) => props.theme.colors.cardBorderHover};
  }

  @media (max-width: 768px) {
    grid-template-columns: 4px 1fr;
    gap: 18px;
    padding: 24px 22px 24px 18px;
  }
`

const AccentBar = styled.div`
  background: ${(props) => props.accent};
  border-radius: 2px;
`

const Body = styled.div`
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
`

const TopRow = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 12.5px;
  color: ${(props) => props.theme.colors.tertiaryText};
`

const CategoryLabel = styled.span`
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: ${(props) => props.accent};
`

const HeroTitle = styled.h1`
  margin: 0;
  font-size: 30px;
  font-weight: 700;
  line-height: 1.3;
  letter-spacing: -0.02em;
  color: ${(props) => props.theme.colors.text};
  word-break: keep-all;
  overflow-wrap: break-word;

  @media (max-width: 768px) {
    font-size: 24px;
    line-height: 1.35;
  }
`

const HeroExcerpt = styled.p`
  margin: 0;
  font-size: 15.5px;
  line-height: 1.7;
  color: ${(props) => props.theme.colors.secondaryText};
  word-break: keep-all;
  overflow-wrap: break-word;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
`

const TagText = styled.span`
  color: ${(props) => props.theme.colors.tertiaryText};
`

const Hero = ({ post }) => {
  if (!post) return null
  const { title, date, tags } = post.frontmatter
  const { excerpt } = post
  const { slug, category: topDir } = post.fields
  const category = categoryOf(topDir)
  const accent = category?.accent || "#3182f6"

  return (
    <Wrapper to={slug}>
      <AccentBar accent={accent} />
      <Body>
        <TopRow>
          {category && (
            <CategoryLabel accent={accent}>{category.label}</CategoryLabel>
          )}
          {category && <span>·</span>}
          <span>{date}</span>
        </TopRow>
        <HeroTitle>{title}</HeroTitle>
        <HeroExcerpt>{excerpt}</HeroExcerpt>
        {tags && tags.length > 0 && (
          <TopRow>
            <TagText>{tags.slice(0, 4).join(", ")}</TagText>
          </TopRow>
        )}
      </Body>
    </Wrapper>
  )
}

export default Hero
