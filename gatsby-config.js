const blogConfig = require("./blog-config")
const { title, description, author, siteUrl } = blogConfig

module.exports = {
  pathPrefix: "/gatsby-starter-hoodie",
  siteMetadata: {
    title,
    description,
    author,
    siteUrl,
  },
  plugins: [
    {
      resolve: `gatsby-plugin-google-gtag`,
      options: {
        trackingIds: ["G-BM7MKY5FBG"],
      },
    },
    {
      resolve: `gatsby-plugin-catch-links`,
      options: { excludePattern: /^\/backend\/transfer-performance(?:\/|$)/ },
    },
    {
      resolve: `gatsby-plugin-robots-txt`,
      options: {
        host: "",
        sitemap: `${siteUrl}sitemap-index.xml`,
        policy: [{ userAgent: "*", allow: "/" }],
      },
    },
    {
      resolve: `gatsby-plugin-react-redux`,
      options: {
        pathToCreateStoreModule: "./src/reducers/createStore",
        serialize: {
          space: 0,
          isJSON: true,
          unsafe: false,
          ignoreFunction: true,
        },
        cleanupOnClient: true,
        windowKey: "__PRELOADED_STATE__",
      },
    },
    {
      resolve: `gatsby-plugin-google-fonts`,
      options: {
        fonts: [
          `noto sans kr:300,400,500,700,900`,
          `source code pro:700`, // you can also specify font weights and styles
        ],
        display: "swap",
      },
    },
    "gatsby-plugin-styled-components",
    `gatsby-plugin-react-helmet`,
    {
      resolve: `gatsby-source-filesystem`,
      options: {
        name: `images`,
        path: `${__dirname}/src/images`,
      },
    },
    `gatsby-transformer-sharp`,
    `gatsby-plugin-sharp`,
    {
      resolve: `gatsby-plugin-manifest`,
      options: {
        name: title,
        short_name: title,
        description: description,
        start_url: `/`,
        background_color: `#f8f9f7`,
        theme_color: `#126756`,
        display: `standalone`,
        icon: `src/images/journal-icon.png`,
      },
    },
    {
      resolve: `gatsby-source-filesystem`,
      options: {
        name: `markdown-pages`,
        path: `${__dirname}/contents/posts`,
      },
    },
    {
      resolve: `gatsby-transformer-remark`,
      options: {
        footnotes: true,
        gfm: true,
        plugins: [
          {
            resolve: `gatsby-remark-images`,
            options: {
              maxWidth: 760,
              loading: "lazy",
              wrapperStyle: "margin-bottom: 1rem;",
              quality: 100,
              showCaptions: true,
              linkImagesToOriginal: false,
            },
          },
          {
            resolve: `gatsby-remark-prismjs`,
            options: {
              classPrefix: "language-",
              inlineCodeMarker: null,
              aliases: {},
              showLineNumbers: false,
              noInlineHighlight: false,
              languageExtensions: [
                {
                  language: "superscript",
                  extend: "javascript",
                  definition: {
                    superscript_types: /(SuperType)/,
                  },
                  insertBefore: {
                    function: {
                      superscript_keywords: /(superif|superelse)/,
                    },
                  },
                },
              ],
              prompt: {
                user: "root",
                host: "localhost",
                global: false,
              },
              escapeEntities: {},
            },
          },
          {
            resolve: `gatsby-remark-katex`,
            options: {
              strict: `ignore`,
            },
          },
          {
            resolve: "gatsby-remark-static-images",
          },
        ],
      },
    },
    `gatsby-plugin-resolve-src`,
    {
      resolve: `gatsby-plugin-sitemap`,
      options: {
        resolveSiteUrl: () => siteUrl,
        query: `{
          allSitePage { nodes { path } }
          allMarkdownRemark {
            nodes {
              fields { slug }
              frontmatter { date update }
            }
          }
        }`,
        resolvePages: ({
          allSitePage: { nodes: pages },
          allMarkdownRemark: { nodes: posts },
        }) => {
          const postMeta = {}
          posts.forEach(node => {
            if (node.fields && node.fields.slug) {
              postMeta[node.fields.slug] = node.frontmatter
            }
          })
          return pages.map(page => ({
            ...page,
            ...(postMeta[page.path] || {}),
          }))
        },
        serialize: ({ path, date, update }) => {
          const entry = { url: path, changefreq: `daily`, priority: 0.7 }
          const lastmod = update || date
          if (lastmod) entry.lastmod = lastmod
          return entry
        },
      },
    },
    {
      resolve: `gatsby-plugin-feed`,
      options: {
        query: `
          {
            site {
              siteMetadata {
                title
                description
                siteUrl
                site_url: siteUrl
              }
            }
          }
        `,
        feeds: [
          {
            serialize: ({ query: { site, allMarkdownRemark } }) => {
              return allMarkdownRemark.edges.map(edge => {
                return Object.assign({}, edge.node.frontmatter, {
                  author,
                  description: edge.node.frontmatter.description || edge.node.excerpt,
                  date: edge.node.frontmatter.date,
                  url: new URL(edge.node.fields.slug, site.siteMetadata.siteUrl).href,
                  guid: new URL(edge.node.fields.slug, site.siteMetadata.siteUrl).href,
                  custom_elements: [{ "content:encoded": edge.node.html }],
                })
              })
            },
            query: `
              {
                allMarkdownRemark(
                  sort: { order: DESC, fields: [frontmatter___date] },
                ) {
                  edges {
                    node {
                      excerpt
                      html
                      fields { slug }
                      frontmatter {
                        title
                        description
                        date
                      }
                    }
                  }
                }
              }
            `,
            output: `/rss.xml`,
            title: `${title} RSS`,
          },
        ],
      },
    },
  ],
}
