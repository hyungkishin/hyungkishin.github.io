---
title: "오늘의 인기상품, 어제의 인기상품과 어떻게 구분할까?"
date: 2026-04-10
update: 2026-04-10
tags:
- 랭킹
- Redis
- SortedSet
- ZSET
- Kafka
- 실시간집계
- 콜드스타트
- 커머스
- Spring
---

# 오늘의 인기상품, 어제의 인기상품과 어떻게 구분할까?

> **TL;DR**
>
> 랭킹은 Top-N을 내놓는 기능이 아니라, "시간의 경계를 어디에 긋는가"를 결정하는 설계 문제입니다.
>
> Kafka로 흘러 들어오는 조회/좋아요/주문 이벤트를 Redis ZSET에 실시간 누적하면서, `ranking:all:{yyyyMMdd}`라는 키 하나에 "어제와 오늘을 어떻게 분리할 것인가"에 대한 판단이 전부 들어갔습니다.
>
> 그 과정에서 `LocalDate.now()`로 키를 만들었다가 이벤트가 지연되면 오늘 키로 흘러가 버리는 버그를 만났고, Top 20 조회에 21번의 DB 쿼리가 나가는 N+1을 잡았고, 자정에 랭킹이 비어버리는 콜드 스타트를 10% carry-over로 풀었습니다.

---

## 🏗️ 인기순 정렬, DB `ORDER BY`로는 왜 안 되나요?

이전 라운드에서 Kafka 파이프라인과 `product_metrics` 테이블을 이미 만들어 둔 상태였어요.
조회/좋아요/주문 이벤트가 발생하면 `commerce-streamer`가 소비해서 `view_count`, `like_count`, `order_count`, `sales_amount`를 누적 `UPSERT`하는 구조였습니다.

그러면 인기순 랭킹은 이렇게 쿼리 한 방으로 끝낼 수 있지 않나? 하는 생각이 먼저 들었어요.

```sql
SELECT product_id,
       view_count * 0.1 + like_count * 0.2 + order_count * 0.7 AS score
FROM product_metrics
ORDER BY score DESC
LIMIT 20;
```

간단하고, 정합성도 높고, 별도 인프라도 필요 없습니다.
그런데 랭킹 조회는 서비스에서 가장 빈번하게 호출되는 API 중 하나예요.
홈 메인의 "오늘의 Top 10", 카테고리별 인기순 정렬, 상품 상세 페이지의 "현재 N위" 배지까지, 한 화면에서만 여러 번 호출됩니다.

매 요청마다 `product_metrics` 전체를 스캔해서 score를 계산하고 정렬하면, 데이터가 쌓일수록 쿼리가 느려지고 DB 부하가 커져요.
score 컬럼을 미리 계산해서 저장하면 정렬은 빨라지지만, 이벤트가 들어올 때마다 score를 재계산해야 하고, 가중치를 바꾸면 전체 row를 다시 갱신해야 합니다.

무엇보다도 이 접근의 가장 큰 문제는 **"오늘의 랭킹"과 "어제의 랭킹"을 구분할 수 없다**는 점이에요.

`product_metrics`는 누적 테이블이라 어제의 조회수와 오늘의 조회수가 뒤섞여 있어요.
일간/주간/월간 집계로 나누려면 별도의 snapshot 테이블을 만들고 배치로 복사하는 구조가 필요한데, 그 순간 "실시간"이라는 단어가 무색해집니다.

📌 **포기한 것** — DB 기반 랭킹은 정합성은 높지만 "조회 빈도"와 "시간 단위 분리"라는 두 요구사항을 동시에 만족시키기 어려워서 포기했어요.
정합성이 살짝 느슨해지더라도 읽기 성능과 운영 유연성을 택했습니다.

---

## 📊 Redis ZSET, 이게 왜 딱 맞는 자료구조인가요?

Redis의 Sorted Set은 `(member, score)` 쌍을 score 기준으로 **정렬된 상태로 유지**하는 자료구조예요.
삽입과 수정이 O(log N), Top-N 조회가 O(log N + N)으로 동작합니다.

핵심은 세 가지 연산이에요.

