---
title: "Kafka Consumer 성능 병목, 어디서 터지는가"
date: 2026-03-06
update: 2026-03-06
tags:
  - loopers
  - technical-writing
  - kafka
  - performance
---

## TL;DR

Kafka Consumer가 느린 이유, 대부분 "안 봐도 되는 메시지를 너무 정성스럽게 처리해서"다.
전체를 파싱하고, 역직렬화하고, 실패하면 본문째 로그로 찍는 구조 — 트래픽 올라가면 consumer lag으로 바로 이어진다.
이 글에서는 실제로 겪었던 Kafka Consumer 병목 패턴과, Jackson Streaming Parser로 사전 필터링한 경험을 정리한다.

---

## 들어가며

Kafka 토픽 하나에 여러 서비스 메시지가 섞여 있는 구조, 실무에서 꽤 흔하다.
"알림톡 발송 실패" 토픽이 있다고 치자. 여기에 결제, 마케팅, 정산 등 온갖 서비스의 실패 메시지가 다 들어온다.
나한테 필요한 건 정산 서비스 실패 메시지뿐인데, 토픽을 쪼갤 수 없는 상황이라면?

이 구조에서 consumer를 돌리다 보면 꽤 빨리 성능 문제를 만나게 된다.

---

## 문제 상황

### 구조

```mermaid
flowchart TB
    subgraph kafka["Kafka 토픽 — notification-fail-v1"]
        direction LR
        m1["정산 서비스 실패"]
        m2["마케팅 캠페인 실패"]
        m3["기타 서비스 실패"]
        m4["기타 서비스 실패"]
    end

    kafka -->|"전부 consume"| consumer

    consumer["NotificationFailConsumer<br/>(concurrency=1, maxPoll=10)"]
    handler["FailHandler<br/>정산 관련 메시지만 처리"]
    fallback["FallbackService<br/>SMS 대체 발송"]

    consumer -->|"정산 메시지만 처리"| handler
    handler --> fallback
```

토픽에 분당 10,000건이 들어오는데, 내가 처리할 건 그중 0.1%인 10건 정도.
나머지 9,990건은 읽고 버려야 한다.

근데 이 "읽고 버리는" 과정이 생각보다 무겁다.

### 흔한 구현: 일단 다 파싱하고 필터링

```mermaid
flowchart TD
    start(["메시지 수신<br/>(모든 서비스 메시지)"])
    readTree["objectMapper.readTree()<br/>JSON 전체 파싱"]
    treeToValue["objectMapper.treeToValue()<br/>내 DTO로 역직렬화 시도"]
    success{"역직렬화<br/>성공?"}
    handle["handle()<br/>서비스 소스 체크 후 처리"]
    logError["log.error(message.value())<br/>메시지 전체 본문 로그 출력"]
    mostly_return["대부분 return<br/>(내 서비스 아님)"]
    ack["ack.acknowledge()"]

    start --> readTree
    readTree --> treeToValue
    treeToValue --> success

    success -->|"성공"| handle
    success -->|"실패<br/>(구조 불일치)"| logError

    handle --> mostly_return
    mostly_return --> ack
    logError --> ack

    style treeToValue fill:#ff6b6b,color:#fff
    style logError fill:#d63031,color:#fff
    style mostly_return fill:#fdcb6e,color:#333
```

왜 느린지 하나씩 뜯어보자.

### 병목 1: 모든 메시지에 readTree()

`objectMapper.readTree()`는 JSON 문자열을 통째로 파싱해서 `JsonNode` 트리를 메모리에 올린다.
메시지 하나당 수십~수백 개의 `JsonNode` 객체가 만들어지고, 쓰고 나면 바로 GC 대상이 된다.

분당 10,000건이면 분당 수십만 개의 단명 객체가 만들어졌다 사라진다.

### 병목 2: 전부 역직렬화 시도

`treeToValue()`로 내 DTO에 매핑을 시도하는데, 다른 서비스 메시지는 구조가 다르니까 대부분 실패한다.
9,990건의 역직렬화 실패 = 9,990번의 예외 생성 + 스택트레이스 구성. 예외를 만드는 것 자체가 비싸다.

### 병목 3: 실패하면 본문 전체를 로그로

