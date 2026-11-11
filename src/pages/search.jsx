import React, { useEffect, useMemo, useRef, useState } from "react"
import { graphql } from "gatsby"
import {
  Archive,
  ArchiveHeader,
  Empty,
  ResultCount,
} from "components/ArchiveFilters"
import Layout from "components/Layout"
import PostList from "components/PostList"
import SEO from "components/SEO"
import TextField from "components/TextField"
import { siteUrl, title } from "../../blog-config"

const normalize = input => (input || "").normalize("NFC").trim().toLowerCase()

function relevance(post, query) {
  const { frontmatter, rawMarkdownBody } = post
  const title = normalize(frontmatter.title)
  if (title === query) return 5
  if (title.includes(query)) return 4
  if ((frontmatter.tags || []).some(tag => normalize(tag).includes(query)))
    return 3
  if (normalize(frontmatter.description).includes(query)) return 2
  return normalize(rawMarkdownBody).includes(query) ? 1 : 0
}

export default function Search({ data, location }) {
  const [query, setQuery] = useState("")
  const editing = useRef(false)
  const input = useRef(null)
  const posts = data.allMarkdownRemark.nodes

  useEffect(() => {
    function readQuery() {
      setQuery(new URLSearchParams(window.location.search).get("q") || "")
      editing.current = false
    }
    readQuery()
    window.addEventListener("popstate", readQuery)
    return () => window.removeEventListener("popstate", readQuery)
  }, [location.search])

  function updateQuery(value) {
    setQuery(value)
    const url = new URL(window.location.href)
    if ((url.searchParams.get("q") || "") === value) return
    if (value) url.searchParams.set("q", value)
    else url.searchParams.delete("q")

    // 한 번의 입력으로 히스토리 한 칸만 쓰고, Enter를 누른 검색어에는 다시 돌아올 수 있다.
    const method = editing.current ? "replaceState" : "pushState"
    window.history[method](window.history.state, "", url)
    editing.current = true
  }

  function clearQuery() {
    editing.current = false
    updateQuery("")
    editing.current = false
    input.current.focus()
  }

  const results = useMemo(() => {
    const needle = normalize(query)
    if (!needle) return posts
    return posts
      .map(post => ({ post, rank: relevance(post, needle) }))
      .filter(hit => hit.rank > 0)
      .sort((a, b) => b.rank - a.rank)
      .map(hit => hit.post)
  }, [posts, query])

  return (
    <Layout wide>
      <SEO
        title={`글 검색 | ${title}`}
        description="제목, 태그, 본문에서 기술 글을 검색합니다."
        url={new URL("search/", siteUrl).href}
      />
      <Archive>
        <ArchiveHeader>
          <h1>글 검색</h1>
          <form
            role="search"
            action="/search/"
            onSubmit={event => {
              event.preventDefault()
              editing.current = false
            }}
          >
            <TextField
              aria-label="글 검색어"
              name="q"
              placeholder="제목, 태그, 본문에서 검색"
              value={query}
              inputRef={input}
              onChange={event => updateQuery(event.target.value)}
              onBlur={() => {
                editing.current = false
              }}
              onClear={clearQuery}
            />
          </form>
        </ArchiveHeader>
        <ResultCount
          title={query.trim() ? "검색 결과" : "전체 글"}
          count={results.length}
        />
        {results.length ? (
          <PostList postList={results} />
        ) : (
          <Empty>
            일치하는 글이 없습니다. 더 짧은 단어나 다른 기술 이름으로 검색해
            보세요.
          </Empty>
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
        rawMarkdownBody
      }
    }
  }
`