```
ZINCRBY ranking:all:20260410 0.7 product:101
  → product:101의 score에 0.7을 더한다. 없으면 새로 추가한다.

ZREVRANGE ranking:all:20260410 0 19 WITHSCORES
  → score 내림차순으로 Top 20을 반환한다.

ZREVRANK ranking:all:20260410 product:101
  → product:101이 score 내림차순에서 몇 번째인지 반환한다.
```

`ZINCRBY`는 원자적이에요.
Redis가 싱글 스레드로 동작하기 때문에 1,000건의 `ZINCRBY`가 동시에 들어와도 race condition이 없습니다.
Round 8의 대기열에서도 같은 이유로 `ZADD NX`를 썼었는데, 이번에는 정렬 기능 자체가 주 목적이에요.

![랭킹 파이프라인 전체 구조](./01-pipeline.svg)

흐름을 말로 풀면 이렇습니다.

사용자가 상품을 조회하거나 좋아요를 누르거나 주문하면, `commerce-api`가 Outbox 패턴으로 이벤트를 DB에 먼저 저장합니다.
별도 스케줄러가 1초마다 Outbox를 polling해서 Kafka로 발행하고, `commerce-streamer`가 이 이벤트를 배치로 소비해요.
소비할 때 기존의 `product_metrics` 누적 로직은 그대로 두고, 여기에 Redis ZSET `ZINCRBY` 한 줄을 추가하는 게 이번 작업의 핵심이었어요.

![ZSET의 구조와 연산](./02-zset-structure.svg)

---

## 🔑 `ranking:all:20260410` — 키 하나에 숨은 시간 설계

과제가 알려준 키 포맷은 `ranking:all:{yyyyMMdd}`예요.
처음 봤을 때는 "그냥 날짜 붙인 거 아닌가?" 싶었는데, 구현하면서 이 키 이름 하나에 얼마나 많은 판단이 담겨있는지 알게 됐습니다.

**첫째, `all`은 "차원"입니다.**
지금은 전체 상품을 대상으로 하지만, 나중에 카테고리별 랭킹을 만들면 `ranking:fashion:20260410`, `ranking:tech:20260410`처럼 차원을 늘릴 수 있어요.
브랜드별은 `ranking:brand:1:20260410` 같은 식으로 확장됩니다.
차원이 키 이름에 박혀 있으면 네임스페이스가 자연스럽게 분리돼요.

**둘째, `{yyyyMMdd}`는 "시간 윈도우"입니다.**
하루가 지나면 새 키가 생기고, 어제의 키는 그대로 남아 있어요.
유저가 "어제의 인기상품"을 조회하고 싶으면 `date=20260409`로 요청하면 되고, "오늘"은 `date=20260410`이에요.
이 단순한 분리가 없으면 "오늘의 랭킹"을 만드는 것 자체가 불가능합니다.

![누적 랭킹과 일간 랭킹의 차이 — 롱테일 문제](./03-time-quantization.svg)

누적으로만 점수를 쌓으면, Day 1에 올라간 히트 상품이 한 달 내내 Top에 머무릅니다.
신상품은 아무리 좋아도 누적 점수가 따라잡을 수 없고, 결국 소수 상품이 Top을 독식하는 롱테일 현상이 생겨요.

일간 키로 분리하면 매일 0에서 시작하기 때문에, 오늘의 Top은 오늘 발생한 시그널만으로 결정됩니다.
신상품도 오늘 하루 동안 많이 팔리면 Top에 올라갈 수 있고, 어제의 히트 상품도 오늘 아무도 안 사면 내려가요.

**셋째, TTL이 이 설계를 완성합니다.**

```kotlin
masterRedisTemplate.expire(key, TTL_DAYS, TimeUnit.DAYS)  // TTL_DAYS = 2
```

TTL을 2일로 잡은 건 "오늘과 어제"를 동시에 조회할 수 있게 하기 위해서예요.
TTL이 1일이면 자정에 어제 키가 사라지고, 자정 직후 "어제의 인기상품"을 조회하려고 하면 빈 결과가 나옵니다.
2일로 잡으면 오늘 새벽 3시에도 어제 키가 살아있어서, 전일 조회가 가능해요.

3일로 늘리면 그만큼 Redis 메모리 사용량이 늘어납니다.
상품 100,000개 기준으로 ZSET 하나당 대략 6~8MB 정도이니, 2일 유지는 12~16MB, 3일은 18~24MB예요.
운영 유연성과 메모리 사이에서 2일이 적당한 균형점이라고 판단했습니다.

