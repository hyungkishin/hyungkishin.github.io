import React, { useState, useMemo } from "react"
import _ from "lodash"
import { graphql } from "gatsby"

import Layout from "components/Layout"
import SEO from "components/SEO"
import Bio from "components/Bio"
import Hero from "components/Hero"
import CategoryFilter from "components/CategoryFilter"
import SeriesShowcase from "components/SeriesShowcase"
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

  // 카테고리에 맞춰 Hero 글 (시리즈 글 제외한 최신 일반 글)
  const heroPost = useMemo(() => {
    const candidates = posts.filter((post) => !matchSeries(post.fields.slug))
    if (selectedCategory === "all") {
      return candidates[0]
    }
    return candidates.find((post) => {
      const cat = categoryOf(post.fields.category)
      return cat && cat.id === selectedCategory
    })
  }, [posts, selectedCategory])

  // 카테고리별 카운트 (시리즈 글 포함, 전체 글 기준)
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

  const showSeriesShowcase = selectedCategory === "all"

  return (
    <Layout wide>
      <SEO title={title} description={description} url={siteUrl} />
      <VerticalSpace size={48} />
      <Bio />
      <Divider />
      <SideTagList tags={tags} postCount={posts.length} />
      <CategoryFilter
        selected={selectedCategory}
        onSelect={setSelectedCategory}
        counts={counts}
      />
      {heroPost && <Hero post={heroPost} />}
      {showSeriesShowcase && <SeriesShowcase posts={posts} />}
      <PostList
        postList={posts}
        excludeSlug={heroPost ? heroPost.fields.slug : null}
        categoryFilter={selectedCategory}
        hideSeriesPosts={selectedCategory === "all"}
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
        id
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
