import React from "react"
import { graphql } from "gatsby"

import Layout from "components/Layout"
import SEO from "components/SEO"
import SeriesDetail from "components/SeriesDetail"

import { findSeriesById } from "utils/seriesRules"
import { description, siteUrl } from "../../../blog-config"

const rule = findSeriesById("round")

const Page = ({ data }) => (
  <Layout wide>
    <SEO title={`SERIES · ${rule.name}`} description={description} url={siteUrl} />
    <SeriesDetail rule={rule} posts={data.allMarkdownRemark.nodes} />
  </Layout>
)

export default Page

export const pageQuery = graphql`
  query {
    allMarkdownRemark(sort: { fields: [frontmatter___date], order: DESC }) {
      nodes {
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
