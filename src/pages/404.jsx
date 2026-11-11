import React from "react"
import { Link } from "gatsby"
import Layout from "components/Layout"
import SEO from "components/SEO"

export default function NotFoundPage() {
  return (
    <Layout>
      <SEO title="페이지를 찾을 수 없습니다" />
      <section className="journal-not-found">
        <h1>페이지를 찾을 수 없습니다</h1>
        <p>주소를 확인하거나 제목과 키워드로 글을 찾아보세요.</p>
        <Link to="/search/">글 검색</Link> <Link to="/">홈으로</Link>
      </section>
    </Layout>
  )
}
