import React from "react"
import styled from "styled-components"

import { CATEGORY_GROUPS } from "utils/categoryRules"

const Wrapper = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 4px 20px;
  margin-top: 28px;
  border-bottom: 1px solid ${(props) => props.theme.colors.divider};

  @media (max-width: 600px) {
    gap: 4px 16px;
    padding: 0 4px;
  }
`

const Chip = styled.button`
  appearance: none;
  background: transparent;
  border: 0;
  border-bottom: 2px solid
    ${(props) => (props.$active ? props.theme.colors.accent : "transparent")};
  padding: 12px 0 14px;
  margin-bottom: -1px;
  cursor: pointer;
  color: ${(props) =>
    props.$active ? props.theme.colors.text : props.theme.colors.tertiaryText};
  font-size: 14px;
  font-weight: ${(props) => (props.$active ? 600 : 500)};
  font-family: inherit;
  transition: color 0.15s, border-color 0.15s;

  &:hover {
    color: ${(props) => props.theme.colors.text};
  }

  &:focus {
    outline: none;
  }

  &:focus-visible {
    outline: 2px solid ${(props) => props.theme.colors.accent};
    outline-offset: 4px;
    border-radius: 2px;
  }
`

const Count = styled.span`
  margin-left: 5px;
  font-size: 12px;
  font-weight: 500;
  color: ${(props) => props.theme.colors.mutedText};
`

const CategoryFilter = ({ selected, onSelect, counts }) => {
  const ALL = { id: "all", label: "All" }
  const items = [ALL, ...CATEGORY_GROUPS]

  return (
    <Wrapper>
      {items.map((item) => {
        const count = item.id === "all" ? counts.__total : counts[item.id] || 0
        if (item.id !== "all" && count === 0) return null
        return (
          <Chip
            key={item.id}
            $active={selected === item.id}
            onClick={() => onSelect(item.id)}
            type="button"
          >
            {item.label}
            <Count>{count}</Count>
          </Chip>
        )
      })}
    </Wrapper>
  )
}

export default CategoryFilter
