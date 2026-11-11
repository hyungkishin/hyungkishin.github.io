---
title: "G1 GC는 언제 애플리케이션을 멈추나"
description: "G1이 젊은 객체를 자주 수집하는 이유와 살아 있는 객체를 옮기는 과정을 따라간다. JDK 25의 실제 로그에서 마킹과 정지 구간을 읽고 같은 일을 두 힙 크기로 실행해 비용을 비교했다."
date: 2026-11-12
update: 2026-11-12
tags:
  - JVM
  - G1
  - GC
  - 성능 측정
---

## 세대별 수집이 기대하는 세 가지 분포

세대별 수집은 객체의 나이를 보고 어느 공간부터 비울지 고른다. 갓 생긴 객체가 일찍 죽는다면 젊은 공간을 먼저 비워 적은 복사로 자리를 많이 얻을 수 있다. 이때 드는 비용은 오래 살아남은 객체의 수명과 세대를 건너는 참조의 수에도 달려 있다. 수집기가 기대하는 분포는 다음 세 가지다.

| 가설 | 무엇을 기대하나 | 수집 방식에 미치는 영향 |
| --- | --- | --- |
| 약한 세대 가설 | 새로 만든 객체 중 많은 수가 일찍 죽는다. | 젊은 세대를 자주 회수하면 살아서 복사해야 할 양이 작다. |
| 강한 세대 가설 | 오래 살아남은 객체일수록 다음 구간도 살아남을 가능성이 높다. | 여러 차례 수집을 견딘 객체를 오래된 세대로 옮겨 반복 복사를 줄인다. |
| 세대 간 참조 가설 | 세대를 가로지르는 참조가 같은 세대 안의 참조보다 적은 편이다. | 오래된 쪽에서 젊은 쪽을 가리킬 가능성이 있는 위치를 기록하면, 젊은 세대만 수집할 때 검색 범위를 좁힐 수 있다. |

