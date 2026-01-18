import React from "react"
import styled from "styled-components"
import { Card, CardTitle, Highlight } from "./styles"

const CareerList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
`

const CareerItem = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 12px 0;
  border-bottom: 1px solid ${props => props.theme.colors.divider};

  &:last-child {
    border-bottom: none;
    padding-bottom: 0;
  }

  @media (max-width: 768px) {
    flex-direction: column;
    gap: 4px;
  }
`

const CareerInfo = styled.div`
  display: flex;
  flex-direction: column;
`

const Company = styled(Highlight)`
  font-size: 16px;
  margin-bottom: 4px;
`

const Position = styled.span`
  font-size: 14px;
  color: ${props => props.theme.colors.tertiaryText};
`

const Period = styled.span`
  font-size: 14px;
  color: ${props => props.theme.colors.mutedText};
  white-space: nowrap;

  @media (max-width: 768px) {
    margin-top: 4px;
  }
`

const CareerCard = ({ careers }) => {
  return (
    <Card>
      <CardTitle>실무 경력</CardTitle>
      <CareerList>
        {careers.map((career, index) => (
          <CareerItem key={index}>
            <CareerInfo>
              <Company>{career.company}</Company>
              <Position>{career.position}</Position>
            </CareerInfo>
            <Period>{career.period}</Period>
          </CareerItem>
        ))}
      </CareerList>
    </Card>
  )
}

export default CareerCard
