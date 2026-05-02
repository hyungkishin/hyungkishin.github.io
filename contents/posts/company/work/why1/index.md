---
title: "캐시 hit률 100%인데 응답이 느린 이유 — 그리고 이 패턴이 위험한 도메인"
date: 2026-05-02
update: 2026-05-02
tags:
- 캐시
- 2-tier
- Caffeine
- Redis
- PubSub
- Spring
- Kotlin
---

> **TL;DR**
>
> hit률 100%인데 응답이 느렸다.
> 처음엔 "Redis Hash로 쪼개면 끝나겠지" 싶었는데, 분해해보니 문제는 parse가 아니라 **RTT 자체**였다.
> 결국 L1(in-pod) + L2(Redis) 2-tier로 갔고, 99% 요청을 0ms로 줄였다.
>
> 근데 이게 글의 핵심은 아니다.
> 진짜 핵심은 **"이 패턴을 어디에 적용하면 안 되는가"** 다.
> 잘못된 reader에 끼우는 순간 UX 사고가 난다 — 글 안에 기준 두 줄로 박아둠.

---

## 이 글에서 가장 먼저 짚어둘 것 — 적용 금지 조건

설계보다 먼저 적어둔다. 이 패턴은 **모든 캐시 reader에 적용하면 안 된다.**

다음 두 조건이 같이 맞을 때만:

1. **갱신 주기가 길다** (분 단위 stale 허용 도메인)
2. **사용자 본인 액션과 인과 없음** ("내가 방금 X 했는데 안 보임" 사고가 안 나는 데이터)

하나라도 깨지면 L1 in-process 캐시는 UX 버그로 직결된다.

| Reader | 적용? | 이유 |
|---|---|---|
| 마스터 데이터 (이번 reader) | O | 연 1회 갱신, 사용자 액션 인과 없음 |
| `UserProfileReader` | **X** | 사용자가 직접 수정. "방금 바꿨는데 안 보임" 컴플레인 직격 |
| `ExternalLinkConnectionReader` | **X** | "방금 연동했는데 미연동으로 뜸" 사고 직격 |

이 줄을 글 맨 위로 올린 이유 — 본문 다 따라온 뒤에 "근데 이거 우리 reader에도 적용?" 하면 늦어서.

---

## 1. 문제 — hit률 100%인데도 응답이 느렸다

특정 hot path API에서 P95가 점점 느려지고 있었다.
이상한 건 **캐시 hit률이 100%**였다는 거다.

24h TTL 정상. 워밍업도 끝남.
근데 매 요청이 일정한 latency를 깔고 있었다.

"hit인데 왜 느려?"

---

## 2. 비용 분해 — 매 hit가 똑같은 비용을 다시 낸다

응답 한 건의 cost를 분해.

| 단계 | 비용 |
|---|---|
| Redis RTT (intra-AZ) | 0.3 ~ 1 ms |
| 페이로드 (Map 통째 ~수백 KB) | 1 ~ 수 ms |
| Jackson `readValue` (수천 entry Map) | 1 ~ 5 ms |
| 그 안에서 key 1개 lookup | µs |

같은 process가 같은 Map을 들고 있을 수 있는데 **매번 외부에 다녀오는 구조.**
hit률이 100%여도 캐시가 캐시 노릇을 못 하고 있었던 거다.

연 1회 갱신되는 마스터 데이터인데 매 요청 ms 단위 cost를 내는 게 본질적 낭비.

---

## 3. 처음 든 생각이 절반만 답이었던 이유

<div class="attempts">

<div class="attempt">

### Redis Hash로 쪼개면 끝 아니야?

처음엔 이렇게 생각했다.

"매 hit이 큰 Map을 통째로 parse하니까, 그걸 Hash로 분리하면 1 entry parse만 하면 되잖아?"

자료도 찾고 마이그레이션 비용도 계산하고 있었다.
근데 latency를 다시 분해하다 보니 이상한 게 보였다.

```
Redis RTT  : 0.3 ~ 1 ms
Payload    : 1 ~ 수 ms      ← Hash 분리하면 줄어듦
Parse      : 1 ~ 5 ms       ← Hash 분리하면 줄어듦
```

