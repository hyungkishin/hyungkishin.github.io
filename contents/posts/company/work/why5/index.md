---
title: "첫 호출 지연과 반복 연결 실패를 구분한 과정"
description: "S3는 첫 호출만 느렸고 외부 OCR 연결은 여러 번 호출해도 끊겼다. 요청별 로그에서 두 증상을 구분했다."
date: 2026-05-02
update: 2026-11-14
tags:
- JVM
- ColdStart
- Warmup
- JIT
- TLS
- Spring
- Kotlin
---

S3 업로드는 첫 호출에 5~10초가 걸렸고 두 번째에는 0.3초면 끝났다. 같은 앱에서 외부 OCR 호출도 실패하고 있었다. S3에서 본 패턴이 워낙 익숙해서 OCR도 같이 워밍업하면 될 줄 알았다.

## 이름이 너무 빨리 나왔다

Spring + JDK 21 앱이 EKS 위에서 돈다. 외부로 나가는 호출은 세 갈래. S3 업로드, 외부 OCR API, 사내 LLM Proxy. 어느 날 관측된 패턴은 이랬다.

```text
1st call: 5~10s   (cold)
2nd call: 0.3s    (warm)
3rd call: 0.3s
```

![호출 횟수별 응답 시간](./01-call-count-response-time.svg)

첫 호출만 느리고 두 번째부터 빠르다. 이 패턴은 서버 개발자에게 너무 익숙해서, 보는 순간 이름이 튀어나온다. "아, cold start네." 그리고 이름이 붙는 순간 진단은 끝난 것 같은 기분이 든다. 처방도 자동으로 따라온다. warmup을 넣자.

여기서 저지른 실수는 하나다. "느림"이라는 한 단어로 S3와 OCR API를 같은 바구니에 담고, 같은 처방을 두 군데 다 적용한 것이다.

## cold start를 의심한 근거

cold start를 의심할 근거는 차고 넘쳤다. 첫 호출이 느려질 수 있는 이유를 쌓아보면 이렇다.

| 단계 | 첫 호출 | 이후 |
|---|---|---|
| JVM JIT | 인터프리터에서 C1/C2 컴파일 진행 | 네이티브 코드 |
| TLS Handshake | Full handshake | Connection pool 재사용 (keep-alive) |
| DNS | 실제 질의 (50~200ms) | OS/JVM DNS 캐시 |
| TCP Connection | 3-way handshake | 기존 connection 재사용 |
| 클래스 로딩 | lazy load | 이미 로드 |
| AWS IRSA STS | AssumeRoleWithWebIdentity (1~2s) | 캐시된 임시 자격증명 |
| Spring Lazy Init | 일부 빈 첫 사용 시 초기화 | 이미 초기화 |

![JIT Tiered Compilation level 0~4](./02-jit-tiered-compilation.svg)

![TLS handshake, cold vs warm](./03-tls-handshake-cold-warm.svg)

![cold start 시간 분해](./06-cold-start-breakdown.svg)

IRSA 첫 STS 호출 1~2초, lazy bean 초기화 1~3초, 여기에 JIT과 TLS와 DNS를 더하면 4~7초는 흔하게 나온다. 관측된 5~10초와 맞아떨어진다.

그런데 여기에 함정이 있다. 이유가 많을수록 가설은 더 그럴듯해질 뿐, 그럴듯함은 진단이 아니다. 가능한 원인을 나열하는 것만으로 OCR API의 실패 원인을 특정할 수는 없었다.

## 호출 시간을 다섯 단계로 나눠 측정하기

처방 전에 해야 했던 일은 시간을 분해하는 것이었다. "느리다" 한 단어 안에는 DNS, TCP, TLS, 서버 처리, 클라이언트 처리가 다 섞여 있다.

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

DNS, TCP, TLS, 서버 처리, 클라이언트 처리 시간을 나눠 측정하면 지연이 발생한 구간을 좁힐 수 있다. warmup을 적용하기 전에 필요한 확인이었다.

## S3: 첫 호출 비용을 warmup으로 줄였다

S3는 처음 가설이 맞았다. 첫 호출 비용이 실제로 컸고, startup 직후 dummy 호출로 그 비용을 미리 내면 됐다.

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

