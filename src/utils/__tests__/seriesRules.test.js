const test = require("node:test")
const assert = require("node:assert/strict")

const {
  SERIES_RULES,
  NAV_LABELS,
  NO_SERIES_ID,
  matchSeries,
  sortSeriesPosts,
  latestPost,
  groupPostsBySeries,
  buildPostNavigation,
} = require("../seriesRules")

const post = (slug, date) => ({
  id: slug,
  fields: { slug },
  frontmatter: { date },
})

const idOf = slug => {
  const rule = matchSeries(slug)
  return rule ? rule.id : null
}

const navOf = (posts, slug) => buildPostNavigation(posts).get(slug)

const slugOf = node => (node ? node.fields.slug : null)

test("matchSeries: 슬러그가 시리즈 소속을 결정한다", async t => {
  await t.test("각 시리즈의 대표 글이 자기 규칙에 잡힌다", () => {
    assert.equal(idOf("/company/work/why3/"), "why")
    assert.equal(idOf("/frontend/performance/phase8/"), "phase")
    assert.equal(idOf("/e-commerce/technical-writing/week10/"), "week")
    assert.equal(
      idOf("/frontend/e-commerce/state-ownership-first/"),
      "storefront"
    )
    assert.equal(idOf("/backend/observability/when-metrics-lie/"), "metrics")
    assert.equal(
      idOf("/backend/observability/when-metrics-lie-kafka-lag/"),
      "metrics"
    )
    assert.equal(idOf("/backend/spring/spring-ai/round6/"), "spring-ai")
    // 파일명이 index.md 가 아니라 슬러그가 한 단 더 들어간다
    assert.equal(
      idOf("/backend/spring/spring-ai/intro/spring-ai/"),
      "spring-ai"
    )
    assert.equal(idOf("/e-commerce/will/will10/"), "will")
  })

  await t.test("시리즈에 속하지 않는 글은 잡히지 않는다", () => {
    assert.equal(idOf("/frontend/good-code-and-ai/"), null)
    assert.equal(idOf("/backend/spring/cpu-bound-vs-io-bound/"), null)
    assert.equal(idOf("/books/tailer/"), null)
    assert.equal(idOf("/resume/"), null)
  })

  await t.test("같은 디렉토리의 무관한 글을 끌어오지 않는다", () => {
    // 시리즈로 옮겼다는 안내만 남은 글. 목록에 다시 끼면 안 된다.
    assert.equal(idOf("/backend/observability/reading-metrics/"), null)
  })

  await t.test("목록 페이지 경로 자체는 시리즈 글이 아니다", () => {
    SERIES_RULES.forEach(rule => {
      assert.equal(
        matchSeries(rule.indexSlug),
        undefined,
        `${rule.id} 의 indexSlug 가 자기 규칙에 잡힌다`
      )
    })
  })

  await t.test("한 글이 두 시리즈에 동시에 속하지 않는다", () => {
    const samples = [
      "/company/work/why1/",
      "/frontend/e-commerce/checkout-modeling/",
      "/backend/observability/when-metrics-lie-redis-p95/",
      "/backend/spring/spring-ai/round1/",
      "/e-commerce/will/one-week/",
    ]
    samples.forEach(slug => {
      const matched = SERIES_RULES.filter(rule => {
        if (rule.pattern && rule.pattern.test(slug)) return true
        return Boolean(rule.slugs && rule.slugs.includes(slug))
      })
      assert.equal(
        matched.length,
        1,
        `${slug} 가 ${matched.length}개 규칙에 잡힌다`
      )
    })
  })

  await t.test("NO_SERIES_ID 는 실제 시리즈 id 와 겹치지 않는다", () => {
    assert.equal(
      SERIES_RULES.some(rule => rule.id === NO_SERIES_ID),
      false
    )
  })
})

