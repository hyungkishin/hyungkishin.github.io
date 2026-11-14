---
title: "Redis P95 5.68초는 어디서 잰 시간일까"
description: "알림 서비스에서 잰 캐시 P95는 5.68초였다. 공유 커넥션에서 기다린 시간도 여기에 포함될까? 타이머를 어디서 시작하는지 코드를 열어 봤다."
date: 2026-02-26
update: 2026-11-14
tags:
- 관측성
- 모니터링
- Redis
- 캐시
- Observability
- technical-writing
---

알림 서비스의 캐시 조회 P95가 5.68초로 찍혔다. 같은 Redis 클러스터를 쓰는 다른 서비스가 보고한 값은 1.44ms였다. 우선 캐시 조회 시간을 재는 코드가 어디에서 타이머를 시작하고 멈추는지 확인했다.

같은 알림 서비스의 DB 조회 P95는 2.12ms였다. 캐시 쪽 타이머는 Redis 명령 실행 전부터 돈다. 공유 커넥션에서 차례를 기다린 시간도 5.68초에 포함될 수 있다.

<style>
.metric-fig,.fig-defs{
  --fig-surface:#ffffff;--fig-ink:#0f172a;--fig-ink2:#334155;--fig-muted:#94a3b8;
  --fig-grid:#eef2f7;--fig-baseline:#d0d7e2;--fig-hair:#e6eaf1;
  --c-blue:#2f6fed;--c-blueink:#1d4ed8;--c-green:#16a34a;--c-greenink:#15803d;
  --c-red:#ef4444;--c-redink:#b91c1c;
}
.metric-fig{
  margin:2.4em 0;border:1px solid var(--fig-hair);border-radius:18px;background:var(--fig-surface);
  padding:20px 22px 12px;overflow:hidden;
  box-shadow:0 1px 2px rgba(2,6,23,.05),0 14px 40px rgba(2,6,23,.09);
}
.metric-fig svg{width:100%;height:auto;display:block;max-width:100%}
.metric-fig svg text{font-family:ui-monospace,"SF Mono","JetBrains Mono",Menlo,monospace}
.metric-fig .cap-head{display:flex;justify-content:space-between;align-items:baseline;gap:14px;margin-bottom:6px}
.metric-fig .cap-tag{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--fig-muted);
  font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
