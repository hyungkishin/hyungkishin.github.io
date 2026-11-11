import React from "react"
import { graphql } from "gatsby"

import Layout from "components/Layout"
import SEO from "components/SEO"
import SeriesDetail from "components/SeriesDetail"

import { findSeriesById } from "utils/seriesRules"
import { description, siteUrl } from "../../blog-config"

const SeriesIndexPage = ({ pageContext, data }) => {
  const rule = findSeriesById(pageContext.seriesId)

  if (!rule) {
    return (
      <Layout wide>
        <p>시리즈를 찾을 수 없습니다.</p>
      </Layout>
    )
  }

  return (
    <Layout wide>
      <SEO
        title={`${rule.name} · 시리즈`}
        description={rule.tagline || description}
        url={`${siteUrl}${rule.indexSlug}`}
      />
      <SeriesDetail rule={rule} posts={data.seriesPosts.nodes} />
    </Layout>
  )
}

export default SeriesIndexPage

export const pageQuery = graphql`
  query SeriesIndexBySeriesId($seriesId: String!) {
    seriesPosts: allMarkdownRemark(
      filter: { fields: { series: { eq: $seriesId } } }
    ) {
      nodes {
        id
        excerpt(pruneLength: 200, truncate: true)
        fields {
          slug
          category
        }
        frontmatter {
          date(formatString: "YYYY년 M월 D일")
          isoDate: date
          title
          description
          tags
        }
      }
    }
  }
`
