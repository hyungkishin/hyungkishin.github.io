const test = require("node:test")
const assert = require("node:assert/strict")
const { matchSeries, buildPostNavigation } = require("../seriesRules")

test("성능과 송금 시리즈는 측정부터 데이터 접근까지 순서대로 이어진다", () => {
  const slugs = [
    "/backend/transfer-performance/01-measurement/",
    "/backend/transfer-performance/02-jvm-execution/",
    "/backend/transfer-performance/03-transfer-contract/",
    "/backend/transfer-performance/04-kafka-redis/",
    "/backend/transfer-performance/05-jpa-access/",
  ]
  const posts = [...slugs].reverse().map(slug => ({
    id: slug,
    fields: { slug },
    frontmatter: { date: "2026-11-04" },
  }))
  const navigation = buildPostNavigation(posts)
  slugs.forEach((slug, index) => {
    assert.equal(matchSeries(slug)?.id, "transfer-performance")
    assert.equal(navigation.get(slug).previous?.fields.slug || null, slugs[index - 1] || null)
    assert.equal(navigation.get(slug).next?.fields.slug || null, slugs[index + 1] || null)
  })
  assert.equal(matchSeries("/backend/transfer-performance/"), undefined)
  assert.equal(matchSeries("/backend/transfer-performance/unrelated/"), undefined)
})