Hash 분리하면 payload + parse는 줄어든다.
**근데 RTT는 그대로다.**

intra-AZ라도 1ms 안팎. 100req/s 면 초당 100ms 누적. 트래픽 늘어나면 비례.

여기서 접근 자체가 틀렸다는 걸 깨달았다.
문제의 본질은 parse cost가 아니었다. **process 안에서 같은 Map을 들고 있을 수 있는데 매번 외부에 가는 것**이 문제였다.

→ Hash 분리는 폐기.

</div>

<div class="attempt">

### 그럼 그냥 in-process로 다 들고?

"Redis 빼고 Caffeine 단독이면 RTT 0, parse 0. 가장 빠름."

이번엔 다른 데서 막혔다.
**pod 재기동.**

EKS rolling update 중에 4대 pod이 동시에 떠오르면 4대가 동시에 cold.
같은 데이터를 동시에 DB에서 끌어오는 stampede.
DB 부하 4배는 물론이고, 운영 알람 폭발.

→ Caffeine 단독도 폐기.

</div>

<div class="attempt">

### 둘 다 답이었다

L1(Caffeine) + L2(Redis) 2-tier.

- 평소엔 L1에서 즉답 (RTT 0, parse 0)
- 새 pod / TTL 만료 시 L2 한 번 다녀옴
- L2도 miss면 분산 lock으로 DB 직격 1회

이 그림이 가장 명확해진 건, 시도 1·2가 다 절반만 답이라는 걸 인정한 다음이었다.

</div>

</div>

---

## 4. 핵심 결정 — 그리고 트레이드오프

### L2 키와 스키마는 그대로 둔다

이게 첫 결정이었다.
prefix 바꾸면 옛 키가 expire될 때까지 **cold storm 위험**이 따라온다.
마이그레이션 비용 0 + rollback은 config flag 한 줄.

대신 잃는 것: 옵션으로 검토했던 L2 Hash 분리(option E)를 못 한다. L2 hit path도 1 entry parse로 줄일 수 있는데, L1 흡수율 99%면 효과 마진이라 유보.

### L1 hit path

```kotlin
override fun findByYearAndKey(year: Int, key: String): Result<Record, ReadError> {
    val map = l1.get(year)            // Caffeine LoadingCache.get()
    return map[key]
        ?.let { Result.Ok(it) }
        ?: Result.Err(ReadError.NotFound("year=$year, key=$key"))
}
```

`l1.get(year)`이 캐시에 있으면 바로 return.
**이게 99% 요청의 path.**

### Cold start 보호 — 분산 lock

L1+L2 둘 다 miss인 cold 케이스에서 stampede가 터진다.
새 배포로 4대 pod이 동시에 같은 year를 DB에서 끌면 부하 4배.

```kotlin
val acquired = redis.opsForValue()
    .setIfAbsent(lockKey, podId, Duration.ofSeconds(10)) ?: false

if (acquired) {
    return try {
        val rows = delegate.findAllByYear(year)
        if (rows.isNotEmpty()) cacheToL2(year, rows)
        Result.Ok(rows)
    } finally {
        redis.execute(RELEASE_LOCK, listOf(lockKey), podId)  // Lua compare-and-del
    }
}

// lock 못 잡은 pod은 L2 polling
repeat(5) {
    Thread.sleep(50)
    readL2(year)?.let { return Result.Ok(it.values.toList()) }
}
```

**왜 `DEL` 직접 안 쓰고 Lua 쓰냐:**
DB 호출이 lock TTL(10s)을 넘기면 lock이 만료된다 → 다른 pod이 새 lock 잡음 → 원래 pod이 뒤늦게 `DEL` 부르면 **남의 lock 지움.**

처음엔 `DEL`로 짜다가 staging에서 lock TTL 내려보고 그 race를 보고 깨달았다.
`if get == myPodId then del` 한 줄을 atomic하게 묶어야 race-safe.

### 운영 핫패치 — Pub/Sub

L1 TTL 1분이라 평소엔 1분 안에 자연 정합.
근데 운영자가 마스터 데이터 오타 정정하면 1분 기다리는 게 답이 아님.
연 1회 갱신 도메인이라 그 1회를 잘못 넣어두면 1년 내내 잘못된 값 나감.

