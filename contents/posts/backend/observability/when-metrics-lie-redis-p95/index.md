---
title: "계기가 거짓말할 때 ③ Redis P95 5.68초는 어디서 잰 시간일까"
date: 2026-02-26
update: 2026-02-26
series: "계기가 거짓말할 때"
tags:
- 관측성
- 모니터링
- Redis
- 캐시
- Observability
- technical-writing
---

> **TL;DR**
>
> 알림 서비스의 캐시 P95가 5.68초였습니다. 같은 DB는 2.12ms. 처음엔 Redis 서버가 아프다고 봤어요.
> 그런데 같은 클러스터의 다른 서비스는 1.44ms로 멀쩡했습니다.
>
> 5.68초는 Redis 명령 실행 시간이 아니라, 공유 커넥션 앞에서 기다린 시간을 포함한 값이었어요.
> "캐시가 느리다"와 "캐시를 호출한 쪽이 기다렸다"는 다른 이야기입니다.

---

<style>
.metric-fig,.fig-defs{
  --fig-surface:#ffffff;--fig-ink:#0f172a;--fig-ink2:#334155;--fig-muted:#94a3b8;
  --fig-grid:#eef2f7;--fig-baseline:#d0d7e2;--fig-hair:#e6eaf1;
  --c-blue:#2f6fed;--c-blueink:#1d4ed8;--c-green:#16a34a;--c-greenink:#15803d;
  --c-red:#ef4444;--c-redink:#b91c1c;
}
@media (prefers-color-scheme: dark){
  .metric-fig,.fig-defs{
    --fig-surface:#121317;--fig-ink:#f2f5fa;--fig-ink2:#cbd5e1;--fig-muted:#697588;
    --fig-grid:#20242d;--fig-baseline:#2d323c;--fig-hair:#252a33;
    --c-blue:#5b9bff;--c-blueink:#93c5fd;--c-green:#34d399;--c-greenink:#6ee7b7;
    --c-red:#f87171;--c-redink:#fca5a5;
  }
}
.metric-fig{
  margin:2.4em 0;border:1px solid var(--fig-hair);border-radius:18px;background:var(--fig-surface);
  padding:20px 22px 12px;overflow:hidden;
  box-shadow:0 1px 2px rgba(2,6,23,.05),0 14px 40px rgba(2,6,23,.09);
}
@media (prefers-color-scheme: dark){.metric-fig{box-shadow:0 1px 2px rgba(0,0,0,.4),0 18px 46px rgba(0,0,0,.5)}}
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

## 캐시 P95라는 지표는 무엇을 재고 있었나

Redis 호출 한 번의 시간은, 서버가 명령을 실행한 시간만이 아닙니다.  
보통 이렇게 쌓여요.

- 애플리케이션에서 호출을 시작
- 커넥션 획득
- 클라이언트 큐에서 대기
- 네트워크 왕복
- Redis 명령 실행
- 응답 역직렬화

APM이 뜨는 "캐시 span"은 대개 **호출 시작부터 응답까지 전체**를 잽니다. 그 안에는 클라이언트에서 줄 서서 기다린 시간도 들어가요.  
그래서 "캐시 P95 5.68초"는 "Redis 서버가 5.68초 걸렸다"와 같은 말이 아닙니다. 어디서 그 시간이 쌓였는지를 나눠 봐야 해요.

<figure class="metric-fig">
  <div class="cap-head"><span class="cap-tag">what one Redis call actually measures</span><span class="cap-tag">span = ① ~ ⑥</span></div>
  <svg viewBox="0 0 660 196" role="img" aria-label="Redis 호출 한 번의 시간은 여섯 단계로 나뉜다. 클라이언트 큐 대기 칸이 5.68초를 만들었고 실제 명령 실행은 0.2ms로 아주 작다" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="e3-red" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--c-red)"/><stop offset="1" stop-color="var(--c-red)" stop-opacity="0.7"/></linearGradient>
      <linearGradient id="e3-green" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--c-green)"/><stop offset="1" stop-color="var(--c-green)" stop-opacity="0.7"/></linearGradient>
      <linearGradient id="e3-slate" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--fig-baseline)"/><stop offset="1" stop-color="var(--fig-baseline)" stop-opacity="0.6"/></linearGradient>
    </defs>
    <g stroke="var(--fig-muted)" stroke-width="1" opacity="0.7">
      <line x1="44" y1="44" x2="44" y2="52"/><line x1="616" y1="44" x2="616" y2="52"/><line x1="44" y1="44" x2="616" y2="44"/>
    </g>
    <text x="330" y="34" text-anchor="middle" fill="var(--fig-muted)" font-size="11" letter-spacing="0.04em">APM 캐시 span = ① ~ ⑥ 전체 (클라이언트 대기 포함)</text>
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
    <g font-size="12" font-weight="700" fill="var(--fig-ink2)" text-anchor="middle">
      <text x="61" y="128">①</text><text x="98" y="128">②</text><text x="308" y="128" fill="var(--c-redink)">③</text>
      <text x="518" y="128">④</text><text x="554" y="128" fill="var(--c-greenink)">⑤</text><text x="593" y="128">⑥</text>
    </g>
    <g font-size="12" font-weight="700">
      <text x="308" y="152" text-anchor="middle" fill="var(--c-redink)">③ 클라이언트 큐 대기 = 5.68초가 쌓인 곳</text>
      <text x="308" y="170" text-anchor="middle" fill="var(--c-greenink)">⑤ 실제 Redis 명령 = ~0.2ms</text>
    </g>
    <text x="330" y="190" text-anchor="middle" fill="var(--fig-muted)" font-size="10.5">① 앱 대기 · ② 커넥션 획득 · ④ 네트워크 · ⑥ 역직렬화</text>
  </svg>
  <figcaption>APM "캐시 span"은 여섯 단계 전체를 잰다. 5.68초는 <b>③ 클라이언트 큐 대기</b>에서 쌓였다. 우리가 "Redis가 느리다"고 상상한 <b>⑤ 명령 실행</b>은 0.2ms로 가장 작은 칸이었다.</figcaption>
