import styled from "styled-components"

export const ResumeContainer = styled.div`
  max-width: 900px;
  margin: 0 auto;
  padding: 0 20px;

  @media (max-width: 768px) {
    padding: 0 16px;
  }
`

export const Card = styled.div`
  background: ${props => props.theme.colors.bodyBackground};
  border: 1px solid ${props => props.theme.colors.border};
  border-radius: 12px;
  padding: 24px;
  margin-bottom: 20px;
  box-shadow: 0 2px 8px ${props => props.theme.colors.headerShadow};
  transition: transform 0.2s ease, box-shadow 0.2s ease;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 16px ${props => props.theme.colors.headerShadow};
  }

  @media (max-width: 768px) {
    padding: 20px 16px;
    margin-bottom: 16px;
  }
`

export const CardTitle = styled.h2`
  font-size: 20px;
  font-weight: 700;
  color: ${props => props.theme.colors.text};
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 2px solid ${props => props.theme.colors.border};
`

export const Badge = styled.span`
  display: inline-block;
  padding: 4px 10px;
  margin: 4px;
  font-size: 13px;
  font-weight: 500;
  border-radius: 6px;
  background: ${props => props.theme.colors.tagBackground};
  color: ${props => props.theme.colors.tagText};
  transition: background 0.2s ease;

  &:hover {
    background: ${props => props.theme.colors.hoveredTagBackground};
  }
`

export const Text = styled.p`
  font-size: 15px;
  line-height: 1.7;
  color: ${props => props.theme.colors.secondaryText};
  margin: 0;
`

export const Link = styled.a`
  color: ${props => props.theme.colors.text};
  text-decoration: none;
  transition: opacity 0.2s ease;

  &:hover {
    opacity: 0.7;
  }
`

export const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 20px;

  @media (max-width: 768px) {
    grid-template-columns: 1fr;
    gap: 16px;
  }
`

export const Highlight = styled.span`
  font-weight: 600;
  color: ${props => props.theme.colors.text};
`

export const BlockQuote = styled.blockquote`
  margin: 16px 0;
  padding: 12px 16px;
  border-left: 4px solid ${props => props.theme.colors.blockQuoteBorder};
  background: ${props => props.theme.colors.blockQuoteBackground};
  border-radius: 0 8px 8px 0;
  font-size: 14px;
  color: ${props => props.theme.colors.secondaryText};
`

export const List = styled.ul`
  margin: 0;
  padding-left: 20px;

  & li {
    font-size: 14px;
    line-height: 1.8;
    color: ${props => props.theme.colors.secondaryText};
    margin-bottom: 4px;
  }
`
