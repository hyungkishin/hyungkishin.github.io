import React from "react"
import { useSelector } from "react-redux"
import styled from "styled-components"
import Giscus from "@giscus/react"

import { giscus } from "../../../../blog-config"
import ReadingLink from "components/ReadingLink"
import Bio from "components/Bio"

const Navigation = styled.nav`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px 24px;
  margin: 28px 0 48px;

  a {
    display: block;
    border-top: 1px solid ${props => props.theme.colors.border};
    padding: 13px 0;
    color: ${props => props.theme.colors.text};
    font-size: 16px;
    font-weight: 650;
    line-height: 1.55;
    text-decoration: none;
    word-break: keep-all;
    overflow-wrap: anywhere;
  }
  a[rel="next"] { grid-column: 2; }
  span {
    display: block;
    margin-bottom: 6px;
    color: ${props => props.theme.colors.tertiaryText};
    font-size: 13px;
    font-weight: 500;
  }
  a:hover { color: ${props => props.theme.colors.accent}; }
  @media (max-width: 520px) {
    grid-template-columns: 1fr;
    gap: 0;
    a[rel="next"] { grid-column: 1; }
  }
`

const Comments = styled.div`
  margin-top: 36px;
  border-top: 1px solid ${props => props.theme.colors.border};
  padding-top: 24px;
`

const Footer = ({ previous, next, previousLabel, nextLabel }) => {
  const { theme } = useSelector(state => state.theme)
  return (
    <>
      <Navigation aria-label="다른 글 읽기">
        {previous && (
          <ReadingLink to={previous.fields.slug} rel="prev">
            <span>{previousLabel || "이전 글"}</span>{previous.frontmatter.title}
          </ReadingLink>
        )}
        {next && (
          <ReadingLink to={next.fields.slug} rel="next">
            <span>{nextLabel || "다음 글"}</span>{next.frontmatter.title}
          </ReadingLink>
        )}
      </Navigation>
      <Bio />
      <Comments>
        <Giscus
          id="comments"
          repo={giscus.repo}
          repoId={giscus.repoId}
          category={giscus.category}
          categoryId={giscus.categoryId}
          mapping={giscus.mapping}
          strict={giscus.strict}
          reactionsEnabled={giscus.reactionsEnabled}
          emitMetadata={giscus.emitMetadata}
          inputPosition={giscus.inputPosition}
          theme={theme === "light" ? "light" : "transparent_dark"}
          lang="ko"
          loading="lazy"
        />
      </Comments>
    </>
  )
}

export default Footer
