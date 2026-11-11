import React from "react"
import { categoryOf } from "utils/categoryRules"
import ReadingLink from "components/ReadingLink"

export default function PostList({ postList }) {
  return (
    <ul className="journal-posts">
      {postList.map(({ fields, frontmatter, excerpt }) => (
        <li key={fields.slug}>
          <ReadingLink to={fields.slug} className="post-row">
            <div className="post-dateline">
              <span>{categoryOf(fields.category)?.label}</span>
              <time dateTime={frontmatter.isoDate?.slice(0, 10)}>{frontmatter.date}</time>
            </div>
            <h3>{frontmatter.title}</h3>
            {(frontmatter.description || excerpt) && <p>{frontmatter.description || excerpt}</p>}
          </ReadingLink>
        </li>
      ))}
    </ul>
  )
}
