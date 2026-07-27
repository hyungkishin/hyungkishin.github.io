const { createFilePath } = require(`gatsby-source-filesystem`)
const {
  NO_SERIES_ID,
  matchSeries,
  groupPostsBySeries,
  buildPostNavigation,
} = require("./src/utils/seriesRules")

exports.createPages = async ({ graphql, actions, reporter }) => {
  const { createPage } = actions

  const postTemplate = require.resolve(`./src/templates/Post.jsx`)
  const resumeTemplate = require.resolve(`./src/templates/Resume.jsx`)
  const seriesIndexTemplate = require.resolve(`./src/templates/SeriesIndex.jsx`)

  const result = await graphql(`
    {
      postsRemark: allMarkdownRemark(
        sort: { fields: [frontmatter___date], order: ASC }
        limit: 1000
      ) {
        nodes {
          id
          fields {
            slug
          }
          frontmatter {
            date
          }
        }
      }
      tagsGroup: allMarkdownRemark(limit: 2000) {
        group(field: frontmatter___tags) {
          fieldValue
        }
      }
    }
  `)

  if (result.errors) {
    reporter.panicOnBuild(
      `There was an error loading your blog posts`,
      result.errors
    )
    return
  }

  const posts = result.data.postsRemark.nodes
  const navigation = buildPostNavigation(posts)

  posts.forEach(post => {
    const nav = navigation.get(post.fields.slug)
    const isResume = post.fields.slug === "/resume/"

    createPage({
      path: post.fields.slug,
      component: isResume ? resumeTemplate : postTemplate,
      context: {
        id: post.id,
        seriesId: nav.seriesId || NO_SERIES_ID,
        previousPostId: nav.previous ? nav.previous.id : null,
        nextPostId: nav.next ? nav.next.id : null,
        previousLabel: nav.previousLabel,
        nextLabel: nav.nextLabel,
      },
    })
  })

  // 시리즈 목록 페이지. 경로는 그 시리즈 글들의 부모 디렉토리다.
  // 글이 아직 없는 규칙은 페이지를 만들지 않는다. 빈 목록 페이지가 사이트맵에 남는다.
  groupPostsBySeries(posts).forEach(({ rule }) => {
    if (!rule.indexSlug) return
    createPage({
      path: rule.indexSlug,
      component: seriesIndexTemplate,
      context: {
        seriesId: rule.id,
      },
    })
  })
}

exports.onCreateNode = ({ node, actions, getNode }) => {
  const { createNodeField } = actions

  if (node.internal.type !== `MarkdownRemark`) return

  const filePath = node.fileAbsolutePath || ""
  // createFilePath가 contents/posts 이후 경로를 반환.
  // 예: contents/posts/company/work/why1/index.md → /company/work/why1/
  const slug = createFilePath({ node, getNode })

  createNodeField({ node, name: `slug`, value: slug })

  // 첫 번째 디렉토리를 카테고리로 사용
  const match = filePath.match(/\/contents\/posts\/([^/]+)\//)
  createNodeField({ node, name: `category`, value: match ? match[1] : "etc" })

  // 시리즈 소속은 슬러그에서 파생된다. 프론트매터에 적지 않는다.
  const rule = matchSeries(slug)
  createNodeField({ node, name: `series`, value: rule ? rule.id : null })
}

exports.createSchemaCustomization = ({ actions }) => {
  const { createTypes } = actions
  const typeDefs = `
  type MarkdownRemark implements Node {
    frontmatter: Frontmatter!
    fields: MarkdownRemarkFields
  }
  type Frontmatter {
    title: String!
    description: String
    tags: [String!]!
  }
  type MarkdownRemarkFields {
    slug: String!
    category: String!
    series: String
  }
  `
  createTypes(typeDefs)
}
