import React from "react"
import ReadingLink from "components/ReadingLink"
import styled from "styled-components"

const Contents = styled.details`
  border-block: 1px solid ${props => props.theme.colors.border};
  margin: 32px 0;
  summary {
    cursor: pointer;
    padding: 14px 2px;
    color: ${props => props.theme.colors.text};
    font-weight: 650;
    line-height: 1.55;
    word-break: keep-all;
  }
  ol { list-style: decimal; margin: 0 0 18px 25px; }
  li { padding: 4px 0 4px 3px; line-height: 1.6; }
  a { color: ${props => props.theme.colors.secondaryText}; text-underline-offset: 3px; }
  a[aria-current] { color: ${props => props.theme.colors.accent}; font-weight: 700; }
`

const Series = ({ rule, posts, currentId }) => (
  <Contents>
    <summary>{rule.name} 목차 · {posts.length}편</summary>
    <ol>
      {posts.map(post => (
        <li key={post.id}>
          <ReadingLink to={post.fields.slug} aria-current={post.id === currentId ? "page" : undefined}>
            {post.frontmatter.title}
          </ReadingLink>
        </li>
      ))}
    </ol>
  </Contents>
)

export default Series
