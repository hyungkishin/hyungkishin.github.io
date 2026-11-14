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
    id: "transfer-performance",
    name: "송금 한 건으로 읽는 백엔드",
    tagline: "송금 요청에 걸린 시간을 재려고 보니 어디서 타이머를 끌지부터 정해야 했다. 수수료를 계산하는 JVM 안에서도, 은행에 보낸 요청의 응답을 기다릴 때도 재는 구간이 달라진다.",
    indexSlug: "/backend/transfer-performance/",
    slugs: [
      "/backend/transfer-performance/01-measurement/",
      "/backend/transfer-performance/class-loading/",
      "/backend/transfer-performance/02-jvm-execution/",
      "/backend/transfer-performance/jit-aot-linux/",
      "/backend/transfer-performance/jvm-memory/",
      "/backend/transfer-performance/system-arraycopy/",
      "/backend/transfer-performance/gc-timeline/",
      "/backend/transfer-performance/tcp-linux/",
      "/backend/transfer-performance/parallel-io/",
      "/backend/transfer-performance/03-transfer-contract/",
      "/backend/transfer-performance/04-kafka-redis/",
      "/backend/transfer-performance/05-jpa-access/",
    ],
  },
  {
    id: "why",
    name: "장애 원인 분석",
    tagline: "인증 버그를 고쳐 배포했는데도 같은 알림이 왔다. 재시도 버튼을 누른 사용자 한 명의 로그로 돌아갔다.",
    indexSlug: "/company/work/",
    pattern: /^\/company\/work\/why\d+\/$/,
    sortKey: slug => Number(slug.match(/why(\d+)/)?.[1]),
  },
  {
    id: "phase",
    name: "프론트엔드 성능 최적화",
    tagline: "기사 페이지에서 태그를 고쳤는데도 AMP 검증에 실패했다. Next.js가 끼워 넣은 스크립트는 어디서 빼야 할까?",
    indexSlug: "/frontend/performance/",
    pattern: /^\/frontend\/performance\/phase\d+\/$/,
    sortKey: slug => Number(slug.match(/phase(\d+)/)?.[1]),
  },
  {
    id: "week",
    name: "이커머스 결제 시스템",
    tagline: "결제 시스템을 13주에 걸쳐 다시 만든 기록",
    indexSlug: "/e-commerce/technical-writing/",
    pattern: /^\/e-commerce\/technical-writing\/week\d+\/$/,
    sortKey: slug => Number(slug.match(/week(\d+)/)?.[1]),
  },
  {
    id: "storefront",
    name: "커머스 프론트엔드 설계",
    tagline: "장바구니 수량을 바꾸면 상품 목록과 결제 화면에는 언제 반영해야 할까?",
    indexSlug: "/frontend/e-commerce/",
    pattern: /^\/frontend\/e-commerce\/[^/]+\/$/,
  },
  {
    id: "metrics",
    name: "지표와 실제 상태가 다를 때",
    tagline: "알림 181건이 도착하지 않았는데 대시보드의 에러율은 0%였다. 성공으로 집계한 요청의 응답 본문을 열었다.",
    indexSlug: "/backend/observability/",
    pattern: /^\/backend\/observability\/when-metrics-lie[^/]*\/$/,
  },
  {
    id: "spring-ai",
    name: "Spring AI로 배달 상담 에이전트 구현하기",
    tagline: "고객이 “그거 취소해 줘”라고 하면 어떤 주문을 취소해야 할까? 이전 대화에서 주문을 찾고 취소 도구를 호출하기까지의 과정을 기록했다.",
    indexSlug: "/backend/spring/spring-ai/",
    // 파일명이 index.md 가 아니라 intro/spring-ai.md 여서 슬러그가 한 단 더 들어간다.
    pattern: /^\/backend\/spring\/spring-ai\/(intro\/spring-ai|round\d+)\/$/,
    // intro 가 1편이고 roundN 이 N+1편이다.
    sortKey: slug => Number(slug.match(/round(\d+)/)?.[1] ?? 0),
  },
  {
    id: "js-quiz",
    name: "자바스크립트 열 문제",
    tagline: "열 가지 문제로 확인하는 자바스크립트 동작 원리",
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
    name: "이커머스 개발 주간 회고",
    tagline: "주차별 설계 결정과 검증 결과, 남은 과제",
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
 * 읽기 순서는 하나다. 시리즈는 첫 편 날짜 자리에 통째로 놓인 블록이고,
 * 시리즈에 속하지 않은 글은 자기 날짜 자리에 한 편짜리 블록으로 낀다.
 * 이전/다음은 이 단일 순서의 이웃이다. 그래서 어떤 글에서도
 * A의 다음이 B면 B의 이전은 A다. 시리즈 중간으로 끼어드는 경로가 없고,
 * 시리즈 양 끝은 단독 글을 건너뛰지 않는다.
 *
 * 라벨은 이동할 글을 설명한다. 같은 시리즈면 "시리즈 이전/다음 편",
 * 다른 시리즈면 "이전/다음 시리즈", 단독 글이면 라벨 없음.
 *
 * 입력 순서와 무관하게 같은 결과가 나온다.
 *
 * @param {object[]} posts fields.slug 와 frontmatter.date 를 가진 글
 * @returns {Map<string, {seriesId: string|null, previous: object|null, next: object|null, previousLabel: string|null, nextLabel: string|null}>} 슬러그로 찾는 내비게이션
 */
const buildPostNavigation = posts => {
  const blocks = groupPostsBySeries(posts).map(({ rule, posts: grouped }) => ({
    seriesId: rule.id,
    posts: grouped,
  }))

  posts
    .filter(post => !matchSeries(post.fields.slug))
    .forEach(post => blocks.push({ seriesId: null, posts: [post] }))

  blocks.sort((a, b) => compareByDateThenSlug(a.posts[0], b.posts[0]))

  const sequence = blocks.flatMap(block =>
    block.posts.map(post => ({ post, seriesId: block.seriesId }))
  )

  const labelFor = (current, neighbor, inSeries, acrossSeries) => {
    if (!neighbor || !neighbor.seriesId) return null
    if (neighbor.seriesId === current.seriesId) return inSeries
    return acrossSeries
  }

  const navigation = new Map()

  sequence.forEach((entry, index) => {
    const previous = sequence[index - 1] || null
    const next = sequence[index + 1] || null

    navigation.set(entry.post.fields.slug, {
      seriesId: entry.seriesId,
      previous: previous ? previous.post : null,
      next: next ? next.post : null,
      previousLabel: labelFor(
        entry,
        previous,
        NAV_LABELS.previousInSeries,
        NAV_LABELS.previousSeries
      ),
      nextLabel: labelFor(
        entry,
        next,
        NAV_LABELS.nextInSeries,
        NAV_LABELS.nextSeries
      ),
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
