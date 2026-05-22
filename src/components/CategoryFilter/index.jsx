import React from "react"
import styled from "styled-components"

import { CATEGORY_GROUPS } from "utils/categoryRules"

const Wrapper = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 28px;
  padding-bottom: 20px;
  border-bottom: 1px solid ${(props) => props.theme.colors.dividerSoft};

  @media (max-width: 600px) {
    padding: 0 4px 16px;
  }
`

const Chip = styled.button`
  appearance: none;
  border: 1px solid
    ${(props) =>
      props.active ? props.accent : props.theme.colors.cardBorder};
  background: ${(props) =>
    props.active ? `${props.accent}15` : props.theme.colors.cardBackground};
  color: ${(props) =>
    props.active ? props.accent : props.theme.colors.secondaryText};
  font-size: 13px;
  font-weight: ${(props) => (props.active ? 700 : 500)};
  padding: 7px 14px;
  border-radius: 999px;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;

  &:hover {
    border-color: ${(props) =>
      props.active ? props.accent : props.theme.colors.cardBorderHover};
  }
`

const CategoryFilter = ({ selected, onSelect, counts }) => {
  const ALL = { id: "all", label: "all", accent: "#191f28" }
  const items = [ALL, ...CATEGORY_GROUPS]

  return (
    <Wrapper>
      {items.map((item) => {
        const count = item.id === "all" ? counts.__total : counts[item.id] || 0
        if (item.id !== "all" && count === 0) return null
        return (
          <Chip
            key={item.id}
            active={selected === item.id}
            accent={item.accent}
            onClick={() => onSelect(item.id)}
          >
            {item.label} · {count}
          </Chip>
        )
      })}
    </Wrapper>
  )
}

export default CategoryFilter
