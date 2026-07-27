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
        <p>Series not found.</p>
      </Layout>
    )
  }

  return (
    <Layout wide>
      <SEO
        title={`${rule.name} · series`}
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
          date(formatString: "MMMM DD, YYYY")
          isoDate: date
          title
          tags
        }
      }
    }
  }
`