측정에서도 하나 배웠다. 처음 관측된 "5초 timeout"은 실제 cold start 시간이 아니라 우리가 정해둔 한도였다. timeout을 30초로 임시로 올려 진짜 시간을 잰 뒤에야 warmup의 효과를 제대로 비교할 수 있었다. 기존 측정값에는 timeout에 도달했다는 사실만 반영돼 있었기 때문이다.

## OCR: 반복 연결 실패는 warmup으로 해결되지 않았다

같은 앱의 OCR API에도 같은 warmup을 넣었다. S3에서 방금 효과를 본 처방이라 더 의심 없이 넣었다. 그런데 숫자가 다르게 나왔다.

| 외부 호출 | 첫 호출 | 두 번째 | 패턴 |
|---|---|---|---|
| S3 PutObject | 5001ms timeout | 887ms 성공 | 첫만 느림, cold start |
| 외부 OCR API | 130ms RST | 130ms RST | 매번 같음, 다른 원인 |
| 사내 LLM Proxy | 정상 | 정상 | 무관 |

![외부 호출별 진단 매핑](./08-our-ocr-diagnosis.svg)

OCR API는 반복 호출에서도 약 130ms 만에 연결이 리셋(RST)됐다. 첫 호출에만 비용이 집중되는 S3와 달랐으므로 outbound 정책과 네트워크 경로를 확인할 필요가 있었다. 일정한 실패 시간만으로 차단 위치를 특정할 수는 없다.

초기화 비용이 주원인이라면 같은 프로세스의 후속 호출에서 지연이 줄어드는지 확인할 수 있다. OCR API는 반복해도 같은 연결 실패가 발생했으므로 warmup만으로 해결하기 어려웠다.

