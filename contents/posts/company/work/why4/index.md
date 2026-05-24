---
title: "8h 안에 한 번에 끝낸다는 SLA 가정 때문에 같은 사용자가 계속 누락됐어요"
date: 2026-05-02
update: 2026-05-02
tags:
- 배치
- SLA
- 멱등성
- 외부의존성
- timeout
- SpringBatch
- Kotlin
---

> **TL;DR**
>
> 매일 새벽 0~8시에 모수 50만짜리 알림 발송 배치를 돌리고 있었어요.
> 운영 timeout이 자주 떴고, 같은 사용자가 며칠째 누락된다는 보고가 들어왔습니다.
>
> 처음 이틀은 parallelism 튜닝이었습니다.
> 30 -> 50 -> 30 -> 다시 50.
> 한쪽 누르면 다른 쪽이 튀어나오는 구조였습니다.
>
> 풀린 건 **SLA 정의 자체를 의심한 다음**이었습니다.
> "8h 안에 한 번에 100%"가 아니라 "24h 안에 누적 100%"로 가정을 바꾸니, 멱등 필터 5라인으로 풀이가 끝났습니다.

---

## 왜 8h 윈도우 안에 끝나지 않았을까?

배치가 운영 윈도우(0~8시)를 자주 넘기기 시작했습니다.
parallelism 30이면 평소 2~3시간에 끝나던 일이 어느 날부터 8시간을 넘겼습니다.

더 불편했던 건 시간 초과 자체가 아니었습니다.
같은 사용자가 며칠째 누락된다는 보고가 따로 들어왔어요.

느린 배치라면 기다리면 됩니다.
근데 같은 사람이 계속 빠지면, 처리량 문제가 아니라 재시도 구조가 같은 실패를 반복하고 있다는 뜻입니다.

처음엔 그 차이를 제대로 보지 못했습니다.

---

## parallelism 30을 50으로 올리면 끝날까?

"동시 처리량을 늘리면 끝나겠지." 단순한 가설이었습니다.

50으로 올렸더니 외부 API rate limit 걸렸어요.
429 에러가 누적.

다시 30으로 내렸습니다.
처리 속도는 줄었지만 8h 안에 들어가긴 했어요.

그 다음 달엔 또 못 끝냈어요.
모수가 슬슬 늘고 있었습니다.

> "3초 timeout이 너무 짧은 거 아닐까?"

근데 timeout을 늘리면 단건 처리 시간이 늘어 전체 실행 시간이 더 길어집니다.
parallelism을 올리면 외부 API가 막고, timeout을 늘리면 윈도우가 터집니다.

여기까지 이틀쯤 썼습니다.
부끄러운 건 이틀 동안 같은 질문만 반복했다는 점이에요.
"어떻게 더 빨리 끝낼까"만 보고 있었고, "같은 사용자가 왜 다시 빠질까"는 뒤로 밀렸습니다.

---

## 처리량의 천장은 어디에 있었을까?

![As-Is, 빨간 박스 3개](./01-as-is-call-graph.svg)

배치 한 건의 호출 경로를 분해했습니다.
처리량을 더 늘리기 전에, 한 명이 왜 매번 같은 자리에서 빠지는지 봐야 했습니다.

| # | 코드 위치 | 결함 |
|---|---|---|
| 1 | `Tasklet.execute:120` | 1년 범위 raw 풀스캔 호출 |
| 2 | `ExternalDataProvider.kt:27` | 일반 API용 `withTimeout(3000)` 가드 |
| 3 | `Tasklet.execute:228` | `catch (Exception)` 으로 timeout silent skip |

이 셋이 묶여 있는 동안에는 문제가 계속 같은 모양으로 반복됩니다.

- 1년치 raw 응답이 3초 안에 들어올 가능성은 사실상 없습니다. 일정 비율이 매일 timeout이 됩니다.
- silent skip은 추적을 막아요. 다음 실행에서 같은 사용자가 같은 timeout을 또 맞습니다.
- parallelism은 단건 timeout 횟수만 줄일 뿐이에요. 같은 사람 누락 패턴은 그대로입니다.

여기서 멈췄습니다.
속도를 더 짜내는 쪽은 방향이 아니었습니다.

> *parallelism으로는 안 풀린다.*

---