.metric-fig figcaption{font-size:13.5px;color:var(--fig-muted);line-height:1.6;padding:14px 2px 8px;
  font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
.metric-fig figcaption b{color:var(--fig-ink2);font-weight:600}
@media (prefers-reduced-motion: reduce){.metric-fig svg animate{display:none}}
</style>

<svg class="fig-defs" width="0" height="0" aria-hidden="true" focusable="false" style="position:absolute;width:0;height:0">
  <defs>
    <filter id="fx-soft" x="-40%" y="-40%" width="180%" height="180%">
      <feDropShadow dx="0" dy="1.5" stdDeviation="2.5" flood-color="#0f172a" flood-opacity="0.14"/>
    </filter>
  </defs>
</svg>

## 캐시가 DB보다 2,700배 느리게 찍혔다

알림 서비스의 캐시 P95가 5.68초로 찍혔다. 같은 서비스의 DB P95는 2.12ms. 정상 구간의 캐시 조회 기준선은 0.2ms대(HGET 약 100~200µs)다.
DB 조회 지연을 줄이기 위해 둔 캐시 계층에서 약 2,700배 큰 P95가 측정됐다. 다만 두 지표의 측정 범위도 함께 확인해야 한다.

첫 가설은 Redis 클러스터의 성능 저하였다. 캐시가 이 정도로 느리면 서버가 문제라는 가설이다. 이 시점에는 5.68초가 어디서 만들어진 시간인지 아무도 모른다.

<figure class="metric-fig">
  <div class="cap-head"><span class="cap-tag">같은 캐시 클러스터의 P95</span><span class="cap-tag">log scale</span></div>
  <svg viewBox="0 0 640 216" role="img" aria-label="로그 스케일 막대. 알림 서비스의 캐시 P95 5.68초가 DB 2.12ms와 다른 서비스의 캐시 1.44ms를 압도한다" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="g7-red" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="var(--c-red)" stop-opacity="0.6"/><stop offset="1" stop-color="var(--c-red)"/></linearGradient>
      <linearGradient id="g7-blue" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="var(--c-blue)" stop-opacity="0.6"/><stop offset="1" stop-color="var(--c-blue)"/></linearGradient>
      <linearGradient id="g7-green" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="var(--c-green)" stop-opacity="0.6"/><stop offset="1" stop-color="var(--c-green)"/></linearGradient>
    </defs>
    <g stroke="var(--fig-grid)" stroke-width="1" font-size="10.5" fill="var(--fig-muted)">
      <line x1="182" y1="32" x2="182" y2="178"/><text x="182" y="194" text-anchor="middle">1ms</text>
      <line x1="289" y1="32" x2="289" y2="178"/><text x="289" y="194" text-anchor="middle">10ms</text>
      <line x1="396" y1="32" x2="396" y2="178"/><text x="396" y="194" text-anchor="middle">100ms</text>
      <line x1="503" y1="32" x2="503" y2="178"/><text x="503" y="194" text-anchor="middle">1s</text>
    </g>
    <line x1="150" y1="32" x2="150" y2="178" stroke="var(--fig-baseline)" stroke-width="1.4"/>
    <g font-size="12">
      <text x="142" y="61"  fill="var(--fig-ink2)" text-anchor="end" font-weight="600">알림 캐시 p95</text>
      <text x="142" y="109" fill="var(--fig-ink2)" text-anchor="end" font-weight="600">타 서비스 캐시</text>
      <text x="142" y="157" fill="var(--fig-ink2)" text-anchor="end" font-weight="600">DB p95</text>
    </g>
    <rect x="150" y="46" width="0" height="30" rx="5" fill="url(#g7-red)" filter="url(#fx-soft)"><animate attributeName="width" values="0;434" dur="1.2s" begin="0.2s" calcMode="spline" keyTimes="0;1" keySplines="0.35 0 0.1 1" fill="freeze"/></rect>
    <rect x="574" y="46" width="10" height="30" rx="0" fill="var(--c-red)" opacity="0"><animate attributeName="opacity" values="0;0.9;0.3;0.9" keyTimes="0;0.34;0.67;1" dur="2.4s" begin="1.4s" repeatCount="indefinite"/></rect>
    <rect x="150" y="94" width="0" height="30" rx="5" fill="url(#g7-blue)"><animate attributeName="width" values="0;49"  dur="0.7s" begin="0.55s" calcMode="spline" keyTimes="0;1" keySplines="0.35 0 0.1 1" fill="freeze"/></rect>
    <rect x="150" y="142" width="0" height="30" rx="5" fill="url(#g7-green)"><animate attributeName="width" values="0;67" dur="0.7s" begin="0.85s" calcMode="spline" keyTimes="0;1" keySplines="0.35 0 0.1 1" fill="freeze"/></rect>
    <g font-weight="700" font-size="12">
      <text x="590" y="65"  fill="var(--c-redink)" text-anchor="end">5.68s</text>
      <text x="209" y="113" fill="var(--c-blueink)">1.44ms</text>
      <text x="227" y="161" fill="var(--c-greenink)">2.12ms</text>
    </g>
    <g transform="translate(474,14)"><rect width="126" height="21" rx="7" fill="var(--c-red)" opacity="0.16"/><text x="63" y="14.5" text-anchor="middle" fill="var(--c-redink)" font-size="12" font-weight="700">~2,700x 느림</text></g>
  </svg>
  <figcaption>같은 클러스터인데 한 서비스만 5.68초. 다른 서비스의 지연이 낮다는 점을 근거로 <b>이 서비스의 클라이언트 경로</b>를 우선 조사했다. (로그 축이라 막대 길이가 아니라 눈금 위치로 읽는다.)</figcaption>
</figure>

같은 클러스터를 쓰는 다른 서비스의 P95는 1.44ms였다. 이 결과만으로 서버 측 원인을 완전히 배제할 수는 없지만, 조사 우선순위는 해당 서비스의 호출 경로로 좁힐 수 있었다.

## 5.68초는 어디서 잰 시간인가

Redis 호출 한 번의 시간은 서버가 명령을 실행한 시간만이 아니다. 보통 이렇게 쌓인다.

- 애플리케이션에서 호출 시작
- 커넥션 획득
- 클라이언트 큐에서 대기
- 네트워크 왕복
- Redis 명령 실행
- 응답 역직렬화

APM이 띄우는 "캐시 span"은 대개 호출 시작부터 응답까지 전체를 잰다. 그 안에는 클라이언트에서 줄 서서 기다린 시간도 들어간다.
"캐시 P95 5.68초"는 "Redis 서버가 5.68초 걸렸다"와 같은 말이 아니다. 그 시간이 여섯 칸 중 어디에 쌓였는지를 나눠야 한다.

<figure class="metric-fig">
  <div class="cap-head"><span class="cap-tag">what one Redis call actually measures</span><span class="cap-tag">6 stages</span></div>
  <svg viewBox="0 0 660 196" role="img" aria-label="Redis 호출 한 번의 시간은 여섯 단계로 나뉜다. 클라이언트 큐 대기 칸이 5.68초를 만들었고 실제 명령 실행은 0.2ms로 아주 작다" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="e3-red" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--c-red)"/><stop offset="1" stop-color="var(--c-red)" stop-opacity="0.7"/></linearGradient>
      <linearGradient id="e3-green" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--c-green)"/><stop offset="1" stop-color="var(--c-green)" stop-opacity="0.7"/></linearGradient>
      <linearGradient id="e3-slate" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--fig-baseline)"/><stop offset="1" stop-color="var(--fig-baseline)" stop-opacity="0.6"/></linearGradient>
    </defs>
    <g stroke="var(--fig-muted)" stroke-width="1" opacity="0.7">
      <line x1="44" y1="44" x2="44" y2="52"/><line x1="616" y1="44" x2="616" y2="52"/><line x1="44" y1="44" x2="616" y2="44"/>
    </g>
    <text x="330" y="34" text-anchor="middle" fill="var(--fig-muted)" font-size="11" letter-spacing="0.04em">APM 캐시 span = 여섯 단계 전체 (클라이언트 대기 포함)</text>
    <g stroke="var(--fig-surface)" stroke-width="2">
      <rect x="44"  y="60" width="0" height="46" rx="2" fill="url(#e3-slate)"><animate attributeName="width" values="0;34"  dur="0.4s" begin="0.1s"  fill="freeze"/></rect>
      <rect x="78"  y="60" width="0" height="46" rx="2" fill="url(#e3-slate)"><animate attributeName="width" values="0;40"  dur="0.4s" begin="0.25s" fill="freeze"/></rect>
      <rect x="118" y="60" width="0" height="46" rx="2" fill="url(#e3-red)" filter="url(#fx-soft)"><animate attributeName="width" values="0;380" dur="0.7s" begin="0.4s" fill="freeze"/></rect>
      <rect x="498" y="60" width="0" height="46" rx="2" fill="url(#e3-slate)"><animate attributeName="width" values="0;40"  dur="0.4s" begin="0.7s"  fill="freeze"/></rect>
      <rect x="538" y="60" width="0" height="46" rx="2" fill="url(#e3-green)"><animate attributeName="width" values="0;32"  dur="0.4s" begin="0.85s" fill="freeze"/></rect>
      <rect x="570" y="60" width="0" height="46" rx="2" fill="url(#e3-slate)"><animate attributeName="width" values="0;46"  dur="0.4s" begin="1.0s"  fill="freeze"/></rect>
    </g>
    <rect x="118" y="60" width="380" height="46" rx="2" fill="none" stroke="var(--c-red)" stroke-width="0" opacity="0.9">
      <animate attributeName="stroke-width" values="0;2;0;2" keyTimes="0;0.34;0.67;1" dur="2.6s" begin="1.4s" repeatCount="indefinite"/>
    </rect>
    <text x="308" y="130" text-anchor="middle" fill="var(--c-redink)" font-size="12" font-weight="700">클라이언트 큐 대기 = 5.68초가 쌓인 곳</text>
    <text x="330" y="154" text-anchor="middle" fill="var(--c-greenink)" font-size="11.5" font-weight="700">가장 작은 칸(명령 실행)이 실제 Redis 작업, 약 0.2ms</text>
    <text x="330" y="182" text-anchor="middle" fill="var(--fig-muted)" font-size="10.5">칸 순서: 앱 대기, 커넥션 획득, 클라이언트 큐 대기, 네트워크, 명령 실행, 역직렬화</text>
  </svg>
  <figcaption>APM "캐시 span"은 여섯 단계 전체를 잰다. <b>클라이언트 큐 대기</b>가 5.68초의 주요 원인인지 검토했다. 비교 기준인 정상 구간의 <b>명령 실행</b>은 0.2ms로 가장 작은 칸이었다.</figcaption>
