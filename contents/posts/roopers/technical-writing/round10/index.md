---
title: "누적 데이터로 '이번 주 랭킹'을 만들 수 있을까?"
date: 2026-04-17
update: 2026-04-17
tags:
- loopers
- technical-writing
- 랭킹
- Spring Batch
- Materialized View
- Chunk Processing
- 커머스
- 배치
- 10주 회고
---

> **TL;DR**
>
> Spring Batch로 주간/월간 랭킹을 만들었어요.
> 근데 "이번 주에 가장 많이 팔린 상품"은 아니에요.
> `product_metrics`가 누적 테이블이라 날짜 구분이 안 되거든요.
>
> - 일별 스냅샷 없이 주간/월간 랭킹을 만들어야 했는데, 어떻게 타협했는지
> - Cleanup과 Aggregate를 왜 두 Step으로 나눴는지
> - 100건에 Chunk-Oriented가 왜 필요한지
> - `currentRank` 초기화 하나 빼먹으면 어떻게 되는지
> - 10주 동안 뭘 만들었고, 어디서 생각이 바뀌었는지

---

## 🔍 이전 라운드에서 멈춘 곳

Round 9에서 Kafka Consumer + Redis ZSET으로 일간 랭킹을 만들었어요.
`ZINCRBY` 한 줄이면 점수가 누적되고, `ZREVRANGE`로 Top-N을 꺼내면 끝이었죠.

그때 블로그 마지막에 이렇게 썼어요.

> 다음 주차는 일간을 주간/월간으로 확장하는 배치 작업이라고 합니다.

자연스럽게 떠오른 방법이 있었어요.
Redis ZSET 키가 `ranking:all:{yyyyMMdd}` 형태니까, 7개 키를 `ZUNIONSTORE`로 합치면 주간 랭킹이 되겠다고 생각했거든요.

근데 TTL이 2일이에요.
3일 전 키는 이미 사라졌어요.
7일치를 합칠 수가 없었습니다.

---

## ❓ 누적 테이블에서 "이번 주"를 어떻게 구분하나요?

못 해요. 솔직하게 말하면 구분할 수 없었어요.

`product_metrics` 테이블 구조를 보면 바로 보여요.

```sql
SELECT product_id, view_count, like_count, order_count, sales_amount
FROM product_metrics
```

날짜 컬럼이 없어요.
서비스 시작 이후 모든 조회, 좋아요, 주문이 한 row에 누적돼 있습니다.
어제의 조회수와 오늘의 조회수가 뒤섞여 있어서, "이번 주에 몇 번 조회됐는가"를 물어볼 방법이 없거든요.

진짜 주간 랭킹을 만들려면 일별 스냅샷 테이블이 필요해요.
매일 자정에 `product_metrics_daily`에 그날의 delta를 기록하고, 주간 집계할 때 7일치를 합산하는 거죠.

그런데 그건 이번 과제의 범위를 넘어가요.
Redis ZSET TTL이 2일이라 7일 전 데이터는 이미 사라져 있고, 일별 스냅샷 테이블을 새로 설계하는 것까지 하면 배치 과제가 아니라 데이터 파이프라인 재설계가 돼버려요.

그래서 타협했어요.
"배치가 실행되는 시점의 누적 메트릭 기준 TOP 100"을 MV(Materialized View) 테이블에 적재하는 방식으로 갔습니다.
"이번 주에 가장 많이 팔린"이 아니라 "전체 기간에서 가장 인기 있는"에 가까운 결과예요.

실무에서도 일별 스냅샷 없이 빠르게 MVP를 만들 때 이 패턴을 쓰곤 해요.
정확한 구간 집계는 데이터 인프라가 갖춰진 뒤에 교체하면 되니까요.

---

## 🏗️ 왜 Job을 주간과 월간으로 나눴나요?

하나의 Job에 `period` 파라미터를 넘겨서 분기하는 것도 가능했어요.
코드 중복도 줄고 관리 포인트도 하나가 되니까요.

