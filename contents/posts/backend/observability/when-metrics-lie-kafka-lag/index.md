---
title: "계기가 거짓말할 때 : Kafka lag 0은 무엇을 의미할까"
date: 2026-02-25
update: 2026-02-25
series: "계기가 거짓말할 때"
tags:
- 관측성
- 모니터링
- Kafka
- lag
- Observability
- technical-writing
---

> **TL;DR**
>
> 발송 지연 신고를 받고 봉투 뒷면에 계산했습니다. 1.1만 건 × 건당 1.5초 = 약 5시간.
> 큐가 5시간 밀렸겠거니 하고 파티션 증설 견적을 냈어요.
>
> 그런데 실제 lag은 최대 12초, 대기 메시지 최대 1건이었습니다. 밀린 큐는 없었어요.
> lag 0은 "느리지 않다"가 아니라 "쌓인 게 없다"에 가깝습니다.

---

<style>
.metric-fig,.fig-defs{
  --fig-surface:#ffffff;--fig-ink:#0f172a;--fig-ink2:#334155;--fig-muted:#94a3b8;
  --fig-grid:#eef2f7;--fig-baseline:#d0d7e2;--fig-hair:#e6eaf1;
  --c-blue:#2f6fed;--c-blueink:#1d4ed8;--c-orange:#f97316;--c-orangeink:#c2410c;
}
@media (prefers-color-scheme: dark){
  .metric-fig,.fig-defs{
    --fig-surface:#121317;--fig-ink:#f2f5fa;--fig-ink2:#cbd5e1;--fig-muted:#697588;
    --fig-grid:#20242d;--fig-baseline:#2d323c;--fig-hair:#252a33;
    --c-blue:#5b9bff;--c-blueink:#93c5fd;--c-orange:#fb923c;--c-orangeink:#fdba74;
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

## lag이라는 지표는 무엇을 재고 있었나

Kafka는 producer가 메시지를 broker의 파티션에 넣고, consumer가 순서대로 읽어 가는 구조입니다.  
각 파티션에는 두 위치가 있어요. 가장 마지막에 들어온 메시지 위치(latest offset)와, consumer가 지금까지 읽은 위치(consumer offset).

- **offset lag** = 이 둘의 차이. 아직 안 읽은 메시지 수.
- **time lag** = 가장 오래된 미소비 메시지가 얼마나 기다렸는가.

여기서 주의할 게 있어요. lag을 *어디서 재느냐*에 따라 달라집니다.  
컨슈머가 읽어 간 위치(position)를 기준으로 하면 처리 중인 메시지는 이미 읽힌 뒤라 lag에 안 잡혀요.  
반대로 커밋 오프셋을 기준으로 하면 처리한 뒤 커밋하는 흔한 설정에서는 처리 중 메시지도 lag에 남습니다.  
Kafka 밖의 지연은 어느 쪽으로도 안 보여요. producer가 늦게 넣는 것, 벤더가 접수한 뒤 늦게 배송하는 것 모두요.

즉 lag은 "큐에 쌓여 대기 중인 양"을 재는 지표지, "전체 지연"을 재는 지표가 아니에요.

<figure class="metric-fig">
  <div class="cap-head"><span class="cap-tag">a message's life · what lag sees</span><span class="cap-tag">queue only</span></div>
  <svg viewBox="0 0 660 196" role="img" aria-label="메시지 한 건이 네 단계를 지나는데 lag은 파티션 대기 구간 하나만 잰다. producer 투입 전, consumer 처리 중, 벤더 배송은 lag 사각지대다" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="e2-blue" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--c-blue)"/><stop offset="1" stop-color="var(--c-blue)" stop-opacity="0.7"/></linearGradient>
      <linearGradient id="e2-slate" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--fig-baseline)"/><stop offset="1" stop-color="var(--fig-baseline)" stop-opacity="0.55"/></linearGradient>
    </defs>
    <g stroke="var(--c-blue)" stroke-width="1.2">
      <line x1="174" y1="52" x2="174" y2="60"/><line x1="374" y1="52" x2="374" y2="60"/><line x1="174" y1="52" x2="374" y2="52"/>
    </g>
    <text x="274" y="42" text-anchor="middle" fill="var(--c-blueink)" font-size="11" font-weight="700">lag이 재는 유일한 구간</text>
    <g stroke="var(--fig-surface)" stroke-width="2">
      <rect x="44"  y="64" width="130" height="44" rx="2" fill="url(#e2-slate)"/>
      <rect x="174" y="64" width="200" height="44" rx="2" fill="url(#e2-blue)"/>
      <rect x="374" y="64" width="120" height="44" rx="2" fill="url(#e2-slate)"/>
      <rect x="494" y="64" width="122" height="44" rx="2" fill="url(#e2-slate)"/>
    </g>
    <g font-size="13" font-weight="700" text-anchor="middle">
      <text x="274" y="91" fill="#ffffff" font-size="11">lag</text>
    </g>
    <circle r="5" fill="var(--c-blue)" filter="url(#fx-glow)">
      <animateMotion path="M50 86 L610 86" dur="4s" repeatCount="indefinite"/>
      <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.1;0.9;1" dur="4s" repeatCount="indefinite"/>
    </circle>
    <g font-size="11" text-anchor="middle" fill="var(--fig-muted)">
      <text x="109" y="128">producer 투입 전</text>
      <text x="274" y="128" fill="var(--c-blueink)" font-weight="700">파티션 대기</text>
      <text x="434" y="128">consumer 처리 중</text>
      <text x="555" y="128">벤더 배송</text>
    </g>
    <text x="330" y="166" text-anchor="middle" fill="var(--fig-muted)" font-size="10.5">파티션 대기만 lag(offset · time)에 잡힌다. 나머지 세 구간은 lag 사각지대.</text>
  </svg>
  <figcaption>메시지 한 건은 네 구간을 지난다. lag이 재는 건 <b>파티션 대기</b> 하나뿐이다. producer 투입 전, consumer가 이미 읽어 처리 중, 벤더 접수 후 배송의 지연은 lag에 보이지 않는다.</figcaption>
