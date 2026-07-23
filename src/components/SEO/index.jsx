import React from "react"
import { Helmet } from "react-helmet"
import config from "../../../blog-config"

const { title: siteName, siteUrl, author, links } = config
const ROOT = siteUrl.replace(/\/+$/, "") // 끝 슬래시 제거한 루트
const DEFAULT_IMAGE = `${ROOT}/og-image.png`
const AUTHOR_URL = (links && links.github) || ROOT

// 프로토콜(https://)은 남기고 경로의 중복 슬래시만 정리한다.
const normalizeUrl = raw => (raw || `${ROOT}/`).replace(/([^:]\/)\/+/g, "$1")

const GOOGLE_VERIFICATION = "Q9ouEs44yfTEb3Nx3iCT7LvOFDOeAg3q-eGYMYGaxMs"

const SEO = ({
  title,
  description,
  url,
  type = "website",
  datePublished,
  dateModified,
  tags,
  image,
}) => {
  const pageUrl = normalizeUrl(url)
  const metaImage = image || DEFAULT_IMAGE
  const isArticle = type === "article"
  const modified = dateModified || datePublished

  const personRef = { "@type": "Person", name: author, url: AUTHOR_URL }

  const jsonLd = isArticle
    ? {
        "@context": "https://schema.org",
        "@type": "BlogPosting",
        mainEntityOfPage: { "@type": "WebPage", "@id": pageUrl },
        url: pageUrl,
        headline: title,
        description,
        image: metaImage,
        inLanguage: "ko-KR",
        datePublished,
        dateModified: modified,
        author: personRef,
        publisher: personRef,
        keywords: tags && tags.length ? tags.join(", ") : undefined,
      }
    : {
        "@context": "https://schema.org",
        "@type": "WebSite",
        name: siteName,
        url: `${ROOT}/`,
        inLanguage: "ko-KR",
        author: personRef,
      }

  return (
    <Helmet>
      <title>{title}</title>
      <link rel="canonical" href={pageUrl} />
      <meta
        name="robots"
        content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1"
      />
      <meta name="author" content={author} />
      <meta
        name="google-site-verification"
        content={GOOGLE_VERIFICATION}
      />
      {description && <meta name="description" content={description} />}

      {/* Open Graph */}
      <meta property="og:type" content={isArticle ? "article" : "website"} />
      <meta property="og:site_name" content={siteName} />
      <meta property="og:locale" content="ko_KR" />
      <meta property="og:url" content={pageUrl} />
      <meta property="og:title" content={title} />
      {description && (
        <meta property="og:description" content={description} />
      )}
      <meta property="og:image" content={metaImage} />

      {isArticle && datePublished && (
        <meta property="article:published_time" content={datePublished} />
      )}
      {isArticle && modified && (
        <meta property="article:modified_time" content={modified} />
      )}
      {isArticle && <meta property="article:author" content={author} />}
      {isArticle &&
        tags &&
        tags.map(tag => (
          <meta property="article:tag" content={tag} key={tag} />
        ))}

      {/* Twitter Card */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={title} />
      {description && (
        <meta name="twitter:description" content={description} />
      )}
      <meta name="twitter:image" content={metaImage} />

      {/* 구조화 데이터 (Google 리치 결과 + AI 답변엔진 인용용) */}
      <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
    </Helmet>
  )
}

export default SEO
