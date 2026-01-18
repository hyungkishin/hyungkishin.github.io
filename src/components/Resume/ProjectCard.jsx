import React, { useState } from "react"
import styled from "styled-components"
import { FaChevronDown, FaChevronUp } from "react-icons/fa"
import { Badge } from "./styles"

const ProjectWrapper = styled.div`
  position: relative;
  padding-left: 24px;
  padding-bottom: 32px;
  border-left: 2px solid ${props => props.theme.colors.border};

  &:last-child {
    padding-bottom: 0;
    border-left-color: transparent;
  }

  &:before {
    content: "";
    position: absolute;
    left: -6px;
    top: 4px;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: ${props => props.theme.colors.text};
  }
`

const ProjectTitle = styled.h3`
  font-size: 18px;
  font-weight: 700;
  color: ${props => props.theme.colors.text};
  margin: 0 0 4px 0;
  line-height: 1.4;
`

const ProjectSubtitle = styled.p`
  font-size: 14px;
  color: ${props => props.theme.colors.tertiaryText};
  margin: 0 0 12px 0;
`

const TechStack = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 16px;
`

const Achievement = styled.div`
  display: inline-block;
  padding: 10px 16px;
  margin-bottom: 16px;
  background: linear-gradient(135deg,
    ${props => props.theme.name === 'dark' ? '#2d3748' : '#f0f4ff'} 0%,
    ${props => props.theme.name === 'dark' ? '#1a202c' : '#e8f0fe'} 100%
  );
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  color: ${props => props.theme.colors.text};
`

const Overview = styled.p`
  font-size: 14px;
  line-height: 1.7;
  color: ${props => props.theme.colors.secondaryText};
  margin: 0 0 16px 0;
`

const ResultsSection = styled.div`
  margin-bottom: 16px;
`

const ResultsTitle = styled.div`
  font-size: 12px;
  font-weight: 600;
  color: ${props => props.theme.colors.tertiaryText};
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 8px;
`

const ResultsList = styled.ul`
  margin: 0;
  padding: 0;
  list-style: none;

  & li {
    position: relative;
    padding-left: 14px;
    font-size: 14px;
    line-height: 1.6;
    color: ${props => props.theme.colors.secondaryText};
    margin-bottom: 4px;

    &:before {
      content: ">";
      position: absolute;
      left: 0;
      color: ${props => props.theme.colors.tertiaryText};
      font-weight: 600;
    }

    &:last-child {
      margin-bottom: 0;
    }
  }
`

const ToggleButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0;
  background: none;
  border: none;
  font-size: 13px;
  font-weight: 500;
  color: ${props => props.theme.colors.tertiaryText};
  cursor: pointer;
  transition: color 0.2s ease;

  &:hover {
    color: ${props => props.theme.colors.text};
  }

  & svg {
    width: 10px;
    height: 10px;
  }
`

const DetailSection = styled.div`
  margin-top: 16px;
  padding: 20px;
  background: ${props => props.theme.colors.background};
  border-radius: 10px;
`

const DetailBlock = styled.div`
  margin-bottom: 20px;

  &:last-child {
    margin-bottom: 0;
  }
`

const DetailTitle = styled.h4`
  font-size: 13px;
  font-weight: 700;
  color: ${props => props.theme.colors.text};
  margin: 0 0 10px 0;
  display: flex;
  align-items: center;
  gap: 8px;

  &:before {
    content: "";
    width: 3px;
    height: 14px;
    background: ${props => props.theme.colors.tertiaryText};
    border-radius: 2px;
  }
`

const DetailList = styled.ul`
  margin: 0;
  padding-left: 16px;

  & li {
    font-size: 13px;
    line-height: 1.7;
    color: ${props => props.theme.colors.secondaryText};
    margin-bottom: 4px;

    &:last-child {
      margin-bottom: 0;
    }
  }
`

const ProblemItem = styled.div`
  margin-bottom: 12px;
  padding-left: 12px;
  border-left: 2px solid ${props => props.theme.colors.divider};

  &:last-child {
    margin-bottom: 0;
  }
`

const ProblemTitle = styled.div`
  font-size: 13px;
  font-weight: 600;
  color: ${props => props.theme.colors.text};
  margin-bottom: 6px;
`

const ProjectCard = ({ project }) => {
  const [isExpanded, setIsExpanded] = useState(false)

  const hasDetails = (project.role?.length > 0) ||
                     (project.tasks?.length > 0) ||
                     (project.problemSolving?.length > 0)

  return (
    <ProjectWrapper>
      <ProjectTitle>{project.title}</ProjectTitle>
      {project.subtitle && <ProjectSubtitle>{project.subtitle}</ProjectSubtitle>}

      {project.techStack && project.techStack.length > 0 && (
        <TechStack>
          {project.techStack.map((tech, index) => (
            <Badge key={index}>{tech}</Badge>
          ))}
        </TechStack>
      )}

      {project.achievement && <Achievement>{project.achievement}</Achievement>}

      {project.overview && <Overview>{project.overview}</Overview>}

      {project.results && project.results.length > 0 && (
        <ResultsSection>
          <ResultsTitle>Key Results</ResultsTitle>
          <ResultsList>
            {project.results.map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ResultsList>
        </ResultsSection>
      )}

      {hasDetails && (
        <>
          <ToggleButton onClick={() => setIsExpanded(!isExpanded)}>
            {isExpanded ? (
              <>접기 <FaChevronUp /></>
            ) : (
              <>상세 보기 <FaChevronDown /></>
            )}
          </ToggleButton>

          {isExpanded && (
            <DetailSection>
              {project.role && project.role.length > 0 && (
                <DetailBlock>
                  <DetailTitle>역할</DetailTitle>
                  <DetailList>
                    {project.role.map((item, index) => (
                      <li key={index}>{item}</li>
                    ))}
                  </DetailList>
                </DetailBlock>
              )}

              {project.tasks && project.tasks.length > 0 && (
                <DetailBlock>
                  <DetailTitle>주요 업무</DetailTitle>
                  <DetailList>
                    {project.tasks.map((item, index) => (
                      <li key={index}>{item}</li>
                    ))}
                  </DetailList>
                </DetailBlock>
              )}

              {project.problemSolving && project.problemSolving.length > 0 && (
                <DetailBlock>
                  <DetailTitle>문제 해결</DetailTitle>
                  {project.problemSolving.map((problem, index) => (
                    <ProblemItem key={index}>
                      <ProblemTitle>{problem.title}</ProblemTitle>
                      <DetailList>
                        {problem.items.map((item, itemIndex) => (
                          <li key={itemIndex}>{item}</li>
                        ))}
                      </DetailList>
                    </ProblemItem>
                  ))}
                </DetailBlock>
              )}
            </DetailSection>
          )}
        </>
      )}
    </ProjectWrapper>
  )
}

export default ProjectCard