test("sortSeriesPosts: 읽는 순서", async t => {
  await t.test("번호는 사전순이 아니라 숫자순이다", () => {
    const rule = matchSeries("/e-commerce/technical-writing/week1/")
    const sorted = sortSeriesPosts(rule, [
      post("/e-commerce/technical-writing/week10/", "2024-03-01"),
      post("/e-commerce/technical-writing/week2/", "2024-01-02"),
      post("/e-commerce/technical-writing/week1/", "2024-01-01"),
    ])
    assert.deepEqual(sorted.map(slugOf), [
      "/e-commerce/technical-writing/week1/",
      "/e-commerce/technical-writing/week2/",
      "/e-commerce/technical-writing/week10/",
    ])
  })

  await t.test("intro 가 round1 보다 앞이다", () => {
    const rule = matchSeries("/backend/spring/spring-ai/round1/")
    const sorted = sortSeriesPosts(rule, [
      post("/backend/spring/spring-ai/round1/", "2026-07-19"),
      post("/backend/spring/spring-ai/intro/spring-ai/", "2025-03-29"),
    ])
    assert.deepEqual(sorted.map(slugOf), [
      "/backend/spring/spring-ai/intro/spring-ai/",
      "/backend/spring/spring-ai/round1/",
    ])
  })

  await t.test("나열 순서로 정의된 시리즈는 날짜를 무시한다", () => {
    const rule = matchSeries("/e-commerce/will/one-week/")
    const sorted = sortSeriesPosts(rule, [
      post("/e-commerce/will/will10/", "2023-01-01"),
      post("/e-commerce/will/one-week/", "2023-12-31"),
    ])
    assert.deepEqual(sorted.map(slugOf), [
      "/e-commerce/will/one-week/",
      "/e-commerce/will/will10/",
    ])
  })

  await t.test("번호 규칙이 없는 시리즈는 날짜순이다", () => {
    const rule = matchSeries("/frontend/e-commerce/checkout-modeling/")
    const sorted = sortSeriesPosts(rule, [
      post("/frontend/e-commerce/state-ownership-first/", "2026-07-24"),
      post("/frontend/e-commerce/checkout-modeling/", "2026-06-26"),
      post("/frontend/e-commerce/product-list-boundary/", "2026-07-03"),
    ])
    assert.deepEqual(sorted.map(slugOf), [
      "/frontend/e-commerce/checkout-modeling/",
      "/frontend/e-commerce/product-list-boundary/",
      "/frontend/e-commerce/state-ownership-first/",
    ])
  })

  await t.test("날짜가 같으면 슬러그로 순서가 고정된다", () => {
    const rule = matchSeries("/frontend/e-commerce/checkout-modeling/")
    const input = [
      post("/frontend/e-commerce/b/", "2026-01-01"),
      post("/frontend/e-commerce/a/", "2026-01-01"),
    ]
    assert.deepEqual(sortSeriesPosts(rule, input).map(slugOf), [
      "/frontend/e-commerce/a/",
      "/frontend/e-commerce/b/",
    ])
    assert.deepEqual(sortSeriesPosts(rule, [...input].reverse()).map(slugOf), [
      "/frontend/e-commerce/a/",
      "/frontend/e-commerce/b/",
    ])
  })

  await t.test("화면용으로 포맷된 날짜에 속지 않는다", () => {
    // "July 03, 2026" < "June 26, 2026" 이 되는 사전순 비교 함정.
    const rule = matchSeries("/frontend/e-commerce/checkout-modeling/")
    const formatted = (slug, date, isoDate) => ({
      id: slug,
      fields: { slug },
      frontmatter: { date, isoDate },
    })
    const sorted = sortSeriesPosts(rule, [
      formatted("/frontend/e-commerce/b/", "July 03, 2026", "2026-07-03"),
      formatted("/frontend/e-commerce/a/", "June 26, 2026", "2026-06-26"),
    ])
    assert.deepEqual(sorted.map(slugOf), [
      "/frontend/e-commerce/a/",
      "/frontend/e-commerce/b/",
    ])
  })

  await t.test("원본 배열을 건드리지 않는다", () => {
    const rule = matchSeries("/company/work/why1/")
    const input = [
      post("/company/work/why2/", "2024-02-01"),
      post("/company/work/why1/", "2024-01-01"),
    ]
    sortSeriesPosts(rule, input)
    assert.equal(input[0].fields.slug, "/company/work/why2/")
  })
})

