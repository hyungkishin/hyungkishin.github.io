import React, { useMemo } from "react"
import styled from "styled-components"
import { Link } from "gatsby"

import SeriesPostList from "components/SeriesPostList"
import { matchSeries, sortSeriesPosts } from "utils/seriesRules"

const BackLink = styled(Link)`
  display: inline-block;
  margin-top: 16px;
  font-size: 13px;
  color: ${(props) => props.theme.colors.tertiaryText};
  text-decoration: none;

  &:hover {
    color: ${(props) => props.theme.colors.text};
  }
`

const Header = styled.div`
  margin-top: 20px;
  padding-bottom: 24px;
  border-bottom: 1px solid ${(props) => props.theme.colors.dividerSoft};

  @media (max-width: 600px) {
    padding: 0 4px 20px;
  }
`

const AccentBar = styled.div`
  width: 28px;
  height: 3px;
  border-radius: 2px;
  background: ${(props) => props.accent};
  margin-bottom: 16px;
`

const Title = styled.h1`
  margin: 0 0 6px;
  font-size: 30px;
  font-weight: 700;
  line-height: 1.3;
  letter-spacing: -0.02em;
  color: ${(props) => props.theme.colors.text};

  @media (max-width: 600px) {
    font-size: 26px;
  }
`

const Tagline = styled.p`
  margin: 0;
  font-size: 15px;
  line-height: 1.6;
  color: ${(props) => props.theme.colors.secondaryText};
`

const Meta = styled.div`
  margin-top: 14px;
  font-size: 12.5px;
  color: ${(props) => props.theme.colors.tertiaryText};
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
      <BackLink to="/series/">← series</BackLink>
      <Header>
        <AccentBar accent={rule.accent} />
        <Title>{rule.name}</Title>
        <Tagline>{rule.tagline}</Tagline>
        <Meta>
          {sorted.length}편 · 최근 {latestDate}
        </Meta>
      </Header>
      <SeriesPostList posts={sorted} accent={rule.accent} />
    </>
  )
}

export default SeriesDetail