## "8h 안에 100%"가 실제 SLA였을까?

질문을 다시 잡았습니다.
"단일 실행 8h 안에 100%"가 실제 SLA인지.

확인해보니

- 알림 발송은 적재 다음 날 새벽
- 적재가 24h 안에만 끝나면 발송 SLA는 안 깨짐

"24h 안에 100% 누적 적재"로 SLA를 재정의하면 풀이가 달라집니다.
한 번에 끝내는 배치가 아니라, 남은 분량을 다음 실행이 이어받는 배치가 됩니다.

데이터가 N-1년 immutable이라는 도메인 특성에서 풀이가 나왔어요.
한 번 처리한 사용자는 다시 처리 안 해도 됩니다.

> **포기한 것**: "새벽 0~8시 한 번의 실행이 모든 것을 끝낸다"는 운영 감각.
> 대신 24h 안에 누락 없이 쌓는 쪽을 택했습니다.

---

## 왜 멱등 필터 5라인으로 풀렸을까?

![To-Be, 멱등 필터 + batch 전용 호출 + 분리 catch](./02-to-be-call-graph.svg)

```kotlin
fun execute(): RepeatStatus {
    val candidateIds = candidateReader.findActiveUserIds(targetYear)
    val processed   = materialRepo.findAllProcessedIds(targetYear)
    val pendingIds  = candidateIds - processed   // 멱등 필터

    log.info("targetYear={} candidates={} processed={} pending={}",
        targetYear, candidateIds.size, processed.size, pendingIds.size)

    pendingIds.chunked(CHUNK_SIZE).forEach { chunk ->
        chunk.forEach(::processOne)
    }
    return RepeatStatus.FINISHED
}
```

`candidateIds - processed` 한 줄이 경계를 바꿨습니다.
실패한 실행을 다시 시작하는 게 아니라, 이미 처리한 사람을 빼고 남은 사람만 보게 했습니다.

장애 시나리오에서 이 경계가 어떻게 작동하는지 봤습니다.

| 시나리오 | Before | After |
|---|---|---|
| Pod 죽음 (1만 중 8천 처리 후) | 1만 처음부터 다시 (100% 부담) | 남은 2천만 추가 처리 (20% 부담) |
| 외부 API 일시 장애 | 매일 같은 사용자 timeout | 다음날 미처리 분량만 자동 재처리 |
| 모수 폭증 | 8h 초과로 cron 겹침 | 7h timebox 후 다음날 이어서 |

추가 비용은 쿼리 1회 + ID Set 메모리 ~4MB.

```sql
CREATE INDEX idx_material_processed ON campaign_material (target_year, processed_at);
```

> **포기한 것**: "단일 실행 100% 보장." 운영팀과 "발송은 적재 후 익일 새벽" 룰을 합의해야 했어요.
>
> 대신 같은 사용자를 매일 처음부터 다시 태우는 비용을 버렸습니다.

발송 일정이 적재와 같은 날이면 24h 분산을 못 씁니다.
이 SLA 재정의는 발송 일정에 의존하는 선택이었습니다.

---

## 일반 API timeout을 batch에도 그대로 써도 될까?

`getStatForBatch`가 dead code로 정의만 돼 있었어요.
와이어링만 추가했습니다.

```kotlin
class ExternalDataProvider(private val client: ExternalClient) {
    // 일반 API: 사용자 화면 보고 있어서 3초 안에 응답해야 함
    suspend fun getStat(userId: Long, range: DateRange): List<Record> =
        withTimeout(3_000) { client.fetch(userId, range) }

    // batch: timeout 가드 없음 (OkHttp 기본 ~10s 까지 대기)
    suspend fun getStatForBatch(userId: Long, range: DateRange): List<Record> =
        client.fetch(userId, range)
}
```

같은 함수 두 벌. `withTimeout(3000)` 한 줄이 다릅니다.
이 한 줄 때문에 일반 API의 응답시간 정책이 batch의 누락 정책으로 흘러 들어가고 있었습니다.

> 여기서 잡아둘 경계: 응답시간 SLA(일반 API) ≠ 처리 SLA(batch).

batch에서는 누락이 응답시간보다 비싸요.

> **포기한 것**: 첫 적재 batch 전체 시간이 10~30% 늘 수 있습니다. 단건 처리 시간이 길어진 결과.

