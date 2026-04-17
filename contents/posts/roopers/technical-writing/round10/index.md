---
title: "누적 테이블 위에 '주간 랭킹'을 얹었을 때 생기는 거짓말"
date: 2026-04-17
update: 2026-04-17
tags:
- loopers
- technical-writing
- 랭킹
- Spring Batch
- Materialized View
- 커머스
- 배치
---

> **TL;DR**
>
> `product_metrics`는 날짜 컬럼이 없는 누적 테이블입니다. 그 위에 "주간/월간 랭킹"이라는 이름을 얹으면 이름과 실체가 어긋납니다. 이번 주차는 그 어긋남을 감추지 않고, 이름부터 바꾸는 쪽을 택했습니다.
>
> - 누적 테이블 위에서는 "이번 주"를 만들 수 없다는 인정
> - `WEEKLY_CUMULATIVE`로의 재정의와 API 계약
> - Cleanup-Aggregate 분리 구조가 왜 가용성을 포기한 설계였는지
> - append-only + 최신 `ranking_date` 조회로의 전환
> - `currentRank` 멤버 변수가 사실상 "재시작 지원 안 함"이었다는 고백

---

## 시작점: Round 9가 남긴 한 줄

Round 9에서 일간 랭킹은 Redis ZSET으로 닫았습니다. `ZINCRBY`로 누적하고 `ZREVRANGE`로 Top-N. 블로그 마지막에 적어둔 한 줄은 이랬습니다.

> 다음 주차는 일간을 주간/월간으로 확장하는 배치 작업입니다.

처음 떠오른 방법은 `ZUNIONSTORE`로 7일치 ZSET 키를 합치는 것이었습니다. 그런데 ZSET TTL이 2일이었습니다. 3일 전 키는 이미 사라진 상태였습니다. ZSET으로는 닫히지 않는 문제라, 시선을 DB로 옮겼습니다. 거기서 이 글의 본질적인 문제를 마주했습니다.

---

## 문제: 누적 테이블 위에는 "구간"이 없다

`product_metrics`는 상품별 한 줄의 누적 row입니다.

```sql
SELECT product_id, view_count, like_count, order_count, sales_amount
FROM product_metrics
```

날짜 컬럼이 없습니다. 서비스 시작 이후의 모든 행동이 한 row에 쌓여 있습니다. "이번 주에 몇 번 조회됐는가"는 이 테이블이 답할 수 없는 질문입니다.

진짜 주간 랭킹이 필요하면 일별 스냅샷(`product_metrics_daily`)이 선행돼야 합니다. 매일 자정에 delta를 찍고, 주간 집계에서 7일치를 합산합니다. 이건 배치 과제의 범위가 아니라 데이터 파이프라인 재설계입니다.

---

## 가장 위험했던 선택지

여기서 가장 위험한 결정은 **"누적 데이터로 주간 랭킹을 흉내 내는 것"**이었습니다. UI에는 "이번 주 TOP"이 찍히지만 실제로 나가는 데이터는 "역대 누적 TOP"입니다. 신규 상품은 이번 주에 아무리 많이 팔려도 스테디셀러를 넘을 수 없습니다. 이건 구현의 타협이 아니라 제품 정의를 어긴 것입니다.

그래서 이름부터 바꿨습니다.

- `DAILY` — Redis ZSET 기반 실시간 일간 랭킹
- `WEEKLY_CUMULATIVE` — 주 1회 배치가 찍는 누적 TOP 스냅샷
- `MONTHLY_CUMULATIVE` — 월 1회 배치가 찍는 누적 TOP 스냅샷

API 응답에는 `semantics` 필드를 더했습니다. 클라이언트가 "이번 주 인기"가 아니라 "주간 집계 시점 기준 누적 TOP"으로 표기하도록 강제하기 위함입니다. 이름이 바뀌니 구현도, 문서도 훨씬 정직해졌습니다.

> 데이터가 답할 수 없는 질문을 이름으로 답하려 하면, 시스템 전체가 거짓말을 시작합니다.

---

## Job을 왜 주간과 월간으로 나눴는가

하나의 Job에 `period` 파라미터로 분기하는 방안도 검토했습니다. 코드 중복은 줄지만, 스케줄링 단위가 다릅니다. 주간은 매주 월요일 새벽, 월간은 매월 1일 새벽에 돕니다. 단일 Job 안에서 `requestDate`를 파싱해 "오늘이 월요일인가 1일인가"를 판단하는 건 스케줄러의 책임을 Job으로 끌어오는 일입니다.

Job을 분리하면 실패 시 재실행 단위가 독립합니다. 월간이 터졌다고 주간을 다시 돌릴 이유가 없습니다. 모니터링 알림도 독립적으로 걸립니다.

```kotlin
@Bean(JOB_NAME)
fun weeklyRankingJob(): Job =
    JobBuilder(JOB_NAME, jobRepository)
        .incrementer(RunIdIncrementer())
        .start(aggregateWeeklyRankingStep(null, null))
        .listener(jobListener)
        .build()
```

