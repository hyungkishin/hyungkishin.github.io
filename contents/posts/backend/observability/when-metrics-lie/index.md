---
title: "알림 181건이 도착하지 않았는데 에러율은 왜 0%였을까"
description: "알림 181건이 도착하지 않았는데 대시보드의 에러율은 0%였다. 성공 건수와 응답 시간, Kafka 대기량을 각각 어디서 재는지 다시 봤다."
date: 2026-02-23
update: 2026-11-14
tags:
- 관측성
- 모니터링
- Observability
- 지표
- technical-writing
---

알림 181건이 도착하지 않은 날, 대시보드의 에러율은 0%였고 응답 지연 P95는 112ms였다. Kafka 컨슈머에도 밀린 메시지가 없었다.

발송 로그와 벤더 응답 본문을 대조했다. HTTP 상태는 200이었지만 본문에는 실패 코드가 있었다.

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
  <figcaption>에러율 0%, 응답 P95 112ms, consumer lag 0. 같은 배치에서 벤더가 접수하지 못한 알림은 <b>181건</b>이었다.</figcaption>
</figure>

<span id="article-section-2"></span>

## 같은 배치를 세 가지 지표로 다시 보면

로그에서 성공으로 센 634건 중 벤더가 접수한 건 453건이었다. 성공을 기록한 시점부터 다시 봤다. [HTTP 200인데 발송에 실패한 181건](/backend/observability/when-metrics-lie-error-rate/)

발송 시간을 순차 처리 기준으로 추산하면 약 다섯 시간이다. 그날 Kafka에서 측정한 대기 시간(time lag)은 가장 길 때도 12초였다. [Kafka lag 0은 무엇을 의미할까](/backend/observability/when-metrics-lie-kafka-lag/)

캐시 조회 P95는 5.68초였다. 그중 Redis가 명령을 실행한 시간은 얼마일까? 타이머의 시작 위치와 공유 커넥션에서 대기하는 구간을 살폈다. [Redis P95 5.68초는 어디서 잰 시간일까](/backend/observability/when-metrics-lie-redis-p95/)
