import React, { useState, useEffect, useMemo, useCallback } from "react"
import styled, { useTheme } from "styled-components"
import mediumZoom from "medium-zoom"
import mermaid from "mermaid"

import useOffsetTop from "hooks/useOffsetTop"

import Toc from "./Toc"
import StyledMarkdown from "./StyledMarkdown"
import PrismTheme from "./PrismTheme"
import GoogleAdvertise from "components/GoogleAdsense"

const Wrapper = styled.div`
  position: relative;
  margin-bottom: 60px;

  @media (max-width: 768px) {
    padding: 0 15px;
  }

  .medium-zoom-overlay {
    z-index: 1000;
  }

  .medium-zoom-image--opened {
    z-index: 1001;
  }
`

const PostTopAdWrapper = styled.div`
  margin-bottom: 40px;
`

const PostBottomAdWrapper = styled.div`
  margin-top: 40px;
`

const Body = ({ html }) => {
  const [toc, setToc] = useState([])
  const theme = useTheme()
  const [ref, offsetTop] = useOffsetTop()

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
        // 렌더링 실패 시 코드블록 유지
      }
    }
  }, [theme.name])

  useEffect(() => {
    setToc(
      Array.from(
        document.querySelectorAll("#article-body > h2, #article-body > h3")
      )
    )

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
      <Toc items={toc} articleOffset={offsetTop} />

      <PrismTheme />

      <PostTopAdWrapper>
        <GoogleAdvertise
          client="ca-pub-2692445439426078"
          slot="2295339271"
          format="auto"
          responsive="true"
        />
      </PostTopAdWrapper>

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
