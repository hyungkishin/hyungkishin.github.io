// 폴더명 → 카테고리 그룹 매핑
// 차별은 텍스트로. 컬러는 한 가지 accent만 사용.
const TOP_DIR_TO_GROUP = {
  backend: "engineering",
  frontend: "engineering",
  devops: "engineering",
  "data-base": "engineering",
  company: "work",
  "e-commerce": "e-commerce",
  books: "reading",
}

const ACCENT = "#2563eb"

export const CATEGORY_GROUPS = [
  { id: "engineering", label: "engineering", accent: ACCENT },
  { id: "work", label: "work", accent: ACCENT },
  { id: "e-commerce", label: "e-commerce", accent: ACCENT },
  { id: "reading", label: "reading", accent: ACCENT },
]

export const categoryOf = (topDir) => {
  if (!topDir) return null
  const groupId = TOP_DIR_TO_GROUP[topDir]
  if (!groupId) return null
  return CATEGORY_GROUPS.find((g) => g.id === groupId)
}

export const findCategoryById = (id) =>
  CATEGORY_GROUPS.find((g) => g.id === id)
