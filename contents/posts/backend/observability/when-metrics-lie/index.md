---
title: "계기가 거짓말할 때 : 대시보드는 왜 거짓말할까"
date: 2026-02-23
update: 2026-02-23
series: "계기가 거짓말할 때"
tags:
- 관측성
- 모니터링
- Observability
- 지표
- technical-writing
---

> **TL;DR**
>
> 에러율 0%, P95 112ms, Kafka 컨슈머 지연 0. 계기가 전부 정상인데 그날 알림 181건이 도착하지 못했습니다.
>
> 지표가 이상할 때 시스템을 의심하기 전에, 그 지표가 무엇을 세고 어디서부터 어디까지 재는지부터 봐야 했어요.  
> 이 시리즈는 지표의 값이 아니라 지표의 정의를 읽는 법을 다룹니다.

---

그날 대시보드는 전부 초록불이었습니다.  
에러율 0.00%. 응답 지연도 평소 그대로. 컨슈머는 밀리지 않았어요.  
그런데 그날 정오 배치에서 알림 181건이 도착하지 못했습니다.

<style>
.metric-fig,.fig-defs{
  --fig-surface:#ffffff;--fig-ink:#0f172a;--fig-ink2:#334155;--fig-muted:#94a3b8;--fig-hair:#e6eaf1;
  --c-green:#16a34a;--c-greenink:#15803d;--c-red:#ef4444;--c-redink:#b91c1c;
}
@media (prefers-color-scheme: dark){
  .metric-fig,.fig-defs{
    --fig-surface:#121317;--fig-ink:#f2f5fa;--fig-ink2:#cbd5e1;--fig-muted:#697588;--fig-hair:#252a33;
    --c-green:#34d399;--c-greenink:#6ee7b7;--c-red:#f87171;--c-redink:#fca5a5;
  }
}
.metric-fig{margin:2.4em 0;border:1px solid var(--fig-hair);border-radius:18px;background:var(--fig-surface);
  padding:18px 20px 10px;overflow:hidden;box-shadow:0 1px 2px rgba(2,6,23,.05),0 14px 40px rgba(2,6,23,.09)}
