/**
 * 실제 contents/posts 를 읽어 시리즈 규칙과 글이 어긋나지 않는지 본다.
 * 글을 추가하다가 시리즈에서 빠지거나, 규칙만 남고 글이 사라지는 상황을 여기서 잡는다.
 */
const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")

const {
  SERIES_RULES,
  NAV_LABELS,
  matchSeries,
  groupPostsBySeries,
  buildPostNavigation,
} = require("../seriesRules")

const POSTS_DIR = path.join(__dirname, "..", "..", "..", "contents", "posts")

// gatsby-source-filesystem 의 createFilePath 와 같은 규칙으로 슬러그를 만든다.
// foo/index.md 는 /foo/ 가 되고 foo/bar.md 는 /foo/bar/ 가 된다.
// index.md 만 읽으면 intro/spring-ai.md 같은 글이 검사에서 통째로 빠진다.
const slugOfEntry = entry => {
  const dir = path.dirname(entry)
  const name = path.basename(entry, ".md")
  const segments = dir === "." ? [] : dir.split(path.sep)
  if (name !== "index") segments.push(name)
  return `/${segments.length ? `${segments.join("/")}/` : ""}`
}

const readPosts = () =>
  fs
    .readdirSync(POSTS_DIR, { recursive: true })
    .filter(entry => entry.endsWith(".md"))
    .map(entry => {
      const raw = fs.readFileSync(path.join(POSTS_DIR, entry), "utf8")
      return {
        id: entry,
        raw,
        fields: { slug: slugOfEntry(entry) },
        frontmatter: { date: (raw.match(/^date:\s*(.+)$/m) || [])[1] || "" },
      }
    })

const posts = readPosts()

