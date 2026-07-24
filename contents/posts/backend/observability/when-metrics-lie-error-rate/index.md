---
title: "계기가 거짓말할 때 : 에러율 0%인데 181건이 실패했습니다"
date: 2026-02-24
update: 2026-07-24
series: "계기가 거짓말할 때"
tags:
- 관측성
- 모니터링
- 에러율
- 알림
- Observability
- technical-writing
---

> **TL;DR**
>
> 이 사건에서 중요한 건 벤더도 네트워크도 아니었다. "성공"이라는 단어가 무엇을 세는지였다.
>
> 배치 로그는 성공 634건을 찍었지만 실제 도착은 453건이다. HTTP 200을 성공으로 셌고, 벤더는 200 안에 실패 코드를 담아 돌려줬다.
> 성공 판정이 `HTTP 200 && code 1000`으로 좁혀지면 삼켜지던 181건이 실패로 남아 재발송 대상이 된다. 같은 배치의 성공률은 로그 99.7%에서 실측 71%로 내려온다.

---

<style>
.metric-fig,.fig-defs{
  --fig-surface:#ffffff;--fig-ink:#0f172a;--fig-ink2:#334155;--fig-muted:#94a3b8;
  --fig-grid:#eef2f7;--fig-baseline:#d0d7e2;--fig-hair:#e6eaf1;
  --c-green:#16a34a;--c-greenink:#15803d;--c-red:#ef4444;--c-redink:#b91c1c;
}
@media (prefers-color-scheme: dark){
  .metric-fig,.fig-defs{
    --fig-surface:#121317;--fig-ink:#f2f5fa;--fig-ink2:#cbd5e1;--fig-muted:#697588;
    --fig-grid:#20242d;--fig-baseline:#2d323c;--fig-hair:#252a33;
    --c-green:#34d399;--c-greenink:#6ee7b7;--c-red:#f87171;--c-redink:#fca5a5;
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
@media (prefers-reduced-motion: reduce){.metric-fig svg animate,.metric-fig svg animateMotion{display:none}}
</style>

<svg class="fig-defs" width="0" height="0" aria-hidden="true" focusable="false" style="position:absolute;width:0;height:0">
  <defs>
    <filter id="fx-glow" x="-60%" y="-60%" width="220%" height="220%">
      <feGaussianBlur stdDeviation="3" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
</svg>

## 문의 한 건이 로그 99.7%와 부딪혔다

시작은 학부모 한 명의 문의다. 이번 달 리포트가 오지 않았다는 내용이다.

로그는 반대편을 가리키고 있었다. 정오 배치 대상 636건 중 2건만 발송 전에 실패로 남고 634건이 전송 성공으로 기록돼 있다. 성공률 99.7%.
한쪽은 분명히 못 받았고 한쪽은 분명히 성공이라고 적혀 있다. 둘 중 하나는 다른 것을 세고 있다는 뜻이다.

## 실패는 어디서 성공으로 바뀌었나

경로를 따라가면 실패가 성공으로 바뀌는 지점이 나온다.

발송 코드는 응답 상태를 확인하기 전에 성공을 먼저 기록한다. 벤더는 HTTP 200을 돌려주면서 본문에 실패 코드를 담는다. 비200과 예외는 catch가 삼키고 null을 반환한다.
이 구조에서 실패는 에러율의 분자에서 빠진다. 분모는 그대로다. 에러율은 실제보다 낮게, 성공률은 높게 찍힌다.

여기서 서로 다른 세 가지가 한 단어에 섞여 있었다.
전송 성공과 업무 성공은 다르다. HTTP 200은 메시지가 벤더에 닿았다는 뜻이지 발송이 됐다는 뜻이 아니다.
예외가 안 난 것과 처리에 성공한 것도 다르다. 코드가 예외 없이 끝나도 그 안에서 실패를 조용히 넘겼을 수 있다.
그리고 catch가 삼킨 실패는 세 번째 부류다. 어디에도 세어지지 않는다.

<figure class="metric-fig">
  <div class="cap-head"><span class="cap-tag">"success" log = delivered + swallowed</span><span class="cap-tag">noon batch · 636</span></div>
  <svg viewBox="0 0 640 220" role="img" aria-label="로그 성공 634건이 실제 도착 453과 삼켜진 181로 갈라지고, 왼쪽 634 블록 높이가 오른쪽 두 칸의 합과 같다" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="e1-log" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--fig-baseline)"/><stop offset="1" stop-color="var(--fig-baseline)" stop-opacity="0.5"/></linearGradient>
      <linearGradient id="e1-good" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--c-green)"/><stop offset="1" stop-color="var(--c-green)" stop-opacity="0.55"/></linearGradient>
      <pattern id="e1-hatch" width="7" height="7" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
        <rect width="7" height="7" fill="var(--c-red)"/><line x1="0" y1="0" x2="0" y2="7" stroke="var(--fig-surface)" stroke-width="2.4" opacity="0.55"/>
      </pattern>
    </defs>
    <line x1="60" y1="186" x2="584" y2="186" stroke="var(--fig-baseline)" stroke-width="1.4"/>
    <rect x="64" y="46" width="120" height="140" rx="7" fill="url(#e1-log)"/>
    <path d="M184 136 C 300 136, 336 136, 452 136" fill="none" stroke="var(--c-green)" stroke-width="1.6" opacity="0.5" stroke-dasharray="4 4"/>
    <path d="M184 66 C 300 66, 336 66, 452 66" fill="none" stroke="var(--c-red)" stroke-width="1.8" stroke-dasharray="5 4">
      <animate attributeName="stroke-dashoffset" values="18;0" dur="1.1s" repeatCount="indefinite"/>
    </path>
    <rect x="452" y="186" width="120" rx="7" fill="url(#e1-good)">
      <animate attributeName="height" values="0;100;100;0" keyTimes="0;0.35;0.9;1" dur="6.5s" calcMode="spline" keySplines="0.4 0 0.15 1;0 0 1 1;0.4 0 0.15 1" repeatCount="indefinite"/>
      <animate attributeName="y" values="186;86;86;186" keyTimes="0;0.35;0.9;1" dur="6.5s" calcMode="spline" keySplines="0.4 0 0.15 1;0 0 1 1;0.4 0 0.15 1" repeatCount="indefinite"/>
    </rect>
    <rect x="452" y="86" width="120" rx="7" fill="url(#e1-hatch)" filter="url(#fx-glow)">
      <animate attributeName="height" values="0;40;40;0" keyTimes="0;0.55;0.9;1" dur="6.5s" calcMode="spline" keySplines="0.4 0 0.15 1;0 0 1 1;0.4 0 0.15 1" repeatCount="indefinite"/>
      <animate attributeName="y" values="86;46;46;86" keyTimes="0;0.55;0.9;1" dur="6.5s" calcMode="spline" keySplines="0.4 0 0.15 1;0 0 1 1;0.4 0 0.15 1" repeatCount="indefinite"/>
    </rect>
    <text x="124" y="122" text-anchor="middle" fill="var(--fig-ink)" font-size="26" font-weight="800" letter-spacing="-0.02em">634</text>
    <text x="124" y="142" text-anchor="middle" fill="var(--fig-muted)" font-size="10.5" letter-spacing="0.06em">LOG "SUCCESS"</text>
    <g font-size="12">
      <text x="124" y="36" text-anchor="middle" fill="var(--fig-muted)" font-weight="600">로그가 말하는 성공</text>
      <text x="512" y="36" text-anchor="middle" fill="var(--fig-muted)" font-weight="600">실제 도착</text>
      <text x="578" y="140" fill="var(--c-greenink)" font-weight="700">453 · 71%</text>
      <text x="578" y="70" fill="var(--c-redink)" font-weight="700">181 · 29% 은폐</text>
    </g>
  </svg>
  <figcaption>로그의 "성공 634"는 실제 도착 453과 삼켜진 181로 나뉜다. 그 181 중 180이 빈 수신번호였다. 왼쪽 블록과 오른쪽 두 칸의 높이가 같다: <b>634 = 453 + 181</b>.</figcaption>
