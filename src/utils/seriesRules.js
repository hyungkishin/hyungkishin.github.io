/**
 * 시리즈 정의의 단일 진실 원천.
 *
 * 어떤 글이 어느 시리즈에 속하는지는 슬러그 하나로 결정된다.
 * 마크다운 프론트매터에는 series 를 적지 않는다. 정의가 두 곳에 있으면
 * 시리즈 목록과 이전/다음 내비게이션이 서로 다른 답을 내놓는다.
 */

// 시리즈 = 슬러그 규칙. indexSlug 는 그 시리즈의 목록 페이지 경로다.
const SERIES_RULES = [
  {
    id: "why",
    name: "why",
    tagline: "사고가 어디서 시작됐는지 짚어보는 글",
    indexSlug: "/company/work/",
    pattern: /^\/company\/work\/why\d+\/$/,
    sortKey: slug => Number(slug.match(/why(\d+)/)?.[1]),
  },
  {
    id: "phase",
    name: "frontend performance",
    tagline: "CMS 기반 뉴스 사이트 성능 최적화 단계",
    indexSlug: "/frontend/performance/",
    pattern: /^\/frontend\/performance\/phase\d+\/$/,
    sortKey: slug => Number(slug.match(/phase(\d+)/)?.[1]),
  },
  {
    id: "week",
    name: "e-commerce 결제 시스템",
    tagline: "결제 시스템을 13주에 걸쳐 다시 만든 기록",
    indexSlug: "/e-commerce/technical-writing/",
    pattern: /^\/e-commerce\/technical-writing\/week\d+\/$/,
    sortKey: slug => Number(slug.match(/week(\d+)/)?.[1]),
  },
  {
    id: "storefront",
    name: "커머스 프론트엔드 다시 그리기",
    tagline: "상품 목록부터 결제 화면까지 경계를 다시 그은 기록",
    indexSlug: "/frontend/e-commerce/",
    pattern: /^\/frontend\/e-commerce\/[^/]+\/$/,
  },
  {
    id: "metrics",
    name: "계기가 거짓말할 때",
    tagline: "대시보드 숫자가 정상일 때 무엇을 다시 재야 하는가",
    indexSlug: "/backend/observability/",
    pattern: /^\/backend\/observability\/when-metrics-lie[^/]*\/$/,
  },
  {
    id: "spring-ai",
    name: "Spring AI 로 때워도 되나유",
    tagline: "배달 상담 에이전트를 6라운드에 걸쳐 만든 기록",
    indexSlug: "/backend/spring/spring-ai/",
    // 파일명이 index.md 가 아니라 intro/spring-ai.md 여서 슬러그가 한 단 더 들어간다.
    pattern: /^\/backend\/spring\/spring-ai\/(intro\/spring-ai|round\d+)\/$/,
    // intro 가 1편이고 roundN 이 N+1편이다.
    sortKey: slug => Number(slug.match(/round(\d+)/)?.[1] ?? 0),
  },
  {
    id: "js-quiz",
    name: "자바스크립트 열 문제",
    tagline: "퀴즈 열 개에서 언어 규칙을 역산한 기록",
    indexSlug: "/frontend/javascript/",
    // 문제 번호가 아니라 규칙 이름이 슬러그다. 읽는 순서는 아래 나열 순서다.
    slugs: [
      "/frontend/javascript/implicit-string-conversion/",
      "/frontend/javascript/value-identity/",
      "/frontend/javascript/shallow-copy/",
      "/frontend/javascript/lookup-and-call/",
      "/frontend/javascript/execution-order/",
    ],
  },
  {
    id: "will",
    name: "e-commerce 주간 회고",
    tagline: "주차별 회고",
    indexSlug: "/e-commerce/will/",
    // 슬러그에 규칙이 없는 시리즈. 나열 순서가 곧 읽는 순서다.
    slugs: [
      "/e-commerce/will/one-week/",
      "/e-commerce/will/two-week/",
      "/e-commerce/will/seven-week/",
      "/e-commerce/will/will10/",
    ],
  },
]

// 시리즈에 속하지 않은 글의 seriesId.
// GraphQL 필터에서 null 은 "시리즈 없는 글 전부"와 매칭되기 때문에,
// 어떤 글의 fields.series 와도 같지 않은 값을 대신 넘긴다.
const NO_SERIES_ID = "__none__"

// 이전/다음 버튼에 붙는 라벨. 시리즈 안에서 넘어가는지, 시리즈를 건너뛰는지 구분한다.
const NAV_LABELS = {
  previousInSeries: "시리즈 이전 편",
  nextInSeries: "시리즈 다음 편",
  previousSeries: "이전 시리즈",
  nextSeries: "다음 시리즈",
}

const matchSeries = slug =>
  SERIES_RULES.find(rule => {
    if (rule.pattern && rule.pattern.test(slug)) return true
    if (rule.slugs && rule.slugs.includes(slug)) return true
    return false
  })

const findSeriesById = id => SERIES_RULES.find(rule => rule.id === id)

/**
 * 정렬에 쓰는 날짜. 화면용으로 포맷된 date("July 03, 2026")는 사전순 비교가
 * 깨지므로, 쿼리에서 함께 받은 원본 isoDate 를 먼저 본다.
 */