test("latestPost: 가장 최근 글", async t => {
  await t.test("포맷된 날짜가 아니라 원본 날짜로 고른다", () => {
    const withIso = (slug, date, isoDate) => ({
      id: slug,
      fields: { slug },
      frontmatter: { date, isoDate },
    })
    const latest = latestPost([
      withIso("/a/", "July 03, 2026", "2026-07-03"),
      withIso("/b/", "June 26, 2026", "2026-06-26"),
    ])
    assert.equal(slugOf(latest), "/a/")
  })

  await t.test("글이 없으면 null", () => {
    assert.equal(latestPost([]), null)
  })
})

test("groupPostsBySeries: 시리즈 묶음", async t => {
  const posts = [
    post("/company/work/why1/", "2024-01-01"),
    post("/frontend/good-code-and-ai/", "2024-02-01"),
    post("/frontend/performance/phase2/", "2024-03-02"),
    post("/frontend/performance/phase1/", "2024-03-01"),
  ]

  await t.test("시리즈에 속하지 않은 글은 어느 묶음에도 없다", () => {
    const grouped = groupPostsBySeries(posts)
    const slugs = grouped.flatMap(group => group.posts.map(slugOf))
    assert.equal(slugs.includes("/frontend/good-code-and-ai/"), false)
  })

  await t.test("시리즈 순서는 첫 편 날짜순이다", () => {
    assert.deepEqual(
      groupPostsBySeries(posts).map(group => group.rule.id),
      ["why", "phase"]
    )
  })

  await t.test("글이 하나도 없는 시리즈는 나오지 않는다", () => {
    assert.deepEqual(
      groupPostsBySeries([post("/company/work/why1/", "2024-01-01")]).map(
        group => group.rule.id
      ),
      ["why"]
    )
  })
})