세 가지 모두 프로그램이 만드는 객체와 참조의 분포에 관한 가정이다. 오래 보관한 캐시 전체를 한꺼번에 지우는 프로그램에서는 비슷한 나이의 객체가 같은 시점에 대거 죽는다. 실제 프로그램에서 추적한 오래된 객체의 수명 분포도 강한 세대 가설을 따르는 경우와 벗어나는 경우가 모두 있었다. [객체 수명 분포를 측정한 연구](https://web.cs.umass.edu/publication/docs/1998/UM-CS-1998-081.pdf) · [세대별 수집과 기억 집합의 초기 실측](https://prl.khoury.northeastern.edu/img/u-sde-1984.pdf)

참조 배열의 여러 칸을 덮어쓰는 경우는 [앞 편의 System.arraycopy 실험](/backend/transfer-performance/system-arraycopy/)에서 보았다. 세 번째 가설에는 이런 쓰기를 추적하는 비용이 따른다. 오래된 배열의 한 칸에 새 객체를 넣으면, 젊은 세대를 수집할 때 그 칸에서 오는 참조도 찾아야 한다. G1의 **쓰기 장벽**은 참조를 저장할 때 변경한 필드가 속한 메모리 구간인 **카드**를 기록한다. 수집할 때는 기억 집합(remembered set)으로 바깥에서 들어오는 참조를 찾는다. 오래된 배열을 자주 갱신하면 장벽과 카드 처리에 드는 일도 늘 수 있다. [G1의 기억 집합](https://docs.oracle.com/en/java/javase/25/gctuning/garbage-first-g1-garbage-collector1.html) · [OpenJDK의 카드 기록 경로](https://github.com/openjdk/jdk25u/blob/7b65d74bcbd7c3a0b4c1f5c5bd85e64aa2e51b4a/src/hotspot/share/gc/g1/g1BarrierSet.inline.hpp#L76-L82)

## 젊은 리전을 비울 때와 오래된 리전을 고를 때

G1은 힙을 일정한 크기의 리전으로 나눈다. Young GC에서는 애플리케이션 스레드를 잠시 멈추고 젊은 리전에서 살아 있는 객체를 빈 Survivor 또는 Old 리전으로 복사한다. 참조를 새 위치에 맞추고 대피(evacuation)에 성공한 리전은 통째로 다시 쓸 수 있다. 여러 GC 작업 스레드가 병렬로 복사해도 이 구간에 애플리케이션은 멈춘다. [OpenJDK 25.0.4.1의 G1YoungCollector::collect](https://github.com/openjdk/jdk25u/blob/7b65d74bcbd7c3a0b4c1f5c5bd85e64aa2e51b4a/src/hotspot/share/gc/g1/g1YoungCollector.cpp#L1088-L1144)

[앞 글의 도달 가능성](/backend/transfer-performance/jvm-memory/)을 기준으로 오래된 리전에 살아 있는 객체가 얼마나 남았는지 세어 보자. 남은 객체가 적으면 옮길 양에 비해 돌려받는 공간이 크다. G1은 Concurrent Start라는 Young 정지에서 마킹을 시작할 준비한다. 이어 애플리케이션이 실행되는 동안 객체 사이의 참조를 따라간다. **Remark**에서는 다시 멈춰 남은 표시 작업을 마무리한다. 이후 기억 집합 재구성 등을 거쳐 **Cleanup** 정지에서 다음 회수 단계를 준비한다. 표시는 무엇이 살아 있는지 조사하는 일이고, 대피는 선택한 리전에서 그 객체를 옮기는 일이다. [OpenJDK의 마킹 주기 실행 순서](https://github.com/openjdk/jdk25u/blob/7b65d74bcbd7c3a0b4c1f5c5bd85e64aa2e51b4a/src/hotspot/share/gc/g1/g1ConcurrentMarkThread.cpp#L271-L310) · [Remark에서 마무리하는 작업](https://github.com/openjdk/jdk25u/blob/7b65d74bcbd7c3a0b4c1f5c5bd85e64aa2e51b4a/src/hotspot/share/gc/g1/g1ConcurrentMark.cpp#L1384-L1423)

회수할 오래된 리전이 남으면 **Mixed GC**에서 젊은 리전과 선택한 오래된 리전을 함께 비운다. 한 번에 넣을 오래된 리전의 수에는 후보 수와 예상 정지 시간 예산이 영향을 준다. 로그에 `Pause Young (Mixed)`가 찍혔다면 젊은 세대만 비웠다고 읽을 수 없는 이유다. [Mixed 진행 여부](https://github.com/openjdk/jdk25u/blob/7b65d74bcbd7c3a0b4c1f5c5bd85e64aa2e51b4a/src/hotspot/share/gc/g1/g1Policy.cpp#L1426-L1430) · [수집할 오래된 리전을 고르는 코드](https://github.com/openjdk/jdk25u/blob/7b65d74bcbd7c3a0b4c1f5c5bd85e64aa2e51b4a/src/hotspot/share/gc/g1/g1CollectionSet.cpp#L343-L396)

## 26.924ms부터 32.740ms까지의 G1 로그

Temurin 25.0.4.1의 96 MiB 힙에서 배열을 반복 할당하자 로그에 `Concurrent Mark Cycle 2.899ms`가 찍혔다. 이 시간 동안 애플리케이션은 얼마나 멈췄을까? 그림은 JVM 기동 후 첫 마킹 주기 주변만 확대한 것이다. 가로축은 실제 시각에 비례한다. 세로선의 속도만 늦췄다. 위쪽 띠는 마킹 주기 전체, 아래쪽 파란 막대는 각각의 애플리케이션 정지다.

![첫 마킹 주기는 27.402ms에 시작해 30.301ms에 끝났다. 그 안에도 두 번의 Young 정지와 Remark, Cleanup 정지가 보인다.](./01-g1-timeline.svg)

26.924ms에 시작한 정지는 `GC(6) Pause Young (Concurrent Start)`다. 0.457ms 뒤 이 작업이 끝나고 `GC(7) Concurrent Mark Cycle`이 시작했다. 그 안에서 `GC(8)`과 `GC(9)`라는 별도의 Young GC가 끼어들었다. 같은 `GC(7)`에 속하는 Remark와 Cleanup 정지는 각각 0.091ms와 0.010ms였다. 주기 전체의 2.899ms를 정지 합계에 더하면 동시 작업까지 정지로 세고, 그 안에서 발생한 정지도 중복 계산한다. [해당 구간의 연속된 원본 로그](./evidence/first-cycle.txt)

30.993ms에는 `Prepare Mixed`가 시작됐다. 실제 Mixed는 32.225ms에 시작한 `GC(11)`이다. 이 정지에서 힙 사용량이 75M에서 52M으로 줄었고 로그가 기록한 정지 길이는 0.515ms였다. 로그의 시작·종료 행을 출력한 시각과 내부 타이머로 잰 길이는 반올림과 기록 지점 때문에 마지막 자릿수가 다를 수 있다.

## 같은 양을 할당하고 힙만 두 배로 늘린 결과

실험 코드는 한 스레드에서 4 KiB 배열을 2,097,152번 만든다. 배열 데이터만 합해 8 GiB다. 최근 128개를 보관하고 네 개 중 하나는 길이 5,120의 순환 배열에도 남긴다. 새 항목이 이전 칸을 덮으면 오래된 참조가 끊긴다. 여덟 번 모두 마지막 배열들에서 계산한 체크섬은 `1136000`이었다. [실험 Java 소스](./evidence/AllocationWindow.java)

Apple M4 Pro에서 G1이 인식하는 프로세서 수를 4로 고정했다. JVM이 시작할 때부터 끝날 때까지 힙 크기를 48 MiB 또는 96 MiB로 유지했다. 각 조건을 새 JVM에서 네 번씩, 48·96·96·48 MiB 순서를 두 차례 반복했다. 아래 값은 각 조건의 실행별 중앙값이다. 처리량은 배열 수를 JVM 프로세스 실행 시간으로 나눈 값이다. [실행별 측정값](./evidence/runs.csv)

| 측정 항목 | 힙 48 MiB | 힙 96 MiB |
| --- | ---: | ---: |
| JVM 시작부터 종료까지 | 551.92 ms | 423.87 ms |
| GC 정지 시간의 합 | 250.55 ms | 173.12 ms |
| 초당 처리한 배열 수 | 380만 개 | 495만 개 |
| Full GC 횟수 | 5회 | 0회 |

힙을 48 MiB 더 주자 같은 할당 작업을 끝내는 시간이 짧아졌다. 48 MiB에서는 Full GC가 실행마다 3~6회 있었고 96 MiB에서는 네 번 모두 없었다. 반면 **가장 길었던 단일 정지**는 48 MiB의 네 실행을 통틀어 1.098ms, 96 MiB에서 5.347ms였다. 정지 시간의 합과 최장 정지는 서로 다른 질문에 답한다. 이 실험은 네트워크 요청을 보내지 않았으므로 어느 값도 요청 지연을 나타내지 않는다. [8회 전체 원본 GC 로그 ZIP](./evidence/gc-logs.zip)

재현하려면 같은 디렉터리에 Java 소스와 아래 스크립트를 둔다. JDK 25의 `java`와 `javac`가 PATH에 있는 상태에서 실행하면, 빈 결과 디렉터리에 원본 로그 여덟 개와 CSV가 생긴다. 정지 합계는 `[gc]`의 `Pause` **종료 행**에 기록된 길이만 더한 값이다. 동시 마킹이 사용한 CPU 시간과 운영체제 스케줄링에 따른 대기는 별도로 측정하지 않았다. [측정·집계 스크립트](./evidence/run.py)

```bash
java -version
python3 run.py results
```

## 수집기가 정지 밖으로 옮겨 온 일

JDK 9는 서버 구성의 기본 수집기를 G1으로 바꿨다. 긴 정지를 줄이기 위해 일부 추적을 애플리케이션과 겹치고, 한 번에 비우는 범위를 제한하는 선택이었다. JDK 11에서 실험 기능으로 등장해 JDK 15에서 정식 기능이 된 ZGC는 객체를 다른 위치로 옮기는 작업까지 애플리케이션과 동시에 진행한다. 객체에 접근할 때 쓰는 장벽이 이동 중에도 올바른 참조를 찾도록 돕는다. JDK 21의 Generational ZGC는 여기에 세대를 나눠 젊은 객체를 더 자주 수집할 수 있게 했다. [JDK 9의 G1 기본화](https://openjdk.org/jeps/248) · [ZGC의 동시 이동 설계](https://openjdk.org/jeps/333) · [JDK 15 정식 기능 전환](https://openjdk.org/jeps/377) · [JDK 21의 세대별 ZGC](https://openjdk.org/jeps/439)

서버가 응답을 기다리는 동안 G1이 실제로 애플리케이션을 멈췄는지는 같은 시간대의 정지 로그에서 확인할 수 있다. 그 밖의 대기는 어느 계층에서 생겼을까? [다음 편에서는 애플리케이션을 떠난 바이트가 TCP와 리눅스 커널을 거치는 과정을 살펴본다.](/backend/transfer-performance/tcp-linux/)
