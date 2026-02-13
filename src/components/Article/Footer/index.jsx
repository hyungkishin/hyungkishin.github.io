import React, { useEffect, useState } from "react"
import { navigate } from "gatsby"
import { useSelector } from "react-redux"
import styled, { useTheme } from "styled-components"
import { BiLeftArrowAlt, BiRightArrowAlt } from "react-icons/bi"
import Giscus from "@giscus/react"

import { giscus } from "../../../../blog-config"

import MDSpinner from "react-md-spinner"

import Divider from "components/Divider"
import Bio from "components/Bio"

const ArticleButtonContainer = styled.div`
  display: flex;
  justify-content: space-between;
  margin-bottom: 48px;

  @media (max-width: 768px) {
    margin-bottom: 80px;
    padding: 0 12.8px;
    flex-direction: column;

    & > div:first-child {
      margin-bottom: 12.8px;
    }
  }
`

const ArrowFlexWrapper = styled.div`
  width: 100%;
  display: flex;
  align-items: center;
  white-space: nowrap;
`

const ArticleButtonTextWrapper = styled.div`
  display: flex;
  align-items: flex-end;
  flex-direction: column;
  overflow: hidden;
`

const Arrow = styled.div`
  position: relative;
  left: 0;
  display: flex;
  align-items: center;
  font-size: 24px;
  flex-basis: 24px;
  transition: left 0.3s;
`

const ArticleButtonWrapper = styled.div`
  display: flex;
  flex-direction: column;
  align-items: ${props => (props.right ? "flex-end" : "flex-start")};
  padding: 1.5rem;
  width: 100%;
  max-width: 48%;
  font-size: 1.1rem;
  border-radius: 12px;
  background-color: ${props => props.theme.colors.nextPostButtonBackground};
  color: ${props => props.theme.colors.text};
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  border: 1px solid transparent;

  &:hover {
    background-color: ${props => props.theme.colors.bodyBackground};
    border-color: ${props => props.theme.colors.accent};
    transform: translateY(-4px);
    box-shadow: 0 10px 20px rgba(0, 0, 0, 0.05);
  }

  & ${ArrowFlexWrapper} {
    flex-direction: ${props => (props.right ? "row-reverse" : "row")};
  }

  & ${ArticleButtonTextWrapper} {
    align-items: ${props => (props.right ? "flex-end" : "flex-start")};
  }

  & ${Arrow} {
    ${props => (props.right ? "margin-left: 12px" : "margin-right: 12px")};
    color: ${props => props.theme.colors.accent};
  }

  @media (max-width: 768px) {
    max-width: 100%;
    margin-bottom: 1rem;
  }
`

const ArticleButtonLabel = styled.div`
  margin-bottom: 4px;
  font-size: 0.8rem;
  font-weight: bold;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: ${props => props.theme.colors.mutedText};
`

const ArticleButtonTitle = styled.div`
  padding: 2px 0;
  width: 100%;
  text-overflow: ellipsis;
  overflow: hidden;
  font-weight: 600;
`

const CommentWrapper = styled.div`
  margin-top: 4rem;
  @media (max-width: 768px) {
    padding: 0 20px;
  }
`

const SpinnerWrapper = styled.div`
  height: 200px;
  display: flex;
  justify-content: center;
  align-items: center;
`

const HiddenWrapper = styled.div`
  height: ${props => (props.isHidden ? "0px" : "auto")};
  overflow: ${props => (props.isHidden ? "hidden" : "auto")};
`

const ArticleButton = ({ right, children, onClick }) => {
  return (
    <ArticleButtonWrapper right={right} onClick={onClick}>
      <ArrowFlexWrapper>
        <Arrow>{right ? <BiRightArrowAlt /> : <BiLeftArrowAlt />}</Arrow>
        <ArticleButtonTextWrapper>
          <ArticleButtonLabel>
            {right ? <>Next Post</> : <>Previous Post</>}
          </ArticleButtonLabel>
          <ArticleButtonTitle>{children}</ArticleButtonTitle>
        </ArticleButtonTextWrapper>
      </ArrowFlexWrapper>
    </ArticleButtonWrapper>
  )
}

const Spinner = () => {
  const theme = useTheme()
  return (
    <SpinnerWrapper>
      <MDSpinner singleColor={theme.colors.spinner} />
    </SpinnerWrapper>
  )
}

const Comment = () => {
  const { theme } = useSelector(state => state.theme)
  const [spinner, setSpinner] = useState(true)

  useEffect(() => {
    const timer = setTimeout(() => {
      setSpinner(false)
    }, 1000)
    return () => clearTimeout(timer)
  }, [])

  return (
    <>
      {spinner && <Spinner />}
      <HiddenWrapper isHidden={spinner}>
        <Giscus
          id="comments"
          repo={giscus.repo}
          repoId={giscus.repoId}
          category={giscus.category}
          categoryId={giscus.categoryId}
          mapping={giscus.mapping}
          strict={giscus.strict}
          reactionsEnabled={giscus.reactionsEnabled}
          emitMetadata={giscus.emitMetadata}
          inputPosition={giscus.inputPosition}
          theme={theme === "light" ? "light" : "transparent_dark"}
          lang="ko"
          loading="lazy"
        />
      </HiddenWrapper>
    </>
  )
}

const Footer = ({ previous, next }) => {
  return (
    <>
      <ArticleButtonContainer>
        {previous ? (
          <ArticleButton onClick={() => navigate(previous?.fields?.slug)}>
            {previous?.frontmatter?.title}
          </ArticleButton>
        ) : (
          <div></div>
        )}
        {next && (
          <ArticleButton right onClick={() => navigate(next?.fields?.slug)}>
            {next?.frontmatter?.title}
          </ArticleButton>
        )}
      </ArticleButtonContainer>

      <Bio />
      <CommentWrapper>
        <Divider mt="32px" />
        <Comment />
      </CommentWrapper>
    </>
  )
}

export default Footer
