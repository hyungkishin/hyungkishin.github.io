---
title: "같은 버그가 두 종류 알림으로 보였습니다"
description: "두 종류의 인증 알림을 사용자 한 명의 시간순 로그에 놓으니 세션 두 벌이 서로 덮어쓰는 경로가 보였다."
date: 2026-05-02
update: 2026-11-13
tags:
- 장애분석
- 상태머신
- 외부연동
- idempotency
- dedup
- Kotlin
- enum
---

어제 저녁에는 수집 실패, 오늘 아침에는 인증 실패가 열한 번. 알림만 보면 외부 데이터 소스와 우리 서명 API를 따로 조사할 일이다. 그런데 양쪽에 같은 사용자가 있었다.

## 알림이 두 개면 결함도 두 개일까

| 시점 | 알림 | 거절 위치 |
|---|---|---|
| 어제 저녁 | `errorCode: INVALID_SESSION` (수집 실패) | 비동기, 외부 데이터 소스 |
| 오늘 오전 | `[ERROR] 인증 처리 실패입니다. 다시 시도하세요` (11회) | 동기, sign API 호출 단계 |

둘을 따로 보면 처리하기 쉽다. 하나는 외부 데이터 소스의 거절이니 외부 쪽 문제로 트래킹하고, 하나는 우리 쪽 sign 단계 5xx니 우리 코드를 파면 된다. 담당 범위도, 로그를 보는 위치도, 의심할 코드도 깔끔하게 갈라진다.

그런데 이렇게 나누는 순간 놓치는 질문이 있다. 두 알림이 왜 하필 같은 시간대에 떨어질까?

## 한 워크플로우에 인증 세션이 중복 생성되면

먼저 이 시스템의 그림을 그려두자. 사용자는 단방향 워크플로우 하나를 밟는다. 사전 설문을 내고, 외부 기관 인증을 요청하고, 인증되면 외부에서 데이터가 수집되고, 마지막에 서명(sign)으로 끝난다. 진행 상태는 DB의 status enum이 들고 있고, 외부 인증 세션은 Redis 한 자리(`authSessionKey(workflowCode)`, TTL 120분)에 저장된다. 다음 단계는 그 세션을 꺼내 쓴다.

![정상 인증 흐름](./01-normal-flow.svg)

이 구조의 전제는 "단방향, 한 번만"이다. Redis key가 워크플로우당 하나라서, 어떤 이유로든 인증이 두 번 트리거되면 두 번째 세션이 첫 번째를 덮어쓴다.

두 번째 인증 세션이 발급되면 첫 번째 세션은 무효가 된다. 첫 번째 세션으로 진행 중이던 작업은 비동기 수집 단계에서 INVALID_SESSION으로 거절되거나 동기 sign 호출 단계에서 5xx로 실패한다.

