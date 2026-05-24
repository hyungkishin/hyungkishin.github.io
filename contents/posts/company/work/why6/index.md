---
title: "큐 거부 0건을 성공이라고 부른 직후, Outbox까지 가야 했습니다"
date: 2026-05-02
update: 2026-05-02
tags:
- 장애회고
- Outbox
- VirtualThreads
- TolerantReader
- 이벤트유실
- Kafka
- Spring
---

> **TL;DR**
>
> 새 enum status를 한 서버만 배포한 상태에서 배치가 돌았습니다.
> 비동기 이벤트 큐가 거부했고, **5,235건이 영구 유실**됐어요.
>
> 1차 봉합으로 Virtual Thread + concurrencyLimit 을 넣었습니다.
> 큐 거부 0건. 이때 "성공" 이라고 불렀어요.
>
> 그 직후 한 가지 의문이 떠올랐어요.
> *"근데 executor pod 죽으면 in-memory 큐는?"*
>
> VT 봉합은 유실을 지연으로 옮겼을 뿐, 정합성 경계를 옮기지 못했습니다.
> 그래서 Outbox까지 가야 했습니다.
> DB write와 이벤트 발행을 같은 트랜잭션에 묶는 것.

---

## 큐 거부 0건이면 정말 해결된 걸까?

큐 거부 0건이라는 숫자는 사람을 안심시켰습니다.
장애 직후에는 더 그랬습니다.

하지만 그 숫자가 숨긴 자리가 있었습니다.
task가 거부되지 않았다는 말은, task가 사라지지 않는다는 말이 아닙니다.
executor pod 안에 남아 있는 동안 pod이 죽으면 끝입니다.

그래서 질문을 바꿔야 했습니다.
큐가 거부하지 않는가가 아니라, **DB 커밋 이후 이벤트를 어디까지 보장할 것인가.**

| 처방 | 막는 자리 | 정합성 경계 |
|---|---|---|
| VT + concurrencyLimit (현재) | 큐 거부 0건 | DB 커밋까지만. executor pod 죽으면 유실 |
| Outbox (NEXT) | DB + outbox 같은 트랜잭션 | outbox INSERT까지 |

큐 거부 0건이라는 숫자가 그럴듯해 보였습니다.
근데 그건 유실을 지연으로 밀어낸 것이었습니다.
막은 게 아니었어요.

같은 사고가 다음에 또 일어날 수 있는 자리는 이렇습니다.

- executor pod이 OOM/evict 되면 in-memory 큐 통째로 유실
- 외부 API가 장기간 정체되면 큐가 무한정 쌓이고, 같은 사고로 돌아옴

불편한 판단이었습니다.
1차 봉합은 필요했지만, 그 봉합을 해결이라고 부르면 다음 장애를 예약하는 셈이었습니다.

---

## 배치 한 번에 무엇이 사라졌을까?

먼저 사라진 것은 이벤트였습니다.
DB row는 바뀌었지만, 그 변경을 바깥으로 알려야 하는 task가 큐에서 거부됐습니다.

| 시각 (KST) | 구분 | 이벤트 |
|---|---|---|
| 13:07 | 시작 | 배치 실행. DB 상태 일괄 변경 (2,100건) |
| 13:10 | 1차 장애 | 이벤트 처리 큐 소진, 2,618건 거부 |
| 13:19 | 연쇄 | 알림 전송 실패 61건 |
| 13:21 | 2차 장애 | 큐 소진 2차, 2,617건 추가 거부 |
| 13:24 | 다른 서버 | 첫 500 에러 (사용자 접근) |
| 13:31 | 탐지 | system alert 인지. **탐지까지 24분.** |
| 14:09 | 복구 | 영향 서버 재배포 완료 |

총 장애 1시간 2분이었어요.

---

## 무슨 일이 순서대로 일어났을까?

![BEFORE, 장애 발생 시 흐름](./01-before-incident-flow.svg)

3개 서버가 같은 enum에 의존하고 있었습니다.

