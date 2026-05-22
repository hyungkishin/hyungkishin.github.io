---
title: "캐시 hit률 100%인데 왜 응답이 느렸을까"
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
> 캐시가 잘 맞고 있었어요. hit률이 99.9% 였습니다.  
> 그런데 P95 응답시간이 점점 늘어났어요. 운영팀 그라파나에서 보면 hit이 들어와도 응답에 4~6ms가 깔려 있었습니다.
>
> 처음엔 "Redis Hash로 쪼개면 끝나겠지" 라고 생각했어요.  
> 분해해보니 문제는 데이터 파싱이 아니라 매번 Redis 다녀오는 RTT 자체였습니다.
>
> 결국 L1(앱 메모리) + L2(Redis) 2단 캐시로 갔습니다.   
> 99% 요청이 0ms 응답으로 떨어졌어요.  
> 그런데 이 글이 진짜 짚고 싶은 건 따로 있습니다.  
> 이 패턴, 잘못된 곳에 끼우면 UX 사고가 납니다.

---

## hit률이 100%인데도 느린 그림

운영팀에서 P95 응답시간이 조금씩 늘어나고 있다는 알림이 떴어요.   
사용자가 항상 보는 마스터 데이터 reader 였습니다.   
연 1회 갱신, TTL은 24시간.

이상한 건 캐시 hit률이 100% 였다는 점이에요.   
hit이 들어오면 0ms로 응답해야 정상인데, 매 요청마다 일정하게 4~6ms가 깔려 있었습니다.

"hit인데 왜 느려?" 가 첫 의문이었어요.

응답 한 건이 어디서 시간을 쓰는지 분해해봤습니다.

- Redis에 다녀오는 왕복 시간(RTT): 같은 AZ 안에서도 0.3~1ms
- Redis가 돌려준 Map 전체(수백 KB)를 받아오는 데: 1~수 ms
- 그 Map을 객체로 변환(`readValue`)하는 데: 1~5 ms
- 변환된 Map에서 키 하나 꺼내는 데: 수 마이크로초

같은 앱 프로세스가 같은 Map을 들고 있을 수 있어요.   
그런데 매 요청마다 Redis로 다녀오는 구조였습니다.   
hit률은 100%인데, 캐시가 캐시 노릇을 못 하고 있었던 거죠.

연 1회 갱신되는 데이터에 매 요청 ms 비용을 내고 있다는 게, 본질적으로 낭비였어요.

---

## Redis Hash로 쪼개면 끝일 줄 알았어요

처음 든 생각은 이거였습니다.   
"Map 통째로 들고 와서 파싱하는 게 느리니까, Redis Hash로 키별로 쪼개두면 1개만 받아오면 되잖아?"

자료도 찾고, 키 마이그레이션 비용도 계산하고 있었습니다.   
그러다 latency 분해표를 다시 보다가 이상한 게 보였어요.

```text
RTT       0.3 ~ 1 ms     ← Hash로 쪼개도 그대로
Payload   1 ~ 수 ms       ← Hash로 쪼개면 작아짐
Parse     1 ~ 5 ms       ← Hash로 쪼개면 거의 0
```

Hash로 쪼개면 payload와 parse는 줄어들어요.   
근데 **Redis 갔다 오는 시간 자체**는 그대로입니다.

같은 AZ 안에서도 RTT가 1ms 안팎이에요.   
초당 100건 요청이면 그것만으로 100ms가 누적됩니다.   
트래픽이 늘면 그대로 비례하고요.

> 문제는 파싱이 아니라, *프로세스 안에서 들고 있을 수 있는 걸 매번 외부에 가는 것* 이었어요.

여기서 첫 가설이 무너졌습니다. Hash 분리는 폐기.

---

## 그럼 Redis 빼고 앱 메모리에만 둘까

다음 가설은 더 단순했어요.   
"어차피 연 1회 갱신이고 데이터도 작은데, Caffeine으로 앱 메모리에만 두면 RTT 0, 파싱 0이잖아."

이번엔 다른 데서 막혔습니다.   
**pod 재기동.**

EKS에 새 버전 배포하면 pod 여러 대가 짧은 시간에 다 떠올라요.   
그 순간 모든 pod이 동시에 cold 상태입니다.   
첫 요청들이 동시에 같은 데이터를 DB에서 끌어오기 시작해요.

이게 stampede 입니다. 같은 데이터 가져오는 쿼리가 N배수로 한꺼번에 DB로 밀려가는 상황. DB 부하가 평소의 N배가 되고, DB 알람이 같이 울려요.

