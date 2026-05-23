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
---

> **TL;DR**
>
> Spring Batch로 주간/월간 랭킹을 만들었어요.
> 근데 "이번 주에 가장 많이 팔린 상품"은 아니에요.
> `product_metrics`가 누적 테이블이라 날짜 구분이 안 되거든요.
>
> - 누적 테이블 위에서 "이번 주"를 만들 수 없다는 한계와, 그 위에서 내린 타협
> - Cleanup-Aggregate 분리가 가용성을 포기한 설계였다는 사실과, API Fallback으로 메운 구멍
> - `currentRank` 멤버 변수가 재시작을 깨뜨린다는 걸 리뷰에서 지적받고, `ExecutionContext`로 고친 과정
> - 미사용 컬럼, rank 이중 변환, 입력 검증 누락까지 — 코드 리뷰가 잡아낸 12건의 결함

---

## 이전 라운드에서 멈춘 곳

Round 9에서 Kafka Consumer + Redis ZSET으로 일간 랭킹을 만들었어요.
`ZINCRBY` 한 줄이면 점수가 누적되고, `ZREVRANGE`로 Top-N을 꺼내면 끝이었죠.

자연스럽게 떠오른 방법이 있었어요.
Redis ZSET 키가 `ranking:all:{yyyyMMdd}` 형태니까, 7개 키를 `ZUNIONSTORE`로 합치면 주간 랭킹이 되겠다고 생각했거든요.

근데 TTL이 2일이에요.
3일 전 키는 이미 사라졌어요.
7일치를 합칠 수가 없었어요.

---

## 누적 테이블 위에 "이번 주"는 없다

`product_metrics` 테이블 구조를 보면 바로 보여요.

```sql
SELECT product_id, view_count, like_count, order_count
FROM product_metrics
```

날짜 컬럼이 없어요.
서비스 시작 이후 모든 조회, 좋아요, 주문이 한 row에 누적돼 있어요.
어제의 조회수와 오늘의 조회수가 뒤섞여 있어서, "이번 주에 몇 번 조회됐는가"를 물어볼 방법이 없거든요.

진짜 주간 랭킹을 만들려면 일별 스냅샷 테이블이 필요해요.
매일 자정에 `product_metrics_daily`에 그날의 delta를 기록하고, 주간 집계할 때 7일치를 합산하는 거죠.

그건 이번 과제의 범위를 넘어가요.
그래서 타협했어요.
"배치가 실행되는 시점의 누적 메트릭 기준 TOP 100"을 MV 테이블에 적재하는 방식으로 갔어요.
"이번 주에 가장 많이 팔린"이 아니라 "전체 기간에서 가장 인기 있는"에 가까운 결과예요.

이걸 "주간 랭킹"이라고 부르면 기획 사기에 가까워요.
신규 상품은 이번 주에 아무리 많이 팔려도 누적 스테디셀러를 이길 수 없으니까요.
이건 랭킹이 아니라 명예의 전당이에요.

그 사실을 숨기지 않고 적어둬요.
실무에서도 일별 스냅샷 없이 빠르게 MVP를 만들 때 이 패턴을 쓰곤 하는데, 중요한 건 **이름이 실체를 정직하게 반영하는가**예요.

---

## Job을 왜 주간과 월간으로 나눴나요?

하나의 Job에 `period` 파라미터를 넘겨서 분기하는 것도 가능했어요.
코드 중복도 줄고 관리 포인트도 하나가 되니까요.

근데 스케줄링이 달라요.
주간 Job은 매주 월요일 새벽에 돌고, 월간 Job은 매월 1일 새벽에 돌아요.
Job 하나에 넣으면 `requestDate`를 파싱해서 "이게 월요일인가, 1일인가"를 판단하는 로직이 Job 안에 들어가야 하는데, 그건 스케줄러의 책임이지 Job의 책임이 아니거든요.

Job이 분리되면 실패 시 하나만 재실행하면 돼요.
월간 Job이 터졌는데 주간까지 다시 돌릴 이유가 없죠.

두 Job의 구조는 거의 동일해요.
차이는 날짜 계산뿐이에요.
주간은 `date.with(DayOfWeek.MONDAY)`로 해당 주의 월요일을 잡고, 월간은 `date.with(TemporalAdjusters.firstDayOfMonth())`로 월초를 잡아요.

SQL, chunk size, ranking limit 같은 공통 설정은 `RankingBatchConstants`로 추출했어요.
두 Job Config에서 같은 SQL을 각각 선언하고 있었는데, 코드 리뷰에서 중복 지적을 받고 정리한 거예요.

---

## Cleanup-Aggregate 분리의 가용성 구멍

각 Job은 두 개의 Step으로 구성돼 있어요.
Step 1은 기존 MV 데이터를 삭제하는 Cleanup Tasklet이고, Step 2는 `product_metrics`에서 읽어서 MV에 적재하는 Chunk-Oriented Step이에요.

처음엔 "Aggregate Step 시작할 때 기존 데이터 DELETE하고 INSERT하면 되지 않나?" 싶었어요.
하나의 Step에 넣으면 코드도 간결하고 트랜잭션도 하나로 묶이니까요.

