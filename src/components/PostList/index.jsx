import React, { useMemo } from "react"
import styled from "styled-components"
import { Link } from "gatsby"

import { SERIES_RULES, matchSeries, sortSeriesPosts } from "utils/seriesRules"
import { categoryOf } from "utils/categoryRules"

const groupPosts = (posts) => {
  const seriesBuckets = {}
  const singles = []

  posts.forEach((post) => {
    const slug = post.fields.slug
    if (slug === "/resume/") return
    const rule = matchSeries(slug)
    if (rule) {
      if (!seriesBuckets[rule.id]) {
        seriesBuckets[rule.id] = { rule, posts: [] }
      }
      seriesBuckets[rule.id].posts.push(post)
    } else {
      singles.push(post)
    }
  })

  const seriesEntries = SERIES_RULES.filter((rule) => seriesBuckets[rule.id]).map(
    (rule) => {
      const bucket = seriesBuckets[rule.id]
      const sorted = sortSeriesPosts(rule, bucket.posts).reverse()
      const latestDate = sorted
        .map((p) => p.frontmatter.date)
        .filter(Boolean)
        .sort()
        .reverse()[0]
      return {
        type: "series",
        key: rule.id,
        rule,
        posts: sorted,
        latestDate,
      }
    }
  )

  const singleEntries = singles.map((post) => ({
    type: "single",
    key: post.fields.slug,
    post,
    date: post.frontmatter.date,
  }))

  return [...seriesEntries, ...singleEntries].sort((a, b) => {
    const dateA = a.type === "series" ? a.latestDate : a.date
    const dateB = b.type === "series" ? b.latestDate : b.date
    return new Date(dateB) - new Date(dateA)
  })
}

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  margin-top: 24px;
  width: 100%;
  min-width: 0;

  @media (max-width: 860px) {
    grid-template-columns: 1fr;
    gap: 12px;
  }
`

const CardLink = styled(Link)`
  display: flex;
  flex-direction: column;
  min-width: 0;
  padding: 24px;
  border-radius: 14px;
  background: ${(props) => props.theme.colors.cardBackground};
  border: 1px solid ${(props) => props.theme.colors.cardBorder};
  text-decoration: none;
  color: inherit;
  transition: border-color 0.15s ease;

  &:hover {
    border-color: ${(props) => props.theme.colors.cardBorderHover};
  }
`

const SeriesCardLink = styled(CardLink)`
  grid-column: span 2;
  position: relative;
  overflow: hidden;
  padding-top: 28px;

  @media (max-width: 860px) {
    grid-column: span 1;
  }
`

const SeriesGradientStrip = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 4px;
  background: linear-gradient(
    90deg,
    ${(props) => props.accent} 0%,
    ${(props) => props.accent}99 60%,
    ${(props) => props.accent}33 100%
  );
`

const CategoryLabel = styled.span`
  font-size: 11.5px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: ${(props) => props.accent};
  margin-bottom: 10px;
`

const SeriesName = styled.h2`
  margin: 0 0 4px;
  font-size: 20px;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: ${(props) => props.theme.colors.text};
`

const SeriesTagline = styled.p`
  margin: 0 0 18px;
  font-size: 14px;
  line-height: 1.6;
  color: ${(props) => props.theme.colors.secondaryText};
`

const SeriesEntries = styled.ul`
  list-style: none;
  margin: 0;
  padding: 14px 0 0;
  border-top: 1px solid ${(props) => props.theme.colors.dividerSoft};
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px 28px;

  @media (max-width: 860px) {
    grid-template-columns: 1fr;
  }
`

const SeriesEntry = styled.li`
  font-size: 13.5px;
  line-height: 1.7;
  color: ${(props) => props.theme.colors.secondaryText};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const SeriesFooter = styled.div`
  margin-top: 14px;
  font-size: 12.5px;
  color: ${(props) => props.theme.colors.tertiaryText};
`

const PostCardTitle = styled.h2`
  margin: 0 0 8px;
  font-size: 18px;
  font-weight: 700;
  line-height: 1.45;
  letter-spacing: -0.01em;
  color: ${(props) => props.theme.colors.text};
  word-break: keep-all;
  overflow-wrap: break-word;
