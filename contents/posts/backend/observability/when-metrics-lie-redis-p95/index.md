---
title: "Redis P95 5.68초는 어디서 잰 시간일까"
description: "알림 서비스에서 잰 캐시 P95는 5.68초였다. 공유 커넥션에서 기다린 시간도 여기에 포함될까? 타이머를 어디서 시작하는지 코드를 열어 봤다."
date: 2026-02-26
update: 2026-11-15
tags:
- 관측성
- 모니터링
- Redis
- 캐시
- Observability
- technical-writing
---

알림 서비스에서 평소 HGET 한 번은 약 100~200µs가 걸렸다. 이번에 대시보드에 찍힌 캐시 조회 P95는 5.68초였다. 같은 시간대, 같은 서비스의 DB 조회 P95는 2.12ms였다.

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

![먼 기록 보관실까지 다녀온 직원의 스톱워치는 2.12ms이고, 책상 옆 선반 앞에 서 있는 직원의 스톱워치는 아직 5.68s다.](./scene-near-shelf-slower.webp)

DB까지 가기 싫어서 붙인 캐시인데, 숫자대로라면 DB에 가는 쪽이 약 2,700배 빠르다.

처음에는 Redis 클러스터가 느려졌다고 의심했다. 클러스터 전체가 느려졌다면 다른 서비스에도 흔적이 있을 것 같았다. 같은 클러스터를 쓰는 서비스의 P95를 나란히 놓았다.

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

이 서비스의 캐시 타이머는 호출을 시작할 때 켜지고 응답을 받으면 멈춘다. 그 사이에 클라이언트가 차례를 기다렸다면 그 시간도 포함된다.
"캐시 P95 5.68초"는 "Redis 서버가 5.68초 걸렸다"와 같은 말이 아니다. 그 시간이 여섯 칸 중 어디에 쌓였는지를 나눠야 한다.

<figure class="metric-fig">
  <div class="cap-head"><span class="cap-tag">what one Redis call actually measures</span><span class="cap-tag">6 stages</span></div>
  <svg viewBox="0 0 660 172" role="img" aria-label="캐시 호출 시작부터 응답까지 잰 시간의 P95는 5.68초였다. 여섯 칸은 호출 경로를 나타내고 점선은 지연을 의심한 클라이언트 큐다. 각 칸의 소요 시간은 측정하지 않았다." xmlns="http://www.w3.org/2000/svg">
    <g stroke="var(--fig-muted)" stroke-width="1" opacity="0.7">
      <line x1="44" y1="44" x2="44" y2="52"/><line x1="616" y1="44" x2="616" y2="52"/><line x1="44" y1="44" x2="616" y2="44"/>
    </g>
    <text x="330" y="34" text-anchor="middle" fill="var(--fig-muted)" font-size="11" letter-spacing="0.04em">호출 시작부터 응답까지 측정한 P95 5.68초</text>
    <g fill="var(--fig-grid)" stroke="var(--fig-baseline)" stroke-width="1">
      <rect x="44"  y="60" width="92" height="46" rx="4"/>
      <rect x="140" y="60" width="92" height="46" rx="4"/>
      <rect x="236" y="60" width="92" height="46" rx="4" stroke="var(--c-red)" stroke-width="1.6" stroke-dasharray="5 4"/>
      <rect x="332" y="60" width="92" height="46" rx="4"/>
      <rect x="428" y="60" width="92" height="46" rx="4" stroke="var(--c-green)" stroke-width="1.6"/>
      <rect x="524" y="60" width="92" height="46" rx="4"/>
    </g>
    <g font-size="11" font-weight="600" fill="var(--fig-ink2)" text-anchor="middle">
      <text x="90"  y="87">호출 시작</text>
      <text x="186" y="87">커넥션 획득</text>
      <text x="282" y="87" fill="var(--c-redink)">큐 대기</text>
      <text x="378" y="87">네트워크</text>
      <text x="474" y="87" fill="var(--c-greenink)">명령 실행</text>
      <text x="570" y="87">역직렬화</text>
    </g>
    <text x="330" y="134" text-anchor="middle" fill="var(--c-redink)" font-size="11.5" font-weight="700">점선 칸: 공유 커넥션 구조로 의심한 대기, 구간별 실측은 없다</text>
    <text x="330" y="158" text-anchor="middle" fill="var(--c-greenink)" font-size="11.5" font-weight="700">평소 HGET 조회는 0.2ms대. 서버 실행 시간은 따로 재지 않았다.</text>
  </svg>
  <figcaption>같은 요청의 구간별 시간은 남아 있지 않아 칸 너비를 모두 같게 그렸다.</figcaption>
</figure>

## 원인 후보를 좁힌 과정

| 단계 | 확인한 것 | 결과 |
|---|---|---|
| 같은 클러스터 타 서비스 P95 | 다른 서비스는 1.44ms | 클러스터 전반 장애의 우선순위를 낮춤 |
| 5.68초가 무엇의 시간인지 | APM 의존성 span(호출~응답, 클라이언트 대기 포함) | 서버 명령 시간만이 아님 |
| 시간대 패턴 | 3시간 주기 스파이크, 정오 정각 급증 | 주기 작업과 겹침 |
| 명령 종류 분해 | 1주 20.9M 요청 중 DEL 10.2M + HMSET 8.64M = 약 90%(건수 기준) | 실사용 읽기가 아니라 재동기화 |
| 클라이언트 커넥션 구조 | 공유 커넥션 1개로 직렬 전송 | 재동기화가 발송 읽기 앞을 막을 수 있는 구조 |

