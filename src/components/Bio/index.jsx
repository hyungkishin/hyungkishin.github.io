import React from "react"
import styled from "styled-components"

import ProfileImage from "images/profile.png"

import {
  FaGithub,
  FaKaggle,
  FaFacebook,
  FaLinkedin,
  FaInstagram,
  FaLink,
  FaEnvelope,
} from "react-icons/fa"

import { description, author, links } from "../../../blog-config"

const BioWrapper = styled.div`
  display: flex;
  align-items: center;
  gap: 20px;

  @media (max-width: 768px) {
    padding: 0 8px;
    gap: 16px;
  }
`

const Profile = styled.div`
  flex: 0 0 auto;
  width: 112px;
  height: 112px;
  border-radius: 999px;
  background-image: url(${ProfileImage});
  background-size: cover;
  background-position: center;

  @media (max-width: 768px) {
    width: 88px;
    height: 88px;
  }
`

const Author = styled.div`
  margin-bottom: 6px;
  font-size: 24px;
  font-weight: 700;
  letter-spacing: -0.015em;
  color: ${props => props.theme.colors.text};
`

const Description = styled.div`
  margin-bottom: 14px;
  line-height: 1.6;
  font-size: 15px;
  color: ${props => props.theme.colors.secondaryText};
`

const LinksWrapper = styled.div`
  & a {
    margin-right: 9.6px;
  }

  & svg {
    width: 25.6px;
    height: 25.6px;
    cursor: pointer;
  }

  & svg path {
    fill: ${props => props.theme.colors.icon};
    transition: fill 0.3s;
  }

  & a:hover svg path {
    fill: ${props => props.theme.colors.text};
  }
`

const Link = ({ link, label, children }) => {
  if (!link) return null
  return (
    <a href={link} target="_blank" rel="noreferrer" aria-label={label}>
      {children}
    </a>
  )
}

const Bio = () => {
  const { github, kaggle, instagram, facebook, linkedIn, email, etc } = links

  return (
    <BioWrapper id="bio">
      <Profile />
      <div>
        <Author>@{author}</Author>
        <Description>{description}</Description>
        <LinksWrapper>
          <Link link={github} label="GitHub">
            <FaGithub />
          </Link>
          <Link link={kaggle} label="Kaggle">
            <FaKaggle />
          </Link>
          <Link link={instagram} label="Instagram">
            <FaInstagram />
          </Link>
          <Link link={facebook} label="Facebook">
            <FaFacebook />
          </Link>
          <Link link={linkedIn} label="LinkedIn">
            <FaLinkedin />
          </Link>
          <Link link={email} label="Email">
            <FaEnvelope />
          </Link>
          <Link link={etc} label="Website">
            <FaLink />
          </Link>
        </LinksWrapper>
      </div>
    </BioWrapper>
  )
}

export default Bio