test("콘텐츠 정합성", async t => {
  await t.test("글을 하나 이상 읽어온다", () => {
    assert.ok(posts.length > 10, `읽어온 글 ${posts.length}편`)
  })

  await t.test("프론트매터에 series 가 남아 있지 않다", () => {
    // 소속 근거는 슬러그 하나다. 프론트매터에 다시 적으면 두 정의가 갈라진다.
    const offenders = posts
      .filter(post => /^series:/m.test(post.raw.split("---")[1] || ""))
      .map(post => post.fields.slug)
    assert.deepEqual(offenders, [])
  })

  await t.test("모든 글에 date 가 있다", () => {
    const missing = posts
      .filter(post => !post.frontmatter.date)
      .map(post => post.fields.slug)
    assert.deepEqual(missing, [])
  })

  await t.test("시리즈 디렉토리의 글이 규칙에서 누락되지 않는다", t => {
    // 나열형 규칙은 아직 쓰지 않은 글까지 순서를 미리 선언한다. 그래서 목록에 있는데
    // 파일이 없는 건 정상이다. 반대로 파일이 있는데 목록에 없으면 그 글은 시리즈에서
    // 빠진 채 발행된다. 이 글을 시리즈로 묶게 만든 원래 버그가 그것이다.
    const missing = []

    SERIES_RULES.filter(rule => rule.slugs).forEach(rule => {
      const declared = new Set(rule.slugs)
      const written = posts
        .map(post => post.fields.slug)
        .filter(
          slug => slug.startsWith(rule.indexSlug) && slug !== rule.indexSlug
        )

      written
        .filter(slug => !declared.has(slug))
        .forEach(slug => missing.push(`${rule.id}: ${slug}`))

      const unwritten = rule.slugs.filter(slug => !written.includes(slug))
      if (unwritten.length > 0) {
        t.diagnostic(`${rule.id}: 아직 쓰지 않은 ${unwritten.length}편`)
      }
    })

    assert.deepEqual(missing, [])
  })

  await t.test("시리즈 디렉토리 아래인데 규칙에 안 잡히는 글을 드러낸다", t => {
    // 의도적으로 뺀 글도 있어서 실패시키지 않는다. 다만 조용히 빠지면
    // intro/spring-ai.md 처럼 규칙 수정 때 통째로 사라져도 아무도 모른다.
    SERIES_RULES.forEach(rule => {
      posts
        .map(post => post.fields.slug)
        .filter(
          slug =>
            slug.startsWith(rule.indexSlug) &&
            slug !== rule.indexSlug &&
            !matchSeries(slug)
        )
        .forEach(slug => t.diagnostic(`${rule.id} 밖에 있는 글: ${slug}`))
    })
  })

  await t.test("시리즈 목록 페이지 경로가 글 경로와 겹치지 않는다", () => {
    const slugs = new Set(posts.map(post => post.fields.slug))
    const collisions = SERIES_RULES.filter(rule =>
      slugs.has(rule.indexSlug)
    ).map(rule => rule.indexSlug)
    assert.deepEqual(collisions, [])
  })

  await t.test("시리즈 id 와 목록 경로가 중복되지 않는다", () => {
    const ids = SERIES_RULES.map(rule => rule.id)
    const indexSlugs = SERIES_RULES.map(rule => rule.indexSlug)
    assert.equal(new Set(ids).size, ids.length)
    assert.equal(new Set(indexSlugs).size, indexSlugs.length)
  })

  await t.test("라벨이 이동할 글의 소속과 일치한다", () => {
    const navigation = buildPostNavigation(posts)

    posts.forEach(post => {
      const rule = matchSeries(post.fields.slug)
      const nav = navigation.get(post.fields.slug)

      const check = (neighbor, label, inSeriesLabel, boundaryLabel) => {
        if (!neighbor) {
          assert.equal(label, null)
          return
        }
        const neighborRule = matchSeries(neighbor.fields.slug)
        const expected = !neighborRule
          ? null
          : rule && neighborRule.id === rule.id
          ? inSeriesLabel
          : boundaryLabel
        assert.equal(
          label,
          expected,
          `${post.fields.slug} 의 이웃 ${neighbor.fields.slug} 라벨이 ${label}`
        )
      }

      check(
        nav.previous,
        nav.previousLabel,
        NAV_LABELS.previousInSeries,
        NAV_LABELS.previousSeries
      )
      check(
        nav.next,
        nav.nextLabel,
        NAV_LABELS.nextInSeries,
        NAV_LABELS.nextSeries
      )
    })
  })

  await t.test("실제 글 전체에서 모든 링크가 대칭이다", () => {
    // 이 리팩터링을 촉발한 증상. 단독 글의 next 가 시리즈 중간 편으로
    // 들어가는데 그 편의 prev 는 시리즈 이전 편이라, 들어간 길로 못 돌아왔다.
    const navigation = buildPostNavigation(posts)
    navigation.forEach((nav, slug) => {
      if (nav.next) {
        const back = navigation.get(nav.next.fields.slug)
        assert.equal(
          back.previous && back.previous.fields.slug,
          slug,
          `${slug} → ${nav.next.fields.slug} 링크가 한 방향이다`
        )
      }
    })
  })

  await t.test("시리즈 블록은 단독 글이 끼어들어도 쪼개지지 않는다", () => {
    // 시리즈 안에서 next 를 따라가면 단독 글을 거치지 않고 끝 편까지 간다.
    const navigation = buildPostNavigation(posts)
    groupPostsBySeries(posts).forEach(({ rule, posts: seriesPosts }) => {
      seriesPosts.slice(0, -1).forEach((episode, i) => {
        const nav = navigation.get(episode.fields.slug)
        assert.equal(
          nav.next && nav.next.fields.slug,
          seriesPosts[i + 1].fields.slug,
          `${rule.id} 의 ${episode.fields.slug} 다음이 시리즈 다음 편이 아니다`
        )
      })
    })
  })

  await t.test("최신 storefront 글 다음은 spring 단독 글이 아니다", () => {
    // 이 리팩터링을 촉발한 회귀. 시리즈에 안 묶여서 날짜순 이웃(Spring)이 붙었다.
    const nav = buildPostNavigation(posts).get(
      "/frontend/e-commerce/state-ownership-first/"
    )
    assert.equal(nav.seriesId, "storefront")
    assert.equal(
      nav.previousLabel,
      NAV_LABELS.previousInSeries,
      "이전 글이 같은 시리즈가 아니다"
    )
  })
})
