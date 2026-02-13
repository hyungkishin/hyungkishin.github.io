import React, { useState, useEffect } from "react"
import styled, { css } from "styled-components"

import { animateScroll } from "react-scroll"

import useScroll from "hooks/useScroll"

import getElementOffset from "utils/getElmentOffset"

import RevealOnScroll from "components/RevealOnScroll"

const STICK_OFFSET = 100

const TocWrapper = styled.div`
  position: absolute;
  opacity: 1;
  left: 100%;

  & > div {
    padding-right: 20px;
    padding-left: 16px;
    margin-left: 48px;
    position: relative;
    width: 240px;
    max-height: calc(100% - 185px);
    overflow-y: auto;

    ::-webkit-scrollbar {
      width: 3px;
    }
    ::-webkit-scrollbar-track {
      background: ${props => props.theme.colors.scrollTrack};
    }

    ::-webkit-scrollbar-thumb {
      background: ${props => props.theme.colors.scrollHandle};
    }

    ${props =>
      props.stick &&
      css`
        position: fixed;
        top: ${STICK_OFFSET}px;
      `}
  }

  @media (max-width: 1300px) {
    display: None;
  }
`

const ParagraphTitle = styled.div`
  margin-bottom: 12px;
  padding-left: ${props => (props.subtitle ? 24 : 12)}px;
  font-size: 13.5px;
  color: ${props => props.theme.colors.mutedText};
  line-height: 1.4;
  transition: all 0.2s ease-in-out;
  border-left: 2px solid transparent;
  position: relative;

  ${props =>
    props.active &&
    css`
      color: ${props => props.theme.colors.accent};
      font-weight: 600;
      border-left: 2px solid ${props => props.theme.colors.accent};
      background: linear-gradient(to right, ${props =>
        props.theme.colors.background}, transparent);
    `}

  &:hover {
    color: ${props => props.theme.colors.text};
    cursor: pointer;
  }
`

const Toc = ({ items, articleOffset }) => {
  const { y } = useScroll()

  const [revealAt, setRevealAt] = useState(4000)
  const [headers, setHeaders] = useState([])
  const [active, setActive] = useState(0)

  useEffect(() => {
    const bioElm = document.getElementById("bio")
    if (bioElm) {
      setRevealAt(
        getElementOffset(bioElm).top - bioElm.getBoundingClientRect().height - 400
      )
    }
  }, [])

  useEffect(() => {
    setHeaders(
      [
        ...document.querySelectorAll("#article-body > h2, #article-body > h3"),
      ].map(element => getElementOffset(element).top)
    )
  }, [items])

  useEffect(() => {
    let currentIdx = 0
    headers.forEach((header, i) => {
      if (header - 100 < y) {
        currentIdx = i
      }
    })
    setActive(currentIdx)
  }, [y, headers])

  const handleClickTitle = index => {
    animateScroll.scrollTo(headers[index] - 70, {
      duration: 500,
      smooth: "easeInOutQuart",
    })
  }

  return (
    <RevealOnScroll revealAt={revealAt} reverse>
      <TocWrapper stick={y > articleOffset - STICK_OFFSET}>
        <div>
          <div style={{ marginBottom: "16px", fontSize: "12px", fontWeight: "bold", color: "var(--colors-secondaryText)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
            Table of Contents
          </div>
          {items.map((item, i) => (
            <ParagraphTitle
              key={i}
              subtitle={item.tagName === "H3"}
              active={i === active}
              onClick={() => handleClickTitle(i)}
            >
              {item.innerText}
            </ParagraphTitle>
          ))}
        </div>
      </TocWrapper>
    </RevealOnScroll>
  )
}

export default Toc
