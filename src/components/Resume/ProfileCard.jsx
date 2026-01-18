import React from "react"
import styled from "styled-components"
import { FaEnvelope, FaPhone, FaGithub, FaBlog } from "react-icons/fa"
import { Card, Link } from "./styles"

const ProfileWrapper = styled(Card)`
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
`

const Name = styled.h1`
  font-size: 28px;
  font-weight: 700;
  color: ${props => props.theme.colors.text};
  margin: 0 0 8px 0;
`

const Role = styled.p`
  font-size: 16px;
  color: ${props => props.theme.colors.secondaryText};
  margin: 0 0 20px 0;
`

const ContactLinks = styled.div`
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 16px;

  @media (max-width: 768px) {
    gap: 12px;
  }
`

const ContactItem = styled(Link)`
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  color: ${props => props.theme.colors.tertiaryText};

  & svg {
    width: 16px;
    height: 16px;
  }

  &:hover {
    color: ${props => props.theme.colors.text};
  }
`

const ProfileCard = ({ contact }) => {
  const { name, role, email, phone, github, blog } = contact

  return (
    <ProfileWrapper>
      <Name>{name}</Name>
      <Role>{role}</Role>
      <ContactLinks>
        {email && (
          <ContactItem href={`mailto:${email}`}>
            <FaEnvelope />
            {email}
          </ContactItem>
        )}
        {phone && (
          <ContactItem href={`tel:${phone}`}>
            <FaPhone />
            {phone}
          </ContactItem>
        )}
        {github && (
          <ContactItem href={github} target="_blank" rel="noopener noreferrer">
            <FaGithub />
            GitHub
          </ContactItem>
        )}
        {blog && (
          <ContactItem href={blog} target="_blank" rel="noopener noreferrer">
            <FaBlog />
            Blog
          </ContactItem>
        )}
      </ContactLinks>
    </ProfileWrapper>
  )
}

export default ProfileCard