</figure>

## 후보는 이 순서로 지워졌다

첫 가설은 벤더 누락이었다. 발송이 성공으로 찍혀 있으니 문제는 바깥이라는 가설이다.
확인은 로그를 믿는 대신 로그가 성공이라 부른 634건을 실제 도착과 대조하는 데서 시작한다.

| 단계 | 확인한 것 | 지운 후보 |
|---|---|---|
| 성공 로그 vs 실제 도착 대조 | 벤더 성공 코드(code 1000)는 453건뿐. 181건이 갈라졌다 | "로그 = 도착"이라는 가정 |
| HTTP status와 본문 코드 분리 | 181건 모두 HTTP는 200, 본문은 실패 | 네트워크·타임아웃 실패 |
| 실패 응답의 공통 필드 | 180건이 같은 응답. `{code 2000, "The to field is required"}` | 무작위 벤더 오류 |
| 빈 번호의 출처 역추적 | 회원 서비스가 빈 문자열로 저장. `== null` 가드가 통과시킴 | 발송 로직 자체의 버그 |

HTTP 연결은 됐으니 네트워크가 아니다. 실패 응답이 한 종류로 반복되니 무작위 벤더 오류가 아니다. 번호가 저장 시점부터 비어 있었으니 발송 로직의 버그도 아니다.
벤더 탓이라는 첫 가설은 마지막 줄에서 지워진다.

