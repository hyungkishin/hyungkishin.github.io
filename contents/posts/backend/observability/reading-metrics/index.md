---
title: "이 글은 '지표와 실제 상태가 다를 때' 시리즈로 옮겼습니다"
description: "한 편에 담았던 알림 장애 기록을 에러율, Redis 응답 시간, Kafka 대기량 세 편으로 나눴다. 여기서 새 시리즈로 이어진다."
date: 2026-02-22
update: 2026-11-15
tags:
- 관측성
- 모니터링
- technical-writing
---

알림 미수신을 조사한 기록을 에러율, Kafka 대기량, Redis 조회 시간 세 편으로 나눴습니다.

![두꺼운 바인더를 빼니 봉투, 대기 줄, 스톱워치 그림이 붙은 세 폴더가 나온다. 하나의 알림 문의를 세 지표로 나눠 살펴본다.](./scene-split-binder-shelf.webp)

[지표와 실제 상태가 다를 때 (프롤로그)](/backend/observability/when-metrics-lie/)에서 세 지표를 함께 볼 수 있습니다.

- [에러율 0%인데 181건이 실패했습니다](/backend/observability/when-metrics-lie-error-rate/)
- [Kafka lag 0은 무엇을 의미할까](/backend/observability/when-metrics-lie-kafka-lag/)
- [Redis P95 5.68초는 어디서 잰 시간일까](/backend/observability/when-metrics-lie-redis-p95/)
