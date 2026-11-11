import React, { useState } from "react"
import { graphql, Link } from "gatsby"
import { FiArrowRight, FiArrowUpRight, FiBookOpen } from "react-icons/fi"
import Layout from "components/Layout"
import SEO from "components/SEO"
import ReadingLink from "components/ReadingLink"
import PostList from "components/PostList"
import { categoryOf, CATEGORY_GROUPS } from "utils/categoryRules"
import { groupPostsBySeries } from "utils/seriesRules"
import { title, description, siteUrl } from "../../blog-config"

const batchSize = 10

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
            <p className="cover-kicker"><FiBookOpen aria-hidden="true" /> 추천 시리즈 <span>· {featured.posts.length}편</span></p>
            <h1 id="cover-title">{featured.rule.name}</h1>
            <p className="cover-deck">송금 버튼을 누른 뒤, 돈은 언제 도착할까? JVM이 수수료를 계산하는 순간부터 잔액이 바뀌고 메시지가 전달될 때까지 한 건의 요청을 따라갑니다.</p>
            <ReadingLink className="cover-link" to={featured.rule.indexSlug}>시리즈 읽기 <FiArrowRight aria-hidden="true" /></ReadingLink>
          </div>
          <picture>
            <source media="(max-width: 600px)" srcSet="/images/transfer-cover-sm.webp" />
            <img src="/images/transfer-cover.webp" width="1050" height="700" alt="" fetchpriority="high" />
          </picture>
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
              <div><span>{parts.length}편</span><strong>{rule.name}</strong></div>
              <FiArrowUpRight aria-hidden="true" />
            </ReadingLink></li>
          ))}</ul>
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
