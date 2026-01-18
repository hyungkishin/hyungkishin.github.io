import React from "react"
import styled from "styled-components"

import ProfileCard from "./ProfileCard"
import IntroCard from "./IntroCard"
import CareerCard from "./CareerCard"
import SkillCard from "./SkillCard"
import ProjectCard from "./ProjectCard"
import { ResumeContainer, Card, CardTitle, List } from "./styles"

import resumeData from "../../../contents/resume/data.json"

const CompanySection = styled.div`
  margin-bottom: 48px;
  padding: 28px;
  background: ${props => props.theme.colors.bodyBackground};
  border: 1px solid ${props => props.theme.colors.border};
  border-radius: 16px;
  box-shadow: 0 2px 8px ${props => props.theme.colors.headerShadow};

  &:last-child {
    margin-bottom: 0;
  }
`

const CompanyTitle = styled.h2`
  font-size: 24px;
  font-weight: 700;
  color: ${props => props.theme.colors.text};
  margin: 0 0 28px 0;
  padding-bottom: 16px;
  border-bottom: 2px solid ${props => props.theme.colors.border};
`

const ProjectList = styled.div`
  padding-left: 8px;
`

const Resume = () => {
  const { contact, intro, careers, skills, companies, activities } = resumeData

  return (
    <ResumeContainer>
      <ProfileCard contact={contact} />

      {intro.length > 0 && <IntroCard intro={intro} />}

      {careers.length > 0 && <CareerCard careers={careers} />}

      {skills.length > 0 && <SkillCard skills={skills} />}

      {companies.map((company) => (
        <CompanySection key={company.name}>
          <CompanyTitle>{company.name}</CompanyTitle>
          <ProjectList>
            {company.projects.map((project, index) => (
              <ProjectCard key={index} project={project} />
            ))}
          </ProjectList>
        </CompanySection>
      ))}

      {activities.length > 0 && (
        <Card>
          <CardTitle>External Activities</CardTitle>
          <List>
            {activities.map((activity, index) => (
              <li key={index}>{activity}</li>
            ))}
          </List>
        </Card>
      )}
    </ResumeContainer>
  )
}

export default Resume