---

## ⚖️ 가중치 0.1 / 0.2 / 0.7 — 감으로 정한 게 아닙니다

점수 계산식은 이렇게 설계했어요.

```
score = 0.1 × view + 0.2 × like + 0.7 × order
```

가중치를 이렇게 정한 이유를 하나씩 풀어볼게요.

**조회(view)에 0.1을 준 건, 조회가 가장 빈번한 시그널이기 때문**이에요.
유저는 하루에 수십 개의 상품을 스쳐 지나가듯 보지만, 그중 실제로 구매 의사가 있는 건 소수예요.
조회 가중치를 높게 잡으면, 단순히 많이 노출된 상품이 Top을 차지해버립니다.
광고 영역에 걸린 상품이 조회만 많이 받고 구매는 적어도 1위가 되는 상황이 나와요.

**좋아요(like)에 0.2를 준 건, 좋아요가 "관심은 있지만 구매는 아직"이라는 약한 시그널이기 때문**이에요.
조회보다는 강한 의사표현이지만, 좋아요가 100개라고 매출이 100건 나오는 건 아니에요.
주문보다는 낮고, 조회보다는 높은 게 맞다고 판단했습니다.

**주문(order)에 0.7을 준 건, 주문이 "실제 구매 행동"이라는 가장 강한 시그널이기 때문**이에요.
유저가 돈을 쓴 상품이 "진짜 인기 상품"에 가깝고, 이게 랭킹의 본질적인 목적과도 맞아요.
주문 1건이 좋아요 3~4건, 조회 7건 정도의 가치를 가진다고 본 셈이에요.

| 시그널 | 가중치 | 근거 |
| --- | --- | --- |
| view | 0.1 | 빈번하지만 구매 의사 약함. 광고 노출 편향 방지 |
| like | 0.2 | 관심 표현. 구매보다는 약하고 조회보다는 강함 |
| order | 0.7 | 실제 구매 행동. 가장 강한 시그널 |

합이 1.0이 되도록 맞춘 건 해석 편의를 위해서예요.
합이 1.0이면 score를 "가중 평균 행동 수"처럼 읽을 수 있고, 가중치를 조정할 때도 "어디를 깎으면 어디를 올려야 하는지" 감이 잡힙니다.

주문 가중치에 수량까지 곱하는 건 자연스럽습니다.

```kotlin
"ORDER_COMPLETED" -> {
    for (item in items) {
        val quantity = (item["quantity"] as Number).toInt()
        rankingScoreUpdater.incrementScore(
            productId,
            RankingEventType.ORDER,
            eventDate,
            quantity.toDouble(),  // 수량만큼 score에 반영
        )
    }
}
```

한 번에 10개를 산 상품은 1개를 산 상품보다 10배 더 많이 팔린 거니까, 10배의 가중치를 받는 게 맞아요.

📌 **포기한 것** — `log(amount)` 기반 매출 정규화도 고려했어요.
고가 상품이 score를 과도하게 독식하는 걸 막기 위한 기법인데, 지금 프로젝트에서는 상품 가격대가 비슷하고 수량 기반 가중이 더 직관적이라 quantity 그대로 쓰기로 했습니다.

---

## 🐛 `LocalDate.now()`의 함정 — 이벤트가 지연되면 어디로 갈까요?

처음 `RankingScoreUpdater`를 이렇게 구현했어요.

```kotlin
fun incrementScore(productId: Long, eventType: RankingEventType, score: Double = 1.0) {
    val key = buildKey(LocalDate.now())  // ← 여기
    val delta = eventType.weight * score
    masterRedisTemplate.opsForZSet().incrementScore(key, productId.toString(), delta)
}
```

`LocalDate.now()`로 "지금 이 순간"의 날짜 키를 만들고 거기에 점수를 누적하는 방식이에요.
동작은 하는데, 곰곰이 생각해보니 함정이 하나 있었어요.

**Kafka 컨슈머 랙이 1시간 쌓였다고 가정해봅시다.**