여기가 진짜 아프다. 역직렬화 실패하면 디버깅용으로 `log.error(message.value())` 찍는 경우가 많은데, 이게 분당 9,990번 호출된다.
본문이 1KB라고 치면 분당 약 10MB 로그가 쌓인다. 로그 I/O가 consumer 스레드를 잡아먹고, 로그 백엔드(Elasticsearch 등)에도 부하를 준다.

거기다 본문에 전화번호, 이름 같은 **개인정보**가 들어있다면? 로그 시스템에 민감정보가 그대로 쌓인다.

### 트래픽이 늘면 벌어지는 일

```mermaid
flowchart LR
    input["토픽 유입<br/>10,000건/분"]
    parse["readTree()<br/>10,000건<br/>(DOM 생성)"]
    deser["treeToValue()<br/>10,000건 시도"]
    fail["역직렬화 실패<br/>9,990건"]
    logErr["log.error()<br/>9,990회<br/>메시지 본문 출력"]
    ok["정상 처리<br/>10건"]
    lag["consumer lag<br/>누적"]
    delay["SMS 발송<br/>수분~수십분 지연"]

    input --> parse --> deser
    deser --> fail --> logErr --> lag --> delay
    deser --> ok

    style fail fill:#ff6b6b,color:#fff
    style logErr fill:#d63031,color:#fff
    style lag fill:#e17055,color:#fff
    style delay fill:#d63031,color:#fff
```

10건 처리하려고 10,000건을 풀 파싱하고, 9,990번 예외 만들고, 9,990번 로그 찍는 구조다.
lag은 쌓이고, 정작 중요한 SMS 대체 발송은 몇 분씩 밀린다.

---

## 해결: Jackson Streaming으로 사전 필터링

아이디어 자체는 간단하다.

> **"내 메시지가 아니면 readTree()를 아예 안 부른다."**

JSON에서 `message_source` 필드 하나만 빠르게 읽으면 되는데, 그걸 위해 전체 DOM 트리를 만들 이유가 없다.
Jackson의 **Streaming API (JsonParser)** 는 토큰 단위로 JSON을 순차 읽기한다. 객체를 안 만들고, 원하는 필드 찾으면 바로 끊을 수 있다.

### 변경 후 흐름

```mermaid
flowchart TD
    start(["메시지 수신<br/>(모든 서비스 메시지)"])
    streaming["Jackson Streaming Parser<br/>message_source 필드만 탐색<br/>(DOM 생성 없음)"]
    isMine{"message_source<br/>== 내 서비스?"}
    skipAck["ack → return<br/>즉시 skip"]
    parseTree["objectMapper.readTree()<br/>+ treeToValue()<br/>내 메시지만 DOM 파싱/역직렬화"]
    handle["handle() → SMS 발송"]
    handleResult{"처리<br/>성공?"}
    successAck["ack (finally)"]
    failLog["log.error(메타 정보만)<br/>topic/partition/offset<br/>key/userId/cause<br/>본문 없음"]
    failAck["ack (finally)<br/>(partition stall 방지)"]
    parseErr["JSON 파싱 실패<br/>log.warn(size만)"]
    parseErrAck["false 반환<br/>→ ack + skip"]

    start --> streaming
    streaming --> isMine

    isMine -->|"내 서비스"| parseTree
    isMine -->|"그 외 (99.9%)"| skipAck

    streaming -.->|"파싱 실패"| parseErr --> parseErrAck

    parseTree --> handle --> handleResult

    handleResult -->|"성공"| successAck
    handleResult -->|"실패"| failLog --> failAck

    style streaming fill:#0984e3,color:#fff
    style isMine fill:#00b894,color:#fff
    style skipAck fill:#55efc4,color:#333
    style parseTree fill:#74b9ff,color:#333
    style successAck fill:#00b894,color:#fff
    style failLog fill:#e17055,color:#fff
    style failAck fill:#fdcb6e,color:#333
```

### Streaming vs readTree 비교