<style>
.metric-fig{--fig-surface:#ffffff;--fig-ink:#0f172a;--fig-ink2:#334155;--fig-muted:#94a3b8;--fig-hair:#e6eaf1;--fig-baseline:#d0d7e2;--c-green:#16a34a;--c-greenink:#15803d;--c-red:#ef4444;--c-redink:#b91c1c;--c-blue:#2f6fed;--c-blueink:#1d4ed8;--c-amber:#d97706;--c-amberink:#b45309;margin:2.4em 0;border:1px solid var(--fig-hair);border-radius:18px;background:var(--fig-surface);padding:18px 20px 10px;overflow:hidden;box-shadow:0 1px 2px rgba(2,6,23,.05),0 14px 40px rgba(2,6,23,.09)}
.metric-fig svg{width:100%;height:auto;display:block;max-width:100%}
.metric-fig svg text{font-family:ui-monospace,"SF Mono","JetBrains Mono",Menlo,monospace}
.metric-fig figcaption{font-size:13.5px;color:var(--fig-muted);line-height:1.6;padding:12px 2px 6px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
.metric-fig figcaption b{color:var(--fig-ink2);font-weight:600}
@media (prefers-reduced-motion: reduce){.metric-fig svg animate,.metric-fig svg animateMotion{display:none}}
</style>

<figure class="metric-fig">
  <svg viewBox="0 0 660 214" role="img" aria-label="세션 2가 세션 1을 덮어쓰고, 세션 1로 진행 중이던 요청이 외부 관문에서 INVALID_SESSION으로 거절된다" xmlns="http://www.w3.org/2000/svg">
    <text x="70" y="76" font-size="11" fill="var(--fig-muted)">인증 트리거 1회차</text>
    <text x="70" y="118" font-size="11" fill="var(--fig-muted)">인증 트리거 2회차</text>
    <line x1="196" y1="72" x2="248" y2="76" stroke="var(--fig-baseline)"/>
    <line x1="196" y1="114" x2="248" y2="112" stroke="var(--fig-baseline)"/>
    <rect x="252" y="50" width="150" height="88" rx="10" fill="none" stroke="var(--fig-baseline)"/>
    <text x="327" y="40" font-size="11" fill="var(--fig-muted)" text-anchor="middle">Redis 세션 키 하나</text>
    <rect x="268" y="62" width="118" height="26" rx="6" fill="var(--c-green)">
      <animate attributeName="opacity" values="0;0;0.9;0.9;0.18;0.18;0" keyTimes="0;0.04;0.08;0.30;0.34;0.97;1" dur="8s" repeatCount="indefinite"/>
    </rect>
    <text x="327" y="79" font-size="11" fill="#ffffff" text-anchor="middle" font-weight="700">세션 1
      <animate attributeName="opacity" values="0;0;1;1;0.35;0.35;0" keyTimes="0;0.04;0.08;0.30;0.34;0.97;1" dur="8s" repeatCount="indefinite"/>
    </text>
    <line x1="268" y1="75" x2="386" y2="75" stroke="var(--c-red)" stroke-width="2">
      <animate attributeName="opacity" values="0;0;1;1;0" keyTimes="0;0.32;0.36;0.97;1" dur="8s" repeatCount="indefinite"/>
    </line>
    <rect x="268" y="100" width="118" height="26" rx="6" fill="var(--c-amber)">
      <animate attributeName="opacity" values="0;0;0.95;0.95;0" keyTimes="0;0.28;0.32;0.97;1" dur="8s" repeatCount="indefinite"/>
    </rect>
    <text x="327" y="117" font-size="11" fill="#ffffff" text-anchor="middle" font-weight="700">세션 2
      <animate attributeName="opacity" values="0;0;1;1;0" keyTimes="0;0.28;0.32;0.97;1" dur="8s" repeatCount="indefinite"/>
    </text>
    <rect x="520" y="50" width="116" height="88" rx="10" fill="none" stroke="var(--fig-baseline)"/>
    <text x="578" y="98" font-size="12" fill="var(--fig-ink)" text-anchor="middle" font-weight="700">외부 관문</text>
    <line x1="406" y1="160" x2="516" y2="160" stroke="var(--fig-baseline)" stroke-dasharray="3 4"/>
    <text x="300" y="164" font-size="10.5" fill="var(--fig-muted)">세션 1로 진행 중이던 작업</text>
    <circle r="6" fill="var(--c-green)">
      <animateMotion path="M410 160 L512 160" keyPoints="0;0;1;1" keyTimes="0;0.44;0.58;1" calcMode="linear" dur="8s" repeatCount="indefinite"/>
      <animate attributeName="opacity" values="0;0;1;1;0;0" keyTimes="0;0.43;0.46;0.58;0.62;1" dur="8s" repeatCount="indefinite"/>
    </circle>
    <g stroke="var(--c-red)" stroke-width="3" stroke-linecap="round">
      <line x1="560" y1="152" x2="596" y2="182"/>
      <line x1="596" y1="152" x2="560" y2="182"/>
      <animate attributeName="opacity" values="0;0;1;1;0" keyTimes="0;0.58;0.62;0.94;1" dur="8s" repeatCount="indefinite"/>
    </g>
    <text x="578" y="204" font-size="10.5" fill="var(--c-redink)" text-anchor="middle" font-weight="700">INVALID_SESSION
      <animate attributeName="opacity" values="0;0;1;1;0" keyTimes="0;0.58;0.62;0.94;1" dur="8s" repeatCount="indefinite"/>
    </text>
  </svg>
  <figcaption>한 워크플로우에 두 세션이 생성됐다. <b>세션 2</b>가 발급되면 <b>세션 1</b>은 무효가 되고, 이전 세션을 사용하는 후속 요청이 거절된다.</figcaption>
</figure>

결함은 "세션이 두 벌 생긴다" 하나다. 알림이 두 종류인 건 거절당하는 관문이 두 군데라서다. 그렇다면 남는 질문은 하나로 좁혀진다. 인증은 왜 두 번 트리거되는가?

입구가 두 개 있었다.

## 중복 요청 방지 조건에서 빠진 AUTH_REQUESTED

첫 번째 입구부터 보자. 사실 중복 인증요청을 막는 가드는 있었다. 그래서 의심이 늦었다.

```kotlin
// AuthRequestService.kt
if (workflow.primaryAuth?.isAuthInProgress() == true) {
    return AuthResponse(result = true, skipped = true)
}
```

인증이 진행 중인 상태에서는 두 번째 요청을 건너뛰도록 구현돼 있었다. 문제는 진행 중 상태를 판정하는 목록이었다.

```kotlin
private val AUTH_IN_PROGRESS_STATUSES =
    setOf(COLLECTION_REQUESTED, COLLECTING, COLLECTED)
//        ▲ AUTH_REQUESTED 가 없음
```

인증요청 직후의 status는 `AUTH_REQUESTED`지만 진행 중 상태 목록에 포함돼 있지 않았다. 그래서 직후에 들어온 두 번째 요청도 외부 인증을 호출해 기존 세션을 덮어썼다.

여기까지만 보면 결론은 간단하다. 상태 목록에 `AUTH_REQUESTED` 한 줄을 추가하면 끝. 실제로 처음엔 그렇게 생각했다.

## 두 번 누르지 않은 사용자

확신을 흔든 건 한 사용자의 시간순 로그였다. 인증요청을 한 번만 누른 사용자가 같은 알림을 만들고 있었다.

| 시각 | 행동 | DB | Redis |
|---|---|---|---|
| T+0 | 사전 설문 1 | `PRE_POLL_DONE` | (없음) |
| T+45s | 인증요청 1 | `AUTH_REQUESTED` | 세션 1 |
| T+1m30s | 사전 설문 2 (답변 수정) | `PRE_POLL_DONE` 으로 reset | 세션 1 그대로 |
| T+1m55s | 인증요청 2 | `AUTH_REQUESTED` | **세션 2가 1을 덮어씀** |

사전 설문 저장 시 인증 상태가 초기화되고 있었다.

```kotlin
// 이미 존재하는 워크플로우에도 상태를 덮어쓰기
fromDb.workflowStatus = WorkflowStatus.PRE_POLL_DONE
fromDb.primaryAuth = WorkflowAuthStatus.PRE_POLL_DONE   // 인증 진행 중이어도 reset
```

설문을 다시 제출하면 인증 status까지 통째로 과거로 되돌린다. status가 `PRE_POLL_DONE`으로 돌아간 순간 dedup 가드의 전제가 사라진다. 시스템 입장에서 이 사용자의 두 번째 인증요청은 두 번째가 아니라 첫 번째다.

중복 요청 방지 조건이 맞아도 다른 저장 경로에서 상태를 초기화하면 중복 여부를 판정할 근거가 사라진다. 상태 변경 경로를 함께 확인해야 했다.

정리하면 입구는 두 개였다.

- 입구 A: 인증요청 연타. 상태 목록에 `AUTH_REQUESTED`가 빠져서 통과된다.
- 입구 B: 사전 설문 재제출. 진행 상태를 초기화해서 통과된다.

설문 재제출에서도 같은 문제가 발생했으므로 연속 클릭 방지만으로는 충분하지 않았다. 수정 범위를 설문 저장 로직까지 넓혔다.

## 두 개의 입구를 닫는 법

입구 A는 상태 목록에 한 줄 추가하면 닫힌다. 입구 B는 저장 로직 쪽에 가드가 들어갔다. 인증이 진행 중이면 설문 답변은 저장하되, 인증 status는 뒤로 돌리지 않는다.

```kotlin
val authInProgress = (fromDb.primaryAuth?.isAuthInProgress() == true) ||
                     (fromDb.secondaryAuth?.isAuthInProgress() == true)

if (!authInProgress) {
    fromDb.workflowStatus = WorkflowStatus.PRE_POLL_DONE
    fromDb.primaryAuth = WorkflowAuthStatus.PRE_POLL_DONE
}
// 답변 필드는 status와 무관하게 항상 갱신
fromDb.answerField1 = ...
```

이 수정에도 검토할 조건이 남았다. 인증 진행 중에 사용자가 정말로 답변을 고치려던 케이스에서는, 답변만 바뀌고 status는 인증 단계에 머문다. 만약 그 답변이 부수 채널 인증의 필요 여부를 결정하는 값이라면 인증 분기를 다시 계산하지 못하는 잠재 위험이 남는다. 운영 데이터를 보면 인증 중 재제출은 대부분 화면 재호출이라 감수했지만, 전수 검증은 못 했다. 이건 솔직하게 미결로 남는다.

## 자동 재시도로 복구할 수 없는 상태

이 결함에는 정책 하나가 겹쳐서 상황을 더 나쁘게 만들었다.

```kotlin
val COLLECT_RETRY_EXCLUDE_ERROR = listOf("SERVICE_UNAVAILABLE", "INVALID_SESSION")
fun needRetry(errorCode: String?): Boolean = !COLLECT_RETRY_EXCLUDE_ERROR.contains(errorCode)
```

`INVALID_SESSION`은 자동 retry 제외 대상이다. 정책 자체는 합리적이다. 세션이 유효하지 않은데 같은 요청을 반복하면 외부 API에 부하만 준다. 정상 상황에서는 맞는 판단이다.

세션 덮어쓰기 이후 INVALID_SESSION이 발생한 사용자는 자동 재시도만으로 복구되지 않았다. 운영자의 수동 초기화 또는 외부 세션 TTL 120분 만료가 필요했다.

자동 재시도 제외 정책은 유효하지 않은 요청의 반복을 줄이지만, 세션 복구 절차가 없으면 사용자의 진행이 장시간 중단될 수 있다.

## 상태 분기 누락을 컴파일 단계에서 검출하기

핫픽스는 결국 두 줄이었다. 그런데 수정이 작다는 게 오히려 불편했다. 작은 수정은 리뷰에서 안심을 만들지만, 같은 종류의 누락이 다시 생기는 걸 막아주진 않는다.

```kotlin
private val AUTH_IN_PROGRESS_STATUSES =
    setOf(AUTH_REQUESTED, COLLECTION_REQUESTED, COLLECTING, COLLECTED)
```

다음에 누군가 새 status를 추가하면, 이 set에도 같이 넣어야 한다는 걸 누가 기억할까? 컴파일러는 모른다. set에서 빠진 값은 그냥 false가 될 뿐 어떤 경고도 없다. 사람의 기억에 맡겨진 목록은 언젠가 다시 구멍이 난다.

그래서 장기적으로는 exhaustive when으로 간다.

```kotlin
fun isAuthInProgress(): Boolean = when (this) {
    AUTH_REQUESTED, COLLECTION_REQUESTED, COLLECTING, COLLECTED -> true
    PRE_POLL_DONE, NOT_NEEDED, COLLECT_FAIL -> false
    // 새 status 추가 시 컴파일 에러로 강제됨
}
```

새 status를 추가했을 때 exhaustive when의 분기가 빠지면 컴파일 오류가 발생한다. 진행 중 여부를 새 상태마다 명시하게 해 목록 누락을 줄일 수 있다.

## 마치며

이 사건을 처음 봤을 때와 끝났을 때, 달라진 건 보는 단위였다. 처음엔 알림 종류별로 봤다. 그러면 결함이 두 개로 보인다. 사용자 한 명의 시간순 로그로 바꿔 보자 결함이 하나로 접혔고, 두 번 누르지 않은 사용자의 존재까지 드러났다. 시간순 트레이스 한 줄 그리는 데 30분이 걸렸는데, 그 30분이 이 사건에서 가장 값어치 있는 시간이었다.

그런데 이 핫픽스를 머지한 뒤에도 알림 카운트가 0으로 내려가지 않았다. 코드는 막았는데 알림은 계속 떴다. 그 이야기는 [다음 편](../why3/)에서 이어진다.
