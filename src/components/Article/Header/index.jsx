import React from "react"
import ReadingLink from "components/ReadingLink"
import styled from "styled-components"
import { author } from "../../../../blog-config"

const Wrapper = styled.header`
  margin: clamp(18px, 4vw, 46px) 0 24px;
  padding-bottom: 22px;
  border-bottom: 1px solid ${props => props.theme.colors.border};

  > a {
    display: inline-block;
    margin-bottom: 12px;
    color: ${props => props.theme.colors.accent};
    font-size: 14px;
    font-weight: 650;
    text-underline-offset: 3px;
  }
  h1 {
    margin: 0 0 16px;
    font-size: clamp(30px, 4vw, 46px);
    font-weight: 750;
    line-height: 1.25;
    letter-spacing: -.05em;
    word-break: keep-all;
    overflow-wrap: anywhere;
    text-wrap: balance;
  }
  p {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 16px;
    color: ${props => props.theme.colors.tertiaryText};
    font-size: 14px;
    line-height: 1.5;
  }
`

const Header = ({ title, date, isoDate, series }) => (
  <Wrapper>
    {series?.indexSlug && <ReadingLink to={series.indexSlug}>{series.name}</ReadingLink>}
    <h1>{title}</h1>
    <p><span>@{author}</span><time dateTime={isoDate}>{date}</time></p>
  </Wrapper>
)

export default Header
