import React, { useState, useMemo } from "react"
import _ from "lodash"
import styled from "styled-components"
import { Link } from "gatsby"

import { AiOutlineArrowLeft } from "react-icons/ai"

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

const Series = ({ header, series }) => {
  const [fold, setFold] = useState(true)

  const filteredPosts = useMemo(() => {
    if (series.length < 5) return series
    if (!fold) return series

    const currentPostIdx = _.findIndex(series, { currentPost: true })

    if (currentPostIdx < 2) return series.slice(0, 5)
    if (series.length - currentPostIdx - 1 < 2)
      return series.slice(series.length - 5, series.length)

    return series.slice(currentPostIdx - 2, currentPostIdx + 3)
  }, [series, fold])

  const showViewButton = useMemo(() => {
    return series.length > 5
  }, [series])

  return (
    <SeriesWrapper>
      <SeriesHeader>
        <Link to={`/series/${_.replace(header, /\s/g, "-")}`}>
          SERIES: {header}
        </Link>{" "}
        <span>({series.length})</span>
      </SeriesHeader>
      <PostWrapper>
        {filteredPosts.map((post, i) => (
          <Post key={i} currentPost={post.currentPost}>
            <Link to={post.fields.slug}>{post.frontmatter.title}</Link>{" "}
            {post.currentPost && <AiOutlineArrowLeft />}{" "}
          </Post>
        ))}
      </PostWrapper>
      {showViewButton && (
        <ViewMore
          onClick={() => {
            setFold(!fold)
          }}
        >
          {fold
            ? `View More (+${series.length - filteredPosts.length})`
            : "View Less"}
        </ViewMore>
      )}
    </SeriesWrapper>
  )
}

export default Series
