import React from "react"
import SEO from "components/SEO"
import { graphql } from "gatsby"

import Layout from "components/Layout"
import Article from "components/Article"
import TagList from "components/TagList"

import { findSeriesById, sortSeriesPosts } from "utils/seriesRules"
import { siteUrl } from "../../blog-config"

const Post = ({ data, pageContext }) => {
  const post = data.markdownRemark
  const { previous, next } = data

  const { title, description, date, tags } = post.frontmatter
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
        <Article.Header title={title} date={date} isoDate={isoDate} series={seriesRule} />
        <Article.Body html={post.html} slug={slug} />
        {tags?.length > 0 && <nav aria-label="글 태그"><TagList tagList={tags} /></nav>}
        {seriesPosts.length > 1 && (
          <Article.Series
            rule={seriesRule}
            posts={seriesPosts}
            currentId={post.id}
          />
        )}
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
        description
        date(formatString: "YYYY년 M월 D일")
        update(formatString: "YYYY년 M월 D일")
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