어제 23:30에 발생한 주문 이벤트가 오늘 00:30에 소비돼요.
이 이벤트가 반영되어야 할 곳은 **어제의 랭킹(`ranking:all:20260409`)**인데, `LocalDate.now()`는 **오늘(`ranking:all:20260410`)**을 반환합니다.
결과적으로 어제의 매출이 오늘의 Top에 꽂히고, 어제의 랭킹은 그만큼 누락돼요.

평소에는 컨슈머 랙이 짧으니까 문제가 잘 드러나지 않아요.
하지만 장애 복구 직후나 배포 직후처럼 큰 랙이 발생한 순간에는 이 버그가 **"잘못된 날짜의 랭킹"**을 만듭니다.
그리고 잘못된 데이터는 수정이 거의 불가능해요. ZSET에서 특정 이벤트만 골라내서 빼는 건 이벤트 로그가 없는 이상 불가능하니까요.

해결은 단순했습니다.
이벤트 자체에 `occurredAt`이 있으니까, 그걸 파싱해서 키를 만들면 돼요.

```kotlin
fun incrementScore(
    productId: Long,
    eventType: RankingEventType,
    eventDate: LocalDate,    // ← 호출부에서 주입
    score: Double = 1.0,
) {
    val key = buildKey(eventDate)
    val delta = eventType.weight * score
    masterRedisTemplate.opsForZSet().incrementScore(key, productId.toString(), delta)
    ensureTtl(key)
}
```

```kotlin
// Consumer에서 occurredAt을 파싱
private fun parseEventDate(occurredAt: String?): LocalDate {
    if (occurredAt == null) return LocalDate.now()
    return try {
        ZonedDateTime.parse(occurredAt).toLocalDate()
    } catch (e: Exception) {
        LocalDate.now()
    }
}

// processRecord 내부
val eventDate = parseEventDate(generic["occurredAt"]?.toString())
rankingScoreUpdater.incrementScore(productId, RankingEventType.VIEW, eventDate)
```

이제 이벤트가 언제 소비되든, 발생 시점의 날짜에 정확히 반영돼요.

이 버그는 처음에 "일단 돌아가니까 괜찮지 않나?" 하고 넘어갈 수도 있었어요.
실제로 테스트를 돌려봤을 때는 전혀 문제가 되지 않았으니까요.
하지만 랭킹 데이터는 한번 틀어지면 되돌리기 어렵고, 장애 복구 시점처럼 "가장 중요한 순간"에 터지는 종류의 버그라는 걸 알아차리고 나서는 그냥 넘어갈 수 없었습니다.

📌 **또 하나 덤으로 잡은 것** — `expire()`를 매 `incrementScore`마다 호출하고 있었어요.
초당 수천 건의 이벤트가 들어오면 불필요한 `EXPIRE` 명령이 수천 번 나갑니다.
키별로 TTL이 한 번만 설정되면 되니까, `ConcurrentHashMap`으로 "이미 TTL을 설정한 키"를 추적해서 최초 1회만 `expire()`를 호출하도록 고쳤어요.

```kotlin
private val ttlInitialized = ConcurrentHashMap<String, Boolean>()

private fun ensureTtl(key: String) {
    ttlInitialized.computeIfAbsent(key) {
        masterRedisTemplate.expire(key, TTL_DAYS, TimeUnit.DAYS)
        true
    }
}
```

키 개수가 날짜 단위라 많아야 2~3개 수준이니, 맵에 들어갈 엔트리도 그 정도밖에 안 됩니다.

---

## ❄️ 자정에 랭킹이 비어있는 문제 — 10% Carry-Over로 푼 이유

일간 키로 랭킹을 분리하면서 새로운 문제가 생겼어요.
자정이 지나는 순간, 오늘 키는 완전히 비어 있습니다.

유저가 00:00:01에 "오늘의 인기상품"을 조회하면 빈 결과가 나와요.
이 문제를 **콜드 스타트**라고 부르는데, 랭킹 시스템의 고질적인 숙제예요.

몇 가지 선택지가 있었습니다.

**A. 그냥 빈 결과를 주고 몇 시간 기다리게 한다.**
가장 단순하지만, 자정 직후에 접속한 유저는 아무것도 보지 못해요.
"이 서비스는 새벽에 죽나?" 하는 인상을 남길 수 있습니다.

