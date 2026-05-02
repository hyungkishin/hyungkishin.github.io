---
title: "첫 호출만 5초 — 'warmup이 답'으로 직진했다가 멈춘 자리"
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
> Spring + JDK 21 앱에서 첫 외부 API 호출이 5~10초, 두 번째부턴 0.3초.
> "이거 cold start네, warmup 도입하면 풀리겠다." 이게 처음 가설이었다.
>
> 한 외부 API에서 막혔다.
> 매번 130ms 만에 RST. 두 번째도, 세 번째도, 100번째도 똑같이 130ms RST.
> warmup을 100번 해도 못 푼다.
>
> 같은 "느림"이라는 증상으로 묶여 있던 게 원인은 셋이 다 달랐다.
>
> **이 문제는 cold start가 아니었다.**
> **"진단 없이 같은 처방을 반복한 문제"였다.**

---

## 이 글에서 가장 먼저 짚어둘 것 — "느림"은 다 cold start가 아니다

| 증상 | 원인 카테고리 | Warmup으로 풀리나? | 진짜 답 |
|---|---|---|---|
| 첫 호출 느리고 두 번째부터 빠름 | Cold start (JIT/connection/STS) | YES | App startup 시 dummy 호출 |
| 매번 똑같이 빠르게 RST/timeout | Outbound 차단 (방화벽, mesh) | NO | SRE — ServiceEntry, SG, NAT |
| 매번 비슷한 시간 (예: 1.7s) | 외부 API 자체 시간 | NO | 외부 API plan 인상 / 다른 API |
| burst 시 일부 거절 (429) | 외부 rate limit | NO | concurrency 직렬화 / commitment tier |

**진단 없이 warmup 직진은 약 처방.**
이 매트릭스가 글 끝이 아니라 글 첫머리에 있어야 하는 이유 — 본문 따라오다가 "warmup 도입" 전에 진단부터 나눠야 한다.

---

## 1. 문제 — 첫 호출만 유독 느렸다

```
1st call: 5~10s   (cold)
2nd call: 0.3s    (warm)
3rd call: 0.3s
```

같은 process, 같은 endpoint, 같은 사용자. 첫 호출만 느림.

![호출 횟수별 응답 시간](./01-call-count-response-time.svg)

운동 시작할 때랑 같다. 처음 1km는 다리 풀려서 느리고, 5분 뛰면 페이스 올라옴.

---

## 2. 시도 1 — "이거 cold start네, warmup 도입하면 풀리겠다"

처음엔 자료 찾고 정리부터 했다.

### Cold path 비용 분해

| 단계 | 첫 호출 | 이후 |
|---|---|---|
| JVM JIT | 인터프리터 → C1/C2 컴파일 진행 | 네이티브 코드 |
| TLS Handshake | Full handshake | Connection pool 재사용 (keep-alive) |
| DNS | 실제 질의 (50~200ms) | OS/JVM DNS 캐시 |
| TCP Connection | 3-way handshake | 기존 connection 재사용 |
| 클래스 로딩 | lazy load | 이미 로드 |
| AWS IRSA STS | AssumeRoleWithWebIdentity (1~2s) | 캐시된 임시 자격증명 |
| Spring Lazy Init | 일부 빈 첫 사용 시 초기화 | 이미 초기화 |

JIT은 단순 "인터프리터 → 네이티브"가 아니다. **Tiered Compilation 4단계** (Level 0 인터프리터 → 1 C1 → 2~3 C1+profiling → 4 C2).

![JIT Tiered Compilation level 0~4](./02-jit-tiered-compilation.svg)

TLS도 "세션 재사용"보다 **"Connection 재사용"이 더 정확**하다. OkHttp/Apache/JDK HttpClient는 대부분 connection pool로 처리.

![TLS handshake — cold vs warm](./03-tls-handshake-cold-warm.svg)

EKS IRSA 첫 STS 호출 1~2초, Spring lazy bean 초기화 1~3초. JIT + TLS + DNS + IRSA + lazy 합산 4~7초가 흔하다.

![cold start 시간 분해](./06-cold-start-breakdown.svg)

근데 이걸 다 외우는 게 핵심이 아니다.
**"첫 호출만 느린지"** — 이 한 가지로 cold start를 가르는 게 진짜 판단 기준이다.

### 측정 — curl `-w` 로 단계별 분리

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

DNS / TCP / TLS / 서버 처리 / 클라이언트 처리 다섯 단계로 분리.
어디가 느린지 정확히 짚어준다.

### Application warmup 코드

```kotlin
@Component
class S3Warmup(
    private val s3Service: S3Service?,
) : ApplicationListener<ApplicationReadyEvent> {

    private val log = LoggerFactory.getLogger(javaClass)

    override fun onApplicationEvent(event: ApplicationReadyEvent) {
        val s3 = s3Service ?: return
        // 비동기 + timeout + try-catch — startup 블로킹 0, 실패 무시
        CompletableFuture.runAsync {
            runCatching { s3.warmupHeadBucket() }
                .onFailure { log.warn("S3 warmup failed (ignored): {}", it.message) }
        }.orTimeout(10, TimeUnit.SECONDS)
    }
}
```

![warmup 전후 효과](./05-warmup-effect.svg)

여기까지가 "cold start 일반론"이다. S3 첫 호출은 이걸로 풀렸다.

---

## 3. 시도 1이 막힌 자리 — 매번 똑같이 130ms RST