Caffeine 단독도 그래서 폐기.

---

## 결국 둘 다 답이었습니다

L1(앱 메모리) + L2(Redis) 2단으로 갔어요.

- 평소엔 L1에서 즉답. RTT 0, 파싱 0.
- 새 pod이 떠오르거나 L1 TTL이 만료되면 L2 한 번 다녀옴.
- L2도 없으면 분산 lock으로 한 pod만 DB로 가서 채워줌. 나머지는 그 결과를 기다림.

이 그림이 깔끔하게 보인 건, *시도 1과 2가 다 절반만 답*이라는 걸 인정한 다음이었어요.

```kotlin
override fun findByYearAndKey(year: Int, key: String): Result<Record, ReadError> {
    val map = l1.get(year)                // Caffeine LoadingCache.get()
    return map[key]
        ?.let { Result.Ok(it) }
        ?: Result.Err(ReadError.NotFound("year=$year, key=$key"))
}
```

`l1.get(year)` 가 캐시에 있으면 그대로 return.   
이게 99% 요청이 지나가는 path 였습니다.

---

## Cold start에서 stampede가 또 터질 뻔했어요

L1과 L2 둘 다 비어 있는 경우가 있어요.   
새 배포로 pod들이 fresh 한 상태에서 첫 요청이 들어왔을 때.

이때 모든 pod이 동시에 같은 year를 DB에서 끌어오려고 하면 다시 stampede 입니다.   
이걸 막으려고 Redis에 분산 lock 을 걸기로 했어요.   
한 pod만 DB로 가고, 나머지는 그 pod이 L2를 채울 때까지 기다리는 구조입니다.

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

