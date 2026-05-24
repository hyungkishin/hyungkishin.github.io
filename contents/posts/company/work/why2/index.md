---
title: "같은 버그가 두 종류 알림으로 보였습니다"
date: 2026-05-02
update: 2026-05-02
tags:
- 장애분석
- 상태머신
- 외부연동
- idempotency
- dedup
- Kotlin
- enum
---

> **TL;DR**
>
> 운영 알림 채널에 두 종류 메시지가 같은 시간대에 떨어지고 있었어요.
> 처음엔 결함이 두 개 따로 있는 줄 알았습니다.
>
> 시간순 트레이스를 그려보다가 깨달았어요.
> **하나의 뿌리에서 갈라진 같은 결함이었습니다.**
>
> 핫픽스는 enum 한 줄이었습니다.
> 그런데 이걸 "한 줄 수정"으로 끝내면 다음 status 추가 때 같은 누락이 다시 납니다.

---

## 왜 같은 시간대에 알림이 두 종류로 떨어졌을까?

운영 알림 채널에서 처음 불편했던 건 양이 아니라 모양이었습니다.
같은 시간대에 두 종류 알림이 올라오고 있었어요.
하나는 비동기 수집 실패처럼 보였고, 하나는 동기 sign API 실패처럼 보였습니다.

둘을 따로 보면 처리하기 쉬웠습니다.
담당 범위도, 로그를 보는 위치도, 의심할 코드도 갈라졌으니까요.
그런데 그렇게 나누는 순간 원인을 놓칠 것 같았습니다.

| 시점 | 알림 | 거절 위치 |
|---|---|---|
| 어제 저녁 | `errorCode: INVALID_SESSION` (수집 실패) | 비동기, 외부 데이터 소스 |
| 오늘 오전 | `[ERROR] 인증 처리 실패입니다. 다시 시도하세요` (11회) | 동기, sign API 호출 단계 |

처음엔 별개의 두 결함인 줄 알았습니다.

"하나는 외부 데이터 소스 거절."
"하나는 우리쪽 sign 단계 5xx."

이렇게 나눠서 트래킹하려고 했습니다.

근데 코드를 따라가다 보니 같은 그림이 보였습니다.
**외부 인증 세션이 한 워크플로우에 두 벌 만들어져서 서로 덮어쓰기.**
거절 시점만 달랐습니다.
뿌리가 같다면 알림을 둘로 쪼개는 건 분석을 편하게 만들 뿐, 장애를 작게 만들지는 못합니다.

---

## 정상 흐름은 왜 한 번만 안전했을까?

![정상 인증 흐름](./01-normal-flow.svg)

각 단계의 결과를 Redis 한 자리(`authSessionKey(workflowCode)`, TTL 120m)에 저장하고, 다음 단계가 그걸 꺼내 씁니다.

> 전제: 단방향, 한 번만.

이 전제가 작을 때는 잘 보이지 않았습니다.
하지만 어떤 단계든 두 번 트리거되는 순간 두 번째 호출의 세션이 첫 번째를 Redis에서 덮어쓰게 됩니다.
Redis key가 하나라서, 시스템은 두 세션을 구분할 방법이 없었습니다.

---

## "인증요청 두 번 클릭"만 막으면 끝일까?

dedup 가드는 있었습니다.
그래서 더 늦게 의심했습니다.

```kotlin
// AuthRequestService.kt
if (workflow.primaryAuth?.isAuthInProgress() == true) {
    return AuthResponse(result = true, skipped = true)
}
```

근데 `isAuthInProgress()` 정의가 이렇게 돼 있었어요.

```kotlin
private val AUTH_IN_PROGRESS_STATUSES =
    setOf(COLLECTION_REQUESTED, COLLECTING, COLLECTED)
//        ▲ AUTH_REQUESTED 가 없음
```

1차 인증요청 직후 status가 `AUTH_REQUESTED` 인데, set에 없으니까 dedup 통과.
2차 클릭에서 외부 호출이 또 나가고 세션이 덮어쓰여집니다.