두 Job의 차이는 날짜 계산뿐입니다. 주간은 `date.with(DayOfWeek.MONDAY)`, 월간은 `date.with(TemporalAdjusters.firstDayOfMonth())`. 이 날짜가 MV 테이블의 `ranking_date`로 쓰입니다.

---

## 최초 설계와 그 결함: Cleanup과 Aggregate를 나눈 이유

첫 구현은 두 Step이었습니다. Step 1은 기존 MV 데이터를 삭제하는 Cleanup Tasklet, Step 2는 `product_metrics`에서 읽어 MV에 적재하는 Chunk-Oriented Step.

분리의 명분은 이랬습니다. 하나의 트랜잭션으로 묶으면 Aggregate 실패 시 Cleanup까지 롤백돼 이전 주 데이터가 남습니다. 지난 주 랭킹을 "이번 주 랭킹"으로 서빙하느니, 빈 결과로 장애를 드러내는 쪽이 낫다고 판단했습니다.

**이 판단은 틀렸습니다.**

Cleanup이 끝나고 Aggregate가 도는 사이에 유저가 랭킹 페이지를 열면, 완전히 빈 화면을 봅니다. Aggregate에서 네트워크 이슈로 재시도가 길어지면 그 시간 동안 랭킹 기능이 정지합니다. "틀린 데이터보다 빈 데이터가 낫다"는 논리는 개발자 편의주의입니다. 서비스 가용성의 기본은 "어떤 상태든 마지막으로 유효했던 데이터를 보여준다"입니다.

---

## 재설계: append-only + 최신 스냅샷 조회

Cleanup 자체를 없앴습니다. 배치는 **새로운 `ranking_date`로 INSERT만** 합니다. 조회는 최신 `ranking_date`를 기준으로 내려갑니다.

```sql
SELECT *
FROM mv_product_rank_weekly
WHERE ranking_date = (
    SELECT MAX(ranking_date)
    FROM mv_product_rank_weekly
    WHERE ranking_date <= :requested_date
)
ORDER BY ranking
```

이 구조의 장점은 세 가지입니다.

첫째, 배치가 도는 동안에도 직전 스냅샷이 그대로 서빙됩니다. 빈 화면이 없습니다.
둘째, 이번 배치가 실패하면 직전 주 데이터가 남아 있습니다. `snapshot_date`를 응답에 포함시키면 "최신 기준 X일자"로 자연스럽게 표기할 수 있고, 유저에게도 정직합니다.
셋째, 트랜잭션 길이가 INSERT 100건으로 짧아집니다. 롤백 비용이 크지 않습니다.

오래된 스냅샷은 별도 retention 배치(`DELETE WHERE ranking_date < NOW() - INTERVAL 3 MONTH`)로 정리합니다. 실무 MV 패턴 중 가장 흔하게 쓰이는 쪽입니다.

---

## Chunk-Oriented의 가치: 100건 기준으로 판단하지 않는 이유

Reader는 `JdbcCursorItemReader`로 composite score를 계산해 정렬된 결과를 읽습니다.

```sql
SELECT product_id, view_count, like_count, order_count, sales_amount,
       (view_count * 0.1 + like_count * 0.2 + order_count * 0.7) AS score
FROM product_metrics
ORDER BY score DESC
LIMIT 100
```

가중치는 Round 9에서 정한 `view 0.1, like 0.2, order 0.7`을 그대로 씁니다. 합이 1.0이라 score를 "가중 평균 행동 수"로 해석할 수 있는 점이 이 값의 장점입니다.

TOP 100 + chunk_size 100이면 단일 Tasklet으로도 충분합니다. Chunk-Oriented를 택한 이유는 미래 시점의 판단이었습니다. TOP이 10,000으로 늘고 chunk_size 1,000으로 분할되면, 7번째 chunk에서 실패했을 때 Tasklet은 처음부터 다시 돌아야 합니다. Chunk 방식은 실패 지점부터 재시작할 수 있습니다.

다만 "재시작할 수 있다"고 말하려면 조건이 하나 더 붙습니다.

---

## 솔직한 고백: 이 Writer는 재시작을 지원하지 않는다

첫 구현의 `RankingWriter`는 `currentRank`를 멤버 변수로 뒀습니다.

```kotlin
class RankingWriter<E>(...) : ItemWriter<ProductMetricsRow>, StepExecutionListener {
    private var currentRank = 0

    override fun beforeStep(stepExecution: StepExecution) {
        currentRank = 0
    }
}
```

`beforeStep`에서 0으로 초기화하기 때문에 정상 흐름에서는 문제가 보이지 않습니다. 하지만 chunk 5에서 실패한 뒤 재시작하면, `beforeStep`이 다시 0을 박아넣어 chunk 6의 첫 상품이 1위로 적재됩니다. **이 Writer는 재시작을 지원한다고 말할 수 없습니다.**

제대로 지원하려면 `currentRank`를 `ExecutionContext`에 쓰고, `beforeStep`에서 복구해야 합니다.

