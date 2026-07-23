/**
 * Implement Gatsby's SSR (Server Side Rendering) APIs in this file.
 *
 * See: https://www.gatsbyjs.com/docs/ssr-apis/
 */

// 모든 페이지 <html>에 한국어 lang을 박아 검색·AI 크롤러가 언어를 정확히 인식하게 한다.
exports.onRenderBody = ({ setHtmlAttributes }) => {
  setHtmlAttributes({ lang: "ko" })
}