test("buildPostNavigation: 이전/다음 글", async t => {
  // 시리즈 두 개와 그 사이에 낀 단독 글.
  const posts = [
    post("/frontend/e-commerce/checkout-modeling/", "2026-06-26"),
    post("/frontend/e-commerce/product-list-boundary/", "2026-07-03"),
    post("/frontend/e-commerce/state-ownership-first/", "2026-07-24"),
    post("/backend/spring/cpu-bound-vs-io-bound/", "2026-07-25"),
    post("/backend/spring/spring-ai/round1/", "2026-07-26"),
    post("/backend/spring/spring-ai/round2/", "2026-07-27"),
  ]

  await t.test("시리즈 안에서는 같은 시리즈끼리 이어진다", () => {
    const nav = navOf(posts, "/frontend/e-commerce/product-list-boundary/")
    assert.equal(nav.seriesId, "storefront")
    assert.equal(
      slugOf(nav.previous),
      "/frontend/e-commerce/checkout-modeling/"
    )
    assert.equal(
      slugOf(nav.next),
      "/frontend/e-commerce/state-ownership-first/"
    )
    assert.equal(nav.previousLabel, NAV_LABELS.previousInSeries)
    assert.equal(nav.nextLabel, NAV_LABELS.nextInSeries)
  })

  await t.test("시리즈 중간 편은 날짜가 끼어든 단독 글로 새지 않는다", () => {
    // 회귀: cpu-bound(07-25)가 날짜상으로는 storefront 뒤, round1 앞에 있어도
    // 시리즈 블록을 쪼개고 들어오면 안 된다.
    const nav = navOf(posts, "/frontend/e-commerce/product-list-boundary/")
    assert.equal(slugOf(nav.next), "/frontend/e-commerce/state-ownership-first/")
  })

  await t.test("시리즈 마지막 편은 순서상 다음 블록으로 이어진다", () => {
    // 단독 글을 건너뛰지 않는다. 건너뛰면 그 글은 next 체인에서 고아가 된다.
    const nav = navOf(posts, "/frontend/e-commerce/state-ownership-first/")
    assert.equal(slugOf(nav.next), "/backend/spring/cpu-bound-vs-io-bound/")
    assert.equal(nav.nextLabel, null)
  })

  await t.test("시리즈끼리 붙어 있으면 경계 라벨이 붙는다", () => {
    const adjacent = [
      post("/frontend/e-commerce/checkout-modeling/", "2026-06-26"),
      post("/backend/spring/spring-ai/round1/", "2026-07-26"),
    ]
    const last = navOf(adjacent, "/frontend/e-commerce/checkout-modeling/")
    assert.equal(slugOf(last.next), "/backend/spring/spring-ai/round1/")
    assert.equal(last.nextLabel, NAV_LABELS.nextSeries)

    const first = navOf(adjacent, "/backend/spring/spring-ai/round1/")
    assert.equal(slugOf(first.previous), "/frontend/e-commerce/checkout-modeling/")
    assert.equal(first.previousLabel, NAV_LABELS.previousSeries)
  })

  await t.test("첫 시리즈의 첫 편에는 이전 글이 없다", () => {
    const nav = navOf(posts, "/frontend/e-commerce/checkout-modeling/")
    assert.equal(nav.previous, null)
    assert.equal(nav.previousLabel, null)
  })

  await t.test("마지막 시리즈의 마지막 편에는 다음 글이 없다", () => {
    const nav = navOf(posts, "/backend/spring/spring-ai/round2/")
    assert.equal(nav.next, null)
    assert.equal(nav.nextLabel, null)
  })

  await t.test("단독 글은 양옆 시리즈와 대칭으로 이어진다", () => {
    // 예전 회귀: 단독 글의 next 는 시리즈 중간 편(날짜순 이웃)인데
    // 그 편의 prev 는 시리즈 이전 편이라 왕복이 안 됐다.
    const nav = navOf(posts, "/backend/spring/cpu-bound-vs-io-bound/")
    assert.equal(nav.seriesId, null)
    assert.equal(
      slugOf(nav.previous),
      "/frontend/e-commerce/state-ownership-first/"
    )
    assert.equal(slugOf(nav.next), "/backend/spring/spring-ai/round1/")
    // 라벨은 이동할 글을 설명한다. 양옆이 시리즈면 시리즈 라벨이 붙는다.
    assert.equal(nav.previousLabel, NAV_LABELS.previousSeries)
    assert.equal(nav.nextLabel, NAV_LABELS.nextSeries)
  })

  await t.test("모든 링크가 대칭이다: A의 다음이 B면 B의 이전은 A다", () => {
    const navigation = buildPostNavigation(posts)
    navigation.forEach((nav, slug) => {
      if (nav.next) {
        const back = navigation.get(nav.next.fields.slug)
        assert.equal(
          slugOf(back.previous),
          slug,
          `${slug} → ${slugOf(nav.next)} 링크가 한 방향이다`
        )
      }
      if (nav.previous) {
        const forward = navigation.get(nav.previous.fields.slug)
        assert.equal(
          slugOf(forward.next),
          slug,
          `${slugOf(nav.previous)} → ${slug} 링크가 한 방향이다`
        )
      }
    })
  })

  await t.test("입력 순서가 뒤섞여도 결과가 같다", () => {
    const shuffled = [
      posts[4],
      posts[0],
      posts[3],
      posts[5],
      posts[2],
      posts[1],
    ]
    const expected = buildPostNavigation(posts)
    const actual = buildPostNavigation(shuffled)

    assert.deepEqual([...actual.keys()].sort(), [...expected.keys()].sort())
    expected.forEach((nav, slug) => {
      assert.deepEqual(
        {
          seriesId: actual.get(slug).seriesId,
          previous: slugOf(actual.get(slug).previous),
          next: slugOf(actual.get(slug).next),
        },
        {
          seriesId: nav.seriesId,
          previous: slugOf(nav.previous),
          next: slugOf(nav.next),
        },
        `${slug} 의 내비게이션이 입력 순서에 따라 달라진다`
      )
    })
  })

  await t.test("모든 글이 내비게이션을 하나씩 가진다", () => {
    const navigation = buildPostNavigation(posts)
    assert.equal(navigation.size, posts.length)
  })

  await t.test("글이 없어도 터지지 않는다", () => {
    assert.equal(buildPostNavigation([]).size, 0)
  })

  await t.test(
    "한 편짜리 시리즈는 양옆이 모두 비거나 이웃 시리즈로 간다",
    () => {
      const single = [post("/company/work/why1/", "2024-01-01")]
      const nav = navOf(single, "/company/work/why1/")
      assert.equal(nav.previous, null)
      assert.equal(nav.next, null)
    }
  )
})