## 재적재와 발송 HGET이 공유한 커넥션

Lettuce(자바 Redis 클라이언트)는 기본적으로 커넥션 하나를 여러 스레드가 나눠 쓴다. 보통은 문제가 되지 않는다.
Redis 서버는 명령을 한 줄로(single-thread) 처리하고 Lettuce는 응답을 기다리지 않고 명령을 연달아 밀어 넣는다(pipelining). 커넥션 하나로도 처리량이 충분한 이유다.

문제는 그 커넥션 하나에 누가 얼마나 밀어 넣느냐다.

이 서비스의 스케줄러는 3시간마다 전 사용자 캐시를 `DEL`로 통째로 지우고 `HMSET`으로 다시 넣는다.
한 번에 33만 개 명령(DEL 약 18만 + HMSET 약 15만)이 그 공유 커넥션 한 줄에 쏟아진다. 1주 전체 Redis 요청의 90%가 이 재적재였다. 사용자 조회보다 정기 재적재에서 발생한 트래픽이 많았다.

재적재 중 발송 경로에서 `HGET`을 보내면 같은 커넥션에서 먼저 보낸 명령의 응답을 기다릴 수 있다. 같은 클러스터를 쓰는 다른 서비스의 P95는 1.44ms였다. 그래서 이 서비스에서만 두 작업이 겹치는 시간이 있는지부터 살폈다.

하나 더 있다. 재적재는 파이프라이닝 없이 사용자당 명령 네 개(delete 2 + add 1 + set 1)를 하나씩, 응답을 받고 다음을 보내는 식으로 처리한다.
응답을 기다려 다음 명령을 보내면 명령 수만큼 왕복한다. 33만 번을 차례로 호출하고 매번 0.2ms가 걸린다고 가정하면 66초다. 파이프라이닝하면 앞 명령의 응답이 오기 전에 다음 명령을 보낼 수 있다.

## 공유 커넥션 경합을 의심한 근거

스파이크는 재적재 cron과 같은 세 시간 간격이었고, 정오에는 발송까지 겹쳤다. 같은 커넥션에서 발송 HGET이 앞선 재적재 명령을 기다렸을 만한 시간대다. 5.68초는 이 시간대에 모은 호출의 P95다. 느린 요청의 구간별 시간은 남아 있지 않아서 큐에서 몇 초를 기다렸는지는 알 수 없었다.

## 무엇이 바뀌나

공유 커넥션 경합을 줄이기 위해 다음 조치를 검토했다.

- **발송 경로와 재적재 경로의 커넥션 분리.** 발송 HGET이 재적재 뒤에 서지 않게 전용 커넥션(또는 풀)을 쓴다. 공유 커넥션에서 발생하는 head-of-line blocking을 줄이기 위한 조치다.
- **전량 DEL+HMSET에서 증분 갱신으로.** 바뀐 것만 갱신하면 33만 개 명령이 애초에 생기지 않는다.
- **resetPushList 파이프라이닝.** 사용자당 네 왕복을 한 배치로 묶어 왕복 수를 자릿수로 줄인다.
- **재적재 cron을 발송 피크(정오)와 분리.** 겹침만 없애는 완화책이다. 앞선 구조 변경 전에도 적용할 수 있는 임시 조치다.
- **commandTimeout 60초에서 10초로 + 예외 시 DB 폴백.** 캐시 응답이 지연되면 대기를 종료하고 DB를 조회한다. timeout만 줄이면 빨리 실패할 뿐이라 폴백이 있어야 요청이 응답으로 끝난다.

발송과 재적재가 쓰는 커넥션을 나누고 cron 시각을 옮겼다. 정오 발송 때 두 작업이 겹치는 일은 사라졌다. 증분 갱신은 아직 적용하지 않아 재적재 때마다 명령 33만 개는 여전히 실행한다.

수정 후 같은 조건에서 비교할 P95 값은 이 글에 없다. 캐시 조회 P95가 얼마나 내려갔는지는 다시 재야 한다. 재적재 자체는 남아 있으므로 그 커넥션에서 발생하는 지연도 별도로 볼 수 있다.

## HGET 한 건의 대기는 어디에 남을까

- P95 span 하나로는 서버 명령 시간과 클라이언트 대기 시간을 나눌 수 없다. 둘을 갈라 보려면 Redis command latency와 커넥션 대기(pending)를 따로 계측해야 한다. 특정 요청이 얼마나 기다렸는지 확인하려면 해당 명령을 큐에 넣은 시각과 실제로 보낸 시각을 맞춰 봐야 한다.
- 서버 쪽 기록으로는 [Redis SLOWLOG](https://redis.io/docs/latest/commands/slowlog-get/)가 있다. 다만 SLOWLOG에 남는 건 서버가 명령을 실행한 시간뿐이고, 클라이언트와 주고받는 I/O와 응답 전송은 빠진다. 스파이크 시각에 기준(`slowlog-log-slower-than`)을 넘은 명령이 없었다면 서버 실행 쪽 가능성을 낮출 수는 있다. 큐에서 몇 초를 기다렸는지는 SLOWLOG로 알 수 없다.
