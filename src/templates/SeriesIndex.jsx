import React from "react"
import { graphql } from "gatsby"

import Layout from "components/Layout"
import SEO from "components/SEO"
import SeriesDetail from "components/SeriesDetail"

import { findSeriesById } from "utils/seriesRules"
import { description, siteUrl } from "../../blog-config"

const SeriesIndexPage = ({ pageContext, data }) => {
  const rule = findSeriesById(pageContext.seriesId)
  const posts = data.allMarkdownRemark.nodes

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
      <SeriesDetail rule={rule} posts={posts} />
    </Layout>
  )
}

export default SeriesIndexPage

export const pageQuery = graphql`
  query {
    allMarkdownRemark(sort: { fields: [frontmatter___date], order: DESC }) {
      nodes {
        id
        excerpt(pruneLength: 200, truncate: true)
        fields {
          slug
          category
        }
        frontmatter {
          date(formatString: "MMMM DD, YYYY")
          title
          tags
        }
      }
    }
  }
`
