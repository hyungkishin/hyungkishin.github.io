import React from "react"
import styled from "styled-components"

import { author } from "../../../../blog-config"

import Divider from "components/Divider"
import TagList from "components/TagList"

const Wrapper = styled.div`
  margin-top: 40px;
  margin-bottom: 48px;
  @media (max-width: 768px) {
    padding: 0 20px;
    margin-top: 24px;
  }
`

const ArticleTitle = styled.h1`
  margin-bottom: 24px;
  line-height: 1.25;
  font-size: 3rem;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: ${props => props.theme.colors.text};
  
  @media (max-width: 768px) {
    font-size: 2.2rem;
  }
`

const Information = styled.div`
  display: flex;
  align-items: center;
  margin-bottom: 32px;
  font-size: 0.95rem;
  color: ${props => props.theme.colors.secondaryText};
  gap: 8px;
`

const Author = styled.span`
  font-weight: 600;
  color: ${props => props.theme.colors.accent};
`

const Date = styled.span`
  font-weight: 400;
  opacity: 0.8;
`

const Header = ({ title, date, tags, minToRead }) => {
  return (
    <Wrapper>
      <ArticleTitle>{title}</ArticleTitle>
      <Information>
        <Author>@{author}</Author>
        <span>·</span>
        <Date>{date}</Date>
        {minToRead && (
          <>
            <span>·</span>
            <Date>{minToRead} min read</Date>
          </>
        )}
      </Information>
      {tags && <TagList tagList={tags} />}
      <Divider mt="32px" />
    </Wrapper>
  )
}

export default Header