| 서버 | 역할 | enum 의존 |
|---|---|---|
| `admin-api` | 배치 실행 + 어드민 API | O |
| `app-api` | 사용자 앱 서버 | O |
| `core-domain` | 도메인 서버 (HTTP 호출) | O |

새 status `EXPIRED_AUTO`를 추가했는데, `admin-api`에만 배포하고 나머지 둘은 누락된 상태였어요.
여기까지는 배포 사고입니다.
하지만 배포 사고가 이벤트 유실까지 번진 이유는 따로 있었습니다.

### 배치가 DB를 바꿨습니다

```sql
UPDATE workflow
SET    workflow_status = 'EXPIRED_AUTO'
WHERE  id IN (...);   -- 50건씩 42회 = 2,100건
```

DB는 정상이었어요.

### 이벤트 처리 큐가 소진됐어요

상태 전이 1건당 비동기 리스너 3개가 `workflowEventExecutor`에 submit 됩니다.

```text
2,100건 × 3 리스너 = 최대 6,300 태스크 -> 수십 초 안에 executor 집중
  ├─ WorkflowSlackListener
  ├─ WorkflowAnalyticsListener
  └─ WorkflowSmsListener
```

BEFORE 코드, 유계 큐. 거부 시 영구 유실:

```kotlin
ThreadPoolTaskExecutor().apply {
    corePoolSize  = N
    maxPoolSize   = M
    queueCapacity = K   // 초과 시 TaskRejectedException -> 영구 유실
}
```

5,235건 유실이었습니다 (13:10과 13:21 두 차례).

### enum 미배포 서버에서 500이 떴어요

```text
java.lang.IllegalArgumentException:
  No enum constant support.enums.WorkflowStatus.EXPIRED_AUTO
```

500 에러 9건 (13:24~13:57). 그 시간대에 실제 진입한 사용자만 영향이었습니다.

---

## VT + concurrencyLimit을 왜 성공이라고 착각했을까?

장애 직후 1차 봉합으로 들어간 변경입니다.
목표는 명확했습니다.
큐가 꽉 찼을 때 버리지 말고, caller를 세워서라도 밀어 넣는 것.

```kotlin
SimpleAsyncTaskExecutor("workflow-event-").apply {
    setVirtualThreads(true)
    concurrencyLimit = 50              // 초과 시 caller 블로킹, 유실 없음
    setTaskTerminationTimeout(30_000L)
}
```

![큐 동작, BEFORE vs AFTER](./02-queue-before-after.svg)

| 항목 | BEFORE | AFTER (VT) |
|---|---|---|
| 큐 초과 시 동작 | 거부, 유실 | caller 블로킹, 지연 |
| 이벤트 유실 건수 | 5,235건 | 0 |
| 배치 속도 | 빠름 | 외부 API 속도에 종속 |

큐 거부 0건. 이때 "성공" 이라고 불렀어요.

그 말이 너무 빨랐습니다.
유실의 원인 하나를 막았을 뿐, 이벤트의 생존 위치는 여전히 메모리였습니다.

---

## 그 직후 어떤 질문이 남았을까?

retro 미팅에서 한 명이 물었습니다.

> "근데 executor pod 이 죽으면 그 안의 task 큐는요?"

in-memory 큐라서 유실됩니다.
이 질문 하나가 1차 봉합의 경계를 드러냈습니다.

VT가 막은 건 거부에 의한 유실이지, pod 죽음에 의한 유실은 아니었어요.
외부 API가 장기간 정체되면 큐는 무한정 쌓이고, 그 상태에서 pod이 evict 되면 같은 사고로 돌아옵니다.

> VT 봉합으로 옮긴 건 큐 거부의 시점. 거부를 지연으로 바꿨을 뿐입니다.

> **포기한 것**: VT 봉합은 정합성 경계를 옮기지 않습니다. DB 커밋까지만 그대로, 외부 API 종속도 그대로예요.

같은 종류 사고가 다음에 또 일어날 수 있다는 게 명확해졌어요.

