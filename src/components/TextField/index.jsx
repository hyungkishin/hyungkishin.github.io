import React from "react"
import styled from "styled-components"
import { FiSearch, FiX } from "react-icons/fi"

const Field = styled.div`
  display: flex;
  align-items: center;
  gap: 13px;
  min-height: 58px;
  padding: 0 12px 0 18px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface);
  color: var(--muted);
  &:focus-within {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  > svg {
    flex-shrink: 0;
  }
  input {
    flex: 1;
    min-width: 0;
    min-height: 54px;
    border: 0;
    background: transparent;
    color: var(--ink);
    font: inherit;
    font-size: 17px;
    outline: none;
  }
  input::placeholder {
    color: var(--muted);
    opacity: 1;
  }
  input::-webkit-search-cancel-button {
    appearance: none;
  }
  button {
    display: grid;
    place-items: center;
    width: 42px;
    height: 42px;
    padding: 0;
    border: 0;
    border-radius: 6px;
    color: var(--muted);
    background: transparent;
    cursor: pointer;
  }
  button:hover {
    color: var(--ink);
  }
`

export default function TextField({ onClear, inputRef, ...props }) {
  return (
    <Field>
      <FiSearch size={20} aria-hidden="true" />
      <input type="search" ref={inputRef} {...props} />
      {props.value && (
        <button type="button" aria-label="검색어 지우기" onClick={onClear}>
          <FiX size={19} aria-hidden="true" />
        </button>
      )}
    </Field>
  )
}