</figure>

## 그날 관측된 것

사실만 적습니다.

- 알림 서비스 캐시 P95: 5.68초.
- 같은 DB P95: 2.12ms.
- 정상 구간의 캐시 조회 기준선: 0.2ms대(HGET 약 100~200µs).

캐시가 DB보다 2,700배 느린 값으로 찍혔습니다.

## 처음엔 Redis 서버가 아프다고 봤다

첫 가설은 "Redis 클러스터의 성능 저하"였어요. 캐시가 이 정도로 느리면 서버가 문제라고 본 거죠.

이건 가설입니다. 아직 5.68초가 어디서 만들어진 시간인지 모릅니다.

## 후보를 하나씩 지운 순서

| 단계 | 확인한 것 | 결과 |
|---|---|---|
| 같은 클러스터 타 서비스 P95 | 다른 서비스는 1.44ms | 클러스터 전반 장애의 우선순위를 낮춤 |
| 5.68초가 무엇의 시간인지 | APM 의존성 span(호출~응답, 클라이언트 대기 포함) | 서버 명령 시간만이 아님 |
| 시간대 패턴 | 3시간 주기 스파이크, 정오 정각 급증 | 주기 작업과 겹침 |
| 명령 종류 분해 | 1주 20.9M 요청 중 DEL 10.2M + HMSET 8.64M = 약 90%(건수 기준) | 실사용 읽기가 아니라 재동기화 |
| 클라이언트 커넥션 구조 | 공유 커넥션 1개로 직렬 전송 | 재동기화가 발송 읽기 앞을 막음 |

<figure class="metric-fig">
  <div class="cap-head"><span class="cap-tag">p95 latency · same cache cluster</span><span class="cap-tag">log scale</span></div>
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
  <figcaption>같은 클러스터인데 한 서비스만 5.68초. 클러스터 전반 장애라면 셋 다 느려야 한다. 그래서 서버 전반보다 <b>이 서비스의 클라이언트 경로</b>를 먼저 팠다.</figcaption>
</figure>

첫 줄이 방향을 바꿨습니다.  
같은 Redis를 쓰는 다른 서비스가 1.44ms라면, 클러스터 전체가 아픈 그림은 아니에요. 그래서 서버 전반 장애를 원인 후보에서 뒤로 미루고, 이 서비스만 다른 점을 찾기 시작했습니다.

## 무엇으로 확정했나

여기까지는 정황이 모입니다.

- 5.68초는 Redis 서버의 명령 실행 시간이 아니라, 클라이언트 대기까지 포함한 span이었습니다.
- 3시간 주기로 도는 전체 재동기화가 `DEL`과 `HMSET`으로 요청 건수의 약 90%를 차지했어요. 실사용 읽기가 아니라 안전망의 재적재였습니다.
- 이 서비스는 공유 커넥션 하나로 명령을 직렬 전송합니다. 재동기화가 수십만 명령을 그 커넥션에 밀어 넣는 동안, 발송 경로의 읽기는 뒤에 줄을 섰어요.

세 정황이 한 방향을 가리킵니다.  
타 서비스는 멀쩡했고(서버 아님), 스파이크 시각이 재동기화와 겹쳤고, 커넥션이 하나라 직렬이었습니다. 그래서 "캐시가 느리다"가 아니라 "발송 읽기가 재동기화 뒤에서 기다렸다"로 좁혔어요.

## 무엇을 바꿨나

- 재동기화 시각을 정오 발송 피크와 분리했습니다.
- 전체 삭제·재적재를 증분 갱신으로 바꾸는 방향을 잡았어요.
- 발송 경로와 동기화 경로의 커넥션을 분리했습니다.

## 고치고 다시 재보니

정직하게 씁니다.

- 시각을 옮기자 정오 발송과 재동기화의 충돌은 사라졌습니다.
- 다만 전량 재적재 구조 자체는 남아 있어요. **시각 이동은 완화책이지 구조적 해결이 아닙니다.**
- 증분 갱신 전환은 후속 과제로 남겼습니다.

수정 후 캐시 P95의 정확한 새 값은 이 글에서 확정해 말하지 않습니다. 충돌 제거는 확인했어요. 다만 "5.68초 → 몇 ms"까지 닫으려면 재측정 구간을 하나 더 잡아야 합니다. 모르는 숫자를 지어내지 않겠습니다.

## 이 지표로는 알 수 없는 것

- P95 span 하나로는 서버 명령 시간과 클라이언트 대기 시간을 분리하지 못합니다. 둘을 나누려면 command latency와 connection wait를 따로 계측해야 해요.
- 재동기화 중 대기 명령이 실제로 얼마나 쌓였는지는 직접 지표로 확인하지 못했습니다. 단일 공유 커넥션 구조 + 시간대 일치 + 타 서비스 정상이라는 정황으로 좁혔을 뿐이에요.

> 캐시가 느리다는 지표는, 캐시 서버가 느리다는 뜻이 아닐 수 있다. 그 시간이 어디서 쌓였는지부터 나눠야 한다.

---

세 편을 관통하는 문장은 하나입니다.  
지표의 값이 이상하면 시스템을 의심하기 전에, 그 값이 무엇을 세고 어디서부터 어디까지 재는지부터 확인한다.  
성공의 정의, lag의 경계, 캐시 P95의 계층. 셋 다 값이 아니라 정의를 읽는 이야기였어요.
