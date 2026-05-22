import React, { useState, useMemo } from "react"
import _ from "lodash"
import { graphql } from "gatsby"

import Layout from "components/Layout"
import SEO from "components/SEO"
import Bio from "components/Bio"
import Hero from "components/Hero"
import CategoryFilter from "components/CategoryFilter"
import PostList from "components/PostList"
import SideTagList from "components/SideTagList"
import Divider from "components/Divider"
import VerticalSpace from "components/VerticalSpace"

import { categoryOf } from "utils/categoryRules"
import { matchSeries } from "utils/seriesRules"

import { title, description, siteUrl } from "../../blog-config"

const BlogIndex = ({ data }) => {
  const posts = data.allMarkdownRemark.nodes.filter(
    (p) => p.fields.slug !== "/resume/"
  )
  const tags = _.sortBy(data.allMarkdownRemark.group, ["totalCount"]).reverse()

  const [selectedCategory, setSelectedCategory] = useState("all")

  // 히어로용 최신 일반 글 (시리즈 글 제외)
  const heroPost = useMemo(() => {
    return posts.find((post) => !matchSeries(post.fields.slug))
  }, [posts])

  // 카테고리별 카운트
  const counts = useMemo(() => {
    const result = { __total: posts.length }
    posts.forEach((post) => {
      const cat = categoryOf(post.fields.category)
      if (cat) result[cat.id] = (result[cat.id] || 0) + 1
    })
    return result
  }, [posts])

  if (posts.length === 0) {
    return (
      <Layout wide>
        <p>No posts found.</p>
      </Layout>
    )
  }

  const showHero = selectedCategory === "all"

  return (
    <Layout wide>
      <SEO title={title} description={description} url={siteUrl} />
      <VerticalSpace size={48} />
      <Bio />
      <Divider />
      <SideTagList tags={tags} postCount={posts.length} />
      {showHero && <Hero post={heroPost} />}
      <CategoryFilter
        selected={selectedCategory}
        onSelect={setSelectedCategory}
        counts={counts}
      />
      <PostList
        postList={posts}
        excludeSlug={showHero && heroPost ? heroPost.fields.slug : null}
        categoryFilter={selectedCategory}
      />
    </Layout>
  )
}

export default BlogIndex

export const pageQuery = graphql`
  query {
    site {
      siteMetadata {
        title
      }
    }
    allMarkdownRemark(sort: { fields: [frontmatter___date], order: DESC }) {
      group(field: frontmatter___tags) {
        fieldValue
        totalCount
      }
      nodes {
        excerpt(pruneLength: 200, truncate: true)
        fields {
          slug
          category
        }
        frontmatter {
          date(formatString: "MMMM DD, YYYY")
          update(formatString: "MMM DD, YYYY")
          title
          tags
        }
      }
    }
  }
`
