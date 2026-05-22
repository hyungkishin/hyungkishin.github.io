import React from "react"
import styled from "styled-components"

const BodyWrapper = styled.div`
  margin: 0 auto;
  padding: 60px 16px 0;
  max-width: ${(props) => (props.$wide ? "1080px" : "760px")};

  @media (max-width: 768px) {
    padding-top: 40px;
  }
`

const Body = ({ children, wide }) => {
  return <BodyWrapper $wide={wide}>{children}</BodyWrapper>
}

export default Body