<style>
.metric-fig{--fig-surface:#ffffff;--fig-ink:#0f172a;--fig-ink2:#334155;--fig-muted:#94a3b8;--fig-hair:#e6eaf1;--fig-baseline:#d0d7e2;--c-green:#16a34a;--c-greenink:#15803d;--c-red:#ef4444;--c-redink:#b91c1c;--c-blue:#2f6fed;--c-blueink:#1d4ed8;--c-amber:#d97706;--c-amberink:#b45309;margin:2.4em 0;border:1px solid var(--fig-hair);border-radius:18px;background:var(--fig-surface);padding:18px 20px 10px;overflow:hidden;box-shadow:0 1px 2px rgba(2,6,23,.05),0 14px 40px rgba(2,6,23,.09)}
.metric-fig svg{width:100%;height:auto;display:block;max-width:100%}
.metric-fig svg text{font-family:ui-monospace,"SF Mono","JetBrains Mono",Menlo,monospace}
.metric-fig figcaption{font-size:13.5px;color:var(--fig-muted);line-height:1.6;padding:12px 2px 6px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
.metric-fig figcaption b{color:var(--fig-ink2);font-weight:600}
@media (prefers-reduced-motion: reduce){.metric-fig svg animate,.metric-fig svg animateMotion{display:none}}
</style>

<figure class="metric-fig">
  <svg viewBox="0 0 660 250" role="img" aria-label="S3는 첫 호출만 느리고 이후 빨라지지만 OCR은 몇 번을 불러도 똑같이 130ms에 끊긴다" xmlns="http://www.w3.org/2000/svg">
    <text x="40" y="26" font-size="12" fill="var(--fig-muted)" font-weight="600">S3: 첫 호출만 비싸다 (cold start)</text>
    <line x1="40" y1="110" x2="360" y2="110" stroke="var(--fig-baseline)"/>
    <rect x="40" y="38" width="22" height="72" rx="3" fill="var(--c-amber)" opacity="0"><animate attributeName="opacity" values="0;0;0;0" keyTimes="0;0.5;0.9;1" dur="7s" repeatCount="indefinite"/></rect>
    <rect x="40" width="22" rx="3" fill="var(--c-amber)" y="110" height="0"><animate attributeName="height" values="0;0;72;72;0;0" keyTimes="0;0.06;0.09;0.88;0.92;1" dur="7s" repeatCount="indefinite"/><animate attributeName="y" values="110;110;38;38;110;110" keyTimes="0;0.06;0.09;0.88;0.92;1" dur="7s" repeatCount="indefinite"/></rect>
    <rect x="80" width="22" rx="3" fill="var(--c-green)" y="110" height="0"><animate attributeName="height" values="0;0;12;12;0;0" keyTimes="0;0.06;0.09;0.88;0.92;1" dur="7s" repeatCount="indefinite"/><animate attributeName="y" values="110;110;98;98;110;110" keyTimes="0;0.06;0.09;0.88;0.92;1" dur="7s" repeatCount="indefinite"/></rect><rect x="120" width="22" rx="3" fill="var(--c-green)" y="110" height="0"><animate attributeName="height" values="0;0;12;12;0;0" keyTimes="0;0.13;0.16;0.88;0.92;1" dur="7s" repeatCount="indefinite"/><animate attributeName="y" values="110;110;98;98;110;110" keyTimes="0;0.13;0.16;0.88;0.92;1" dur="7s" repeatCount="indefinite"/></rect><rect x="160" width="22" rx="3" fill="var(--c-green)" y="110" height="0"><animate attributeName="height" values="0;0;12;12;0;0" keyTimes="0;0.2;0.23;0.88;0.92;1" dur="7s" repeatCount="indefinite"/><animate attributeName="y" values="110;110;98;98;110;110" keyTimes="0;0.2;0.23;0.88;0.92;1" dur="7s" repeatCount="indefinite"/></rect><rect x="200" width="22" rx="3" fill="var(--c-green)" y="110" height="0"><animate attributeName="height" values="0;0;12;12;0;0" keyTimes="0;0.27;0.3;0.88;0.92;1" dur="7s" repeatCount="indefinite"/><animate attributeName="y" values="110;110;98;98;110;110" keyTimes="0;0.27;0.3;0.88;0.92;1" dur="7s" repeatCount="indefinite"/></rect><rect x="240" width="22" rx="3" fill="var(--c-green)" y="110" height="0"><animate attributeName="height" values="0;0;12;12;0;0" keyTimes="0;0.34;0.37;0.88;0.92;1" dur="7s" repeatCount="indefinite"/><animate attributeName="y" values="110;110;98;98;110;110" keyTimes="0;0.34;0.37;0.88;0.92;1" dur="7s" repeatCount="indefinite"/></rect><rect x="280" width="22" rx="3" fill="var(--c-green)" y="110" height="0"><animate attributeName="height" values="0;0;12;12;0;0" keyTimes="0;0.41;0.44;0.88;0.92;1" dur="7s" repeatCount="indefinite"/><animate attributeName="y" values="110;110;98;98;110;110" keyTimes="0;0.41;0.44;0.88;0.92;1" dur="7s" repeatCount="indefinite"/></rect><rect x="320" width="22" rx="3" fill="var(--c-green)" y="110" height="0"><animate attributeName="height" values="0;0;12;12;0;0" keyTimes="0;0.48;0.51;0.88;0.92;1" dur="7s" repeatCount="indefinite"/><animate attributeName="y" values="110;110;98;98;110;110" keyTimes="0;0.48;0.51;0.88;0.92;1" dur="7s" repeatCount="indefinite"/></rect>
    <text x="51" y="32" font-size="10" fill="var(--c-amberink)" text-anchor="middle" font-weight="700">5s
      <animate attributeName="opacity" values="0;0;1;1;0" keyTimes="0;0.06;0.1;0.88;1" dur="7s" repeatCount="indefinite"/>
    </text>
    <text x="440" y="102" font-size="11" fill="var(--c-greenink)" font-weight="700">두 번째부터 0.3s</text>
    <text x="40" y="150" font-size="12" fill="var(--fig-muted)" font-weight="600">OCR: 몇 번을 불러도 130ms RST (잠긴 문)</text>
    <line x1="40" y1="228" x2="360" y2="228" stroke="var(--fig-baseline)"/>
    <rect x="40" width="22" rx="3" fill="var(--c-red)" y="228" height="0"><animate attributeName="height" values="0;0;10;10;0;0" keyTimes="0;0.06;0.09;0.88;0.92;1" dur="7s" repeatCount="indefinite"/><animate attributeName="y" values="228;228;218;218;228;228" keyTimes="0;0.06;0.09;0.88;0.92;1" dur="7s" repeatCount="indefinite"/></rect><rect x="80" width="22" rx="3" fill="var(--c-red)" y="228" height="0"><animate attributeName="height" values="0;0;10;10;0;0" keyTimes="0;0.13;0.16;0.88;0.92;1" dur="7s" repeatCount="indefinite"/><animate attributeName="y" values="228;228;218;218;228;228" keyTimes="0;0.13;0.16;0.88;0.92;1" dur="7s" repeatCount="indefinite"/></rect><rect x="120" width="22" rx="3" fill="var(--c-red)" y="228" height="0"><animate attributeName="height" values="0;0;10;10;0;0" keyTimes="0;0.2;0.23;0.88;0.92;1" dur="7s" repeatCount="indefinite"/><animate attributeName="y" values="228;228;218;218;228;228" keyTimes="0;0.2;0.23;0.88;0.92;1" dur="7s" repeatCount="indefinite"/></rect><rect x="160" width="22" rx="3" fill="var(--c-red)" y="228" height="0"><animate attributeName="height" values="0;0;10;10;0;0" keyTimes="0;0.27;0.3;0.88;0.92;1" dur="7s" repeatCount="indefinite"/><animate attributeName="y" values="228;228;218;218;228;228" keyTimes="0;0.27;0.3;0.88;0.92;1" dur="7s" repeatCount="indefinite"/></rect><rect x="200" width="22" rx="3" fill="var(--c-red)" y="228" height="0"><animate attributeName="height" values="0;0;10;10;0;0" keyTimes="0;0.34;0.37;0.88;0.92;1" dur="7s" repeatCount="indefinite"/><animate attributeName="y" values="228;228;218;218;228;228" keyTimes="0;0.34;0.37;0.88;0.92;1" dur="7s" repeatCount="indefinite"/></rect><rect x="240" width="22" rx="3" fill="var(--c-red)" y="228" height="0"><animate attributeName="height" values="0;0;10;10;0;0" keyTimes="0;0.41;0.44;0.88;0.92;1" dur="7s" repeatCount="indefinite"/><animate attributeName="y" values="228;228;218;218;228;228" keyTimes="0;0.41;0.44;0.88;0.92;1" dur="7s" repeatCount="indefinite"/></rect><rect x="280" width="22" rx="3" fill="var(--c-red)" y="228" height="0"><animate attributeName="height" values="0;0;10;10;0;0" keyTimes="0;0.48;0.51;0.88;0.92;1" dur="7s" repeatCount="indefinite"/><animate attributeName="y" values="228;228;218;218;228;228" keyTimes="0;0.48;0.51;0.88;0.92;1" dur="7s" repeatCount="indefinite"/></rect><rect x="320" width="22" rx="3" fill="var(--c-red)" y="228" height="0"><animate attributeName="height" values="0;0;10;10;0;0" keyTimes="0;0.55;0.58;0.88;0.92;1" dur="7s" repeatCount="indefinite"/><animate attributeName="y" values="228;228;218;218;228;228" keyTimes="0;0.55;0.58;0.88;0.92;1" dur="7s" repeatCount="indefinite"/></rect>
    <rect x="420" y="196" width="128" height="24" rx="7" fill="var(--c-red)" opacity="0.14"/>
    <text x="484" y="212" font-size="11" fill="var(--c-redink)" text-anchor="middle" font-weight="700">warmup ×100
      <animate attributeName="opacity" values="1;1;0.3;1;1" keyTimes="0;0.7;0.75;0.8;1" dur="7s" repeatCount="indefinite"/>
    </text>
    <text x="484" y="234" font-size="10.5" fill="var(--fig-muted)" text-anchor="middle">변화 없음</text>
  </svg>
  <figcaption>비슷하게 보고된 증상이지만 원인은 달랐다. 위는 반복하면 풀리는 <b>첫 호출 비용</b>이고, 아래는 반복해도 똑같이 끊기는 <b>outbound 차단</b>이다. 아래 사례에서는 warmup으로 연결 실패가 해결되지 않는다.</figcaption>
</figure>

## 원인에 따라 조치를 구분했다

![느림의 원인 분류 진단 흐름](./07-slowness-diagnosis-flow.svg)

| 외부 호출 | 진단 | 처방 |
|---|---|---|
| S3 PutObject | Cold start (JIT + IRSA + TLS) | warmup 코드 추가 |
| 외부 OCR API | Outbound 차단 | SRE 담당자에게 확인 요청, ServiceEntry 등록 요청 |
| 사내 LLM Proxy | 무관 | 그대로 유지 |

사후에 정리한 진단 순서는 이렇다. 이 순서대로 갔으면 이름을 잘못 붙일 일이 없었다.

```text
1. 증상 측정 (어떤 호출 / 얼마나 / 어떤 패턴)
2. 반복 호출 비교, 두 번째부터 빨라지는가
3. 단계별 elapsed 분리, DNS/TCP/TLS/서버/클라이언트 (curl -w)
4. 인프라 검증, pod 안에서 nc/curl로 outbound 가능한가
5. 외부 API 한도 검증, 콘솔/문서에서 RPM·동시성 제한
6. 위 통과 + 첫 호출만 느리면 cold start 확정, warmup
```

실제로 한 일은 1에서 6으로의 직진이었다. 2번 하나만 챙겼어도 OCR은 초기에 걸러졌다. "두 번째부터 빨라지는가"라는 질문에 OCR의 답은 처음부터 "아니오"였으니까.

비슷한 증상의 원인별 확인 항목을 만들어두면 다음에 빠르다.

| 증상 | 원인 카테고리 | Warmup으로 풀리나? | 검토할 조치 |
|---|---|---|---|
| 첫 호출 느리고 두 번째부터 빠름 | Cold start (JIT/connection/STS) | YES | App startup 시 dummy 호출 |
| 매번 똑같이 빠르게 RST/timeout | Outbound 차단 (방화벽, mesh) | NO | SRE, ServiceEntry, SG, NAT |
| 매번 비슷한 시간 (예: 1.7s) | 외부 API 자체 시간 | NO | 외부 API plan 인상 / 다른 API |
| burst 시 일부 거절 (429) | 외부 rate limit | NO | concurrency 직렬화 / commitment tier |

## 곁가지 두 개

이 사건을 파는 동안 두 가지 흔한 오해도 같이 정리됐다.

하나, "K8s probe가 있으면 되는 것 아닌가?" readiness probe를 통과하면 Pod로 트래픽을 보낼 수 있다. 그래도 JIT 컴파일이 덜 됐거나 커넥션 풀이 비어 있을 수 있다. 롤링 업데이트 중 준비되지 않은 Pod를 피하는 일과 첫 요청을 빠르게 처리하는 일은 따로 봐야 한다.

둘, 로컬 IDEA에서 잰 숫자는 운영 신호가 아니다. "Run with fast startup" 옵션은 `-XX:TieredStopAtLevel=1`로 C1까지만 컴파일하고, 옵션이 없어도 디버거 attach 자체가 JIT을 제약한다. warm 성능이 2~5배 느리게 측정된다. 성능을 잴 거면 빌드된 jar로 재야 한다.

## 마치며

S3의 첫 호출이 느린 이유를 찾으면서 JIT 컴파일, TLS 핸드셰이크, IRSA까지 살펴봤다. 그러고는 OCR에서도 시간을 재 보기도 전에 같은 처방부터 썼다. 두 번째에도 똑같이 끊기는지만 봤어도 워밍업으로 고칠 문제가 아니라는 걸 알 수 있었다.

남은 숙제도 있다. GraalVM Native Image는 startup 50ms가 매력적이지만 PGO 없는 peak 처리량 하락과 reflection 설정 부담 때문에 평가 전이고, AppCDS는 startup 5~10% 단축 여지가 있다. OCR의 ServiceEntry 등록은 인프라 팀 일정에 물려 있고, OkHttp의 connect/read timeout 명시도 대기 중이다.