**B. 빈 결과면 전날 랭킹을 그대로 보여준다.**
구현은 쉽지만, "오늘의 인기상품"이라는 타이틀과 실제 데이터가 일치하지 않게 돼요.
유저가 본 상품을 오후에 다시 찾아가면 순위가 완전히 달라져 있고요.

**C. 전날 점수의 일부를 오늘로 미리 복사해둔다.**
이게 **Score Carry-Over** 방식이에요.
어제 Top에 있던 상품들에게 "작은 점수"를 미리 주는 겁니다.
오늘의 시그널이 쌓이기 전까지는 어제 기준으로 보여주고, 오늘의 시그널이 쌓이면 자연스럽게 순위가 갱신돼요.

![콜드 스타트 carry-over — 전일 점수의 10%를 익일로 복사](./04-cold-start.svg)

C를 택했습니다.
매일 23:50에 스케줄러가 돌면서, 전일 Top 500의 score에 10%를 곱해서 오늘 키에 미리 넣어두는 구조예요.

```kotlin
@Scheduled(cron = "0 50 23 * * *")
fun carryOverScores() {
    val today = LocalDate.now()
    val tomorrow = today.plusDays(1)
    val sourceKey = rankingScoreUpdater.buildKey(today)
    val targetKey = rankingScoreUpdater.buildKey(tomorrow)

    val topEntries = masterRedisTemplate.opsForZSet()
        .reverseRangeWithScores(sourceKey, 0, CARRY_OVER_LIMIT - 1)

    if (topEntries.isNullOrEmpty()) {
        log.info("carry-over 대상 없음. sourceKey={}", sourceKey)
        return
    }

    for (entry in topEntries) {
        val member = entry.value ?: continue
        val carryScore = (entry.score ?: 0.0) * CARRY_OVER_WEIGHT  // 0.1
        if (carryScore > 0) {
            masterRedisTemplate.opsForZSet().incrementScore(targetKey, member, carryScore)
        }
    }
    masterRedisTemplate.expire(targetKey, TTL_DAYS, TimeUnit.DAYS)
}
```

**왜 10%인가요?**

Carry-over 비율이 너무 높으면 어제의 상품이 오늘의 Top을 계속 차지해요.
롱테일을 피하려고 일간 키로 나눴는데, carry-over로 다시 롱테일이 돌아오면 의미가 없어요.
반대로 너무 낮으면 carry-over의 효과가 없어지고, 어제 Top 상품이 오늘도 Top에 자연스럽게 이어지는 느낌을 주기 어렵습니다.

10%는 "오늘의 시그널 한두 건만 와도 금방 추월당하는 수준"이에요.
어제 score 42.7이었던 상품이 오늘 4.27로 시작하는데, 오늘 주문 10건(score 7.0)만 나오면 바로 밀려납니다.
즉, carry-over는 **"오늘의 Top을 결정하는 힘"이 아니라 "자정 직후의 공백을 메우는 장치"**로 동작해요.

**왜 Top 500만 복사하나요?**

어제 ZSET에 10만 개 상품이 있었다고 해도, 그중 의미 있는 상품은 상위 몇 백 개뿐이에요.
score가 0.1밖에 안 되는 상품까지 다 복사하면 Redis 쓰기만 낭비돼요.
Top 500이면 대부분의 유저가 실제로 보게 될 범위를 커버하고, 나머지는 오늘의 시그널로만 결정됩니다.

📌 **포기한 것** — `ZUNIONSTORE`로 처리하는 방법도 있어요.
한 번의 명령으로 두 ZSET을 가중 합산할 수 있어서 더 깔끔해 보이지만, Lettuce 클라이언트에서 WEIGHTS 파라미터 지정 API가 불편하고, Top 500만 가져오는 제한을 걸기 어려워서 수동 반복 복사 방식을 택했어요.

---

## 🔢 Top 20 조회에 21개 쿼리가 나가는 이유

랭킹 API를 처음 구현했을 때 UseCase는 이렇게 생겼었어요.

```kotlin
fun getRankingPage(date: String, page: Int, size: Int): RankingPageInfo {
    val entries = rankingRepository.getTopRankings(date, offset, size.toLong())
    // ...
    val products = entries.map { productRepository.findById(it.productId) }  // ← N+1
    // ...
}
```