```kotlin
override fun onMessage(message: Message, pattern: ByteArray?) {
    val body = String(message.body)
    when {
        body == "ALL" -> l1.invalidateAll()
        body.toIntOrNull() != null -> l1.invalidate(body.toInt())
        else -> log.warn("invalid invalidation body={}", body)
    }
}
```

admin endpoint에서 `DEL` + `PUBLISH "{year}"`.
모든 pod listener가 받아서 L1 evict.

### 안전망 — Pub/Sub은 best-effort

Pub/Sub은 메시지 보장 X.
listener reconnect 중에 발행된 메시지는 그 pod에 안 닿을 수 있음.

두 겹으로 막음:

1. **L1 TTL 1분** — 메시지 못 받아도 1분 안에 자연 evict
2. **Reconnect 시 `invalidateAll()`** — 끊겼다 붙으면 보수적으로 통째로 비움

**여기서 잃는 것:**
"운영자가 invalidate 호출했는데 그 시점에 한 pod의 listener가 reconnect 중이었다" 시나리오에선 그 pod이 최대 1분 동안 옛 값을 노출한다.
이걸 감수할 수 있는 도메인이라야 이 설계가 성립.
바로 위에서 짚은 적용 금지 조건이 다시 살아나는 자리.

---

## 5. 결과

| 항목 | Before | After |
|---|---|---|
| 매 요청 Redis RTT | 1~5 ms | 0 (99% L1 hit) |
| 매 요청 JSON parse | full Map | 0 (99% L1 hit) |
| 데이터 정정 반영 시간 | ~24h (TTL) | 즉시 (Pub/Sub) |
| Redis 장애 시 | 5xx 위험 | L1 hit이면 정상 응답 |
| Cold start stampede | 무방비 | DB hit 1회로 수렴 |

L2 키 그대로 → 마이그레이션 0, rollback config flag 한 줄.

---

## 안 푼 것 / 애매했던 결정들

- **L1 stale 1분** — 운영자 invalidate 누락 + Pub/Sub 단절 동시 발생 시 1분 stale. 연 1회 갱신이라 허용했지만 다른 도메인이면 안전 마진 좁다
- **L2 Hash 분리(option E)** — L2 hit path 1 entry parse. L1 흡수율 99%면 효과 마진. 메트릭상 L2 hit이 늘면 그때 검토
- **`refreshAfterWrite` 미적용** — hot key tail latency 줄일 수 있는데 지금 대부분 L1 hit이라 의미 적음. p99 spike 보이면 켜기로 미뤄둠
- **circuit breaker 임계 튜닝** — DB 장애 시 fallback 발동 조건은 staging 측정 후 조정 예정. 지금은 Resilience4j 기본값
- **`maximumSize(4)`** — year 4개라고 적었는데 5+ year 조회 거의 없어서 4 유지. 근데 정확히 4가 충분하다는 근거는 측정값이 아니라 "당년+전년+이전년+여유" 직관

마지막 항목은 솔직히 좀 애매했다.
지금 트래픽으론 4가 충분한데, 미래 트래픽에서 5가 필요해지면 LRU eviction이 hot path에 끼어들 수 있다.
메트릭(`l1_eviction_count`) 추이 보고 결정하는 게 맞는 자리인데 일단 4로 두고 모니터링 중.

---

## 메모

PR 올리기 직전, diff 다시 훑다가 두 줄에서 멈췄다.

```kotlin
.maximumSize(4)
.expireAfterWrite(Duration.ofMinutes(1))
```

`maximumSize(4)` — 진짜 4면 충분한가? 위에 적은 그 애매함.

`expireAfterWrite(1m)` — Pub/Sub이 즉시 invalidate 해주는데 굳이 둘 필요? 있다. **Pub/Sub은 best-effort라서.** 이 1분이 메시지 손실 시 자연 정합 안전망.

종이에 옵션 비교를 적을 땐 "L1 + L2 + Pub/Sub" 한 줄이었다.
실제 코드는 lock release race · reconnect 가드 · stampede 보호 · single-flight · TTL 안전망 · circuit breaker 까지 다 들어가야 했다.
한 줄을 빼도 운영에서 한 시즌 안에 부딪히는 시나리오들.