---

## 사고 원인과 구조 원인은 왜 달랐을까?

사고 원인은 단순했어요.
`admin-api` 만 배포하고 다른 두 서버를 누락한 것.

구조 원인이 다음 사고를 다시 만들 자리였습니다.
배포 누락은 사람과 절차에서 시작됐습니다.
하지만 DB commit과 이벤트 발행이 떨어져 있으면, 사람의 실수는 같은 유실로 번집니다.

| # | 결함 | 결과 |
|---|---|---|
| 1 | 상태와 이벤트 강결합. DB commit ≠ 이벤트 발행 보장 | DB 성공, 이벤트 유실 |
| 2 | enum 하드코딩. 3개 서버가 같은 enum 직접 의존 | 신규 상태 = 동시 배포 강제 |
| 3 | 이벤트 fan-out을 단일 executor에 집중 | 6,300 태스크로 큐 폭발 필연 |
| 4 | 하루 1번 배치 = burst 설계 자체 | 2,100건 일괄로 이벤트 6,300 폭발 |

이게 Outbox, Tolerant Reader, stream 전환이 필요한 이유였어요.

---

## 정합성 경계를 어디로 옮겨야 할까?

![정합성 경계 이동](./03-consistency-boundary.svg)

방향은 이벤트를 메모리에 오래 붙잡는 것이 아니었습니다.
DB 상태 변경과 outbox INSERT를 같은 트랜잭션에 넣는 것.

```sql
CREATE TABLE workflow_outbox (
    id            BIGINT AUTO_INCREMENT PRIMARY KEY,
    workflow_code VARCHAR(50)  NOT NULL,
    event_type    VARCHAR(100) NOT NULL,
    payload       JSON         NOT NULL,
    status        VARCHAR(20)  NOT NULL DEFAULT 'PENDING',
    retry_count   INT          NOT NULL DEFAULT 0,
    created_at    DATETIME     NOT NULL DEFAULT NOW(),
    sent_at       DATETIME     NULL
);
CREATE INDEX idx_outbox_status ON workflow_outbox (status, created_at);
```

```kotlin
// 1) 트랜잭션: DB + outbox INSERT 같이
@Transactional
fun expireWorkflows(cutoff: LocalDateTime): Int {
    val transitioned = /* 기존 로직 */
    repo.saveAll(transitioned)
    outboxRepository.saveAll(transitioned.map(::toOutbox))
    return transitioned.size
    // eventPublisher.publishStatusChanged() 호출 제거. outbox로 위임.
}

// 2) 별도 publisher (스케줄러 또는 CDC)
@Scheduled(fixedDelay = 5_000)
fun publish() {
    outboxRepository.findPending(limit = 100).forEach { event ->
        runCatching { slackClient.send(event); analyticsClient.send(event) }
            .onSuccess { outboxRepository.markSent(event.id) }
            .onFailure { outboxRepository.incrementRetry(event.id) }
    }
}
```

`retry_count > 3` 이면 `FAILED` 상태 + DLQ 처리 + alert.

> **포기한 것**: DB write가 2배가 됩니다. 운영 요소도 "DB + outbox + consumer + DLQ" 로 늘어납니다.

"이 운영 비용을 감수할 만큼 이벤트 유실이 비싼가" 라는 질문이 매번 따라옵니다.
이번에는 비쌌습니다.
장애 알림까지 유실되는 구조였기 때문입니다.

---

## 모르는 enum은 어떻게 받아야 할까?

enum 동시 배포도 같은 경계를 드러냈습니다.
서버 셋이 같은 문자열을 같은 시점에 알아야만 하는 구조였어요.

```kotlin
data class WorkflowResponse(
    val code: String? = null,
    val workflowStatusRaw: String? = null,  // String으로 수신
) {
    val workflowStatus: WorkflowStatus?
        get() = workflowStatusRaw
            ?.let { raw -> runCatching { WorkflowStatus.valueOf(raw) }.getOrNull() }
            .also {
                if (it == null && workflowStatusRaw != null)
                    log.warn("알 수 없는 workflow 상태: {}", workflowStatusRaw)
            }
}
```

