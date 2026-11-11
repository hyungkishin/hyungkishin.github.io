import React from "react"
import { Link } from "gatsby"
import { links } from "../../../../blog-config"

export default function Footer() {
  return (
    <footer className="journal-footer">
      <Link className="footer-name" to="/">hyungkishin.blog</Link>
      <nav aria-label="바닥글 메뉴">
        <Link to="/#posts">글 목록</Link>
        <Link to="/#series">시리즈</Link>
        <Link to="/tags/" replace={false}>태그</Link>
        <Link to="/resume/">이력서</Link>
        <a href={links.github}>GitHub</a>
        <a href="/rss.xml">RSS</a>
      </nav>
    </footer>
  )
}