</figure>

## 원인 후보를 좁힌 과정

| 단계 | 확인한 것 | 결과 |
|---|---|---|
| 같은 클러스터 타 서비스 P95 | 다른 서비스는 1.44ms | 클러스터 전반 장애의 우선순위를 낮춤 |
| 5.68초가 무엇의 시간인지 | APM 의존성 span(호출~응답, 클라이언트 대기 포함) | 서버 명령 시간만이 아님 |
| 시간대 패턴 | 3시간 주기 스파이크, 정오 정각 급증 | 주기 작업과 겹침 |
| 명령 종류 분해 | 1주 20.9M 요청 중 DEL 10.2M + HMSET 8.64M = 약 90%(건수 기준) | 실사용 읽기가 아니라 재동기화 |
| 클라이언트 커넥션 구조 | 공유 커넥션 1개로 직렬 전송 | 재동기화가 발송 읽기 앞을 막음 |

## 재적재와 발송 HGET이 공유한 커넥션

Lettuce(자바 Redis 클라이언트)는 기본적으로 커넥션 하나를 여러 스레드가 나눠 쓴다. 보통은 문제가 되지 않는다.
Redis 서버는 명령을 한 줄로(single-thread) 처리하고 Lettuce는 응답을 기다리지 않고 명령을 연달아 밀어 넣는다(pipelining). 커넥션 하나로도 처리량이 충분한 이유다.

