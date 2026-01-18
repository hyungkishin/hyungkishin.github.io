import React from "react"
import styled from "styled-components"
import { Card, CardTitle, Badge } from "./styles"

const SkillSection = styled.div`
  margin-bottom: 16px;

  &:last-child {
    margin-bottom: 0;
  }
`

const SkillCategory = styled.h3`
  font-size: 14px;
  font-weight: 600;
  color: ${props => props.theme.colors.tertiaryText};
  margin: 0 0 8px 0;
`

const SkillList = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
`

const SkillCard = ({ skills }) => {
  return (
    <Card>
      <CardTitle>기술 역량</CardTitle>
      {skills.map((skillGroup, index) => (
        <SkillSection key={index}>
          <SkillCategory>{skillGroup.category}</SkillCategory>
          <SkillList>
            {skillGroup.items.map((skill, skillIndex) => (
              <Badge key={skillIndex}>{skill}</Badge>
            ))}
          </SkillList>
        </SkillSection>
      ))}
    </Card>
  )
}

export default SkillCard
