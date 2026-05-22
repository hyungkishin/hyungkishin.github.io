import React from "react"
import styled from "styled-components"
import { Link } from "gatsby"

import { categoryOf } from "utils/categoryRules"

const Wrapper = styled(Link)`
  display: block;
  margin-top: 32px;
  padding: 40px 0 44px;
  border-bottom: 1px solid ${(props) => props.theme.colors.border};
  text-decoration: none;
  color: inherit;
  transition: opacity 0.15s ease;

  &:hover h1 {
    color: ${(props) => props.theme.colors.accent};
  }

  @media (max-width: 768px) {
    padding: 28px 0 32px;
  }
`

const Eyebrow = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 18px;
  font-size: 12.5px;
  font-weight: 500;
  color: ${(props) => props.theme.colors.tertiaryText};
`

const Category = styled.span`
  color: ${(props) => props.theme.colors.accent};
  font-weight: 600;
  letter-spacing: 0.04em;
`

const Sep = styled.span`
  color: ${(props) => props.theme.colors.mutedText};
`

const HeroTitle = styled.h1`
  margin: 0 0 16px;
  font-size: 44px;
  font-weight: 700;
  line-height: 1.15;
  letter-spacing: -0.025em;
  color: ${(props) => props.theme.colors.text};
  word-break: keep-all;
  overflow-wrap: break-word;
  transition: color 0.15s ease;

  @media (max-width: 768px) {
    font-size: 30px;
    line-height: 1.22;
  }
`

const HeroExcerpt = styled.p`
  margin: 0;
  font-size: 16.5px;
  line-height: 1.65;
  color: ${(props) => props.theme.colors.secondaryText};
  word-break: keep-all;
  overflow-wrap: break-word;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  max-width: 720px;
`

const Hero = ({ post }) => {
  if (!post) return null
  const { title, date } = post.frontmatter
  const { excerpt } = post
  const { slug, category: topDir } = post.fields
  const category = categoryOf(topDir)

  return (
    <Wrapper to={slug}>
      <Eyebrow>
        <span>Latest</span>
        {category && (
          <>
            <Sep>·</Sep>
            <Category>{category.label}</Category>
          </>
        )}
        <Sep>·</Sep>
        <span>{date}</span>
      </Eyebrow>
      <HeroTitle>{title}</HeroTitle>
      <HeroExcerpt>{excerpt}</HeroExcerpt>
    </Wrapper>
  )
}

export default Hero
