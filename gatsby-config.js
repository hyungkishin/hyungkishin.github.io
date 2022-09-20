module.exports = {
  siteMetadata: {
    title: `하나투어 테크 블로그`,
    description: `하나투어 기술 블로그입니다.`,
    author: `hyungkiShin`,
    siteUrl: 'https://hyungkiShin.github.io/', // 배포 후 변경 예정
  },
  plugins: [
    {
      resolve: 'gatsby-plugin-typescript',
      options: {
        isTSX: true,
        allExtensions: true,
      },
    },

    {
      resolve: 'gatsby-plugin-canonical-urls',
      options: {
        siteUrl: 'https://hyungkiShin.github.io/',
        stripQueryString: true,
      },
    },

    `gatsby-plugin-emotion`,

    `gatsby-plugin-react-helmet`,

    'gatsby-plugin-sitemap',

    `gatsby-transformer-sharp`,

    `gatsby-plugin-image`,

    {
      resolve: `gatsby-source-filesystem`,
      options: {
        name: `contents`,
        path: `${__dirname}/contents`,
      },
    },

    {
      resolve: `gatsby-source-filesystem`,
      options: {
        name: `images`,
        path: `${__dirname}/static`,
      },
    },

    {
      resolve: `gatsby-plugin-sharp`,
      options: {
        defaults: {
          formats: ['auto', 'webp'],
          quality: 100,
          placeholder: 'blurred',
        }
      }
    },

    {
      resolve: `gatsby-transformer-remark`,
      options: {
        plugins: [
          {
            resolve: 'gatsby-remark-smartypants',
            options: {
              dashes: 'oldschool',
            },
          },

          {
            resolve: 'gatsby-remark-prismjs',
            options: {
              classPrefix: 'language-',
            },
          },

          {
            resolve: 'gatsby-remark-images',
            options: {
              maxWidth: 768,
              quality: 100,
              withWebp: true,
            },
          },

          {
            resolve: 'gatsby-remark-copy-linked-files',
            options: {},
          },

          {
            resolve: 'gatsby-remark-external-links',
            options: {
              target: '_blank',
              rel: 'nofollow',
            },
          },

        ],
      },
    },

    {
      resolve: 'gatsby-plugin-canonical-urls',
      options: {
        siteUrl: '<https://my-website.com/>',
        stripQueryString: true,
      },
    },

    {
      resolve: 'gatsby-plugin-robots-txt',
      options: {
        policy: [{ userAgent: '*', allow: '/' }],
      },
    },

  ],
};