근데 하나의 트랜잭션이면 Aggregate가 실패했을 때 Cleanup까지 롤백돼요.
이전 데이터가 그대로 남아 있게 되는 거죠.

그래서 분리했는데, **이것도 문제가 있었어요.**
Cleanup이 끝나고 Aggregate가 도는 사이에 유저가 랭킹 페이지에 접속하면 빈 화면을 봐요.
Aggregate에서 네트워크 에러로 재시도가 길어지면 그 시간 동안 랭킹이 없어요.

실무에서는 Shadow Table에 먼저 적재하고 `RENAME TABLE`로 무중단 교체하거나, append-only로 쌓고 최신 `ranking_date`를 조회하는 방식을 써요.
이번엔 거기까지 가지 않고, **API 레벨에서 Fallback 체인**을 넣어서 구멍을 메웠어요.

---

## API Fallback: 빈 화면을 보여주지 않는 임시방편

MV가 비어있을 때 빈 배열을 그대로 내보내면 서비스 장애나 다름없어요.
그래서 `GetRankingUseCase`에 3단계 Fallback을 넣었어요.

```kotlin
RankingPeriod.WEEKLY -> {
    val rankingDate = toStartOfWeek(date)
    val entries = weeklyRankingRepository.findRankings(rankingDate, page - 1, size)
    val count = weeklyRankingRepository.countByRankingDate(rankingDate)
    if (entries.isNotEmpty()) {
        entries to count
    } else {
        // 이전 주 데이터로 fallback
        val prevWeek = rankingDate.minusWeeks(1)
        val fallbackEntries = weeklyRankingRepository.findRankings(prevWeek, page - 1, size)
        val fallbackCount = weeklyRankingRepository.countByRankingDate(prevWeek)
        if (fallbackEntries.isNotEmpty()) {
            fallbackEntries to fallbackCount
        } else {
            // 최종 fallback: 일간 Redis
            rankingRepository.getTopRankings(date, offset, size.toLong()) to
                rankingRepository.getTotalCount(date)
        }
    }
}
```

이번 주 MV가 비어있으면 이전 주 MV를 찾아보고, 그마저도 없으면 일간 Redis ZSET으로 넘어가요.
유저는 어떤 상황에서든 "뭔가"를 봐요.

근본 해결은 아니에요.
이전 주 데이터를 이번 주 데이터처럼 보여주는 건 정직하지 않으니까요.
근본 해결은 append-only + 최신 `ranking_date` 조회이거나, Shadow Table `RENAME`이에요.
이번엔 Fallback이 비용 대비 충분한 임시방편이라고 판단했어요.

---

## 100건인데 Chunk-Oriented가 필요한가요?

Reader는 `JdbcCursorItemReader`로 composite score를 계산해서 정렬된 결과를 읽어요.

```sql
SELECT product_id,
       (view_count * 0.1 + like_count * 0.2 + order_count * 0.7) AS score
FROM product_metrics
ORDER BY score DESC
LIMIT 100
```

처음엔 `sales_amount`도 SELECT에 포함했었어요.
코드 리뷰에서 "score 계산에 안 쓰이는 컬럼을 왜 읽느냐"고 지적받았어요.
맞는 말이에요.
불필요한 데이터 전송이고, 나중에 가중치 바꿀 때 혼란만 줘요.
SQL과 `ProductMetricsRow` DTO에서 전부 제거했어요.

가중치는 Round 9에서 정한 것과 동일해요.
view 0.1, like 0.2, order 0.7.

TOP 100 + chunk_size 100이면 한 번의 chunk에서 다 처리돼요.
Tasklet 하나에 JDBC로 SELECT 하고 INSERT 하면 끝이에요.

근데 이건 "지금 100건이니까 괜찮다"에 기대는 판단이에요.
상품이 수만 개로 늘어나고 TOP 10,000을 집계해야 하는 날이 오면, chunk_size=1000으로 10개 chunk가 돌아야 해요.
중간에 7번째 chunk에서 DB 커넥션이 끊기면, Tasklet 방식은 처음부터 다시 돌아야 해요.
Chunk 방식은 실패한 chunk부터 재시작할 수 있어요.

다만 "재시작할 수 있다"고 말하려면 조건이 하나 더 붙어요.

---

## `currentRank`와 `ExecutionContext` — 코드 리뷰가 잡아낸 재시작 버그

첫 구현의 `RankingWriter`는 `currentRank`를 멤버 변수로 뒀어요.
`beforeStep()`에서 0으로 초기화하니까 정상 흐름에서는 문제가 안 보였어요.

코드 리뷰에서 이런 질문이 왔어요.
"chunk 5에서 실패하고 재시작되면, `beforeStep`이 다시 0을 박아넣어서 chunk 6의 첫 상품이 1위로 적재되는 거 아니냐?"

맞아요.
멤버 변수에 상태를 저장하는 건 "이 배치는 재시작을 지원하지 않는다"는 선언과 같아요.

`ExecutionContext`에 저장/복구하도록 수정했어요.

