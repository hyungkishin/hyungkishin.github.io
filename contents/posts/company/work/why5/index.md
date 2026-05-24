---
title: "첫 호출만 5초, warmup으로 풀릴 줄 알았어요"
date: 2026-05-02
update: 2026-05-02
tags:
- JVM
- ColdStart
- Warmup
- JIT
- TLS
- Spring
- Kotlin
---

> **TL;DR**
>
> Spring + JDK 21 앱에서 첫 외부 API 호출이 5~10초, 두 번째부터는 0.3초였어요.
> "이거 cold start네, warmup 도입하면 풀리겠다." 이게 처음 가설이었습니다.
>
> 한 외부 API에서 막혔어요.
> 매번 130ms 만에 RST. 두 번째도, 세 번째도, 100번째도 똑같이 130ms RST.
> warmup을 100번 해도 못 풀어요.
>
> 같은 "느림"으로 묶어놨던 호출들이, 뜯어보니 서로 다른 문제였습니다.
>
> 문제는 cold start가 아니었습니다.
> **진단 없이 같은 처방을 반복한 것**이었습니다.

---

## 왜 첫 호출만 5초가 걸렸을까?

숫자만 보면 쉬운 문제처럼 보였습니다.
첫 호출만 5~10초, 두 번째부터는 0.3초.

이 패턴은 너무 익숙해서 오히려 위험했어요.
"cold start네" 라고 이름 붙이는 순간, 진단은 끝난 것처럼 느껴졌습니다.

```text
1st call: 5~10s   (cold)
2nd call: 0.3s    (warm)
3rd call: 0.3s
```

같은 process, 같은 endpoint, 같은 사용자.
첫 호출만 느림.

![호출 횟수별 응답 시간](./01-call-count-response-time.svg)

그래서 처음엔 이 패턴만 보고 cold start라고 봤습니다.
불편했던 건 그 다음입니다.
같은 "느림"이라는 이름으로 S3와 OCR API를 묶었고, 둘 다 같은 처방으로 처리했습니다.

---

## "cold start니까 warmup이면 되겠지"가 맞았을까?

처음 반응은 자료였습니다.
JIT, TLS, DNS, TCP, 클래스 로딩, IRSA, Spring lazy init.
첫 호출이 느려질 수 있는 이유는 충분히 많았습니다.

문제는 이유가 많을수록 가설이 더 그럴듯해진다는 점이었어요.
그럴듯함은 진단이 아닙니다.

| 단계 | 첫 호출 | 이후 |
|---|---|---|
| JVM JIT | 인터프리터에서 C1/C2 컴파일 진행 | 네이티브 코드 |
| TLS Handshake | Full handshake | Connection pool 재사용 (keep-alive) |
| DNS | 실제 질의 (50~200ms) | OS/JVM DNS 캐시 |
| TCP Connection | 3-way handshake | 기존 connection 재사용 |
| 클래스 로딩 | lazy load | 이미 로드 |
| AWS IRSA STS | AssumeRoleWithWebIdentity (1~2s) | 캐시된 임시 자격증명 |
| Spring Lazy Init | 일부 빈 첫 사용 시 초기화 | 이미 초기화 |

JIT은 단순 "인터프리터에서 네이티브"가 아닙니다.
Tiered Compilation 4단계로 진행돼요 (Level 0 인터프리터, 1 C1, 2~3 C1+profiling, 4 C2).

![JIT Tiered Compilation level 0~4](./02-jit-tiered-compilation.svg)

TLS도 "세션 재사용" 보다 "Connection 재사용" 이 더 정확합니다.
OkHttp/Apache/JDK HttpClient는 대부분 connection pool로 처리해요.

![TLS handshake, cold vs warm](./03-tls-handshake-cold-warm.svg)

EKS IRSA 첫 STS 호출 1~2초, Spring lazy bean 초기화 1~3초.
JIT + TLS + DNS + IRSA + lazy 합산이 4~7초 흔합니다.

![cold start 시간 분해](./06-cold-start-breakdown.svg)

하지만 이 표를 다 외워도 OCR API는 풀리지 않았습니다.

> 판단 기준은 자료의 양이 아니었습니다.
> **첫 호출만 느린가.** 이걸 먼저 갈랐어야 했습니다.

---

## 어디가 느린지는 어떻게 쪼개야 할까?

warmup을 넣기 전에 먼저 시간을 찢어야 했습니다.
"느리다"는 한 단어 안에 DNS, TCP, TLS, 서버 처리, 클라이언트 처리가 같이 들어갑니다.

![curl 시간 변수 의미](./04-curl-time-variables.svg)

```bash
curl -w "
  DNS:           %{time_namelookup}s
  CONNECT:       %{time_connect}s
  SSL_HANDSHAKE: %{time_appconnect}s
  TTFB:          %{time_starttransfer}s
  TOTAL:         %{time_total}s
" -s -o /dev/null https://...
```

DNS, TCP, TLS, 서버 처리, 클라이언트 처리.
다섯 단계로 분리해서, 어디가 느린지 정확히 짚어줍니다.