ZSET에서 `productId`를 20개 꺼낸 다음, 각각에 대해 `findById`를 호출하고 있었어요.
코드만 봐서는 자연스러워 보이는데, 실제로는 Top 20 조회 요청 하나에 DB 쿼리가 **21번**(ZCARD 1번 + findById 20번) 나갑니다.

트래픽이 적을 때는 티가 안 나요.
하지만 랭킹 API는 홈 메인에서 초당 수십 번씩 호출될 가능성이 있는 API예요.
초당 50 req만 들어와도 DB 쿼리는 **초당 1,000번**이 됩니다.
이 중 20번은 정확히 같은 범위의 ID를 조회하는데, DB 입장에서는 매번 별도의 쿼리로 처리해야 하니까요.

해결은 `findAllByIds`를 추가하는 거였어요.

```kotlin
// ProductRepository (domain)
interface ProductRepository {
    fun findAllByIds(ids: List<Long>): List<Product>
    // ...
}

// ProductJpaRepository (infrastructure)
@Query("SELECT p FROM ProductEntity p WHERE p.id IN :ids AND p.deletedAt IS NULL")
fun findAllActiveByIds(ids: List<Long>): List<ProductEntity>

// GetRankingUseCase
val productIds = entries.map { it.productId }
val products = productRepository.findAllByIds(productIds)  // IN 쿼리 1회
val productMap = products.associateBy { requireNotNull(it.persistenceId) }

val rankings = entries.mapNotNull { entry ->
    val product = productMap[entry.productId] ?: return@mapNotNull null
    // ...
}
```

`WHERE p.id IN (:ids)` 한 방으로 끝나요.
쿼리 수가 21 → 2로 줄었고, 응답 시간도 수십 ms 단위에서 한 자릿수 ms로 떨어집니다.

이건 프레임워크가 자동으로 잡아주지 않는 종류의 N+1이에요.
JPA의 `@OneToMany` fetch 전략으로 잡는 게 아니라, **"컬렉션을 받아서 개별 조회하는 패턴"**에서 발생하는 애플리케이션 레벨의 N+1이거든요.
코드 리뷰나 로그 분석 없이는 안 보이고, 성능 테스트를 돌려봐야 드러나는 종류의 문제입니다.

이 패턴은 `findAllByIds`에서 끝나는 게 아니에요.
브랜드 정보도 같은 방식으로 `findAllByIds`를 쓰고 있습니다.

```kotlin
val brandIds = products.map { it.refBrandId }.toSet()
val brandMap = brandRepository.findAllByIds(brandIds)
    .associateBy { requireNotNull(it.persistenceId) }
```

결과적으로 랭킹 20개 조회에 필요한 DB 쿼리는 **ZSET 조회 + product IN 쿼리 + brand IN 쿼리 = 3번**이에요.
이 정도면 트래픽이 늘어도 DB가 쉽게 버텨냅니다.

---

## 🕳️ 아직 풀지 못한 것들

**실시간 가중치 조절.**
현재 가중치는 `enum`에 하드코딩되어 있어요.
마케팅 팀이 "이번 주는 좋아요 가중치를 0.3으로 올려달라"고 요청하면, 코드 수정 + 배포가 필요합니다.
가중치를 Redis의 Hash나 Configuration 테이블로 빼면 실시간 조절이 가능하지만, 그 순간 "이벤트가 들어올 때마다 가중치를 조회해야 하는" 오버헤드가 생겨요.
캐싱하면 해결되지만, 캐시 무효화 타이밍을 언제로 잡을지는 또 다른 문제입니다.

**시간 단위 랭킹.**
일간으로는 충분하지만, "지금 이 순간 인기 급상승" 같은 기능을 만들려면 1시간 단위 키가 필요해요.
`ranking:all:2026041014` 같은 키를 만들고, 매 시간 새로 시작하는 구조인데, 키 개수가 24배로 늘고 Redis 메모리도 그만큼 늘어납니다.
콜드 스타트 주기도 하루 1번이 아니라 시간당 1번이 되어야 하고요.
현재 트래픽 규모에서는 오버 엔지니어링이라 넣지 않았어요.