```kotlin
class RankingWriter<E>(
    private val rankingDate: LocalDate,
    private val entityFactory: (ProductMetricsRow, Int, LocalDate) -> E,
    private val saveAction: (List<E>) -> Unit,
) : ItemWriter<ProductMetricsRow>, StepExecutionListener {
    private lateinit var stepExecution: StepExecution
    private var currentRank = 0

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
}
```

chunk가 성공적으로 커밋되면 `ExecutionContext`에 현재 rank가 저장돼요.
재시작 시 `beforeStep`에서 마지막으로 커밋된 rank를 복구해서 이어서 매겨요.

Writer를 제네릭으로 만든 것도 의도가 있었어요.
주간과 월간의 Writer 로직이 동일한데, 적재하는 Entity만 달라요.
`entityFactory`와 `saveAction`을 람다로 주입받으면 코드를 복붙하지 않아도 돼요.

---

## API 분기와 rank 컨벤션 통일

`RankingPeriod` enum으로 UseCase에서 분기해요.

```kotlin
enum class RankingPeriod {
    DAILY,
    WEEKLY,
    MONTHLY,
}
```

DAILY면 기존 Redis ZSET에서 조회하고, WEEKLY/MONTHLY면 MV 테이블에서 JPA로 조회해요.
enrichment(상품/브랜드 조인)는 `buildRankingPageInfo`로 공통 추출했어요.
Round 9에서 N+1을 잡을 때 만든 `findAllByIds` IN 쿼리가 그대로 재사용돼요.

코드 리뷰에서 **rank 이중 변환** 문제를 지적받았어요.
MV 테이블에 1-based ranking(1, 2, 3...)이 저장돼 있는데, JPA 리포지토리에서 `entity.ranking - 1`로 0-based로 바꾸고, UseCase에서 다시 `entry.rank + 1`로 1-based로 되돌리고 있었어요.
라운드트립이 무의미해요.

MV 리포지토리는 1-based 그대로 반환하고, Redis(DAILY)만 0-based이므로 UseCase에서 분기하도록 정리했어요.

```kotlin
val isRankZeroBased = period == RankingPeriod.DAILY
val displayRank = if (isRankZeroBased) entry.rank + 1 else entry.rank
```

Controller에도 입력 검증이 없었어요.
`page=0`이나 `size=-1`이 들어오면 `PageRequest.of()`에서 `IllegalArgumentException`이 터져서 500이 나가요.
`@Min(1)` `@Max(100)`으로 4xx 응답으로 바꿨어요.

```kotlin
@Validated
@RestController
@RequestMapping("/api/v1/rankings")
class RankingController(...) {
    @GetMapping
    fun getRankings(
        @RequestParam(required = false) date: String?,
        @RequestParam(required = false, defaultValue = "DAILY") period: RankingPeriod,
        @RequestParam(required = false, defaultValue = "20") @Min(1) @Max(100) size: Int,
        @RequestParam(required = false, defaultValue = "1") @Min(1) page: Int,
    ): ApiResponse<GetRankingResponse> { ... }
}
```

MV 테이블에는 `(ranking_date, ranking)` 복합 인덱스와 `(product_id, ranking_date)` 유니크 제약을 걸었어요.
유니크 제약이 없으면 Cleanup이 스킵되거나 실패한 후 Aggregate가 재실행될 때 동일 데이터가 중복 삽입돼요.

---

## 아직 풀지 못한 것들

**`product_metrics` 자체가 누적 단일 row라는 데이터 모델 한계가 남아요.**
`ORDER BY (계산 컬럼) DESC LIMIT 100`은 인덱스를 못 타는 Filesort예요.
상품이 100만 개가 되면 DB CPU가 배치에 점유되어 다른 API까지 느려져요.

**Cleanup-Aggregate 사이의 가용성 구멍은 Fallback으로 메웠지만 근본 해결은 아니에요.**
Shadow Table + `RENAME TABLE`이나 append-only + 최신 `ranking_date` 조회가 실무 정답이에요.

**"이번 주에 핫한 상품"이라는 도메인 표현은 여전히 불가능해요.**
일별 스냅샷이 들어와야 풀리는 문제예요.

---

## 정리

이번 주차에서 가장 많이 배운 건 **코드 리뷰의 가치**예요.

혼자서는 테스트 rank 순서가 틀린 것도, `salesAmount`를 읽고 안 쓰는 것도, `currentRank`가 재시작에서 깨지는 것도 못 찾았어요.
12건의 지적이 들어왔고, CRITICAL 3건, MAJOR 3건, MINOR 6건을 전부 수정했어요.

정상 흐름에서만 테스트하면 안 보이는 것들이 있어요.
배치가 실패하고 재시작될 때, API에 잘못된 파라미터가 들어올 때, MV가 비어있을 때.
이런 비정상 경로를 코드 작성 시점에 상상할 수 있느냐가 설계 역량의 차이라는 걸, 리뷰를 통해 체감했어요.

> 10주 회고는 별도 포스팅으로 분리했어요. 이 글은 "누적 테이블 위에 주간 랭킹을 얹었을 때 생기는 문제"에 집중하는 쪽이 맞다고 판단했어요.