```mermaid
flowchart LR
    subgraph before["Before: readTree()"]
        direction TB
        b1["JSON 문자열 입력"]
        b2["전체 DOM 트리 생성<br/>(JsonNode 객체 그래프)"]
        b3["메모리 할당 + GC 부담"]
        b1 --> b2 --> b3
    end

    subgraph after["After: Jackson Streaming"]
        direction TB
        a1["JSON 문자열 입력"]
        a2["토큰 단위 순차 읽기<br/>(객체 생성 없음)"]
        a3["판별 필드 발견 즉시 종료<br/>평균 JSON의 5~10%만 읽음"]
        a1 --> a2 --> a3
    end

    style before fill:#ff7675,color:#fff
    style after fill:#00b894,color:#fff
```

| 지표 | readTree() | Streaming |
|------|-----------|-----------|
| 메모리 할당 | JsonNode 트리 전체 | 거의 없음 (토큰 버퍼만) |
| CPU | 전체 JSON 파싱 | 판별 필드까지만 |
| GC 부담 | 높음 (단명 객체 대량 생성) | 최소 |
| 관심 없는 메시지 비용 | **readTree 전체 비용** | **5~10% 비용** |

### 성능 개선 효과

```mermaid
flowchart LR
    input2["토픽 유입<br/>10,000건/분"]
    streaming2["Streaming Parser<br/>message_source만 탐색"]
    check["내 서비스 여부 판별<br/>O(1) 토큰 탐색"]
    skipAll["즉시 skip + ack<br/>9,990건<br/>(DOM 생성 없음)"]
    process["readTree()<br/>+ treeToValue()<br/>+ handle()<br/>+ SMS 발송<br/>10건"]

    input2 --> streaming2 --> check
    check -->|"99.9%"| skipAll
    check -->|"0.1%"| process

    style streaming2 fill:#0984e3,color:#fff
    style check fill:#00b894,color:#fff
    style skipAll fill:#55efc4,color:#333
    style process fill:#74b9ff,color:#333
```

| 지표 | Before | After | 개선율 |
|------|--------|-------|--------|
| JSON DOM 파싱 (readTree) | 10,000건 | 10건 | **99.9% 감소** |
| 역직렬화 시도 (treeToValue) | 10,000건 | 10건 | **99.9% 감소** |
| 관심 없는 메시지 파싱 비용 | readTree 전체 | Streaming 5~10% | **~95% 감소** |
| log 호출 (본문 포함) | 9,990건 | 0건 | **100% 제거** |
| 로그 I/O | 9,990회 (본문 포함) | 실패 시에만 (메타만) | **99.9%+ 감소** |
| 민감정보 노출 | 9,990건 | 0건 | **100% 제거** |
| consumer lag | 누적 (수분~수십분) | 최소 | **즉시 처리** |

---

## 구현

### Streaming 사전 필터

```kotlin
private val jsonFactory = objectMapper.factory

private fun isMyMessage(payload: String): Boolean {
    if (payload.isEmpty()) return false
    return runCatching {
        jsonFactory.createParser(payload).use { parser ->
            while (parser.nextToken() != null) {
                if (parser.currentToken == JsonToken.FIELD_NAME
                    && parser.currentName == "message_source"
                ) {
                    parser.nextToken()
                    return@runCatching parser.valueAsString == "my-service"
                }
            }
            false
        }
    }.getOrElse { false }
}
```

`jsonFactory.createParser()`로 Streaming Parser를 열고, 토큰을 하나씩 읽다가 `message_source`를 만나면 값만 확인하고 바로 끊는다.
DOM 트리를 안 만드니까 메모리 할당이 거의 없다.

### Consumer 본체

```kotlin
fun listen(message: ConsumerRecord<String, String>, ack: Acknowledgment) {
    // 1. Streaming으로 내 메시지인지 확인 — 아니면 즉시 skip
    if (!isMyMessage(message.value())) {
        ack.acknowledge()
        return
    }

    // 2. 내 메시지만 풀 파싱 + 처리 — finally로 ack 보장
    try {
        val root = objectMapper.readTree(message.value())
        val data = objectMapper.treeToValue(root, MyDto::class.java)
        handler.handle(data)
    } catch (e: Exception) {
        log.error(
            "handle_error : topic={} partition={} offset={} key={} cause={}",
            message.topic(), message.partition(), message.offset(),
            message.key() ?: "unknown",
            classifyCause(e), e,
        )
    } finally {
        ack.acknowledge()
    }
}
```

---

## Ack 정책: 왜 실패해도 ack 하는가