// lock을 못 잡은 pod은 L2를 잠깐 polling
repeat(5) {
    Thread.sleep(50)
    readL2(year)?.let { return Result.Ok(it.values.toList()) }
}
```

처음엔 lock을 풀 때 `redis.del(key)` 로 짰어요.   
staging에서 일부러 lock TTL을 1초로 내려놓고 돌려보다 race를 봤습니다.

DB 조회가 lock TTL 10초를 넘기면 lock이 자동 만료돼요.   
그 사이에 다른 pod이 새 lock을 잡습니다.   
원래 pod이 뒤늦게 끝나서 `del` 을 부르면, *남이 잡고 있는 lock 을 지우게 되는 거예요.*

> `if get(key) == myPodId then del` 이 한 줄을 atomic 하게 묶어야 안전합니다.

Lua script 로 묶었어요.

---

## 운영자가 데이터를 정정했는데 1분을 기다려야 할까요

L1 TTL을 1분으로 잡아놨으니, 평소엔 1분 안에 자연 정합 됩니다.   
근데 운영자가 마스터 데이터 오타를 정정한 자리에선 1분이 너무 길었어요.

이 데이터는 연 1회 갱신이에요.   
그 한 번을 잘못 넣어두면 1년 내내 잘못된 값이 사용자에게 나갑니다.

그래서 Redis Pub/Sub 으로 정정 신호를 모든 pod에 뿌리기로 했어요.   
admin 화면에서 운영자가 저장을 누르면 Redis가 `PUBLISH "{year}"` 를 발행합니다.   
각 pod이 그 메시지를 받아서 L1에서 해당 year를 evict.

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

그런데 Redis Pub/Sub은 메시지 보장이 안 되는 채널이에요.   
listener가 잠깐 reconnect 하는 동안 발행된 메시지는 그 pod에 안 닿을 수 있습니다.

두 겹으로 막았어요.

첫째, L1 TTL을 1분으로 둡니다. 메시지를 못 받아도 1분 안에 자연 evict.   
둘째, pod의 Redis listener가 끊겼다 다시 붙으면 보수적으로 `invalidateAll()` 을 호출. 끊긴 동안 놓친 메시지가 있어도 안전.

> **포기한 것**: 운영자가 invalidate 호출한 바로 그 순간에 어떤 pod의 listener가 reconnect 중이면, 그 pod은 최대 1분 동안 옛 값을 그대로 노출합니다.

이걸 감수할 수 있는 도메인이라야 이 설계가 성립해요.

---

## 그래서 이걸 어디에 적용하면 안 될까요

사실 이 질문이 설계보다 먼저였습니다.

이 패턴은 다음 두 조건이 같이 맞을 때만 적용 가능해요.

1. 갱신 주기가 길다. 분 단위 stale을 허용할 수 있는 도메인.
2. 사용자 본인 액션과 인과가 없다. "내가 방금 X 했는데 안 보임" 사고가 안 나는 데이터.

두 조건 중 하나라도 깨지면 L1 캐시는 UX 버그로 직결됩니다.

예를 들어 `UserProfileReader` 에 이걸 끼우면 어떻게 될까요.   
사용자가 자기 닉네임을 바꿨는데, 다른 사용자가 들고 있던 그 사용자의 L1 캐시가 옛 닉네임이에요. 1분 동안 옛 닉네임이 다른 화면에 노출됩니다.   
컴플레인이 들어옵니다. *"방금 바꿨는데 왜 안 바뀌나요"*

`ExternalLinkConnectionReader` 도 비슷해요.   
사용자가 외부 서비스를 방금 연동했는데, 그 사용자 본인 화면에서 1분 동안 "미연동" 으로 나옵니다. 사고예요.

| Reader | 적용 | 이유 |
|---|---|---|
| 마스터 데이터 (이번 reader) | OK | 연 1회 갱신, 사용자 액션 인과 없음 |
| `UserProfileReader` | X | 사용자가 직접 수정. 컴플레인 직격. |
| `ExternalLinkConnectionReader` | X | "방금 연동했는데 미연동" 사고 직격 |

> *잘못된 reader에 끼우는 순간 UX 사고가 납니다.*

이 표를 글 맨 위에 박아두는 걸 진지하게 고민했어요. "이거 우리 reader에도 적용해야지" 라는 생각이 본문 다 따라온 뒤에 떠오르면 늦으니까요.

---

## 트레이드오프 정리

| 결정 | 얻은 것 | 포기한 것 |
|---|---|---|
| L1 + L2 2단 | 99% 요청 0ms 응답 | 메시지 손실 시 최대 1분 stale |
| L2 키 스키마 그대로 유지 | 마이그레이션 0, rollback 한 줄 | L2 hit path 추가 최적화는 못 함 |
| 분산 lock + Lua compare-and-del | DB stampede 1회로 수렴 | lock TTL 넘는 호출에서도 안전하지만 추가 복잡도 |
| L1 TTL 1분 + Pub/Sub | 즉시 정합 + 메시지 손실 안전망 | 1분 stale 구간이 도메인에 따라 위험 |

---

## 안 푼 것, 애매했던 결정들

- **L1 stale 1분**: 운영자 invalidate 누락과 Pub/Sub 단절이 같이 터지면 1분 stale. 연 1회 갱신이라 허용했지만 다른 도메인이면 안전 마진이 좁아요.
- **L2 Hash 분리(option E)**: L2 hit path 를 1 entry parse로 줄일 수 있어요. L1 흡수율이 99% 면 효과가 작아서 유보. 메트릭상 L2 hit이 늘면 그때 다시 봅니다.
- **`refreshAfterWrite` 미적용**: hot key tail latency를 줄일 수 있는데 지금은 대부분 L1 hit이라 의미가 작아요. p99 spike가 보이면 켜기로 미뤄뒀습니다.
- **circuit breaker 임계 튜닝**: DB 장애 시 fallback 발동 조건은 staging 측정 후 조정 예정. 지금은 Resilience4j 기본값.
- **`maximumSize(4)`**: 4면 충분하다는 근거가 측정값이 아니라 "당년+전년+이전년+여유" 직관입니다. 메트릭(`l1_eviction_count`) 추이 보고 결정해야 하는 자리.

---

## 메모

PR 올리기 직전, diff를 다시 훑다가 두 줄에서 멈췄어요.

```kotlin
.maximumSize(4)
.expireAfterWrite(Duration.ofMinutes(1))
```

`maximumSize(4)`. 진짜 4면 충분한가, 위에 적은 그 애매함.

`expireAfterWrite(1m)`. Pub/Sub이 즉시 invalidate 해주는데 이게 굳이 필요한가 싶었어요. 필요합니다. Pub/Sub은 best-effort라서요. 이 1분이 메시지 손실 시 자연 정합의 안전망이 되어 줍니다.

종이에 옵션 비교를 적을 땐 *L1 + L2 + Pub/Sub* 한 줄이었어요.   
실제 코드는 lock release race, reconnect 가드, stampede 보호, single-flight, TTL 안전망, circuit breaker 까지 다 들어가야 했습니다.

한 줄을 빼도 운영에서 한 시즌 안에 부딪히는 시나리오들이었어요.
