---
title: "계기가 거짓말할 때 ① 에러율 0%인데 181건이 실패했습니다"
date: 2026-07-24
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
> 배치는 "성공 634건"을 찍었는데 실제 도착은 453건이었습니다.
> HTTP 200을 성공으로 셌기 때문이에요. 벤더는 200을 주면서 본문에 실패 코드를 담아 돌려줬습니다.
>
> 성공을 `HTTP 200 && code 1000`으로 다시 정의하자, 그날 성공률은 로그상 99.7%에서 실측 71%로 내려앉았어요.

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

## 성공이라는 지표는 무엇을 세고 있었나

에러율이나 성공률을 볼 때, 우리는 분자와 분모를 암묵적으로 정합니다.  
그 정의가 어긋나면 숫자 전체가 다른 값을 재게 돼요.

세 가지가 자주 섞입니다.

- 전송에 성공한 것과 업무에 성공한 것은 다릅니다. HTTP 200은 "메시지가 벤더에 닿았다"이지 "발송이 됐다"가 아니에요.
- 예외가 안 난 것과 처리에 성공한 것도 다릅니다. 코드가 아무 예외 없이 끝나도, 그 안에서 실패를 조용히 넘겼을 수 있어요.
- 실패를 catch로 삼키면 그 실패는 분자에서 빠집니다. 분모는 그대로인데 분자만 남으니, 성공률은 언제나 좋아 보입니다.

"성공"이라는 한 단어가 무엇을 세는지 정하지 않으면, 그 지표는 처음부터 다른 값을 재고 있는 겁니다.

## 그날 관측된 것

사실만 적습니다.

- 정오 배치 대상: 636건.
- 배치 로그: "전송 성공 634건".
- 학부모 한 명이 이번 달 리포트를 못 받았다는 문의.

로그만 보면 성공률 99.7%(634/636)입니다. 그런데 민원이 왔어요.  
로그와 사용자가 어긋났습니다.

## 처음엔 벤더를 의심했다

첫 가설은 "벤더 쪽에서 일부가 누락됐다"였습니다.  
발송은 우리가 성공으로 찍었으니, 문제는 우리 바깥이라고 봤어요.

이건 가설입니다. 아직 아무것도 확인하지 않았어요.

## 후보를 하나씩 지운 순서

로그를 믿는 대신, 로그가 "성공"이라 부른 634건을 실제 도착과 대조하는 것부터 시작했습니다.

| 단계 | 확인한 것 | 지운 후보 |
|---|---|---|
| 성공 로그 vs 실제 도착 대조 | 벤더 성공 코드(code 1000)는 453건뿐. 181건이 갈라졌다 | "로그 = 도착"이라는 가정 |
| HTTP status와 본문 코드 분리 | 181건 모두 HTTP는 200, 본문은 실패 | 네트워크·타임아웃 실패 |
| 실패 응답의 공통 필드 | 180건이 같은 응답. `{code 2000, "The to field is required"}` | 무작위 벤더 오류 |
| 빈 번호의 출처 역추적 | 회원 서비스가 빈 문자열로 저장. `== null` 가드가 통과시킴 | 발송 로직 자체의 버그 |

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

각 줄에서 후보를 하나씩 지웠습니다.  
HTTP 연결은 됐으니 네트워크가 아니고, 실패 응답이 한 종류로 반복되니 무작위 벤더 오류가 아니고, 번호가 저장 시점부터 비어 있었으니 발송 로직 문제도 아니었어요.

## 무엇으로 확정했나

숫자가 이렇게 닫힙니다.

- 로그 "성공 634" = 실제 성공 453 + 삼켜진 181.
- 삼켜진 181건 중 180건은 빈 수신번호(code 2000). 나머지 1건은 다른 유효성 오류로, 이 조사에서 원인을 특정하지 못했습니다.

삼킴의 메커니즘은 이랬어요.  
발송 코드가 응답 상태를 확인하기 전에 "성공"을 먼저 기록했습니다. 비200과 예외는 catch로 삼킨 뒤 null을 반환했고요.

빈 문자열 번호의 뿌리는 회원 서비스였습니다.  
숫자 없는 번호를 `null`이 아니라 빈 문자열로 저장했어요. 다운스트림의 `== null` 가드는 빈 문자열을 통과시켰고요.  
그렇게 약 12%의 사용자가 빈 번호를 달고 파이프라인 끝까지 갔습니다.

"벤더 탓"이라는 첫 가설은 여기서 지워졌어요.

## 무엇을 바꿨나

성공의 정의부터 좁혔습니다. 200이어도 벤더 실패 코드면 실패입니다.

```java
// 바뀐 성공 판정
boolean ok = res.status() == 200 && res.body().code() == 1000;
if (!ok) recordFailure(res);   // 실패도 이력에 남긴다 (재발송 대상)
```

- 비2xx와 벤더 실패 코드는 실패로 이력에 남겨 재발송 대상으로 돌렸습니다.
- 저장 단계에서 빈 문자열·공백 번호를 검증합니다.
- 실패를 사유별로 집계해 Slack으로 통보합니다.

## 고치고 다시 재보니

정의 하나를 바꿨을 뿐입니다. 그런데 같은 배치의 성공률이 다르게 보였어요.

- 성공률: 로그 기준 99.7%(634/636) → 실측 71%(453/636).
- 빈 번호를 만든 사용자 비율: 약 12%.
- 성공을 code 1000까지 보게 되면서 "성공인데 미도달" 181건이 더는 성공으로 집계되지 않습니다.

숫자가 나빠진 게 아니에요. 처음부터 이 숫자였습니다. 계기의 눈금을 고쳤을 뿐이죠.

## 이 지표로는 알 수 없는 것

- code 1000도 "벤더가 접수했다"이지 사용자 단말 도착까지 보장하지 않습니다. 접수 성공과 최종 도착은 여전히 다른 지표예요.
- 이미 삼켜져 유실된 과거분은 이력이 없어 복구하지 못했습니다. 관측을 세우기 전의 데이터는 돌아오지 않아요.
- 삼켜진 181건 중 1건의 원인은 아직 특정하지 못했습니다.

> 에러율을 보기 전에, 에러가 지표에 남는지부터 확인한다.

다음 편은 Kafka lag입니다. lag이 0이면 정말 밀린 게 없는 걸까요.  
봉투 계산으로는 5시간, 실측으로는 12초였던 이야기예요.
