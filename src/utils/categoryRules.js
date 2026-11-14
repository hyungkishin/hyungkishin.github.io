export const CATEGORY_GROUPS = [
  { id: "backend", label: "백엔드" },
  { id: "frontend", label: "프런트엔드" },
  { id: "company", label: "업무 기록" },
  { id: "e-commerce", label: "커머스" },
  { id: "infra", label: "인프라와 DB" },
  { id: "books", label: "독서" },
]

export const findCategoryById = id => CATEGORY_GROUPS.find(group => group.id === id)

export const categoryOf = directory => findCategoryById(
  directory === "devops" || directory === "data-base" ? "infra" : directory
)