문제는 그 커넥션 하나에 누가 얼마나 밀어 넣느냐다.

이 서비스의 스케줄러는 3시간마다 전 사용자 캐시를 `DEL`로 통째로 지우고 `HMSET`으로 다시 넣는다.
한 번에 33만 개 명령(DEL 약 18만 + HMSET 약 15만)이 그 공유 커넥션 한 줄에 쏟아진다. 1주 전체 Redis 요청의 90%가 이 재적재였다. 사용자 조회보다 정기 재적재에서 발생한 트래픽이 많았다.

그동안 발송 경로가 캐시를 읽으려고 `HGET`을 보내면 그 명령은 재적재 명령들 뒤에 줄을 선다.
앞의 수십만 개가 빠질 때까지 기다린다. 이것이 head-of-line blocking이다. 커넥션이 하나라 앞이 막히면 뒤는 예외 없이 기다리는 구조다.

다른 서비스와 달랐던 곳이 여기다. 서버 전체에 걸친 병목이라면 다른 서비스의 지연도 함께 확인할 필요가 있다. 다른 서비스는 1.44ms로 정상 범위였다.
이 결과와 커넥션 구조를 종합하면 해당 서비스의 공유 커넥션에서 발생하는 경합을 우선 검증할 필요가 있었다.

하나 더 있다. 재적재는 파이프라이닝 없이 사용자당 명령 네 개(delete 2 + add 1 + set 1)를 하나씩, 응답을 받고 다음을 보내는 식으로 처리한다.
파이프라이닝이 없으면 명령 N개는 곧 왕복(RTT) N번이다. 왕복이 0.2ms라도 수십만 번이면 수십 초다. 파이프라인으로 묶으면 왕복 한두 번으로 줄고 자릿수가 바뀐다.