```kotlin
override fun beforeStep(stepExecution: StepExecution) {
    this.stepExecution = stepExecution
    currentRank = stepExecution.executionContext.getInt(KEY_CURRENT_RANK, 0)
}

override fun write(chunk: Chunk<out ProductMetricsRow>) {
    val entities = chunk.items.map { row ->
        currentRank++
        entityFactory(row, currentRank, rankingDate)
    }
    saveAction(entities)
    stepExecution.executionContext.putInt(KEY_CURRENT_RANK, currentRank)
}
```

이번 주차에서 여기까지 들어가지 않았습니다. TOP 100 + chunk 100 구조라 재시작이 사실상 "전체 재실행"과 거의 같고, 단일 chunk 실패를 세밀하게 관리할 이유가 적었습니다. 멤버 변수로 상태를 관리하는 선택은 **"이 배치는 재시작을 사용하지 않는다"는 암묵적 선언**과 같습니다. 그 사실을 숨기지 않고 적어둡니다.

---

## API는 어떻게 분기하는가

`RankingPeriod` enum으로 UseCase에서 분기합니다.

```kotlin
val (entries, totalCount) = when (period) {
    DAILY -> {
        val entries = rankingRepository.getTopRankings(date, offset, size.toLong())
        val count = rankingRepository.getTotalCount(date)
        entries to count
    }
    WEEKLY_CUMULATIVE -> {
        val rankingDate = toStartOfWeek(date)
        val entries = weeklyRankingRepository.findLatestRankings(rankingDate, page - 1, size)
        val count = weeklyRankingRepository.countByLatestRankingDate(rankingDate)
        entries to count
    }
    MONTHLY_CUMULATIVE -> { /* 월간은 toStartOfMonth */ }
}
```

`findLatestRankings`는 "`requested_date` 이하의 가장 최근 `ranking_date`"를 기준으로 조회합니다. 배치가 도는 중이거나 이번 주 배치가 실패한 경우에도 직전 스냅샷이 서빙됩니다.

enrichment(상품/브랜드 조인)는 `buildRankingPageInfo`로 공통 추출했습니다. Round 9에서 N+1을 잡을 때 만든 `findAllByIds` IN 쿼리가 그대로 재사용됩니다. period에 상관없이 productId 목록이 나오면, 그 이후 흐름은 같습니다.

MV 테이블에는 `(ranking_date, ranking)` 복합 인덱스를 걸었습니다. 최신 `ranking_date`로 필터링한 뒤 `ranking` 순서로 정렬하는 쿼리가 이 인덱스 하나로 커버됩니다.

---

## 아직 풀지 못한 것들

**`product_metrics` 자체가 누적 단일 row라는 데이터 모델 결함이 남습니다.**
`ORDER BY score DESC LIMIT 100`은 인덱스 없는 계산 컬럼으로 전체 정렬을 도는 쿼리입니다. 현재 규모에서는 문제가 되지 않습니다. 상품이 100만 개가 되면 Filesort가 DB CPU를 점유해, 배치가 도는 동안 다른 API 응답까지 느려집니다. score를 미리 계산해 인덱스를 걸어도, insert/update 시점의 인덱스 재정렬 비용이 다른 자리로 옮겨갈 뿐입니다. 이 문제는 CQRS로 조회 전용 모델을 분리하지 않는 한 쿼리 튜닝으로 덮이지 않습니다.

**"이번 주에 핫한 상품"이라는 도메인 표현은 여전히 불가능합니다.**
이름을 `WEEKLY_CUMULATIVE`로 바꿔 정직해졌지만, 유저가 진짜 원하는 "이번 주 급상승"은 일별 스냅샷이 들어와야 풀리는 문제입니다.

**Blue/Green 슬롯 스왑과 파티셔닝은 다음 수순입니다.**
가용성을 더 밀어붙이려면 테이블 두 벌에 active 포인터를 두는 Blue/Green 구조가 자연스러운 다음 단계입니다. 대용량 정렬이 필요해지는 시점에는 Reader 파티셔닝도 검토 대상입니다. 이번 범위에서는 append-only가 비용 대비 충분했습니다.

---

## 정리

이번 주차에서 가장 크게 바뀐 판단은 두 가지입니다.

하나는 **이름**입니다. 누적 데이터로 구간 랭킹을 흉내 내지 않고, `WEEKLY_CUMULATIVE`로 재정의했습니다. 데이터가 답할 수 없는 질문을 이름으로 가리면, 시스템 전체가 거짓말을 하기 시작합니다.

다른 하나는 **가용성**입니다. Cleanup-Aggregate 분리는 "배치 실패 시 빈 화면"을 설계값으로 깔고 있었습니다. append-only + 최신 `ranking_date` 조회로 바꾸니, 배치 실패가 서비스 장애로 직결되지 않습니다.

재시작, 대용량 정렬, 진짜 구간 집계. 남은 숙제는 다음 라운드의 몫입니다.

> 10주 회고는 별도 포스팅으로 분리합니다. 이 글은 "누적 테이블 위에 주간 랭킹을 얹었을 때 생기는 거짓말" 한 주제에만 집중하는 쪽이 맞다고 판단했습니다.