그런데 스케줄링이 다릅니다.
주간 Job은 매주 월요일 새벽에 돌고, 월간 Job은 매월 1일 새벽에 돌아요.
Job 하나에 넣으면 `requestDate`를 파싱해서 "이게 월요일인가, 1일인가"를 판단하는 로직이 Job 안에 들어가야 하는데, 그건 스케줄러의 책임이지 Job의 책임이 아니거든요.

Job이 분리되면 실패 시 하나만 재실행하면 돼요.
월간 Job이 터졌는데 주간까지 다시 돌릴 이유가 없죠.
모니터링 알림도 독립적으로 걸 수 있어서, "주간 배치 실패" 알림과 "월간 배치 실패" 알림을 각각 다른 채널에 보낼 수 있어요.

두 Job의 구조는 거의 동일해요.

```kotlin
@Bean(JOB_NAME)
fun weeklyRankingJob(): Job {
    return JobBuilder(JOB_NAME, jobRepository)
        .incrementer(RunIdIncrementer())
        .start(cleanupWeeklyRankingStep(null))
        .next(aggregateWeeklyRankingStep(null, null))
        .listener(jobListener)
        .build()
}
```

차이는 날짜 계산뿐이에요.
주간은 `date.with(DayOfWeek.MONDAY)`로 해당 주의 월요일을 잡고, 월간은 `date.with(TemporalAdjusters.firstDayOfMonth())`로 월초를 잡아요.
이 날짜가 MV 테이블의 `ranking_date`가 됩니다.

`@ConditionalOnProperty`로 Job 단위 활성화를 걸어둬서, 배치 애플리케이션이 뜰 때 `spring.batch.job.name=weeklyRankingJob`을 주면 주간 Job만 빈 등록되고, 월간 설정은 아예 로딩되지 않아요.

---

## ⚖️ Cleanup과 Aggregate를 왜 두 Step으로 분리했나요?

각 Job은 두 개의 Step으로 구성돼 있어요.
Step 1은 기존 MV 데이터를 삭제하는 Cleanup Tasklet이고, Step 2는 `product_metrics`에서 읽어서 MV에 적재하는 Chunk-Oriented Step이에요.

처음엔 "Aggregate Step 시작할 때 기존 데이터 DELETE하고 INSERT하면 되지 않나?" 싶었어요.
하나의 Step에 넣으면 코드도 간결하고 트랜잭션도 하나로 묶이니까요.

근데 그게 문제예요.
하나의 트랜잭션이면 Aggregate가 실패했을 때 Cleanup까지 롤백돼요.
이전 데이터가 그대로 남아 있게 되는 거죠.

언뜻 보면 "이전 데이터라도 남아있는 게 낫지 않나?" 싶을 수 있어요.
근데 이전 데이터는 지난 주 배치가 적재한 거예요.
이번 주 배치가 실패했는데 지난 주 랭킹을 "이번 주 랭킹"으로 보여주면, 유저는 틀린 데이터를 보고 있는지 모르는 채로 지나가요.
빈 결과를 받으면 "뭔가 문제가 있구나"를 인지할 수 있고, API 호출 쪽에서 fallback 로직을 태울 수도 있어요.

Cleanup Tasklet은 간결해요.

```kotlin
class CleanupRankingTasklet(
    private val rankingDate: LocalDate,
    private val deleteAction: (LocalDate) -> Unit,
    private val tableName: String,
) : Tasklet {
    override fun execute(contribution: StepContribution, chunkContext: ChunkContext): RepeatStatus {
        log.info("$tableName 기존 데이터 삭제: rankingDate=$rankingDate")
        deleteAction(rankingDate)
        return RepeatStatus.FINISHED
    }
}
```

`deleteAction`은 JpaRepository의 `deleteByRankingDate`를 메서드 레퍼런스로 넘기고 있어요.
Tasklet이 직접 어떤 테이블을 지우는지 몰라도 되게끔, 삭제 행위 자체를 주입받는 구조예요.

