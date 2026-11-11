---
title: "대시보드는 왜 거짓말할까"
date: 2026-02-23
update: 2026-09-06
tags:
- 관측성
- 모니터링
- Observability
- 지표
- technical-writing
---

> **TL;DR**
>
> 장애를 조사하면서 먼저 확인한 것은 지표의 성공 판정 기준과 측정 범위였다.
>
> 에러율 0%, P95 112ms, Kafka 컨슈머 지연 0. 지표가 모두 정상 범위인데 알림 181건이 도착하지 못했다.
> 지표의 집계 대상과 측정 범위를 확인하면 정상 범위의 수치와 실제 실패가 함께 나타나는 이유를 설명할 수 있다. 이 시리즈에서는 각 지표의 정의와 해석할 때 주의할 점을 다룬다.

---

그날 대시보드의 지표는 모두 정상 범위였다.
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
  <figcaption>세 지표는 정상 범위지만 <b>실제 도착</b>에는 실패가 발생했다. 지표별 집계 기준과 측정 범위를 확인해 이 차이를 설명한다.</figcaption>
</figure>

지표가 정상 범위여도 사용자는 알림을 받지 못했다.
이런 차이를 조사할 때는 시스템 상태와 함께 지표의 집계 기준도 확인해야 한다.

지표는 정해진 대상과 구간을 측정한 수치다.
집계 대상과 측정 범위를 확인하지 않으면 수치가 정확해도 시스템 상태를 잘못 해석할 수 있다.

## 지표를 믿기 전에 확인하는 세 가지

**정의.** 무엇을 성공으로, 무엇을 실패로 세는가. 분자와 분모가 실제로 무엇인가.

**측정 경계.** 어디서부터 어디까지 잰 시간인가. 그 구간 밖의 지연은 이 지표에 아예 보이지 않는다.

**집계 방식.** 평균인가 백분위인가 합계인가. 그 방식으로는 어떤 차이를 파악하기 어려운가.

이 세 가지를 확인하지 않으면 숫자는 맞는데 결론이 틀리는 일이 생긴다.

> 값이 이상하면 해당 지표의 집계 대상과 측정 범위를 확인하고 시스템 상태와 대조한다.

## 앞으로 다룰 것

각 편에서는 지표를 잘못 해석했던 사례 하나를 다룬다.

- **에러율 0%인데 181건이 실패했습니다** : HTTP 200은 왜 성공이 아니었을까
- **Kafka lag 0은 무엇을 의미할까** : 단순 추산으로 5시간, 실측 12초
- **Redis P95 5.68초는 어디서 잰 시간일까** : 캐시가 느린 건지, 앞에서 기다린 건지

편마다 순서는 같다.
관측된 현상 → 실패가 만들어진 경로 → 가설을 검증한 순서 → 확정한 것과 확정하지 못한 것 → 바꾼 것 → 다시 잰 결과 → 그 지표로도 알 수 없는 것.

각 가설을 어떤 근거로 검토하고 제외했는지 기록한다.