## 공유 커넥션 경합을 의심한 근거

다음 네 가지 관측과 구조를 근거로 공유 커넥션 경합을 주요 원인 후보로 판단했다.

- **한 서비스만 느림.** 다른 서비스는 1.44ms. 서버 전반 장애의 조사 우선순위를 낮췄다.
- **명령의 90%가 재적재.** 1주 20.9M 요청 중 DEL 10.2M + HMSET 8.64M. 실사용이 아니라 안전망 트래픽이다.
- **스파이크 시각이 재적재 cron과 일치.** 3시간 주기, 정오 정각 급증.
- **커넥션이 하나.** 공유 커넥션이라 앞이 막히면 뒤가 대기한다.

공유 커넥션 구조는 재적재가 발송 HGET의 대기를 늘릴 수 있음을 설명한다. 다만 5.68초 중 대기 시간의 비중을 확정하려면 명령 실행 시간과 클라이언트 대기 시간을 분리해 측정해야 한다.

## 무엇이 바뀌나

공유 커넥션 경합을 줄이기 위해 다음 조치를 검토했다.

- **발송 경로와 재적재 경로의 커넥션 분리.** 발송 HGET이 재적재 뒤에 서지 않게 전용 커넥션(또는 풀)을 쓴다. 공유 커넥션에서 발생하는 head-of-line blocking을 줄이기 위한 조치다.
- **전량 DEL+HMSET에서 증분 갱신으로.** 바뀐 것만 갱신하면 33만 개 명령이 애초에 생기지 않는다.
- **resetPushList 파이프라이닝.** 사용자당 네 왕복을 한 배치로 묶어 왕복 수를 자릿수로 줄인다.
- **재적재 cron을 발송 피크(정오)와 분리.** 겹침만 없애는 완화책이다. 앞선 구조 변경 전에도 적용할 수 있는 임시 조치다.
- **commandTimeout 60초에서 10초로 + 예외 시 DB 폴백.** 캐시 응답이 지연되면 대기를 종료하고 DB를 조회한다. timeout만 줄이면 빨리 실패할 뿐이라 폴백이 있어야 요청이 응답으로 끝난다.

다시 잰 결과는 이렇다.
정상 상태 캐시 조회는 원래 0.2ms대(HGET 약 100~200µs)다. 5.68초는 그 2만 배가 넘는다. 커넥션 분리와 cron 분리로 정오 발송과 재적재의 충돌은 사라졌다. 증분 갱신은 구조 변경이라 후속으로 남았고, 이것이 없는 한 33만 개 명령은 여전히 어딘가에서 돈다.

수정 후 P95 수치는 이 글에서 제시하지 않는다. 그래서 지연 감소 폭을 수치로 확정할 수는 없다.
커넥션을 분리하면 발송 HGET과 재적재가 같은 커넥션에서 경합하는 상황을 줄일 수 있다. 실제로 정상 기준선(0.2ms)에 가까워졌는지는 재측정이 필요하다. 전량 재적재 구조가 남아 있으므로 재적재 커넥션의 스파이크도 별도로 확인해야 한다.

## 이 지표로도 알 수 없는 것

- P95 span 하나로는 서버 명령 시간과 클라이언트 대기 시간을 나눌 수 없다. 둘을 갈라 보려면 Redis command latency와 커넥션 대기(pending)를 따로 계측해야 한다. 두 구간을 따로 계측해야 전체 지연 중 서버 실행과 클라이언트 대기의 비중을 확인할 수 있다.

> 캐시가 느리다는 지표는, 캐시 서버가 느리다는 뜻이 아닐 수 있다. 그 시간이 어디서 쌓였는지부터 나눠야 한다.

---

세 편을 관통하는 문장은 하나다.
지표의 값이 이상하면 시스템을 의심하기 전에, 그 값이 무엇을 세고 어디서부터 어디까지 재는지부터 확인한다.
성공의 정의, lag의 경계, 캐시 P95의 계층. 셋 다 값이 아니라 정의를 읽는 이야기다.