이 작업은 귀찮습니다.
대신 처방을 늦추고, 원인을 먼저 고정합니다.

---

## warmup 코드는 어디까지 먹혔을까?

S3는 처음 가설이 맞았습니다.
첫 호출 비용이었고, startup 이후 dummy 호출로 비용을 미리 냈습니다.

```kotlin
@Component
class S3Warmup(
    private val s3Service: S3Service?,
) : ApplicationListener<ApplicationReadyEvent> {

    private val log = LoggerFactory.getLogger(javaClass)

    override fun onApplicationEvent(event: ApplicationReadyEvent) {
        val s3 = s3Service ?: return
        // 비동기 + timeout + try-catch. startup 블로킹 0, 실패 무시.
        CompletableFuture.runAsync {
            runCatching { s3.warmupHeadBucket() }
                .onFailure { log.warn("S3 warmup failed (ignored): {}", it.message) }
        }.orTimeout(10, TimeUnit.SECONDS)
    }
}
```

![warmup 전후 응답 시간](./05-warmup-effect.svg)

여기까지는 "cold start"로 설명이 됐습니다.
S3 첫 호출은 이걸로 풀렸습니다.

> **포기한 것**: startup 이후 백그라운드 작업 하나를 추가했습니다. 실패는 무시하지만, 로그와 timeout은 남겨야 했습니다.
> 대신 첫 S3 호출에서 5초 timeout을 맞는 비용을 줄였습니다.

---

## 그런데 OCR API는 왜 100번 호출해도 같았을까?

같은 앱에 외부 OCR API 호출도 있었습니다.
"같은 cold start 패턴이겠지" 싶어서 같이 warmup 코드를 추가했어요.
여기서 판단이 가장 불편했습니다.
이미 S3에서 맞은 처방이 있었기 때문에, 같은 처방을 다시 쓰고 싶었습니다.

근데 패턴이 달랐습니다.

| 외부 호출 | 첫 호출 | 두 번째 | 패턴 |
|---|---|---|---|
| S3 PutObject | 5001ms timeout | 887ms 성공 | 첫만 느림, cold start |
| 외부 OCR API | 130ms RST | 130ms RST | 매번 같음, 다른 원인 |
| 사내 LLM Proxy | 정상 | 정상 | 무관 |

S3는 첫 호출만 5초 timeout, 두 번째부터 800ms.
근데 OCR API는 첫, 두번째, 100번째 다 똑같이 130ms 만에 RST.

![외부 호출별 진단 매핑](./08-our-ocr-diagnosis.svg)

130ms는 우리쪽에서 만들어진 시간이 아니에요.
요청이 우리쪽에서 빨리 끊긴다는 뜻이고, 인프라에서 outbound가 막혀 있을 가능성이 큽니다.
warmup 100번 해도 같은 패턴이 그대로 나옵니다.

여기서 첫 가설이 무너졌어요.

> "느림"이라는 한 단어로 묶어둔 순간 처방이 틀어졌습니다.
> S3는 첫 호출 비용이었고, OCR은 매번 130ms에 끊기는 outbound 차단이었습니다.

---

## 처방 전에 무엇을 먼저 갈랐어야 할까?

![느림의 원인 분류 진단 흐름](./07-slowness-diagnosis-flow.svg)

원인을 분리하고 나서야 처방도 갈라졌습니다.
같은 외부 호출이라도 장애 경계가 달랐습니다.

| 외부 호출 | 진단 | 처방 |
|---|---|---|
| S3 PutObject | Cold start (JIT + IRSA + TLS) | warmup 코드 추가 |
| 외부 OCR API | Outbound 차단 | SRE 컨택, ServiceEntry 등록 요청 |
| 사내 LLM Proxy | 무관 | 그대로 유지 |

S3 timeout도 5s에서 30s로 임시 조정해서 실제 cold start 시간을 측정한 뒤에 warmup을 도입했어요.
"5초 timeout 떨어진다" 는 우리가 만든 한도였지, 실제 cold start 시간이 아니었습니다.

이것도 작은 불편함이었습니다.
timeout을 늘리면 장애가 길게 보입니다.
대신 한 번은 실제 시간을 봐야 했습니다.

진단 순서는 이렇습니다.

```text
1. 증상 측정 (어떤 호출 / 얼마나 / 어떤 패턴)
2. 반복 호출 비교, 두 번째부터 빨라지는가
3. 단계별 elapsed 분리, DNS/TCP/TLS/서버/클라이언트 (curl -w)
4. 인프라 검증, pod 안에서 nc/curl로 outbound 가능한가
5. 외부 API 한도 검증, 콘솔/문서에서 RPM·동시성 제한
6. 위 통과 + 첫 호출만 느리면 cold start 확정, warmup
```

처음엔 1단계에서 바로 6단계로 직진했어요.
진단을 빼먹고 약 처방.

---

## 같은 느림에 같은 약을 써도 될까?

같은 증상이라도 원인 카테고리가 다르면 처방이 다릅니다.

