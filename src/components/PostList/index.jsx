import React, { useMemo } from "react"
import styled from "styled-components"
import { Link } from "gatsby"

import { matchSeries } from "utils/seriesRules"
import { categoryOf } from "utils/categoryRules"

const List = styled.div`
  display: flex;
  flex-direction: column;
  margin-top: 12px;
`

const Row = styled(Link)`
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 24px;
  align-items: start;
  padding: 28px 0;
  border-bottom: 1px solid ${(props) => props.theme.colors.dividerSoft};
  text-decoration: none;
  color: inherit;
  transition: opacity 0.15s ease;

  &:hover h2 {
    color: ${(props) => props.theme.colors.accent};
  }

  @media (max-width: 600px) {
    grid-template-columns: 1fr;
    gap: 10px;
    padding: 22px 4px;
  }
`

const Body = styled.div`
  min-width: 0;
`

const Eyebrow = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
  font-size: 12px;
  color: ${(props) => props.theme.colors.tertiaryText};
`

const Category = styled.span`
  color: ${(props) => props.theme.colors.accent};
  font-weight: 600;
  letter-spacing: 0.04em;
`

const Title = styled.h2`
  margin: 0 0 8px;
  font-size: 22px;
  font-weight: 700;
  line-height: 1.35;
  letter-spacing: -0.015em;
  color: ${(props) => props.theme.colors.text};
  word-break: keep-all;
  overflow-wrap: break-word;
  transition: color 0.15s ease;

  @media (max-width: 600px) {
    font-size: 19px;
  }
`

const Excerpt = styled.p`
  margin: 0;
  font-size: 14.5px;
  line-height: 1.65;
  color: ${(props) => props.theme.colors.secondaryText};
  word-break: keep-all;
  overflow-wrap: break-word;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  max-width: 640px;
`

const DateText = styled.div`
  font-size: 13px;
  color: ${(props) => props.theme.colors.tertiaryText};
  white-space: nowrap;
  padding-top: 2px;

  @media (max-width: 600px) {
    display: none;
  }
`

const EmptyState = styled.div`
  margin-top: 48px;
  text-align: center;
  color: ${(props) => props.theme.colors.tertiaryText};
  font-size: 14px;
`

const truncateExcerpt = (excerpt, maxLength = 140) => {
  if (!excerpt) return ""
  if (excerpt.length <= maxLength) return excerpt
  return excerpt.slice(0, maxLength).trimEnd() + "…"
}

const PostCard = ({ post }) => {
  const { title, date } = post.frontmatter
  const { excerpt } = post
  const { slug, category: topDir } = post.fields
  const category = categoryOf(topDir)

  return (
    <Row to={slug}>
      <Body>
        <Eyebrow>
          {category && <Category>{category.label}</Category>}
        </Eyebrow>
        <Title>{title}</Title>
        <Excerpt>{truncateExcerpt(excerpt)}</Excerpt>
      </Body>
      <DateText>{date}</DateText>
    </Row>
  )
}

const PostList = ({
  postList,
  excludeSlug,
  categoryFilter,
  hideSeriesPosts = false,
}) => {
  const filtered = useMemo(() => {
    let list = postList
    if (excludeSlug) {
      list = list.filter((p) => p.fields.slug !== excludeSlug)
    }
    if (hideSeriesPosts) {
      list = list.filter((p) => !matchSeries(p.fields.slug))
    }
    if (categoryFilter && categoryFilter !== "all") {
      list = list.filter((p) => {
        const matched = categoryOf(p.fields.category)
        return matched && matched.id === categoryFilter
      })
    }
    return list
  }, [postList, excludeSlug, categoryFilter, hideSeriesPosts])

  if (filtered.length === 0) {
    return <EmptyState>이 카테고리에는 아직 글이 없어요.</EmptyState>
  }

  return (
    <List>
      {filtered.map((post) => (
        <PostCard key={post.id || post.fields.slug} post={post} />
      ))}
    </List>
  )
}

export default PostList
