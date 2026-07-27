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

  await t.test(
    "시리즈 글의 이전/다음은 같은 시리즈이거나 시리즈 경계다",
    () => {
      const navigation = buildPostNavigation(posts)

      posts.forEach(post => {
        const rule = matchSeries(post.fields.slug)
        if (!rule) return

        const nav = navigation.get(post.fields.slug)
        const check = (neighbor, label, boundaryLabel) => {
          if (!neighbor) return
          const neighborRule = matchSeries(neighbor.fields.slug)
          const sameSeries = neighborRule === rule
          assert.ok(
            sameSeries || label === boundaryLabel,
            `${post.fields.slug} 의 이웃 ${neighbor.fields.slug} 가 다른 시리즈인데 라벨이 ${label}`
          )
          if (!sameSeries) {
            assert.ok(
              neighborRule,
              `${post.fields.slug} 가 시리즈에 속하지 않은 ${neighbor.fields.slug} 로 이어진다`
            )
          }
        }

        check(nav.previous, nav.previousLabel, NAV_LABELS.previousSeries)
        check(nav.next, nav.nextLabel, NAV_LABELS.nextSeries)
      })
    }
  )

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