같은 앱에 외부 OCR API 호출도 있었다.
"같은 cold start 패턴이겠지" 싶어서 같이 warmup 코드 추가.

근데 패턴이 달랐다.

| 외부 호출 | 첫 호출 | 두 번째 | 패턴 |
|---|---|---|---|
| S3 PutObject | 5001ms timeout | 887ms 성공 | 첫만 느림 → cold start |
| 외부 OCR API | 130ms RST | 130ms RST | 매번 같음 → 다른 원인 |
| 사내 LLM Proxy | 정상 | 정상 | 무관 |

S3는 첫 호출만 5초 timeout, 두 번째부터 800ms.
근데 OCR API는 첫·두번째·100번째 다 똑같이 130ms 만에 RST.

![외부 호출별 진단 매핑](./08-our-ocr-diagnosis.svg)

**130ms는 우리쪽에서 만들어진 시간이 아니다.**
요청이 우리쪽에서 빨리 끊긴다는 뜻. 인프라에서 outbound가 막혀 있을 가능성.
warmup 100번 해도 같은 패턴이 그대로 나온다.

여기서 시도 1이 무너졌다.
"느림"이라는 한 가지 증상으로 묶여 있던 게 **원인이 셋이 다 달랐다.**

---

## 4. 시도 2 — 진단 매트릭스 + 처방 매핑

![느림의 원인 분류 진단 흐름](./07-slowness-diagnosis-flow.svg)

원인을 분리한 뒤 처방을 다르게 가져갔다.

| 외부 호출 | 진단 | 처방 |
|---|---|---|
| S3 PutObject | Cold start (JIT + IRSA + TLS) | warmup 코드 추가 |
| 외부 OCR API | Outbound 차단 | SRE 컨택 — ServiceEntry 등록 요청 |
| 사내 LLM Proxy | 무관 | 그대로 유지 |

S3 timeout도 5s → 30s 임시 조정해서 진짜 cold start 시간을 측정한 후에 warmup 도입했다.
"5초 timeout 떨어진다"는 우리가 만든 한도였지, 진짜 cold start 시간이 아니었음.

### 진단 순서

```
1. 증상 측정 (어떤 호출 / 얼마나 / 어떤 패턴)
   ↓
2. 반복 호출 비교 — 두 번째부터 빨라지는가
   ↓
3. 단계별 elapsed 분리 — DNS/TCP/TLS/서버/클라이언트 (curl -w)
   ↓
4. 인프라 검증 — pod 안에서 nc/curl로 outbound 가능한가
   ↓
5. 외부 API 한도 검증 — 콘솔/문서에서 RPM·동시성 제한
   ↓
6. 위 통과 + 첫 호출만 느리면 → cold start 확정 → warmup
```

처음엔 1단계에서 바로 6단계로 직진했다. 진단 빼먹고 약 처방.

---

## 5. K8s probe + rolling update 는 cold start 답이 아니다

| 주장 | 실제 |
|---|---|
| Readiness probe로 ready 전 트래픽 차단 | 정확. 단 **앱 시작 완료 ≠ JIT/connection warm**. probe 통과해도 JIT은 cold |
| 사내 chassis 가 워밍업 수행 | 보통 `DataSource eager init` 같은 startup task만. **외부 API 워밍업은 안 함** |
| Rolling update | 트래픽 안전성. cold start 자체 해결은 X |

probe·rolling update는 **장애 회피**용. **첫 호출 latency 자체는 별도 워밍업 필요.**

처음엔 "K8s probe로 다 풀린다"고 들었던 적도 있다. 이거 절반만 맞는 말이었음.

### IDEA 디버그 vs 프로덕션

| | IDEA 디버그 | 프로덕션 |
|---|---|---|
| JIT | `-XX:TieredStopAtLevel=1` (C1만) | default (C2까지) |
| Warm 성능 | **2~5배 느림** | 최적 |

운영 성능 측정은 IDEA가 아니라 빌드된 jar로.

---

## 안 푼 것 / 애매했던 결정들

- **GraalVM Native Image** — startup 50ms 수준이지만 PGO 없으면 peak 처리량이 떨어짐. reflection 설정 부담도 큼. 도입 평가 못 함
- **AppCDS** — `-XX:+UseAppCDS`는 deprecated, `ArchiveClassesAtExit` / `SharedArchiveFile` 만 써야 함. 도입 안 했지만 startup 5~10% 개선 여지 있음
- **외부 OCR API SRE 작업 일정** — ServiceEntry 등록 요청 보냈지만 인프라 팀 일정에 의존
- **OkHttp `connectTimeout`/`readTimeout` 명시 부재** — 환경마다 default가 달라서 일관성 위험

---

## 메모

처음엔 cold start 자료를 굉장히 자세히 정리했다.
JIT Tiered Compilation 그림, TLS handshake 단계, IRSA 흐름. 다 도식화.

근데 실제로 막힌 건 **그 자료 안에 답이 없는 케이스**였다.
S3는 cold start. OCR API는 outbound 차단. 자료 하나로 둘 다 풀리지 않았다.

"내가 정리한 일반론 안에 답이 있을 거라는 가정"이 처음 가설을 직진하게 만든 자리.

**이 글의 본질은 cold start가 아니다.**
**'진단 없이 같은 처방을 반복한 실패'다.**

같은 증상이라도 처방이 같지는 않다.
warmup이 약이 되는 케이스인지부터 가르는 게 먼저였다.
