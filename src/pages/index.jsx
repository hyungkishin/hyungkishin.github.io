import React, { useState } from "react"
import { graphql, Link } from "gatsby"
import { FiArrowRight } from "react-icons/fi"
import TransferFlow from "components/TransferFlow"
import Layout from "components/Layout"
import SEO from "components/SEO"
import ReadingLink from "components/ReadingLink"
import PostList from "components/PostList"
import { categoryOf, CATEGORY_GROUPS } from "utils/categoryRules"
import { groupPostsBySeries } from "utils/seriesRules"
import { title, description, siteUrl } from "../../blog-config"

const batchSize = 10
const illustratedPosts = [
  { slug: "/backend/transfer-performance/02-jvm-execution/#diagram-01-stack-machine", label: "JVM의 피연산자 스택" },
  { slug: "/frontend/javascript/value-identity/#diagram-01-reference-identity", label: "Set의 객체 참조" },
  { slug: "/frontend/e-commerce/measure-before-optimizing/#diagram-01-first-paint", label: "브라우저의 첫 페인트" },
]

export default function BlogIndex({ data }) {
  const posts = data.allMarkdownRemark.nodes
  const groups = groupPostsBySeries(posts).reverse()
  const featured = groups.find(({ rule }) => rule.id === "transfer-performance")
  const [category, setCategory] = useState("all")
  const [limit, setLimit] = useState(batchSize)
  const visible = category === "all" ? posts : posts.filter(p => categoryOf(p.fields.category)?.id === category)
  const categories = CATEGORY_GROUPS.filter(group => posts.some(post => categoryOf(post.fields.category)?.id === group.id))

  return (
    <Layout wide>
      <SEO title={title} description={description} url={siteUrl} />
      {featured && (
        <section className="cover-story" aria-labelledby="cover-title">
          <div className="cover-copy">
            <p className="cover-kicker">{featured.rule.name} 첫 편</p>
            <h1 id="cover-title">{featured.posts[0].frontmatter.title}</h1>
            <p className="cover-deck">1만 원을 보낸다고 하자. 서버 로그에 찍힌 건 ‘접수됨’까지 걸린 시간이다. 심사와 은행 처리까지 재려면 타이머를 어디서 꺼야 할까?</p>
            <div className="cover-actions">
              <ReadingLink className="cover-link" to={featured.posts[0].fields.slug}>첫 편 읽기 <FiArrowRight aria-hidden="true" /></ReadingLink>
              <ReadingLink className="cover-contents" to={featured.rule.indexSlug}>전체 {featured.posts.length}편</ReadingLink>
            </div>
          </div>
          <TransferFlow />
        </section>
      )}
      <div className="journal-index">
        <section id="posts" aria-labelledby="posts-title">
          <div className="section-title">
            <h2 id="posts-title">글 목록</h2>
            <span aria-live="polite">{visible.length}편</span>
          </div>
          <div className="topic-picks" role="group" aria-label="주제로 글 거르기">
            {[{ id: "all", label: "전체" }, ...categories].map(group => (
              <button key={group.id} aria-pressed={category === group.id} type="button" onClick={() => {
                setCategory(group.id)
                setLimit(batchSize)
              }}>{group.label}</button>
            ))}
          </div>
          <PostList postList={visible.slice(0, limit)} />
          {limit < visible.length && <button type="button" className="archive-more" onClick={() => setLimit(limit + batchSize)}>글 더 보기 <span>({visible.length - limit}편 남음)</span></button>}
        </section>
        <aside id="series" className="series-shelf" aria-labelledby="series-title">
          <div className="section-title"><h2 id="series-title">시리즈</h2><span>{groups.length}개</span></div>
          <ul>{groups.map(({ rule, posts: parts }) => (
            <li key={rule.id}><ReadingLink to={rule.indexSlug}>
              <strong>{rule.name}</strong><span>{parts.length}편</span>
            </ReadingLink></li>
          ))}</ul>
          <nav className="illustration-index" aria-labelledby="illustration-title">
            <h3 id="illustration-title">그림으로 읽기</h3>
            <ul>{illustratedPosts.map(({ slug, label }) => (
              <li key={slug}><ReadingLink to={slug}>{label}</ReadingLink></li>
            ))}</ul>
          </nav>
          <Link className="shelf-tags" to="/tags/">태그로 찾아보기 <FiArrowRight aria-hidden="true" /></Link>
        </aside>
      </div>
    </Layout>
  )
}

export const pageQuery = graphql`
  query {
    allMarkdownRemark(
      filter: { fields: { slug: { ne: "/resume/" } } }
      sort: [{frontmatter: {date: DESC}}, {fields: {slug: ASC}}]
    ) {
      nodes {
        excerpt(pruneLength: 150, truncate: true)
        fields { slug category }
        frontmatter { title description date(formatString: "YYYY.MM.DD") isoDate: date }
      }
    }
  }
`