"처리 실패했으면 ack 안 하고 재시도해야 하는 거 아냐?" 라고 생각할 수 있다.

맞는 말인데, **보조 흐름(fallback)** 성격의 consumer라면 실패해도 ack 하는 게 나을 때가 많다.

### ack 안 하면 벌어지는 일

`MANUAL_IMMEDIATE` + `concurrency=1` 구조에서 ack을 안 하면:
1. 같은 메시지를 **무한 재시도** — 외부 API 장애면 끝없이 반복
2. 해당 partition의 **후속 메시지 전부 blocking** — partition stall
3. 뒤에 있는 멀쩡한 메시지들도 처리 못함 → **장애가 번짐**

```mermaid
flowchart LR
    subgraph stall["partition stall"]
        direction TB
        msg1["실패 메시지<br/>(ack 안 함)"]
        msg2["정상 메시지 1<br/>(대기)"]
        msg3["정상 메시지 2<br/>(대기)"]
        msg4["정상 메시지 3<br/>(대기)"]
        msg1 -.->|"blocking"| msg2 -.-> msg3 -.-> msg4
    end

    style msg1 fill:#d63031,color:#fff
    style msg2 fill:#636e72,color:#fff
    style msg3 fill:#636e72,color:#fff
    style msg4 fill:#636e72,color:#fff
```

실패 한 건 때문에 뒤에 있는 수십~수백 건이 다 밀리는 거다. 실패를 유실하는 것보다 이게 더 위험하다.

### ack 보장 패턴: try/finally

```kotlin
// early return 분기: 직접 ack 후 return
if (!isMyMessage(message.value())) {
    ack.acknowledge()
    return
}

// 처리 구간: finally로 ack 보장
try {
    // 역직렬화 + 핸들러 호출
} catch (e: Exception) {
    // 상관키 로깅 (본문은 절대 안 남김)
} finally {
    ack.acknowledge()  // 어떤 경우에도 ack
}
```

`runCatching` + `onFailure`로도 되긴 하는데, 나중에 누가 중간에 return을 하나 넣으면 ack이 빠질 수 있다.
`try/finally`는 언어가 보장해주니까 그런 실수가 원천 차단된다.

### 케이스별 정리

```mermaid
flowchart LR
    subgraph cases["케이스별 ack 정책"]
        direction TB
        c1["Streaming 파싱 실패<br/>(깨진 메시지)"]
        c2["관심 없는 메시지"]
        c3["처리 성공"]
        c4["처리 실패<br/>(역직렬화/외부API/DB)"]
    end

    c1 -->|"ack O"| r1["warn 로그<br/>(size만)"]
    c2 -->|"ack O"| r2["로그 없음"]
    c3 -->|"ack O"| r3["info 로그"]
    c4 -->|"ack O<br/>(finally)"| r4["error 로그<br/>(상관키+cause만)<br/>본문 없음"]

    style c1 fill:#636e72,color:#fff
    style c2 fill:#636e72,color:#fff
    style c3 fill:#00b894,color:#fff
    style c4 fill:#e17055,color:#fff
    style r4 fill:#fdcb6e,color:#333
```

| 케이스 | ack | 로그 | 이유 |
|--------|-----|------|------|
| Streaming 파싱 실패 | O | `warn` (size만) | 재시도해봤자 의미 없음 (깨진 메시지) |
| 관심 없는 메시지 | O | 없음 | 내 관심사가 아님 |
| 처리 성공 | O | `info` | 정상 |
| 처리 실패 | **O (finally)** | `error` (상관키+cause) | partition stall 방지 |

---

## 실패 로그 설계: 본문 대신 상관키

실패했을 때 "뭐가 실패했는지" 추적하려면 로그가 필요하다.
근데 본문 전체를 찍으면 민감정보 문제가 생긴다. 대신 **상관키(correlation key)** 와 **실패 원인 분류(cause)** 만 남긴다.

```
handle_error :
    topic={}  partition={}  offset={}    ← Kafka 좌표 (정확한 위치)
    key={}                                ← 메시지 키 (대체 상관키)
    userId={}                             ← 비즈니스 상관키
    templateCode={}                       ← 분류용
    cause={}                              ← 실패 원인
```

### cause 분류

예외의 cause chain을 타고 내려가면서 분류한다.

