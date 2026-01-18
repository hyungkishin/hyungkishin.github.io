import React from "react"
import { Card, CardTitle, Text } from "./styles"

const IntroCard = ({ intro }) => {
  return (
    <Card>
      <CardTitle>소개</CardTitle>
      {intro.map((paragraph, index) => (
        <Text key={index} style={{ marginBottom: index < intro.length - 1 ? "12px" : 0 }}>
          {paragraph}
        </Text>
      ))}
    </Card>
  )
}

export default IntroCard