## 숫자가 닫힌다

로그 "성공 634"는 실제 성공 453과 삼켜진 181로 나뉜다. 삼켜진 181건 중 180건은 빈 수신번호(code 2000)다. 나머지 1건은 다른 유효성 오류로, 이 조사에서 원인을 특정하지 못했다.

빈 번호의 뿌리는 회원 서비스다. 숫자 없는 번호가 `null`이 아니라 빈 문자열로 저장되고, 다운스트림의 `== null` 가드는 빈 문자열을 통과시킨다.
이렇게 저장된 사용자가 회원 전체의 약 12%다. 그들의 발송 요청은 아무 데서도 걸러지지 않고 파이프라인 끝의 벤더까지 간다. 벤더만이 유일하게 거절하는데 그 거절이 catch에 삼켜져 있었다.

## 성공의 정의가 바뀌면 무엇이 달라지나

200이어도 벤더 실패 코드면 실패다. 이 판정이 차단하는 것은 실패가 성공 집계로 새는 경로다.

```java
// 바뀐 성공 판정
boolean ok = res.status() == 200 && res.body().code() == 1000;
if (!ok) recordFailure(res);   // 실패도 이력에 남긴다 (재발송 대상)
```

- 비2xx와 벤더 실패 코드는 실패 이력으로 남아 재발송 대상이 된다.
- 저장 단계가 빈 문자열과 공백 번호를 거른다.
- 실패는 사유별로 집계돼 Slack으로 온다.

같은 배치를 새 정의로 다시 재면 성공률은 로그 기준 99.7%(634/636)에서 실측 71%(453/636)로 내려온다. 이 배치의 미도달 180건은 대상 636건의 약 28%다. (빈 번호 사용자 자체는 회원 전체의 약 12%)
숫자가 나빠진 게 아니다. 처음부터 이 숫자였다. 계기의 눈금이 바뀌었을 뿐이다.

에러율은 실패를 세는 지표가 아니라 실패라고 정의된 것을 세는 지표다. 정의 밖의 실패는 0% 안에 있다.

## 이 지표로도 알 수 없는 것

- code 1000도 벤더가 접수했다는 뜻이지 사용자 단말 도착까지 보장하지 않는다. 접수 성공과 최종 도착은 여전히 다른 지표다.
- 이미 삼켜져 유실된 과거분은 이력이 없어 복구되지 않는다. 관측이 서기 전의 데이터는 돌아오지 않는다.
- 삼켜진 181건 중 1건의 원인은 특정되지 않았다.

> 에러율을 보기 전에, 에러가 지표에 남는지부터 확인한다.

다음 편은 Kafka lag이다. lag 0이 밀린 게 없다는 뜻인지, 봉투 계산 5시간이 실측 12초가 된 이야기다.