처음에는 Tasklet에 `@Transactional`을 붙여뒀는데, 코드 리뷰에서 지적받았어요.
Spring Batch의 Tasklet Step은 이미 `transactionManager`로 트랜잭션을 관리하고 있어서, Tasklet 자체에 `@Transactional`을 붙이면 트랜잭션이 이중으로 걸려요.
기능적으로 문제가 생기진 않지만, 불필요한 어노테이션은 혼란만 줘서 제거했습니다.

---

## 🔎 100건인데 Chunk-Oriented가 필요한가요?

솔직히 지금 데이터로만 보면 필요 없어요.
TOP 100이고 chunk_size도 100이니까, 한 번의 chunk에서 다 처리돼요.
Tasklet 하나에 JDBC로 SELECT 하고 INSERT 하면 끝이에요.

그런데 이건 "지금 100건이니까 괜찮다"에 기대는 판단이에요.

상품이 수만 개로 늘어나고 TOP 10,000을 집계해야 하는 날이 오면, chunk_size=1000으로 10개 chunk가 돌아야 해요.
중간에 7번째 chunk에서 DB 커넥션이 끊기면, Tasklet 방식은 처음부터 다시 돌아야 해요.
Chunk 방식은 실패한 chunk부터 재시작할 수 있어요.

과제에서 Chunk-Oriented를 권장하기도 했고, "나중에 구조를 바꾸지 않아도 되는" 쪽을 택했습니다.

Reader는 `JdbcCursorItemReader`로 composite score를 계산해서 정렬된 결과를 읽어요.

```sql
SELECT product_id, view_count, like_count, order_count, sales_amount,
       (view_count * 0.1 + like_count * 0.2 + order_count * 0.7) AS score
FROM product_metrics
ORDER BY score DESC
LIMIT 100
```

가중치는 Round 9에서 정한 것과 동일해요.
view 0.1, like 0.2, order 0.7.
합이 1.0이라 score를 "가중 평균 행동 수"로 읽을 수 있는 게 장점이었고, 그걸 그대로 가져왔어요.

Writer는 조금 고민이 있었어요.

---

## ⚠️ `currentRank` 초기화를 빼먹으면 어떻게 되나요?

`RankingWriter`는 `ItemWriter`와 `StepExecutionListener`를 동시에 구현해요.

```kotlin
class RankingWriter<E>(
    private val rankingDate: LocalDate,
    private val entityFactory: (ProductMetricsRow, Int, LocalDate) -> E,
    private val saveAction: (List<E>) -> Unit,
) : ItemWriter<ProductMetricsRow>, StepExecutionListener {
    private var currentRank = 0

    override fun beforeStep(stepExecution: StepExecution) {
        currentRank = 0
    }

    override fun write(chunk: Chunk<out ProductMetricsRow>) {
        val entities = chunk.items.map { row ->
            currentRank++
            entityFactory(row, currentRank, rankingDate)
        }
        saveAction(entities)
    }
}
```

처음에는 `StepExecutionListener` 없이 단순 인스턴스 변수로 `currentRank`를 뒀어요.
테스트는 전부 통과했어요.
정상 흐름에서는 문제가 안 보이니까요.

코드 리뷰에서 이런 질문을 받았어요.
"Step이 실패하고 재시작되면 Writer 인스턴스가 재사용되는데, 그때 `currentRank`가 100에서 시작하면?"

랭킹이 101부터 매겨져요.
1위 상품이 101위로 적재돼요.

`beforeStep()`에서 0으로 초기화하면 재시작할 때도 1부터 시작해요.
한 줄짜리 수정이었는데, 이걸 빼먹으면 정상 흐름에서는 절대 안 잡히는 버그가 프로덕션에서 터져요.
Round 9에서 `LocalDate.now()`와 같은 패턴이에요.
정상 흐름에서만 테스트하면 안 보이는 것들이 있더라고요.

Writer를 제네릭으로 만든 것도 의도가 있었어요.
주간과 월간의 Writer 로직이 동일한데, 적재하는 Entity만 `ProductRankWeeklyEntity`와 `ProductRankMonthlyEntity`로 달라요.
`entityFactory`와 `saveAction`을 람다로 주입받으면 Writer 코드를 복붙하지 않아도 돼요.

