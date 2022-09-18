import React, { FunctionComponent } from 'react'
import styled from '@emotion/styled'
import ProfileImage from 'components/main/ProfileImage'

const Background = styled.div`
  width: 100%;
  /* background-image: linear-gradient(60deg, #69e1f7 0%, #6578fa 100%); */
  color: #ffffff;
`

const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: flex-start;
  width: 768px;
  height: 400px;
  margin: 0 auto;

  @media (max-width: 768px) {
    width: 100%;
    height: 300px;
    padding: 0 20px;
  }
`

const SubTitle = styled.div`
  font-size: 20px;
  font-weight: 400;
  color: #0a0a0a;

  @media (max-width: 768px) {
    font-size: 15px;
  }
`

const Title = styled.div`
  margin-top: 5px;
  font-size: 35px;
  font-weight: 700;
  color: #0a0a0a;

  @media (max-width: 768px) {
    font-size: 25px;
  }
`

const Introduction: FunctionComponent = function () {
  return (
    <Background>
      <Wrapper>
        <ProfileImage />
        <div>
          <SubTitle>하나투어</SubTitle>
          <Title>하나하나가 새롭다</Title>
        </div>
      </Wrapper>
    </Background>
  )
}

export default Introduction