const ACCENT = "#2563eb"

// slug 가 full path 형태 (예: /company/work/why1/, /roopers/will/one-week/) 이므로
// pattern 은 마지막 segment 만 검사하도록 작성.
export const SERIES_RULES = [
  {
    id: "why",
    name: "why",
    tagline: "사고가 어디서 시작됐는지 짚어보는 글",
    pattern: /\/why\d+\/$/,
    sortKey: (slug) => parseInt(slug.match(/why(\d+)/)[1], 10),
    accent: ACCENT,
  },
  {
    id: "phase",
    name: "frontend performance",
    tagline: "CMS 기반 뉴스 사이트 성능 최적화 단계",
    pattern: /\/phase\d+\/$/,
    sortKey: (slug) => parseInt(slug.match(/phase(\d+)/)[1], 10),
    accent: ACCENT,
  },
  {
    id: "round",
    name: "roopers round",
    tagline: "결제 시스템을 13주에 걸쳐 다시 만든 기록",
    pattern: /\/round\d+\/$/,
    sortKey: (slug) => parseInt(slug.match(/round(\d+)/)[1], 10),
    accent: ACCENT,
  },
  {
    id: "will",
    name: "roopers will",
    tagline: "주차별 회고",
    slugs: [
      "/roopers/will/one-week/",
      "/roopers/will/two-week/",
      "/roopers/will/seven-week/",
      "/roopers/will/will10/",
    ],
    sortOrder: [
      "/roopers/will/one-week/",
      "/roopers/will/two-week/",
      "/roopers/will/seven-week/",
      "/roopers/will/will10/",
    ],
    accent: ACCENT,
  },
]

export const matchSeries = (slug) =>
  SERIES_RULES.find((rule) => {
    if (rule.pattern && rule.pattern.test(slug)) return true
    if (rule.slugs && rule.slugs.includes(slug)) return true
    return false
  })

export const findSeriesById = (id) =>
  SERIES_RULES.find((rule) => rule.id === id)

export const sortSeriesPosts = (rule, posts) =>
  [...posts].sort((a, b) => {
    const slugA = a.fields.slug
    const slugB = b.fields.slug
    if (rule.sortOrder) {
      return rule.sortOrder.indexOf(slugA) - rule.sortOrder.indexOf(slugB)
    }
    if (rule.sortKey) {
      try {
        return rule.sortKey(slugA) - rule.sortKey(slugB)
      } catch {
        return 0
      }
    }
    return new Date(a.frontmatter.date) - new Date(b.frontmatter.date)
  })
