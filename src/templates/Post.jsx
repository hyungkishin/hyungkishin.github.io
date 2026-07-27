import React from "react"
import SEO from "components/SEO"
import { graphql } from "gatsby"

import Layout from "components/Layout"
import Article from "components/Article"

import { findSeriesById, sortSeriesPosts } from "utils/seriesRules"
import { siteUrl } from "../../blog-config"

const Post = ({ data, pageContext }) => {
  const post = data.markdownRemark
  const { previous, next } = data

  const { title, description, date, update, tags } = post.frontmatter
  const { isoDate, isoUpdate } = post.frontmatter
  const { slug } = post.fields

  const seriesRule = findSeriesById(pageContext.seriesId)
  const seriesPosts = seriesRule
    ? sortSeriesPosts(seriesRule, data.seriesPosts.nodes)
    : []

  return (
    <Layout>
      <SEO
        title={title}
        description={description || post.excerpt}
        url={`${siteUrl}${slug}`}
        type="article"
        datePublished={isoDate}
        dateModified={isoUpdate || isoDate}
        tags={tags}
      />
      <Article>
        <Article.Header title={title} date={date} update={update} tags={tags} />
        {seriesPosts.length > 1 && (
          <Article.Series
            rule={seriesRule}
            posts={seriesPosts}
            currentId={post.id}
          />
        )}
        <Article.Body html={post.html} />
        <Article.Footer
          previous={previous}
          next={next}
          previousLabel={pageContext.previousLabel}
          nextLabel={pageContext.nextLabel}
        />
      </Article>
    </Layout>
  )
}

export default Post

export const pageQuery = graphql`
  query BlogPostBySlug(
    $id: String!
    $seriesId: String
    $previousPostId: String
    $nextPostId: String
  ) {
    site {
      siteMetadata {
        title
      }
    }
    markdownRemark(id: { eq: $id }) {
      id
      excerpt(pruneLength: 200, truncate: true)
      html
      frontmatter {
        title
        date(formatString: "MMMM DD, YYYY")
        update(formatString: "MMMM DD, YYYY")
        isoDate: date
        isoUpdate: update
        tags
      }
      fields {
        slug
      }
    }
    seriesPosts: allMarkdownRemark(
      filter: { fields: { series: { eq: $seriesId } } }
    ) {
      nodes {
        id
        fields {
          slug
        }
        frontmatter {
          title
          isoDate: date
        }
      }
    }
    previous: markdownRemark(id: { eq: $previousPostId }) {
      fields {
        slug
      }
      frontmatter {
        title
      }
    }
    next: markdownRemark(id: { eq: $nextPostId }) {
      fields {
        slug
      }
      frontmatter {
        title
      }
    }
  }
`