**Redis 장애 시 랭킹 복구.**
ZSET 데이터는 Redis에만 있어서, Redis가 죽으면 랭킹이 전부 사라져요.
`product_metrics` 테이블에 누적 데이터는 있지만, 이건 "전체 누적"이지 "오늘의 시그널"이 아니에요.
AOF persistence를 켜면 대부분 복구되지만, 복구 직전 몇 초~몇 분의 이벤트는 유실됩니다.
Kafka 재처리로 채우려면 consumer group offset을 되돌려야 하는데, 이러면 `product_metrics`가 이중 누적되어서 정합성이 깨져요.
"랭킹 복구를 위해 metrics는 오차를 감수할 것인가" 같은 트레이드오프를 풀어야 합니다.

**ZSET 메모리 관리.**
TTL을 2일로 잡아두긴 했지만, 상품이 100만 개로 늘어나면 ZSET 하나당 60~80MB가 됩니다.
2일치면 120~160MB인데, 이건 현재 Redis 사이즈에서 감당 가능한 수준이에요.
다만 score가 0.1 수준인 롱테일 상품까지 전부 ZSET에 남겨두면 낭비라, 상위 N개만 유지하는 cap 전략도 검토할 수 있어요.
`ZREMRANGEBYRANK`로 주기적으로 꼬리를 잘라내는 방식입니다.

---

## 💭 돌아보면

이번 작업에서 가장 크게 배운 건, **"랭킹은 결과가 아니라 시간 설계다"**라는 거였어요.

처음에는 "유저에게 Top 20을 보여주는 API를 만든다"로 생각하고 접근했어요.
그런데 구현하다 보면 실제로 결정해야 하는 건 전부 시간과 관련된 판단이에요.

- 어제와 오늘을 어디서 자를까? (키 설계)
- 이벤트가 지연되면 어느 시점의 랭킹에 반영할까? (occurredAt 파싱)
- 자정에 비어버리는 시간대를 어떻게 메울까? (carry-over)
- TTL은 얼마나 길게 잡아야 어제까지 조회 가능하게 할까? (2일)
- 언제 carry-over 스케줄러를 돌려야 할까? (23:50)

`ranking:all:20260410`이라는 키 하나에 이 모든 판단이 응축되어 있어요.
이 키를 처음 봤을 때는 "그냥 날짜 붙인 문자열"이었는데, 구현을 마치고 보니 **"서비스가 '오늘'을 어떻게 정의하는가"**에 대한 진술문처럼 느껴졌어요.

또 하나 기록해두고 싶은 건, `LocalDate.now()` 버그예요.
이건 테스트로는 절대 안 잡히는 종류의 버그였어요.
컨슈머 랙이 정상인 상태에서는 `LocalDate.now()`와 이벤트의 `occurredAt`이 사실상 같은 날짜거든요.
장애 복구 시점처럼 랙이 크게 벌어지는 순간에만 증상이 드러나는데, 그때는 이미 잘못된 데이터가 쌓인 뒤예요.

"돌아는 간다"와 "올바르다"는 다릅니다.
돌아가는 코드를 보고 "이게 왜 올바른가?"를 물어보는 습관이 중요하다는 걸 이번에도 확인했어요.
`LocalDate.now()`를 쓴 순간 "지금 시점"이 어디를 가리키는지 물었어야 했고, 물었다면 "소비 시점이 아니라 발생 시점이어야 한다"는 답이 나왔을 거예요.

N+1도 같은 맥락이에요.
`productIds.map { findById(it) }`는 문법적으로 자연스럽고 테스트도 통과합니다.
하지만 "이 코드가 초당 50 req를 받으면 어떻게 되는가?"를 묻지 않으면 보이지 않아요.

다음 라운드에서는 일간 집계를 활용해서 주간/월간 집계를 만드는 배치 작업을 다룰 예정이에요.
`ZUNIONSTORE`로 7개 키를 합쳐서 주간 랭킹을 만드는 구조가 되겠지만, 그때도 "어떤 시간 단위에서 어떤 시간 단위로 넘어갈지"의 설계가 또 나올 것 같습니다.

결국 랭킹 시스템은 **시간을 어떻게 다룰 것인가에 대한 연속된 판단**이고, 키 이름 하나에 그 판단이 전부 담긴다는 점 — 이게 이 주차의 핵심이었어요.