처음엔 이 한 줄 누락이 모든 알림의 원인이라고 생각했어요.
enum set에 `AUTH_REQUESTED` 추가하면 끝일 줄.

---

## 그런데 두 번 안 누른 사용자는 왜 터졌을까?

확신을 흔든 건 한 사용자의 시간순 로그였습니다.
"인증요청을 두 번 누른 적이 없는 사용자"가 같은 알림을 만들고 있었어요.
그 로그 앞에서는 enum 한 줄 수정이라는 설명이 너무 작았습니다.

| 시각 | 행동 | DB | Redis |
|---|---|---|---|
| T+0 | 사전 설문 1 | `PRE_POLL_DONE` | (없음) |
| T+45s | 인증요청 1 | `AUTH_REQUESTED` | 세션₁ |
| T+1m30s | 사전 설문 2 (답변 수정) | `PRE_POLL_DONE` 으로 reset | 세션₁ 그대로 |
| T+1m55s | 인증요청 2 | `AUTH_REQUESTED` | **세션₂가 ₁ 덮어쓰기** |

dedup 가드가 작동하려면 `primaryAuth`가 `AUTH_REQUESTED` 이상이어야 합니다.
그런데 사전 설문 재제출이 그걸 `PRE_POLL_DONE`으로 되돌려버려요.

`WorkflowChanger.savePoll`을 다시 봤습니다.

```kotlin
// 이미 존재하는 워크플로우에도 상태를 덮어쓰기
fromDb.workflowStatus = WorkflowStatus.PRE_POLL_DONE
fromDb.primaryAuth = WorkflowAuthStatus.PRE_POLL_DONE   // 인증 진행 중이어도 reset
fromDb.secondaryAuth = ...
```

이건 별도 결함이었습니다.
클릭을 막는 가드가 있어도, 다른 경로가 상태를 과거로 돌리면 가드는 없는 것과 같아집니다.

- 시나리오 A (인증요청 두 번 클릭): dedup이 작동하기 직전 상태에서의 race
- 시나리오 B (사전 설문 재제출): dedup의 전제 자체를 깨는 reset

B가 A보다 더 광범위했습니다.
enum 한 줄 추가만으론 부족했어요.
여기서 핫픽스의 모양이 바뀌었습니다.

---

## 그럼 둘 다 막으면 끝일까?

옵션 B로 가드를 추가했습니다.
인증이 진행 중이면 설문 답변은 저장하되, 인증 status는 뒤로 돌리지 않는 방식입니다.

```kotlin
val authInProgress = (fromDb.primaryAuth?.isAuthInProgress() == true) ||
                     (fromDb.secondaryAuth?.isAuthInProgress() == true)

if (!authInProgress) {
    fromDb.workflowStatus = WorkflowStatus.PRE_POLL_DONE
    fromDb.primaryAuth = WorkflowAuthStatus.PRE_POLL_DONE
    fromDb.secondaryAuth = ...
}
// 답변 필드는 status와 무관하게 항상 갱신
fromDb.answerField1 = ...
```

이걸로 A와 B 둘 다 차단됩니다.

> **포기한 것**: 사용자가 *실제로* 답변을 수정한 케이스. status는 인증 단계에 머물러 있고 답변만 바뀝니다.

`hiredLast5Years` 같은 답변이 부수 채널 인증 필요 여부를 결정한다면, 이 가드가 잠재 위험을 남깁니다.
운영 데이터상 사전 설문 재제출이 실제 수정인 경우는 드물고, 대부분 화면 재호출이나 실수라 합의했습니다.
공짜는 아니었어요.
상태를 지키는 대신, 답변 변경이 인증 분기를 다시 계산해야 하는 가능성을 남겼습니다.

---

## 그래서 어디를 막았을까?

| 옵션 | 무엇 | 막는 자리 |
|---|---|---|
| A (필수) | enum set에 `AUTH_REQUESTED` 추가 | 시나리오 A |
| B (권장) | `savePoll` 가드 | 시나리오 A + B |
| C (장기) | 외부 인증 idempotency 계약 | 결함이 발현돼도 외부에서 흡수 |

