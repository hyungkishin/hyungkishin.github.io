import React from "react"
import styled from "styled-components"
import ReadingLink from "components/ReadingLink"

const List = styled.ol`
  margin: 0;
  padding: 0;
  list-style: none;
  li { border-bottom: 1px solid ${p => p.theme.colors.border}; }
  a {
    display: grid;
    grid-template-columns: 2.25rem minmax(0, 1fr);
    gap: 16px;
    padding: 24px 0;
    color: ${p => p.theme.colors.text};
    text-decoration: none;
  }
  span { padding-top: 4px; font-size: 15px; font-variant-numeric: tabular-nums; color: ${p => p.theme.colors.accent}; }
  h2 { font-size: clamp(18px, 2.1vw, 23px); font-weight: 680; line-height: 1.45; letter-spacing: -.025em; }
  a:hover h2 { color: ${p => p.theme.colors.accent}; }
  p { margin: 6px 0 0; color: ${p => p.theme.colors.secondaryText}; line-height: 1.7; font-size: 15px; }
  time { display: block; margin-top: 7px; color: ${p => p.theme.colors.tertiaryText}; font-size: 13px; }
  @media (max-width: 600px) {
    a { grid-template-columns: 1.6rem minmax(0, 1fr); gap: 8px; padding: 20px 0; }
  }
`

const SeriesPostList = ({ posts }) => (
  <List>
    {posts.map((post, index) => {
      const { title, date, isoDate, description } = post.frontmatter
      return (
        <li key={post.id || post.fields.slug}>
          <ReadingLink to={post.fields.slug}>
            <span aria-hidden="true">{index + 1}</span>
            <div>
              <h2>{title}</h2>
              <p>{description || post.excerpt}</p>
              <time dateTime={isoDate}>{date}</time>
            </div>
          </ReadingLink>
        </li>
      )
    })}
  </List>
)

export default SeriesPostList
