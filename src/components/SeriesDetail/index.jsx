import React, { useMemo } from "react"
import styled from "styled-components"
import { Link } from "gatsby"

import SeriesPostList from "components/SeriesPostList"
import { matchSeries, sortSeriesPosts } from "utils/seriesRules"

const BackLink = styled(Link)`
  display: inline-block;
  margin-top: 20px;
  font-size: 13px;
  color: ${(props) => props.theme.colors.tertiaryText};
  text-decoration: none;

  &:hover {
    color: ${(props) => props.theme.colors.text};
  }
`

const Header = styled.div`
  margin-top: 24px;
  padding-bottom: 28px;
  border-bottom: 1px solid ${(props) => props.theme.colors.border};

  @media (max-width: 600px) {
    padding: 0 4px 24px;
  }
`

const Eyebrow = styled.div`
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: ${(props) => props.theme.colors.accent};
  margin-bottom: 12px;
`

const Title = styled.h1`
  margin: 0 0 12px;
  font-size: 44px;
  font-weight: 700;
  line-height: 1.15;
  letter-spacing: -0.025em;
  color: ${(props) => props.theme.colors.text};

  @media (max-width: 600px) {
    font-size: 30px;
  }
`

const Tagline = styled.p`
  margin: 0;
  font-size: 16px;
  line-height: 1.6;
  color: ${(props) => props.theme.colors.secondaryText};
  max-width: 540px;
`

const Meta = styled.div`
  margin-top: 18px;
  font-size: 12.5px;
  color: ${(props) => props.theme.colors.tertiaryText};
`

const Empty = styled.div`
  margin-top: 48px;
  text-align: center;
  color: ${(props) => props.theme.colors.tertiaryText};
  font-size: 14px;
`

const SeriesDetail = ({ rule, posts }) => {
  const filtered = useMemo(
    () =>
      posts.filter((post) => {
        const matched = matchSeries(post.fields.slug)
        return matched && matched.id === rule.id
      }),
    [posts, rule]
  )
  const sorted = useMemo(() => sortSeriesPosts(rule, filtered), [filtered, rule])
  const latestDate = useMemo(() => {
    const dates = sorted.map((p) => p.frontmatter.date).filter(Boolean).sort()
    return dates[dates.length - 1]
  }, [sorted])

  return (
    <>
      <BackLink to="/">← home</BackLink>
      <Header>
        <Eyebrow>Series · {sorted.length}편</Eyebrow>
        <Title>{rule.name}</Title>
        <Tagline>{rule.tagline}</Tagline>
        {latestDate && <Meta>최근 업데이트 · {latestDate}</Meta>}
      </Header>
      {sorted.length === 0 ? (
        <Empty>이 시리즈에는 아직 글이 없어요.</Empty>
      ) : (
        <SeriesPostList posts={sorted} />
      )}
    </>
  )
}

export default SeriesDetail