</figure>

## 그날 관측된 것

사실만 적습니다.

- 발송 대상 약 1.1만 건.
- "알림이 느리다"는 신고가 며칠째.

여기까지는 신고뿐이에요. 지표를 아직 안 봤습니다.

## 처음엔 큐가 5시간 밀렸다고 봤다

머릿속 어림 계산(흔히 "봉투 뒷면 계산")부터 했어요.  
1.1만 건 × 건당 1.5초 = 약 5시간. 파티션이 1개라 consumer를 늘려도 처리량이 안 오르니, 큐가 5시간 밀렸겠거니 했습니다.

이건 가설입니다. 곱셈이지 측정이 아니에요.

## 후보를 지운 순서

곱셈을 믿는 대신 lag 지표를 열었습니다.

| 단계 | 확인한 것 | 결과 |
|---|---|---|
| 봉투 계산 | 1.1만 × 1.5초 ≈ 5시간 | 가설(추정) |
| offset lag | 최대 대기 메시지 1건 | "큐에 쌓였다"가 지워짐 |
| time lag | 최대 12초 | "5시간 지연"이 지워짐 |
| 처리량·입력량 곡선 | 밀린 구간 없음 | backlog 자체가 없음 |

<figure class="metric-fig">
  <div class="cap-head"><span class="cap-tag">envelope math vs measured lag</span><span class="cap-tag">11,260 msgs</span></div>
  <svg viewBox="0 0 720 264" role="img" aria-label="같은 시작점에서 봉투계산은 5시간으로 치솟고 실측 지연은 12초에 붙어 있다" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="g-env" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="var(--c-orange)" stop-opacity="0.32"/><stop offset="1" stop-color="var(--c-orange)" stop-opacity="0"/>
      </linearGradient>
      <linearGradient id="g-meas" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="var(--c-blue)" stop-opacity="0.28"/><stop offset="1" stop-color="var(--c-blue)" stop-opacity="0"/>
      </linearGradient>
      <linearGradient id="g-envline" x1="0" y1="1" x2="1" y2="0">
        <stop offset="0" stop-color="var(--c-orange)" stop-opacity="0.7"/><stop offset="1" stop-color="var(--c-orange)"/>
      </linearGradient>
    </defs>
    <g stroke="var(--fig-grid)" stroke-width="1">
      <line x1="52" y1="40" x2="684" y2="40"/><line x1="52" y1="97" x2="684" y2="97"/><line x1="52" y1="154" x2="684" y2="154"/>
    </g>
    <line x1="52" y1="212" x2="684" y2="212" stroke="var(--fig-baseline)" stroke-width="1.4"/>
    <path d="M52 210 C 240 208, 430 150, 684 46 L684 212 L52 212 Z" fill="url(#g-env)">
      <animate attributeName="opacity" values="0;0.95;0.95;0" keyTimes="0;0.42;0.9;1" dur="6.5s" calcMode="spline" keySplines="0.45 0 0.15 1;0 0 1 1;0.45 0 0.15 1" repeatCount="indefinite"/>
    </path>
    <path d="M52 210 L150 209 L300 208 L360 208 L378 199 L398 208 L520 208 L684 207 L684 212 L52 212 Z" fill="url(#g-meas)">
      <animate attributeName="opacity" values="0;0.95;0.95;0" keyTimes="0;0.42;0.9;1" dur="6.5s" calcMode="spline" keySplines="0.45 0 0.15 1;0 0 1 1;0.45 0 0.15 1" repeatCount="indefinite"/>
    </path>
    <path d="M52 210 L150 209 L300 208 L360 208 L378 199 L398 208 L520 208 L684 207" fill="none" stroke="var(--c-blue)" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" pathLength="100" stroke-dasharray="100">
      <animate attributeName="stroke-dashoffset" values="100;0;0;100" keyTimes="0;0.42;0.9;1" dur="6.5s" calcMode="spline" keySplines="0.45 0 0.15 1;0 0 1 1;0.45 0 0.15 1" repeatCount="indefinite"/>
    </path>
    <path d="M52 210 C 240 208, 430 150, 684 46" fill="none" stroke="url(#g-envline)" stroke-width="2.8" stroke-linecap="round" pathLength="100" stroke-dasharray="100">
      <animate attributeName="stroke-dashoffset" values="100;0;0;100" keyTimes="0;0.42;0.9;1" dur="6.5s" calcMode="spline" keySplines="0.45 0 0.15 1;0 0 1 1;0.45 0 0.15 1" repeatCount="indefinite"/>
    </path>
    <circle r="9" fill="var(--c-orange)" opacity="0.18">
      <animateMotion path="M52 210 C 240 208, 430 150, 684 46" keyPoints="0;1;1;0" keyTimes="0;0.42;0.9;1" dur="6.5s" calcMode="spline" keySplines="0.45 0 0.15 1;0 0 1 1;0.45 0 0.15 1" repeatCount="indefinite"/>
    </circle>
    <circle r="4.5" fill="var(--c-orange)" filter="url(#fx-glow)">
      <animateMotion path="M52 210 C 240 208, 430 150, 684 46" keyPoints="0;1;1;0" keyTimes="0;0.42;0.9;1" dur="6.5s" calcMode="spline" keySplines="0.45 0 0.15 1;0 0 1 1;0.45 0 0.15 1" repeatCount="indefinite"/>
    </circle>
    <circle cx="52" cy="211" r="4" fill="var(--fig-surface)" stroke="var(--fig-ink2)" stroke-width="1.6"/>
    <g transform="translate(556,30)"><rect width="128" height="21" rx="7" fill="var(--c-orange)" opacity="0.16"/><text x="12" y="14.5" fill="var(--c-orangeink)" font-size="12" font-weight="700">봉투계산 · 약 5시간</text></g>
    <g transform="translate(520,224)"><rect width="164" height="21" rx="7" fill="var(--c-blue)" opacity="0.16"/><text x="12" y="14.5" fill="var(--c-blueink)" font-size="12" font-weight="700">실측 lag · 12초 (대기 1건)</text></g>
    <text x="56" y="230" fill="var(--fig-muted)" font-size="10.5" letter-spacing="0.03em">발송 시작</text>
  </svg>
  <figcaption>같은 지점에서 출발한 두 선. 위는 <b>건수 x 건당시간</b>이 그린 추정, 아래는 컨슈머가 실제로 보고한 지연. 두 선의 벌어짐이 곧 잘못된 견적의 크기다.</figcaption>