const sortableDate = post =>
  String(post.frontmatter.isoDate || post.frontmatter.date || "")

const compareByDateThenSlug = (a, b) => {
  const byDate = sortableDate(a).localeCompare(sortableDate(b))
  return byDate !== 0 ? byDate : a.fields.slug.localeCompare(b.fields.slug)
}

/** 가장 최근 글. 시리즈 카드의 "최근 업데이트" 표기에 쓴다. */
const latestPost = posts =>
  posts.reduce(
    (latest, post) =>
      !latest || sortableDate(post) > sortableDate(latest) ? post : latest,
    null
  )

// 규칙이 순서를 지정하지 못하면 null. 그런 글은 날짜 순으로 밀린다.
const seriesOrderKey = (rule, slug) => {
  if (rule.slugs) {
    const index = rule.slugs.indexOf(slug)
    return index === -1 ? null : index
  }
  if (!rule.sortKey) return null
  const key = rule.sortKey(slug)
  return Number.isFinite(key) ? key : null
}

/** 시리즈 안에서의 읽는 순서. week2 가 week10 보다 앞이다. */
const sortSeriesPosts = (rule, posts) =>
  [...posts].sort((a, b) => {
    const keyA = seriesOrderKey(rule, a.fields.slug)
    const keyB = seriesOrderKey(rule, b.fields.slug)
    if (keyA !== null && keyB !== null && keyA !== keyB) return keyA - keyB
    if (keyA !== null && keyB === null) return -1
    if (keyA === null && keyB !== null) return 1
    return compareByDateThenSlug(a, b)
  })

/**
 * 글을 시리즈별로 묶는다. 시리즈끼리의 순서는 첫 편 날짜 순,
 * 첫 편 날짜가 같으면 SERIES_RULES 선언 순서.
 *
 * @returns {{rule: object, posts: object[]}[]}
 */
const groupPostsBySeries = posts => {
  const buckets = new Map()

  posts.forEach(post => {
    const rule = matchSeries(post.fields.slug)
    if (!rule) return
    if (!buckets.has(rule.id)) buckets.set(rule.id, [])
    buckets.get(rule.id).push(post)
  })

  return SERIES_RULES.filter(rule => buckets.has(rule.id))
    .map(rule => ({
      rule,
      posts: sortSeriesPosts(rule, buckets.get(rule.id)),
    }))
    .sort((a, b) => compareByDateThenSlug(a.posts[0], b.posts[0]))
}

/**
 * 글마다 이전/다음 글을 정한다.
 *
 * 시리즈 글은 같은 시리즈 안에서만 이어진다. 시리즈의 양 끝에서는 인접한
 * 시리즈의 마지막 편 또는 첫 편으로 넘어간다. 시리즈에 속하지 않은 글은
 * 전체 날짜 순의 앞뒤 글로 잇는다.
 *
 * 입력 순서와 무관하게 같은 결과가 나온다.
 *
 * @param {object[]} posts fields.slug 와 frontmatter.date 를 가진 글
 * @returns {Map<string, {seriesId: string|null, previous: object|null, next: object|null, previousLabel: string|null, nextLabel: string|null}>} 슬러그로 찾는 내비게이션
 */
const buildPostNavigation = posts => {
  const chronological = [...posts].sort(compareByDateThenSlug)
  const groups = groupPostsBySeries(posts)
  const groupIndexById = new Map(groups.map(({ rule }, i) => [rule.id, i]))

  const navigation = new Map()

  chronological.forEach((post, index) => {
    const rule = matchSeries(post.fields.slug)

    if (!rule) {
      navigation.set(post.fields.slug, {
        seriesId: null,
        previous: chronological[index - 1] || null,
        next: chronological[index + 1] || null,
        previousLabel: null,
        nextLabel: null,
      })
      return
    }

    const groupIndex = groupIndexById.get(rule.id)
    const siblings = groups[groupIndex].posts
    const position = siblings.findIndex(
      sibling => sibling.fields.slug === post.fields.slug
    )

    const previousGroup = groups[groupIndex - 1]
    const nextGroup = groups[groupIndex + 1]

    const [previous, previousLabel] =
      position > 0
        ? [siblings[position - 1], NAV_LABELS.previousInSeries]
        : previousGroup
        ? [
            previousGroup.posts[previousGroup.posts.length - 1],
            NAV_LABELS.previousSeries,
          ]
        : [null, null]

    const [next, nextLabel] =
      position < siblings.length - 1
        ? [siblings[position + 1], NAV_LABELS.nextInSeries]
        : nextGroup
        ? [nextGroup.posts[0], NAV_LABELS.nextSeries]
        : [null, null]

    navigation.set(post.fields.slug, {
      seriesId: rule.id,
      previous,
      next,
      previousLabel,
      nextLabel,
    })
  })

  return navigation
}

module.exports = {
  SERIES_RULES,
  NAV_LABELS,
  NO_SERIES_ID,
  matchSeries,
  findSeriesById,
  sortSeriesPosts,
  latestPost,
  groupPostsBySeries,
  buildPostNavigation,
}