```kotlin
private fun classifyCause(e: Exception): String {
    val causes = generateSequence<Throwable>(e) { it.cause }.toList()
    return when {
        causes.any { it is JsonProcessingException } -> "DESERIALIZE_FAIL"
        causes.any { it is DataAccessException } -> "DB_FAIL"
        causes.any { it is RestClientException } -> "EXTERNAL_API_FAIL"
        else -> e.javaClass.simpleName
    }
}
```

| cause | 의미 | 대응 |
|-------|------|------|
| `DESERIALIZE_FAIL` | 메시지 구조가 바뀜 | 프로듀서 쪽 변경 이력 확인 |
| `DB_FAIL` | DB 장애 | DB 상태 확인 후 수동 재발송 |
| `EXTERNAL_API_FAIL` | 외부 API 장애 | API 상태 확인 후 수동 재발송 |
| `{클래스명}` | 미분류 | 클래스명으로 역추적 |

상관키가 null일 수도 있다(역직렬화 실패 시). 이때는 `message.key()`로 대체해서 **검색 가능한 키가 최소 하나**는 남도록 한다.

---

## 이중 파싱 트레이드오프

현재 구조에서 내 메시지(0.1%)는 Streaming 스캔 → readTree로 **2번 파싱**된다.
근데 나머지 99.9%에서 readTree를 완전히 날린 이득이 워낙 크기 때문에, 이 비율에서는 충분히 남는 장사다.

다만 내 메시지 비율이 확 올라가는 상황(예: 외부 서비스 전체 장애로 실패가 폭증)에서는 이중 파싱 비용이 눈에 띌 수 있다.

> 내 메시지 비율이 10%를 넘기면 streaming 없이 바로 readTree → 필드 체크 방식으로 전환을 고려한다.
> 이 경우에도 역직렬화(`treeToValue`)는 내 메시지만 하니까 변경 전보다는 낫다.

---

## 더 극단적인 상황이 오면

이걸로도 못 버틸 만큼 트래픽이 치솟으면:

| 방안 | 설명 | 난이도 |
|------|------|--------|
| **concurrency 증가** | 병렬 처리 | 낮음 |
| **MAX_POLL_RECORDS 증가** | 한 번에 더 많이 poll | 낮음 |
| **문자열 사전 필터** | Streaming 전에 `contains("\"message_source\":\"my-service\"")` | 중간 (JSON 변형에 취약) |
| **전용 토픽 분리** | 프로듀서 측에 전용 토픽 publish 요청 | 높음 (타팀 협의) |
| **DLQ 도입** | 실패 메시지를 별도 토픽으로 | 중간 |

### DLQ가 필요해지는 시점

- 메시지 유실이 CS/정산/법적 이슈로 번질 수 있을 때
- 장애가 반복돼서 수동 대응이 지칠 때
- 실패 디버깅에 원문 payload가 꼭 필요할 때 (로그에는 민감정보를 못 남기니까)
- 발송이 법적 의무(고지 문자 등)로 승격될 때 → ack-on-failure가 위험해지고, DLQ + 재처리 파이프라인이 필수

궁극적으로 가장 깔끔한 건 **전용 토픽 분리**다. 내 메시지만 들어오는 토픽이 있으면 사전 필터링 자체가 필요 없다.
근데 이건 프로듀서 쪽(다른 팀)이 바꿔줘야 하니까 협의 비용이 크다. 현실적으로는 Streaming 필터링이 가성비가 제일 좋다.

---

## 정리

1. **안 볼 메시지에 비용 쓰지 마라** — Jackson Streaming으로 판별 필드만 읽고 바로 skip
2. **로그에 본문 찍지 마라** — 민감정보 노출 + I/O 병목. 상관키와 cause만 남겨라
3. **보조 흐름이면 실패해도 ack 해라** — partition stall은 실패 한 건보다 훨씬 큰 장애를 만든다
4. **모든 경로에서 ack을 보장해라** — `try/finally`로. `runCatching`은 중간 return에 취약하다
5. **상관키는 null 방어해라** — 검색 가능한 키가 최소 하나는 남아야 운영에서 추적이 된다

빠르게 처리하는 게 아니라, **안 해도 되는 걸 안 하는 게** 핵심이다.
