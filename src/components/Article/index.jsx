import styled from "styled-components"

import Header from "./Header"
import Series from "./Series"
import Body from "./Body"
import Footer from "./Footer"

const Article = styled.article`
  width: min(100%, 696px);
  margin-inline: auto;
  min-width: 0;
`

Article.Header = Header
Article.Series = Series
Article.Body = Body
Article.Footer = Footer

export default Article