---

## 📊 API는 어떻게 일간/주간/월간을 분기하나요?

`RankingPeriod` enum으로 분기해요.

```kotlin
enum class RankingPeriod {
    DAILY,
    WEEKLY,
    MONTHLY,
}
```

API 엔드포인트는 하나예요.

```
GET /api/v1/rankings?date=20260417&period=DAILY&size=20&page=1
```

`GetRankingUseCase`에서 `when (period)`로 나뉘어요.
DAILY면 기존 Redis ZSET에서 조회하고, WEEKLY면 `mv_product_rank_weekly` 테이블에서, MONTHLY면 `mv_product_rank_monthly` 테이블에서 JPA로 조회해요.

```kotlin
val (entries, totalCount) = when (period) {
    RankingPeriod.DAILY -> {
        val entries = rankingRepository.getTopRankings(date, offset, size.toLong())
        val count = rankingRepository.getTotalCount(date)
        entries to count
    }
    RankingPeriod.WEEKLY -> {
        val rankingDate = toStartOfWeek(date)
        val entries = weeklyRankingRepository.findRankings(rankingDate, page - 1, size)
        val count = weeklyRankingRepository.countByRankingDate(rankingDate)
        entries to count
    }
    RankingPeriod.MONTHLY -> {
        val rankingDate = toStartOfMonth(date)
        val entries = monthlyRankingRepository.findRankings(rankingDate, page - 1, size)
        val count = monthlyRankingRepository.countByRankingDate(rankingDate)
        entries to count
    }
}
```

entries를 가져온 뒤의 상품/브랜드 enrichment는 `buildRankingPageInfo`로 공통 추출했어요.
Round 9에서 N+1을 잡으면서 만들었던 `findAllByIds` IN 쿼리가 그대로 재사용돼요.
period가 뭐든 productId 목록이 나오면, 그 이후는 같은 흐름이에요.

처음에는 도메인 리포지토리 인터페이스에서 `offset`과 `limit`을 직접 받았어요.
코드 리뷰에서 "UseCase에서 offset을 계산해서 넘기고, Repository에서 다시 PageRequest로 변환하면 이중 변환"이라는 피드백을 받았어요.
`page`와 `size`를 그대로 넘기도록 바꿨습니다.

MV 테이블에는 `(ranking_date, ranking)` 복합 인덱스를 걸어뒀어요.
`ranking_date`로 필터링한 뒤 `ranking` 순서로 정렬하는 쿼리가 나가니까, 이 인덱스 하나로 커버돼요.

---

## 🕳️ 아직 풀지 못한 것들

**일별 스냅샷 없이는 진짜 "이번 주만의" 랭킹을 만들 수 없어요.**
지금 방식은 누적 메트릭 기준 스냅샷이에요.
"이번 주에 급상승한 상품"은 표현할 수 없고, 매주 비슷한 TOP이 반복될 가능성이 높아요.

**Redis ZSET TTL 2일이라 7일 전 데이터 복구가 불가능해요.**
일별 스냅샷을 만들더라도 ZSET이 아닌 별도 저장소에 기록해야 하는데, 그건 데이터 파이프라인 재설계에요.

**병렬 Step, 파티셔닝 같은 고급 배치 패턴은 다루지 않았어요.**
상품이 수십만 개가 되면 Reader를 파티셔닝해서 병렬로 읽어야 하는데, 지금은 LIMIT 100이라 필요가 없었어요.
필요해지는 시점은 "TOP N의 N이 커지거나, 점수 계산 로직이 복잡해져서 읽기 자체가 느려질 때"예요.

---

## 🔄 10주를 돌아보며

10주 동안 하나의 커머스 시스템을 계속 확장해왔어요.
처음엔 도메인 모델 하나 만드는 것부터 시작했는데, 끝나고 보니 꽤 넓은 범위를 건드렸더라고요.

