import React, { useMemo } from "react"
import styled from "styled-components"
import { Link } from "gatsby"

import { SERIES_RULES, matchSeries, sortSeriesPosts } from "utils/seriesRules"

const Section = styled.section`
  margin-top: 36px;
  padding-top: 28px;
  padding-bottom: 28px;
  border-top: 1px solid ${(props) => props.theme.colors.dividerSoft};
  border-bottom: 1px solid ${(props) => props.theme.colors.dividerSoft};
`

const Header = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 20px;
  gap: 12px;
`

const Title = styled.h2`
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: ${(props) => props.theme.colors.text};
`

const Lead = styled.span`
  font-size: 13px;
  color: ${(props) => props.theme.colors.tertiaryText};
`

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;

  @media (max-width: 700px) {
    grid-template-columns: 1fr;
  }
`

const Card = styled(Link)`
  display: flex;
  flex-direction: column;
  padding: 22px 22px 20px;
  border: 1px solid ${(props) => props.theme.colors.cardBorder};
  border-radius: 12px;
  background: ${(props) => props.theme.colors.cardBackground};
  text-decoration: none;
  color: inherit;
  transition: border-color 0.15s ease;

  &:hover {
    border-color: ${(props) => props.theme.colors.cardBorderHover};
  }

  &:hover h3 {
    color: ${(props) => props.theme.colors.accent};
  }
`

const Eyebrow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
  font-size: 11.5px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: ${(props) => props.theme.colors.accent};
`

const Count = styled.span`
  color: ${(props) => props.theme.colors.tertiaryText};
  font-weight: 500;
`

const Name = styled.h3`
  margin: 0 0 6px;
  font-size: 18px;
  font-weight: 700;
  line-height: 1.35;
  letter-spacing: -0.01em;
  color: ${(props) => props.theme.colors.text};
  transition: color 0.15s ease;
`

const Tagline = styled.p`
  margin: 0;
  font-size: 13.5px;
  line-height: 1.55;
  color: ${(props) => props.theme.colors.secondaryText};
`

const Meta = styled.div`
  margin-top: 12px;
  font-size: 12px;
  color: ${(props) => props.theme.colors.tertiaryText};
`

const SeriesShowcase = ({ posts }) => {
  const series = useMemo(() => {
    const buckets = {}
    posts.forEach((post) => {
      const rule = matchSeries(post.fields.slug)
      if (!rule) return
      if (!buckets[rule.id]) buckets[rule.id] = { rule, items: [] }
      buckets[rule.id].items.push(post)
    })
    return SERIES_RULES.filter((rule) => buckets[rule.id]).map((rule) => {
      const bucket = buckets[rule.id]
      const sorted = sortSeriesPosts(rule, bucket.items).reverse()
      const dates = sorted
        .map((p) => p.frontmatter.date)
        .filter(Boolean)
        .sort()
      return {
        rule,
        items: sorted,
        latestDate: dates[dates.length - 1],
      }
    })
  }, [posts])

  if (series.length === 0) return null

  return (
    <Section>
      <Header>
        <Title>Series</Title>
        <Lead>한 흐름으로 묶인 글들</Lead>
      </Header>
      <Grid>
        {series.map(({ rule, items, latestDate }) => {
          const target = rule.indexSlug || items[0]?.fields.slug || "/"
          return (
            <Card key={rule.id} to={target}>
              <Eyebrow>
                <span>{rule.id}</span>
                <Count>· {items.length}편</Count>
              </Eyebrow>
              <Name>{rule.name}</Name>
              <Tagline>{rule.tagline}</Tagline>
              <Meta>최근 {latestDate}</Meta>
            </Card>
          )
        })}
      </Grid>
    </Section>
  )
}

export default SeriesShowcase