알 수 없는 값은 `null` + 경고 로그 + alert.
UNKNOWN fallback은 silent failure 위험이라 사용 안 했어요.

> **포기한 것**: "알 수 없는 status를 받았다" 가 일찍 안 보일 수 있어요. 모니터링 alert 임계 잘못 잡으면 silent failure로 흐릅니다.

---

## burst 자체는 어떻게 없앨까?

Outbox가 유실 경계를 옮겨도 burst는 남습니다.
하루 1번 배치가 만드는 압력은 그대로입니다.

```text
[현재]  하루 1번 배치 -> 2,100건 burst -> 이벤트 6,300 폭발
[목표]  auto_calculated_at + 7일 시점 도래 시 Kafka delay message
        또는 scheduler가 개별 만료 처리 -> burst 0
```

P0와 P1으로 유실과 계약 충격은 흡수되지만, burst 자체는 그대로예요.
규모가 커지면 같은 비율로 압박이 옵니다.
마지막에는 stream 전환까지 가야 합니다.

다만 이건 봉합보다 큰 결정입니다.
운영 모델을 바꾸는 일이어서 P2로 밀렸습니다.

---

## 아직 어떤 결정을 남겼을까?

| # | 질문 | 현재 상태 | 목표 상태 |
|---|---|---|---|
| Q1 | 이벤트 유실 시 재처리 전략? | 없음. 거부된 태스크는 사라짐. | Outbox + retry + DLQ |
| Q2 | 이벤트 멱등성 보장? | 미설계 | Slack: at-most-once. Analytics: event_id 기반 exactly-once. |
| Q3 | 상태 변경과 이벤트 발행 정합성 경계? | DB 커밋까지만 | DB + outbox INSERT 같은 트랜잭션 |

---

## 무엇을 아직 못 정했을까?

- **Outbox 도입 일정**: P0 라고 적었지만 솔직히 분기 안에 들어갈지 자신 없어요. PR 사이즈가 크고 멱등성 설계가 따라와서 단독 작업이 큽니다.
- **CDC vs 스케줄러 publisher**: Debezium 도입할지, `@Scheduled` 폴링으로 갈지 결정 못 했습니다. 운영 비용 차이가 커서 팀 합의가 필요해요.
- **VT concurrencyLimit 50**: 50이라는 숫자가 운영 측정값이 아니라 "외부 API rate limit이 100이니까 절반" 직관입니다. P0 머지 전에는 이대로 가지만 임시 숫자예요.
- **stream 전환 (P2)**: 아키텍처 변경 비용이 커서 분기 단위로 결정 못 했어요.

---

## 어디서 성공이라는 말을 거둬야 했을까?

retro 미팅에서 큐 거부 0건을 성공이라고 부른 직후 의문이 떠오른 게 가장 컸어요.
그 의문이 안 떠올랐으면 "VT로 풀렸다" 로 끝났을 거고, 다음 비슷한 패턴(executor pod 죽음, 외부 API 정체)에서 같은 사고를 또 찍었을 거예요.

탐지까지 24분 걸렸습니다.
운영 알림 자체가 유실돼서 알림으로는 알 수 없었고, system alert로 인지됐어요.

> 장애 알림 자체가 유실되는 구조는 MTTR을 직접 늘립니다.

이번 사고가 알려준 가장 비싼 깨달음이었어요.

VT 봉합은 막은 게 아니라, 시간을 산 거였습니다.
이 시간 안에 Outbox로 넘어가야 한다는 의미.
안 넘어가면 같은 사고를 다시 만나게 될 거예요.

성공이라는 말은 정합성 경계가 옮겨진 뒤에 써야 했습니다.
그 전까지는 "거부 0건"이 아니라 "아직 메모리에 남아 있는 위험"으로 불러야 했습니다.
