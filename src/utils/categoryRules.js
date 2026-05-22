// 폴더명 → 카테고리 그룹 매핑
// 토스의 Engineering/Design/Product 처럼 3~4개로 묶음
const TOP_DIR_TO_GROUP = {
  backend: "engineering",
  frontend: "engineering",
  devops: "engineering",
  "data-base": "engineering",
  company: "work",
  roopers: "roopers",
  books: "reading",
}

export const CATEGORY_GROUPS = [
  { id: "engineering", label: "engineering", accent: "#3182f6" },
  { id: "work", label: "work", accent: "#6366f1" },
  { id: "roopers", label: "roopers", accent: "#f59e0b" },
  { id: "reading", label: "reading", accent: "#10b981" },
]

export const categoryOf = (topDir) => {
  if (!topDir) return null
  const groupId = TOP_DIR_TO_GROUP[topDir]
  if (!groupId) return null
  return CATEGORY_GROUPS.find((g) => g.id === groupId)
}

export const findCategoryById = (id) =>
  CATEGORY_GROUPS.find((g) => g.id === id)