누락 0건이 더 비싸다고 봐서 감수했습니다.
모수가 100만 넘어가면 이 트레이드오프 다시 봐야 합니다.

---

## timeout과 데이터 결함을 같이 잡아도 될까?

silent skip을 두 갈래로 나눴습니다.
timeout과 데이터 결함을 같은 skip으로 묶으면 운영 판단이 흐려졌습니다.

```kotlin
chunk.forEach { userId ->
    try {
        processOne(userId)
    } catch (e: TimeoutException) {
        timeoutQueue.add(userId)
        externalApiTimeoutCounter.increment()
        log.warn("timeout userId={}, will be retried tomorrow", userId)
    } catch (e: Exception) {
        skipException.put(userId, e)
        log.error("skip userId={} cause={}", userId, e.javaClass.simpleName)
    }
}
```

- `timeoutQueue` 는 외부 API 장애 시그널
- `skipException` 은 데이터 결함 시그널

둘은 대응이 다릅니다.
하나는 기다리거나 재시도할 문제이고, 다른 하나는 데이터를 고쳐야 하는 문제예요.
그래서 알림도 갈랐습니다.

```promql
sum(rate(external_api_timeout_total[5m]))
/
sum(rate(batch_processed_total[5m])) > 0.05
```

---

## 장애가 나면 다음날 이어갈 수 있을까?

![장애 시나리오 3개, 24h 안에 자연 회복](./03-failure-scenarios-sla.svg)

| 시나리오 | Before | After |
|---|---|---|
| A. 외부 API 일시 장애 | 며칠째 같은 사용자 누락 | 24h 안에 100% 적재 |
| B. Pod 중간 죽음 | 처음부터 다시 | 미처리 분량만 재처리 |
| C. 모수 폭증 | 8h 초과로 cron 겹침 | 7h timebox 후 다음날 이어서 |

최소 합격선은 셋이었습니다.
멱등 필터 + 7h 타임박스 + 자동 재실행 cron.
이 셋만 있으면 시나리오 B와 C의 24h SLA가 보장됩니다.

여기서도 불편한 부분은 남습니다.
7h에 끊는다는 건 그날 새벽 실행 안에서 끝내겠다는 욕심을 접는다는 뜻입니다.
대신 다음 실행이 이어받을 수 있게 만들었습니다.

---

## 무엇을 아직 못 정했을까?

- **단일 실행 100% 포기**: 운영팀 합의 받았지만 솔직히 모든 PM이 동의한 건 아니에요. "왜 한 번에 다 못 하나" 라는 질문이 분기 회의에서 또 나옵니다.
- **closed-year stat 경로 강제**: 닫힌 연도는 stat 테이블을 직접 읽으면 1차 적재 부하가 줄어듭니다. 호환성 전수 검증 부담으로 후순위로 미뤘는데, 마지막에는 이쪽으로 가야 할 가능성이 커요.
- **OkHttp `connectTimeout`/`readTimeout` 명시 부재**: 환경마다 다르게 잡혀 있을 수 있어요. 환경 일관성 + 무한 대기 가드 차원에서 명시해야 합니다.
- **모수 정의 합의**: 활성/휴면/신규 가입 컷오프 운영팀 합의 대기 중.

---

## 어디서 가정을 바꿨을까?

parallelism만 만지고 있었어요.
30 -> 50 -> 30 -> 50. 운영 윈도우 들어가면 안도, 못 들어가면 다시 내리고.

가정을 바꾼 건 어느 한 시점의 결정이 아니었습니다.
"왜 같은 사용자가 며칠째 누락되지?" 라는 질문이 어느 날 떠올랐고, parallelism으론 그 질문이 안 풀린다는 게 보였어요.

그제서야 SLA 정의 자체를 다시 읽었습니다.
발송 일정이 익일 새벽이라는 사실을 처음 안 것도 그때였어요.
"24h 안에 누적" 이 가능한 도메인이라는 걸, 코드보다 운영 일정에서 먼저 본 자리였습니다.

늦게 인정한 게 있습니다.
이건 batch 튜닝이 아니라 운영 계약을 다시 읽어야 하는 일이었습니다.

코드의 모양이 운영 정책에 의존하는 케이스가 있다는 걸 늦게 알았어요.