1~3주차는 도메인 모델링과 계층 분리를 다뤘어요.
DIP를 적용하고, Aggregate Root를 설계하고, infrastructure가 domain을 의존하지 않게 만드는 구조를 잡았어요.
이때는 "아키텍처 규칙이 왜 필요한가"를 몸으로 배운 시기였어요.

4주차에서 처음으로 생각이 크게 바뀌었어요.
트랜잭션과 동시성을 다루면서, `@Transactional` 하나 붙이면 끝나는 게 아니라는 걸 깨달았거든요.
SELECT FOR UPDATE를 쓸지, 낙관적 락을 쓸지, 아니면 아예 DB 레벨에서 원자적 UPDATE로 갈지.
"정합성을 어디에서 보장할 것인가"라는 질문이 처음 나온 주차였고, 이후로 매 라운드마다 이 질문이 계속 돌아왔어요.

5~6주차는 읽기 최적화와 PG 연동이었어요.
캐시 무효화 전략, Resilience4j 서킷 브레이커, 타임아웃 설계.
외부 시스템이 느려지면 내 서비스가 같이 죽는 문제를 처음 겪었고, "빨리 끊는 것"이 "기다리는 것"보다 나을 때가 있다는 판단을 내렸어요.

7주차가 두 번째 전환점이었어요.
이벤트 기반 아키텍처와 Kafka를 도입하면서, 동기 호출을 끊으면 시스템이 얼마나 유연해지는가를 체감했어요.
주문 완료 이벤트를 발행하면 재고 차감, 포인트 적립, 알림 발송이 각자의 속도로 움직여요.
하나가 느려져도 다른 것들이 기다리지 않아요.

8주차는 Redis ZSET으로 대기열을 만들었어요.
`ZADD NX`의 원자성 덕분에 분산 환경에서도 순서가 보장되는 구조였어요.

9주차에서 같은 ZSET을 랭킹에 썼어요.
`ZINCRBY` 한 줄이면 되는 구현이었는데, `LocalDate.now()` 한 줄을 잘못 쓰면 컨슈머 랙이 벌어질 때 어제 매출이 오늘 랭킹에 꽂히는 버그가 생겨요.
정상 흐름에서만 테스트하면 안 보이는 것들이 있다는 걸, 코드 한 줄로 배웠어요.

10주차는 Spring Batch로 MV를 적재했어요.
누적 데이터로 구간 랭킹을 만들어야 하는 한계, Step 분리의 이유, Chunk-Oriented의 확장성 판단, 재시작 시 상태 초기화.
배치는 "한 번 돌리면 끝"이 아니라 "실패했을 때 어디서부터 다시 시작하나"가 핵심이더라고요.

돌아보면 가장 반복적으로 물었던 질문은 하나예요.
"지금 동작하는 건 알겠는데, 이게 깨지는 조건은 뭐지?"

정상 흐름에서는 다 괜찮아 보여요.
`LocalDate.now()`도, `currentRank` 인스턴스 변수도, Cleanup 없는 단일 Step도.
깨지는 건 컨슈머 랙이 벌어지거나, Step이 재시작되거나, 배치가 실패한 직후 재실행될 때예요.
이런 비정상 경로를 미리 상상할 수 있느냐가, 10주 전의 저와 지금의 차이인 것 같아요.

실시간 일간 랭킹은 Redis ZSET으로, 주간/월간은 Batch+MV로 사전 집계.
실시간성이 불필요한 구간에 실시간 비용을 쏟지 않는 판단.
이 조합이 10주의 결론이에요.

캐시 무효화, Kafka 이벤트 드리븐, 서킷 브레이커, Redis ZSET 랭킹, Spring Batch MV 적재.
이것들이 하나의 커머스 시나리오 안에서 연결돼 있어요.
각각을 따로 배웠으면 "아 그런 게 있구나"로 끝났을 텐데, 하나의 서비스에서 연결해보니 왜 이 조합이 나오는지가 보여요.
실무에서도 이 패턴들이 따로 노는 게 아니라 하나의 흐름으로 이어져 있을 거라고 판단해요.
