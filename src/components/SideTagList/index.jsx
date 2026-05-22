import React from "react"
import _ from "lodash"
import styled from "styled-components"
import { Link } from "gatsby"

const RelativeWrapper = styled.div`
  position: relative;
`

const Wrapper = styled.aside`
  position: absolute;
  left: calc(100% + 40px);
  top: 0;
  width: 200px;
  font-size: 13.5px;

  @media (max-width: 1400px) {
    display: none;
  }
`

const Title = styled.div`
  font-size: 11.5px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: ${(props) => props.theme.colors.tertiaryText};
  margin-bottom: 18px;
`

const TagList = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
`

const Tag = styled.li`
  margin-bottom: 10px;
  color: ${(props) => props.theme.colors.secondaryText};
  cursor: pointer;
  transition: color 0.15s;
  font-size: 13.5px;

  &:hover {
    color: ${(props) => props.theme.colors.text};
  }

  & > a {
    color: inherit;
    text-decoration: none;
  }
`

const SideTagList = ({ tags, postCount }) => {
  return (
    <RelativeWrapper>
      <Wrapper>
        <Title>Tags</Title>
        <TagList>
          <Tag>
            <Link to="/tags">all ({postCount})</Link>
          </Tag>
          {_.map(tags, (tag) => (
            <Tag key={tag.fieldValue}>
              <Link to={`/tags?q=${tag.fieldValue}`}>
                {tag.fieldValue} ({tag.totalCount})
              </Link>
            </Tag>
          ))}
        </TagList>
      </Wrapper>
    </RelativeWrapper>
  )
}

export default SideTagList
