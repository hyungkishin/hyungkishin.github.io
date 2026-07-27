import React, { useState, useMemo } from "react"
import styled from "styled-components"
import { Link } from "gatsby"

import { AiOutlineArrowLeft } from "react-icons/ai"

const FOLDED_SIZE = 5

const SeriesWrapper = styled.div`
  margin-bottom: 40px;
  padding: 24px;
  background-color: ${props => props.theme.colors.seriesBackground};
  border-radius: 12px;
  border: 1px solid ${props => props.theme.colors.border};
`

const SeriesHeader = styled.h2`
  margin-bottom: 20px;
  font-size: 0.9rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: ${props => props.theme.colors.accent};

  & > span {
    font-weight: 500;
    color: ${props => props.theme.colors.tertiaryText};
    margin-left: 4px;
  }

  & > a {
    color: inherit;
    text-decoration: none;
    transition: opacity 0.2s;
  }

  & > a:hover {
    opacity: 0.8;
  }
`

const PostWrapper = styled.ul`
  list-style: none;
  padding: 0;
`

const Post = styled.li`
  position: relative;
  font-size: 14px;
  color: ${props =>
    props.currentPost
      ? props.theme.colors.text
      : props.theme.colors.secondaryText};
  font-weight: ${props => (props.currentPost ? "700" : "400")};

  &:not(:last-child) {
    margin-bottom: 12px;
  }

  & > a {
    text-decoration: none;
    color: inherit;
    transition: color 0.2s;
  }

  & > a:hover {
    color: ${props => props.theme.colors.accent};
  }

  & > svg {
    position: absolute;
    margin-left: 8px;
    color: ${props => props.theme.colors.accent};
  }
`

const ViewMore = styled.div`
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid ${props => props.theme.colors.divider};
  font-size: 13px;
  font-weight: 600;
  text-align: center;
  color: ${props => props.theme.colors.tertiaryText};
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    color: ${props => props.theme.colors.text};
  }
`

/** 접힌 상태에서는 현재 글을 가운데 두고 앞뒤 편만 보여준다. */
const foldAround = (posts, currentIndex) => {
  if (posts.length <= FOLDED_SIZE) return posts

  const half = Math.floor(FOLDED_SIZE / 2)
  if (currentIndex < half) return posts.slice(0, FOLDED_SIZE)
  if (posts.length - currentIndex - 1 < half) return posts.slice(-FOLDED_SIZE)
  return posts.slice(currentIndex - half, currentIndex + half + 1)
}

/**
 * @param {object} rule 시리즈 규칙 (utils/seriesRules)
 * @param {object[]} posts 읽는 순서대로 정렬된 같은 시리즈의 글
 * @param {string} currentId 지금 보고 있는 글의 id
 */
const Series = ({ rule, posts, currentId }) => {
  const [folded, setFolded] = useState(true)

  const currentIndex = useMemo(
    () => posts.findIndex(post => post.id === currentId),
    [posts, currentId]
  )

  const visiblePosts = useMemo(
    () => (folded ? foldAround(posts, currentIndex) : posts),
    [posts, currentIndex, folded]
  )

  const hiddenCount = posts.length - visiblePosts.length

  return (
    <SeriesWrapper>
      <SeriesHeader>
        {rule.indexSlug ? (
          <Link to={rule.indexSlug}>SERIES: {rule.name}</Link>
        ) : (
          <>SERIES: {rule.name}</>
        )}{" "}
        <span>({posts.length})</span>
      </SeriesHeader>
      <PostWrapper>
        {visiblePosts.map(post => {
          const isCurrent = post.id === currentId
          return (
            <Post key={post.id} currentPost={isCurrent}>
              <Link to={post.fields.slug}>{post.frontmatter.title}</Link>{" "}
              {isCurrent && <AiOutlineArrowLeft />}{" "}
            </Post>
          )
        })}
      </PostWrapper>
      {posts.length > FOLDED_SIZE && (
        <ViewMore onClick={() => setFolded(!folded)}>
          {folded ? `View More (+${hiddenCount})` : "View Less"}
        </ViewMore>
      )}
    </SeriesWrapper>
  )
}

export default Series
