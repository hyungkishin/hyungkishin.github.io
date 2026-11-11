import React from "react"
import { Link } from "gatsby"
import { useTheme } from "styled-components"
import { FiBookOpen, FiMoon, FiSearch, FiSun } from "react-icons/fi"
import { title } from "../../../../blog-config"

export default function Header({ toggleTheme }) {
  const dark = useTheme().name === "dark"
  const themeLabel = dark ? "밝은 화면으로 전환" : "어두운 화면으로 전환"

  return (
    <header className="journal-header">
      <a className="journal-skip" href="#main-content">본문으로 이동</a>
      <div className="journal-bar">
        <Link className="journal-brand" to="/" aria-label={title + " 홈"}>
          <FiBookOpen aria-hidden="true" />
          {title}
        </Link>
        <nav aria-label="주 메뉴">
          <Link className="nav-archive" to="/#posts">글 목록</Link>
          <Link className="nav-series" to="/#series">시리즈</Link>
          <Link className="nav-tags" to="/tags/" replace={false} activeClassName="current">태그</Link>
          <Link className="nav-search" to="/search/" replace={false} activeClassName="current" aria-label="글 검색">
            <FiSearch aria-hidden="true" /><span>검색</span>
          </Link>
          <button type="button" className="nav-theme" onClick={toggleTheme}
            title={themeLabel} aria-label={themeLabel}>
            {dark ? <FiSun aria-hidden="true" /> : <FiMoon aria-hidden="true" />}
          </button>
        </nav>
      </div>
    </header>
  )
}
