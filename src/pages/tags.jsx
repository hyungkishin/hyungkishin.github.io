import React, { useEffect, useMemo, useRef, useState } from "react"
import { graphql, Link } from "gatsby"
import styled from "styled-components"
import {
  Archive,
  ArchiveHeader,
  Empty,
  ResultCount,
} from "components/ArchiveFilters"
import Layout from "components/Layout"
import PostList from "components/PostList"
import SEO from "components/SEO"
import TagList from "components/TagList"
import TextField from "components/TextField"
import { siteUrl, title } from "../../blog-config"

const PreviewCount = 8

const TagNavigation = styled.nav`
  margin-top: 19px;
  h2 {
    margin: 0 0 14px;
    font-size: 16px;
    color: var(--ink);
    font-weight: 650;
  }
  > button,
  > a {
    display: inline-flex;
    align-items: center;
    min-height: 40px;
    margin: 9px 18px 0 0;
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--accent);
    cursor: pointer;
    font: inherit;
    font-size: 14px;
    text-underline-offset: 4px;
    text-decoration: underline;
  }
`

export default function TagsPage({ data, location }) {
  const [filter, setFilter] = useState("")
  const [expanded, setExpanded] = useState(false)
  const [selected, setSelected] = useState("")
  const input = useRef(null)
  const { nodes: posts, group } = data.allMarkdownRemark
  const tags = useMemo(
    () =>
      [...group].sort(
        (a, b) =>
          b.totalCount - a.totalCount ||
          a.fieldValue.localeCompare(b.fieldValue, "ko")
      ),
    [group]
  )

  useEffect(() => {
    function readSelection() {
      setSelected(new URLSearchParams(window.location.search).get("q") || "")
    }
    readSelection()
    window.addEventListener("popstate", readSelection)
    return () => window.removeEventListener("popstate", readSelection)
  }, [location.search])

  const term = filter.trim().toLowerCase()
  const matchingTags = term
    ? tags.filter(tag => tag.fieldValue.toLowerCase().includes(term))
    : tags
  const visible =
    term || expanded ? matchingTags : matchingTags.slice(0, PreviewCount)
  const postsWithTag = selected
    ? posts.filter(post => post.frontmatter.tags?.includes(selected))
    : posts

  return (
    <Layout wide>
      <SEO
        title={`태그 | ${title}`}
        description="기술 주제별로 글을 모아 봅니다."
        url={new URL("tags/", siteUrl).href}
      />
      <Archive>
        <ArchiveHeader>
          <h1>태그</h1>
          <TextField
            aria-label="태그 이름"
            placeholder="태그 이름으로 찾기"
            value={filter}
            inputRef={input}
            onChange={event => setFilter(event.target.value)}
            onClear={() => {
              setFilter("")
              input.current.focus()
            }}
          />
          <TagNavigation aria-label="태그 선택">
            <h2>
              {term
                ? "일치하는 태그"
                : expanded
                ? "전체 태그"
                : "글이 많은 태그"}
            </h2>
            <div id="tag-options">
              {visible.length ? (
                <TagList count tagList={visible} selected={selected} />
              ) : (
                <Empty>일치하는 태그가 없습니다.</Empty>
              )}
            </div>
            {!term && tags.length > PreviewCount && (
              <button
                type="button"
                aria-expanded={expanded}
                aria-controls="tag-options"
                onClick={() => setExpanded(!expanded)}
              >
                {expanded ? "태그 접기" : `태그 ${tags.length}개 모두 보기`}
              </button>
            )}
            {selected && (
              <Link to="/tags/" replace={false}>
                선택한 태그 해제
              </Link>
            )}
          </TagNavigation>
        </ArchiveHeader>
        <ResultCount
          title={selected ? `‘${selected}’ 태그의 글` : "전체 글"}
          count={postsWithTag.length}
        />
        {postsWithTag.length ? (
          <PostList postList={postsWithTag} />
        ) : (
          <Empty>이 태그로 발행한 글이 없습니다.</Empty>
        )}
      </Archive>
    </Layout>
  )
}

export const pageQuery = graphql`
  query {
    allMarkdownRemark(
      filter: { fields: { slug: { ne: "/resume/" } } }
      sort: { fields: [frontmatter___date], order: DESC }
    ) {
      group(field: frontmatter___tags) {
        fieldValue
        totalCount
      }
      nodes {
        id
        excerpt(pruneLength: 200, truncate: true)
        fields {
          slug
          category
        }
        frontmatter {
          date(formatString: "YYYY.MM.DD")
          isoDate: date
          title
          description
          tags
        }
      }
    }
  }
`