</figure>

곱셈은 큐가 밀렸을 "경우"를 그린 그림입니다. lag은 실제로 밀린 양을 잰 값이고요.  
둘이 이만큼 벌어졌다는 건, 봉투 계산이 애초에 없는 백로그를 상상했다는 뜻이에요.  
(참고로 "대기 1건"과 "time lag 12초"는 같은 순간의 값이 아니라 각각의 최댓값입니다. 12초는 리밸런싱 같은 순간의 1회 스파이크였어요.)

## 무엇으로 확정했나

여기까지만 말할 수 있습니다.

- **측정된 구간에서 Kafka backlog는 이 지연의 원인이 아니었다.**

파티션이 1개라 consumer를 늘려도 처리량이 안 오르는 구조는 맞아요. 그런데 밀린 큐 자체가 없었으니, 그건 지금 풀 문제가 아니었습니다.  
그날 "안 온" 것의 상당수는 앞 편에서 본 삼켜진 실패였어요. "느리게 느껴진" 부분이 남았다면, 그건 Kafka 구간이 아니라 벤더 접수 후 배송처럼 lag 사각지대에 있을 가능성이 큽니다. 이 편이 확정한 건 "Kafka backlog는 아니다"까지예요.

## 무엇을 바꿨나

- 근거 없는 파티션 증설을 보류했습니다. 지표가 불필요한 조치 하나를 막았어요.
- 진짜 원인(발송 성공 판정)은 1편에서 고쳤습니다.
- lag(offset·time)을 발송 대시보드에 상시 지표로 올렸습니다.

## 고치고 다시 재보니

- 평시 offset lag은 0 근처, time lag 최대 12초 그대로.
- 월말 월간 리포트 1.1만 건 버스트 때 time lag 최대 약 10분. 봉투 계산의 5시간과는 자릿수가 다릅니다.
- 파티션은 늘리지 않았습니다. 발송은 정상으로 돌아왔어요.

## 이 지표로는 알 수 없는 것

- lag 0은 "시스템 전체에 지연이 없다"가 아니라 "소비되지 않고 대기 중인 메시지가 없다"에 가깝습니다.
- Kafka 투입 전(producer 지연)과 벤더 접수 후(벤더 배송 지연)의 지연은 이 지표로 판단할 수 없어요.
- lag 수집 주기가 짧으면 순간 스파이크를 놓칠 수 있습니다.

> lag 0은 밀린 게 없다는 뜻이지, 느리지 않다는 뜻이 아니다.

다음 편은 캐시입니다. Redis P95가 5.68초로 찍혔어요. 그게 정말 Redis가 느린 걸까요.