| 증상 | 원인 카테고리 | Warmup으로 풀리나? | 가야 할 처방 |
|---|---|---|---|
| 첫 호출 느리고 두 번째부터 빠름 | Cold start (JIT/connection/STS) | YES | App startup 시 dummy 호출 |
| 매번 똑같이 빠르게 RST/timeout | Outbound 차단 (방화벽, mesh) | NO | SRE, ServiceEntry, SG, NAT |
| 매번 비슷한 시간 (예: 1.7s) | 외부 API 자체 시간 | NO | 외부 API plan 인상 / 다른 API |
| burst 시 일부 거절 (429) | 외부 rate limit | NO | concurrency 직렬화 / commitment tier |

진단 없이 warmup으로 직진하면 약을 잘못 씁니다.

warmup은 나쁜 처방이 아니었습니다.
다만 첫 호출 비용에만 맞는 처방이었습니다.
outbound 차단에는 요청을 더 많이 보내는 코드일 뿐입니다.

---

## K8s probe가 첫 호출 latency까지 막아줄까?

처음엔 "K8s probe로 다 풀린다" 고 들었던 적도 있어요.
이게 절반만 맞는 말이었습니다.

| 주장 | 실제 |
|---|---|
| Readiness probe로 ready 전 트래픽 차단 | 정확. 단 앱 시작 완료 ≠ JIT/connection warm. probe 통과해도 JIT은 cold. |
| 사내 chassis가 워밍업 수행 | 보통 `DataSource eager init` 같은 startup task만. 외부 API 워밍업은 안 함. |
| Rolling update | 트래픽 안전성. cold start 자체 해결은 X. |

probe와 rolling update는 장애 회피용이에요.
첫 호출 latency 자체는 별도 워밍업이 필요합니다.

여기서도 경계가 갈립니다.
probe는 "트래픽을 받아도 되는가" 를 묻고, warmup은 "첫 실제 요청이 비용을 맞을 것인가" 를 줄입니다.

---

## IDEA 디버그 숫자를 믿어도 될까?

IntelliJ의 Run/Debug 설정에서 "Run with fast startup" 옵션이 켜져 있으면, `-XX:TieredStopAtLevel=1` 이 붙어서 C1까지만 컴파일됩니다.
옵션을 안 켜면 default JIT (C2까지)로 돌긴 하지만, 디버거 attach 자체가 JIT 컴파일을 제약합니다.

| 항목 | IDEA 디버그 | 프로덕션 |
|---|---|---|
| JIT 단계 | fast startup 옵션 시 C1만, default도 디버거 어태치로 컴파일 제약 | C1 + C2 정상 |
| Warm 성능 | 2~5배 느림 (디버거 + 컴파일 제약) | 기준 성능 |

운영 성능 측정은 IDEA가 아니라 빌드된 jar로.

> **포기한 것**: 로컬 IDEA에서 본 latency는 운영 신호가 아닙니다. 측정이 필요하면 빌드한 jar를 띄워야 해요.
> 편한 디버그 환경을 버리고, 재현성이 있는 실행 조건을 택해야 했습니다.

---

## 무엇을 아직 못 정했을까?

- **GraalVM Native Image**: startup 50ms 수준이지만 PGO 없으면 peak 처리량이 떨어집니다. reflection 설정 부담도 커요. 도입 평가 못 했습니다.
- **AppCDS**: `-XX:+UseAppCDS` 는 deprecated. `ArchiveClassesAtExit` / `SharedArchiveFile` 만 써야 합니다. 도입 안 했지만 startup 5~10% 단축 여지 있어요.
- **외부 OCR API SRE 작업 일정**: ServiceEntry 등록 요청 보냈지만 인프라 팀 일정에 의존하는 자리.
- **OkHttp `connectTimeout`/`readTimeout` 명시 부재**: 환경마다 default가 달라서 일관성 위험 있어요.

---

## 어디서 가정이 굳었을까?

처음엔 cold start 자료를 굉장히 자세히 모았습니다.
JIT Tiered Compilation 그림, TLS handshake 단계, IRSA 흐름. 다 도식화.

근데 실제로 막힌 건 그 자료가 설명하지 못하는 케이스였습니다.
S3는 cold start, OCR API는 outbound 차단.
자료 하나로 둘 다 풀리지 않았어요.

"내가 모은 일반론 안에서 설명될 거라는 가정" 이 처음 가설을 직진하게 만든 자리였습니다.

사실 막혔던 자리는 cold start가 아니었어요.
**진단 없이 같은 처방을 반복한 실패**였습니다.

같은 증상이라도 처방이 같지는 않아요.
warmup이 약이 되는 케이스인지부터 가르는 게 먼저였습니다.

그래서 다음에는 이름을 붙이기 전에 먼저 패턴을 나눠야 합니다.
첫 호출만 느린지, 매번 같은 시간에 끊기는지, 외부 API 자체가 늦는지.
그 순서를 건너뛰면 지식이 많아질수록 더 빠르게 틀립니다.
