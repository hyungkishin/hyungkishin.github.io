import React, { useState, useEffect, useMemo } from "react"
import styled, { useTheme } from "styled-components"
import mediumZoom from "medium-zoom"

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

  useEffect(() => {
    setToc(
      Array.from(
        document.querySelectorAll("#article-body > h2, #article-body > h3")
      )
    )

    if (zoom) {
      zoom.detach()
      zoom.attach("#article-body img:not(.no-zoom)")
    }

    return () => {
      if (zoom) zoom.detach()
    }
  }, [html, zoom])

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