부수 채널(2차 인증) enum도 같은 한 줄 추가.

자동 retry는 막혀 있었어요.
이 정책 자체는 외부 API 부하를 보호하기 위한 선택이었습니다.

```kotlin
val COLLECT_RETRY_EXCLUDE_ERROR = listOf("SERVICE_UNAVAILABLE", "INVALID_SESSION")
fun needRetry(errorCode: String?): Boolean = !COLLECT_RETRY_EXCLUDE_ERROR.contains(errorCode)
```

`INVALID_SESSION`이 retry 제외 대상(외부 API 부하 보호 목적).
결함으로 이 에러가 발생한 사용자는 자동으론 영영 못 빠져나옵니다.
운영자가 수동 reset하거나, 사용자가 외부 세션 TTL(~120m) 만료까지 기다려야 합니다.

> **포기한 것**: 이 정책이 자가증식 루프와 결합하면 영구 실패 사용자를 만들 수 있습니다.
> 운영자가 reset하지 않으면 사용자는 외부 세션 TTL이 끝날 때까지 기다립니다.

---

## enum set으로 다음 누락을 막을 수 있을까?

이번 핫픽스는 두 줄이었어요.
불편했던 건 수정량이 작다는 점이었습니다.
작은 수정은 리뷰에서 안심을 만들지만, 같은 종류의 누락을 다시 막아주지는 않습니다.

```kotlin
private val AUTH_IN_PROGRESS_STATUSES =
    setOf(AUTH_REQUESTED, COLLECTION_REQUESTED, COLLECTING, COLLECTED)
```

근데 이 set에 새 status가 추가될 때 같이 넣어야 한다는 사실을, 컴파일러가 알려주지 않아요.
다음에 누군가 status를 추가하면 같은 종류 누락이 또 일어납니다.

그래서 장기적으로는 `when (exhaustive)` 또는 `sealed class` 로 가야 합니다.

```kotlin
fun isAuthInProgress(): Boolean = when (this) {
    AUTH_REQUESTED, COLLECTION_REQUESTED, COLLECTING, COLLECTED -> true
    PRE_POLL_DONE, NOT_NEEDED, COLLECT_FAIL -> false
    // 새 status 추가 시 컴파일 에러로 강제됨
}
```

새 status를 추가하면 컴파일러가 "이 조건도 처리해야 한다" 고 막아줍니다.

---

## 무엇을 아직 못 정했을까?

- **옵션 B 가드의 잠재 위험**: 답변 변경이 인증 분기 조건에 영향 주는 케이스가 있는지 전수 검증 못 했어요. 코드 리뷰 받았지만 솔직히 100% 자신은 없습니다.
- **`INVALID_SESSION` retry 제외 정책**: 영구 실패 사용자를 만든다는 부작용. 운영에서 수동 reset 안 하면 사용자가 두 시간 기다려야 합니다.
- **외부 idempotency 옵션 C**: 외부 팀과 계약 협의 필요. 일정 아직 못 잡았어요.
- **enum -> sealed class 전환**: 영향 범위가 넓어서 단독 PR로 갑니다. 핫픽스 머지 후 별도 작업.

---

## 어디서 처음 의심이 바뀌었을까?

PR 올리기 전에 알림 카운트가 안 줄어드는 패턴이 따로 보였어요.
"한 사용자가 같은 결함을 여러 번 발생시키는" 패턴.
이 흐름은 [후속편](../why3/)으로 이어집니다.
코드 결함이 사용자 메시지를 통해 증폭되는 구조였어요.

처음 시간순 트레이스를 그릴 때 한 줄에 30분 걸렸습니다.
그 시간이 아깝지는 않았어요.
알림 이름이 아니라 사용자 한 명의 상태 변화를 따라갔을 때만, 두 결함이 같은 방향을 가리켰습니다.

> "이 사용자가 인증요청을 두 번 안 눌렀는데 왜 세션이 두 벌이지?"

이 의문이 시나리오 B를 발견하게 한 자리였어요.
첫 가설을 의심한 게, 컴파일러를 의심하는 것보다 먼저 와야 했습니다.
