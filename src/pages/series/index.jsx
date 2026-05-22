import React from "react"
import styled from "styled-components"
import { Link, graphql } from "gatsby"

import Layout from "components/Layout"
import SEO from "components/SEO"

import { SERIES_RULES, matchSeries } from "utils/seriesRules"
import { title, description, siteUrl } from "../../../blog-config"

const Header = styled.div`
  margin-top: 24px;
  padding-bottom: 24px;
  border-bottom: 1px solid ${(props) => props.theme.colors.dividerSoft};

  @media (max-width: 768px) {
    padding: 0 4px 20px;
  }
`

const PageTitle = styled.h1`
  margin: 0;
  font-size: 30px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: ${(props) => props.theme.colors.text};
`

const List = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 28px;
`

const Row = styled(Link)`
  display: block;
  padding: 22px 24px;
  border-radius: 14px;
  background: ${(props) => props.theme.colors.cardBackground};
  border: 1px solid ${(props) => props.theme.colors.cardBorder};
  border-left: 3px solid ${(props) => props.accent};
  text-decoration: none;
  color: inherit;
  transition: border-color 0.15s ease;

  &:hover {
    border-color: ${(props) => props.theme.colors.cardBorderHover};
    border-left-color: ${(props) => props.accent};
  }
`

const Name = styled.h2`
  margin: 0 0 4px;
  font-size: 19px;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: ${(props) => props.theme.colors.text};
`

const Tagline = styled.p`
  margin: 0 0 10px;
  font-size: 14px;
  line-height: 1.6;
  color: ${(props) => props.theme.colors.secondaryText};
`

const Count = styled.div`
  font-size: 12.5px;
  color: ${(props) => props.theme.colors.tertiaryText};
`

const SeriesIndex = ({ data }) => {
  const posts = data.allMarkdownRemark.nodes
  const counts = SERIES_RULES.reduce((acc, rule) => {
    acc[rule.id] = 0
    return acc
  }, {})
  posts.forEach((post) => {
    const rule = matchSeries(post.fields.slug)
    if (rule) counts[rule.id] += 1
  })

  return (
    <Layout wide>
      <SEO title={`series · ${title}`} description={description} url={siteUrl} />
      <Header>
        <PageTitle>series</PageTitle>
      </Header>
      <List>
        {SERIES_RULES.map((rule) => (
          <Row key={rule.id} to={`/series/${rule.id}/`} accent={rule.accent}>
            <Name>{rule.name}</Name>
            <Tagline>{rule.tagline}</Tagline>
            <Count>{counts[rule.id]}편</Count>
          </Row>
        ))}
      </List>
    </Layout>
  )
}

export default SeriesIndex

export const pageQuery = graphql`
  query {
    allMarkdownRemark {
      nodes {
        fields {
          slug
        }
      }
    }
  }
`
