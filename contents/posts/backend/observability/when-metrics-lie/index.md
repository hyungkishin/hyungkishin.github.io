---
title: "계기가 거짓말할 때 : 대시보드는 왜 거짓말할까"
date: 2026-02-23
update: 2026-07-24
tags:
- 관측성
- 모니터링
- Observability
- 지표
- technical-writing
---

> **TL;DR**
>
> 그날 필요한 건 시스템 점검이 아니었다. 계기의 눈금을 읽는 일이었다.
>
> 에러율 0%, P95 112ms, Kafka 컨슈머 지연 0. 계기가 전부 정상인데 알림 181건이 도착하지 못했다.
> 지표가 무엇을 세고 어디서부터 어디까지 재는지를 읽으면, 정상인 계기와 실패한 결과가 어떻게 공존하는지 설명된다. 이 시리즈는 지표의 값이 아니라 지표의 정의를 읽는다.

---

그날 대시보드는 전부 초록불이었다.
에러율 0.00%. 응답 지연도 평소 그대로. 컨슈머는 밀리지 않았다.
그런데 정오 배치에서 알림 181건이 도착하지 못했다.

<style>
.metric-fig,.fig-defs{
  --fig-surface:#ffffff;--fig-ink:#0f172a;--fig-ink2:#334155;--fig-muted:#94a3b8;--fig-hair:#e6eaf1;
  --c-green:#16a34a;--c-greenink:#15803d;--c-red:#ef4444;--c-redink:#b91c1c;
}
.metric-fig{margin:2.4em 0;border:1px solid var(--fig-hair);border-radius:18px;background:var(--fig-surface);
  padding:18px 20px 10px;overflow:hidden;box-shadow:0 1px 2px rgba(2,6,23,.05),0 14px 40px rgba(2,6,23,.09)}
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

지표는 다 정상이라는데 사용자는 못 받았다.
계기가 멀쩡한데 결과가 틀렸다면 먼저 의심할 것은 시스템이 아니라 계기의 눈금이다.

지표는 숫자가 아니다. 시스템을 특정 방식으로 한 번 잘라 본 결과다.
무엇을 세는지, 어디서부터 어디까지 재는지 모르면 그 숫자는 쉽게 거짓말을 한다.

## 지표를 믿기 전에 확인하는 세 가지

**정의.** 무엇을 성공으로, 무엇을 실패로 세는가. 분자와 분모가 실제로 무엇인가.

**측정 경계.** 어디서부터 어디까지 잰 시간인가. 그 구간 밖의 지연은 이 지표에 아예 보이지 않는다.

**집계 방식.** 평균인가 백분위인가 합계인가. 그 방식이 무엇을 숨기는가.

이 세 가지가 비면 숫자는 맞는데 결론이 틀리는 일이 생긴다.

> 값이 이상하면 시스템을 의심하기 전에, 그 값이 무엇을 세고 어디까지 재는지부터 확인한다.

## 앞으로 다룰 것

각 편은 실제로 그 지표에 속았던 사례 하나를 따라간다.

- **에러율 0%인데 181건이 실패했습니다** : HTTP 200은 왜 성공이 아니었을까
- **Kafka lag 0은 무엇을 의미할까** : 봉투 계산으로 5시간, 실측 12초
- **Redis P95 5.68초는 어디서 잰 시간일까** : 캐시가 느린 건지, 앞에서 기다린 건지

편마다 순서는 같다.
관측된 현상 → 실패가 만들어진 경로 → 후보를 지운 순서 → 확정한 것과 확정하지 못한 것 → 바꾼 것 → 다시 잰 결과 → 그 지표로도 알 수 없는 것.

원인을 맞히는 이야기가 아니라 후보를 어떻게 좁혔는지가 남는 기록이다.