`

const PostCardExcerpt = styled.p`
  margin: 0 0 16px;
  font-size: 14px;
  line-height: 1.65;
  color: ${(props) => props.theme.colors.secondaryText};
  word-break: keep-all;
  overflow-wrap: break-word;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
`

const MetaRow = styled.div`
  margin-top: auto;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 12.5px;
  color: ${(props) => props.theme.colors.tertiaryText};
`

const Dot = styled.span`
  color: ${(props) => props.theme.colors.mutedText};
`

const TagText = styled.span`
  color: ${(props) => props.theme.colors.tertiaryText};
`

const EmptyState = styled.div`
  margin-top: 64px;
  text-align: center;
  color: ${(props) => props.theme.colors.tertiaryText};
  font-size: 14px;
`

const truncateExcerpt = (excerpt, maxLength = 110) => {
  if (!excerpt) return ""
  if (excerpt.length <= maxLength) return excerpt
  return excerpt.slice(0, maxLength).trimEnd() + "…"
}

const PostCard = ({ post }) => {
  const { title, date, tags } = post.frontmatter
  const { excerpt } = post
  const { slug, category: topDir } = post.fields
  const category = categoryOf(topDir)

  return (
    <CardLink to={slug}>
      {category && (
        <CategoryLabel accent={category.accent}>{category.label}</CategoryLabel>
      )}
      <PostCardTitle>{title}</PostCardTitle>
      <PostCardExcerpt>{truncateExcerpt(excerpt)}</PostCardExcerpt>
      <MetaRow>
        <span>{date}</span>
        {tags && tags.length > 0 && (
          <>
            <Dot>·</Dot>
            <TagText>{tags.slice(0, 3).join(", ")}</TagText>
          </>
        )}
      </MetaRow>
    </CardLink>
  )
}

const SeriesGroupCard = ({ entry }) => {
  const { rule, posts, latestDate } = entry

  return (
    <SeriesCardLink to={`/series/${rule.id}/`}>
      <SeriesGradientStrip accent={rule.accent} />
      <CategoryLabel accent={rule.accent}>series</CategoryLabel>
      <SeriesName>{rule.name}</SeriesName>
      <SeriesTagline>{rule.tagline}</SeriesTagline>
      <SeriesEntries>
        {posts.slice(0, 6).map((post) => (
          <SeriesEntry key={post.fields.slug} title={post.frontmatter.title}>
            {post.frontmatter.title}
          </SeriesEntry>
        ))}
      </SeriesEntries>
      <SeriesFooter>
        {posts.length}편 · 최근 {latestDate}
      </SeriesFooter>
    </SeriesCardLink>
  )
}

const PostList = ({ postList, excludeSlug, categoryFilter }) => {
  const filtered = useMemo(() => {
    let list = postList
    if (excludeSlug) {
      list = list.filter((p) => p.fields.slug !== excludeSlug)
    }
    if (categoryFilter && categoryFilter !== "all") {
      list = list.filter((p) => {
        const matched = categoryOf(p.fields.category)
        return matched && matched.id === categoryFilter
      })
    }
    return list
  }, [postList, excludeSlug, categoryFilter])

  const entries = useMemo(() => {
    const grouped = groupPosts(filtered)
    if (categoryFilter && categoryFilter !== "all") {
      // 카테고리 필터 시 시리즈 카드는 숨기고 개별 글만
      return grouped.filter((e) => e.type === "single")
    }
    return grouped
  }, [filtered, categoryFilter])

  if (entries.length === 0) {
    return <EmptyState>이 카테고리에는 아직 글이 없어요.</EmptyState>
  }

  return (
    <Grid>
      {entries.map((entry) =>
        entry.type === "series" ? (
          <SeriesGroupCard key={entry.key} entry={entry} />
        ) : (
          <PostCard key={entry.key} post={entry.post} />
        )
      )}
    </Grid>
  )
}

export default PostList
