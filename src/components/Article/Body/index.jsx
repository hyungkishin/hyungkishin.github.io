import React, { useState, useEffect, useMemo, useCallback, useRef } from "react"
import styled, { useTheme } from "styled-components"
import mediumZoom from "medium-zoom"
import mermaid from "mermaid"

import Toc from "./Toc"
import StyledMarkdown from "./StyledMarkdown"
import PrismTheme from "./PrismTheme"
import GoogleAdvertise from "components/GoogleAdsense"
import TextToSpeech from "./TextToSpeech"

const Wrapper = styled.div`
  position: relative;
  margin-bottom: 35px;

  .medium-zoom-overlay {
    z-index: 1000;
  }

  .medium-zoom-image--opened {
    z-index: 1001;
  }
`

const PostBottomAdWrapper = styled.div`
  margin-top: 40px;
`

const Body = ({ html, slug }) => {
  const [toc, setToc] = useState([])
  const theme = useTheme()
  const ref = useRef(null)

  useEffect(() => {
    if (!toc.length) return
    const target = toc.find(heading => `#${heading.id}` === window.location.hash)
    if (target) document.getElementById(target.id)?.scrollIntoView()
  }, [toc])

  const zoom = useMemo(() => {
    if (typeof window === "undefined") return null
    return mediumZoom({
      background: theme.colors.zoomBackground,
      margin: 24,
    })
  }, [theme.colors.zoomBackground])

  const renderMermaid = useCallback(async () => {
    const codeBlocks = document.querySelectorAll(
      "#article-body pre code.language-mermaid"
    )
    if (codeBlocks.length === 0) return

    mermaid.initialize({
      startOnLoad: false,
      theme: theme.name === "dark" ? "dark" : "default",
    })

    for (let i = 0; i < codeBlocks.length; i++) {
      const code = codeBlocks[i]
      const pre = code.parentElement
      if (!pre || pre.dataset.mermaidProcessed) continue
      pre.dataset.mermaidProcessed = "true"

      const graphDefinition = code.textContent
      const id = `mermaid-${Date.now()}-${i}`

      try {
        const { svg } = await mermaid.render(id, graphDefinition)
        // mermaid가 DOM에 남긴 임시 컨테이너 제거
        const tempEl = document.getElementById("d" + id)
        if (tempEl) tempEl.remove()

        const wrapper = document.createElement("div")
        wrapper.className = "mermaid-diagram"
        wrapper.innerHTML = svg
        pre.replaceWith(wrapper)
      } catch {
        // 렌더링 실패 시 코드블록 유지.
        // mermaid가 body에 남긴 에러 SVG 컨테이너도 지운다.
        // SPA 라우팅에서는 이 잔재가 다른 글 위까지 따라다닌다.
        const tempEl = document.getElementById("d" + id)
        if (tempEl) tempEl.remove()
        const orphan = document.getElementById(id)
        if (orphan) orphan.remove()
      }
    }
  }, [theme.name])

  useEffect(() => {
    ref.current.querySelectorAll("table").forEach(table => {
      if (table.parentElement.classList.contains("table-scroll")) return
      const scroll = document.createElement("div")
      scroll.className = "table-scroll"
      scroll.tabIndex = 0
      scroll.setAttribute("role", "region")
      scroll.setAttribute("aria-label", table.caption?.textContent || "표 가로 스크롤")
      table.replaceWith(scroll)
      scroll.appendChild(table)
    })
    const sections = [...ref.current.querySelectorAll(":scope > h2, :scope > h3")]
    setToc(sections.map((heading, index) => {
      if (!heading.id) heading.id = `article-section-${index + 1}`
      return { id: heading.id, text: heading.textContent, depth: heading.tagName.slice(1) }
    }))
  }, [html])

  useEffect(() => {
    renderMermaid()

    if (zoom) {
      zoom.detach()
      zoom.attach("#article-body img:not(.no-zoom)")
    }

    return () => {
      if (zoom) zoom.detach()
    }
  }, [html, zoom, renderMermaid])

  return (
    <Wrapper>
      <Toc items={toc} />

      <PrismTheme />

      <TextToSpeech slug={slug} />

      <StyledMarkdown
        id="article-body"
        dangerouslySetInnerHTML={{ __html: html }}
        itemProp="articleBody"
        ref={ref}
      />

      <PostBottomAdWrapper>
        <GoogleAdvertise
          client="ca-pub-2692445439426078"
          slot="2295339271"
          format="auto"
          responsive="true"
        />
      </PostBottomAdWrapper>
    </Wrapper>
  )
}

export default Body
