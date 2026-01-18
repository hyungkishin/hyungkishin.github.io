import React from "react"
import SEO from "components/SEO"
import { graphql } from "gatsby"

import Layout from "components/Layout"
import Resume from "components/Resume"

import { siteUrl } from "../../blog-config"

const ResumeTemplate = ({ data }) => {
  const post = data.markdownRemark
  const { title } = post.frontmatter
  const { slug } = post.fields

  return (
    <Layout>
      <SEO title={title} description="이력서" url={`${siteUrl}${slug}`} />
      <Resume />
    </Layout>
  )
}

export default ResumeTemplate

export const pageQuery = graphql`
  query ResumeBySlug($id: String!) {
    site {
      siteMetadata {
        title
      }
    }
    markdownRemark(id: { eq: $id }) {
      id
      frontmatter {
        title
      }
      fields {
        slug
      }
    }
  }
`