@media (prefers-color-scheme: dark){.metric-fig{box-shadow:0 1px 2px rgba(0,0,0,.4),0 18px 46px rgba(0,0,0,.5)}}
.metric-fig svg{width:100%;height:auto;display:block;max-width:100%}
.metric-fig svg text{font-family:ui-monospace,"SF Mono","JetBrains Mono",Menlo,monospace}
.metric-fig figcaption{font-size:13.5px;color:var(--fig-muted);line-height:1.6;padding:12px 2px 6px;
  font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
.metric-fig figcaption b{color:var(--fig-ink2);font-weight:600}
@media (prefers-reduced-motion: reduce){.metric-fig svg animate{display:none}}
</style>

<figure class="metric-fig">
  <svg viewBox="0 0 660 128" role="img" aria-label="세 지표가 모두 초록불 정상인데 실제 도착만 181건 실패로 빨갛다" xmlns="http://www.w3.org/2000/svg">
    <g font-family="ui-monospace,monospace">
      <g>
        <rect x="12"  y="16" width="152" height="96" rx="12" fill="var(--c-green)" opacity="0.09"/>
        <rect x="12"  y="16" width="152" height="96" rx="12" fill="none" stroke="var(--c-green)" stroke-opacity="0.35"/>
        <circle cx="30" cy="38" r="5" fill="var(--c-green)"/>
        <text x="44" y="42" font-size="12" fill="var(--fig-muted)">에러율</text>
        <text x="28" y="80" font-size="24" font-weight="800" fill="var(--fig-ink)">0.00%</text>
        <text x="28" y="100" font-size="11" fill="var(--c-greenink)" font-weight="700">정상</text>
      </g>
      <g>
        <rect x="174" y="16" width="152" height="96" rx="12" fill="var(--c-green)" opacity="0.09"/>
        <rect x="174" y="16" width="152" height="96" rx="12" fill="none" stroke="var(--c-green)" stroke-opacity="0.35"/>
        <circle cx="192" cy="38" r="5" fill="var(--c-green)"/>
        <text x="206" y="42" font-size="12" fill="var(--fig-muted)">응답 P95</text>
        <text x="190" y="80" font-size="24" font-weight="800" fill="var(--fig-ink)">112ms</text>
        <text x="190" y="100" font-size="11" fill="var(--c-greenink)" font-weight="700">정상</text>
      </g>
      <g>
        <rect x="336" y="16" width="152" height="96" rx="12" fill="var(--c-green)" opacity="0.09"/>
        <rect x="336" y="16" width="152" height="96" rx="12" fill="none" stroke="var(--c-green)" stroke-opacity="0.35"/>
        <circle cx="354" cy="38" r="5" fill="var(--c-green)"/>
        <text x="368" y="42" font-size="12" fill="var(--fig-muted)">consumer lag</text>
        <text x="352" y="80" font-size="24" font-weight="800" fill="var(--fig-ink)">0</text>
        <text x="352" y="100" font-size="11" fill="var(--c-greenink)" font-weight="700">정상</text>
      </g>
      <g>
        <rect x="498" y="16" width="150" height="96" rx="12" fill="var(--c-red)" opacity="0.11"/>
        <rect x="498" y="16" width="150" height="96" rx="12" fill="none" stroke="var(--c-red)" stroke-width="1.6">
          <animate attributeName="stroke-opacity" values="1;0.35;1" dur="2.2s" repeatCount="indefinite"/>
        </rect>
        <circle cx="516" cy="38" r="5" fill="var(--c-red)"><animate attributeName="opacity" values="1;0.4;1" dur="2.2s" repeatCount="indefinite"/></circle>
        <text x="530" y="42" font-size="12" fill="var(--fig-muted)">실제 도착</text>
        <text x="514" y="80" font-size="24" font-weight="800" fill="var(--c-redink)">181건 실패</text>
        <text x="514" y="100" font-size="11" fill="var(--c-redink)" font-weight="700">미도달</text>
      </g>
    </g>
  </svg>
  <figcaption>세 계기는 모두 초록불이다. 그런데 <b>실제 도착</b>만 빨갛다. 이 시리즈는 왼쪽 셋이 정상인데 오른쪽이 실패하는 순간을, 계기의 눈금을 다시 읽어 설명한다.</figcaption>
</figure>

지표는 다 정상이라는데 사용자는 못 받았어요.  
계기가 멀쩡한데 결과가 틀렸다면, 먼저 의심할 건 시스템이 아니라 계기의 눈금입니다.

지표는 숫자가 아닙니다.  
시스템을 특정 방식으로 한 번 잘라 본 결과예요.  
무엇을 세는지, 어디서부터 어디까지 재는지 모르면 그 숫자는 쉽게 거짓말을 합니다.

## 지표를 믿기 전에 확인하는 세 가지

**정의.** 무엇을 성공으로, 무엇을 실패로 세는가. 분자와 분모가 실제로 무엇인가.

**측정 경계.** 어디서부터 어디까지 잰 시간인가. 그 구간 밖의 지연은 이 지표에 아예 안 보인다.

**집계 방식.** 평균인가 백분위인가 합계인가. 그 방식이 무엇을 숨기는가.

이 세 가지를 확인하지 않으면, 숫자는 맞는데 결론은 틀리는 일이 생깁니다.

> 값이 이상하면 시스템을 의심하기 전에, 그 값이 무엇을 세고 어디까지 재는지부터 확인한다.

## 앞으로 다룰 것

각 편은 지표 하나를 개념부터 풀고, 실제로 그 지표에 속았던 사례를 따라갑니다.

- **① 에러율 0%인데 181건이 실패했습니다** : HTTP 200은 왜 성공이 아니었을까
- **② Kafka lag 0은 무엇을 의미할까** : 봉투 계산으로 5시간, 실측 12초
- **③ Redis P95 5.68초는 어디서 잰 시간일까** : 캐시가 느린 건지, 앞에서 기다린 건지

편마다 순서는 같습니다.  
지표가 무엇인지 → 관측된 사실 → 처음 세운 가설 → 어떤 근거로 후보를 지웠는지 → 무엇으로 확정했는지(또는 못 했는지) → 무엇을 바꿨는지 → 다시 재보니 어땠는지 → 이 지표로는 알 수 없는 것.

원인을 맞히는 이야기가 아니라, 후보를 어떻게 좁혔는지를 남기려 합니다.
