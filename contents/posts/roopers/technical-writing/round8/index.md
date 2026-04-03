---
title: "주문 버튼 1만 번 눌리면, 대기열 없이 버틸 수 있을까?"
date: 2026-04-03
update: 2026-04-03
tags:
- 대기열
- Redis
- SortedSet
- 동시성
- 비관적락
- SELECT_FOR_UPDATE
- INSERT_IGNORE
- 커머스
- Spring
---

# 주문 버튼이 1만 번 눌리면, 대기열 없이 버틸 수 있을까?

> **TL;DR**
>
> 재고 차감에 `SELECT FOR UPDATE`를 걸어두면 동시성은 보장되지만, 트래픽이 몰리는 순간 락 대기가 연쇄적으로 쌓이면서 DB 커넥션 풀이 고갈됩니다.
>
> Redis Sorted Set 기반 대기열을 앞단에 두고, 스케줄러가 DB 처리량에 맞춰 사용자를 배치 단위로 입장시키는 구조를 만들었습니다.
> 그 과정에서 배치 크기를 어떻게 산정했는지, 토큰 TTL을 왜 300초로 잡았는지, 그리고 대기열이 풀지 못하는 문제는 무엇인지를 기록합니다.

---

## 🔥 락이 있으면 안전한 거 아닌가요?

재고 차감 로직에는 이미 `SELECT FOR UPDATE` + 조건부 `UPDATE`가 걸려 있었어요.

```sql
SELECT * FROM product WHERE id = ? FOR UPDATE;
UPDATE product SET stock = stock - ? WHERE id = ? AND stock >= ?;
```

한 트랜잭션이 row lock을 잡고 있으면 다음 트랜잭션은 락이 풀릴 때까지 대기하고, `WHERE stock >= ?`가 최종 방어선 역할을 하기 때문에 정합성 자체는 깨지지 않습니다.

10명이 동시에 주문해도 문제없어요.
100명이 와도 느리긴 하겠지만 버틸 수 있습니다.

그런데 1만 명이 동시에 누르면 이야기가 달라져요.

DB 커넥션 풀이 50개라고 하면, 50개의 트랜잭션이 동시에 `FOR UPDATE` 락을 잡으려 경합합니다.
주문 1건의 평균 처리 시간이 200ms라면, 락을 잡은 트랜잭션이 끝나야 다음 트랜잭션이 진행되니까 실질적으로 직렬 처리에 가까워져요.

50개 커넥션이 전부 락 대기에 묶이면, 51번째 요청부터는 HikariCP의 `connectionTimeout`(기본 30초)을 기다리다 예외가 터집니다.
상품 조회, 브랜드 목록 같은 락과 무관한 API까지 커넥션을 얻지 못해서 같이 죽어요.

문제는 재고 정합성이 아니라, 락 경합이 시스템 전체의 가용성을 잡아먹는다는 거였어요.

![FOR UPDATE 락 경합이 서비스 전체를 죽이는 과정](./01-lock-contention.svg)

---

## 🚪 그러면 DB에 들어오는 요청 자체를 조절하면 되지 않을까?

락을 더 빠르게 풀거나, 락 없이 처리하는 방법도 있겠지만, 근본적으로는 DB에 동시에 도달하는 요청 수를 줄여야 했어요.

1만 명이 동시에 `FOR UPDATE`를 때리는 게 문제니까, DB가 감당할 수 있는 속도로 요청을 흘려보내면 됩니다.

이걸 하려면 사용자를 일단 어딘가에 줄 세워두고, DB 처리량에 맞춰 조금씩 입장시키는 구조가 필요했어요.

선택지가 두 가지 있었는데요.

**DB 기반 대기열**은 `waiting_queue` 테이블에 INSERT하고, 스케줄러가 `SELECT ... FOR UPDATE SKIP LOCKED`로 뽑아가는 방식이에요.
별도 인프라 없이 RDB만으로 가능하다는 장점이 있지만, 대기열 자체가 DB에 부하를 주는 아이러니가 생깁니다.
1만 명이 동시에 INSERT하면 그것만으로도 커넥션 풀 경합이 발생할 수 있어요.

**Redis 기반 대기열**은 Sorted Set에 `ZADD`로 넣고, `ZPOPMIN`으로 뽑아가는 방식이에요.
Redis는 싱글 스레드에서 원자적으로 처리하기 때문에 1만 건 `ZADD`가 동시에 들어와도 경합이 없습니다.

이 프로젝트에는 이미 쿠폰 비동기 발급과 상품 캐시를 위해 Redis가 올라가 있었기 때문에, 추가 인프라 비용 없이 Redis를 쓸 수 있었어요.
DB 커넥션 풀을 보호하려고 대기열을 만드는 건데, 그 대기열이 DB를 쓰면 의미가 반감되니까 Redis를 택했습니다.

📌 **포기한 것** — DB 기반 대기열은 Redis 장애 시에도 동작한다는 장점이 있었는데, 대기열 자체의 쓰기 부하가 원래 문제(커넥션 풀 고갈)를 악화시킬 수 있어서 포기했어요.

---

## ⏳ 대기열은 어떤 구조로 동작하나요?

흐름은 세 단계로 나뉘어요.

사용자가 주문 페이지에 진입하면 `POST /api/v1/queue/enter`를 호출합니다.
이때 Redis Sorted Set에 `userId`를 score(현재 타임스탬프)와 함께 넣어요.

```kotlin
fun enter(userId: Long): QueueEntryResult {
    val existingToken = entryTokenRepository.findToken(userId)
    if (existingToken != null) {
        return QueueEntryResult.alreadyAuthorized(existingToken)
    }

    val score = System.currentTimeMillis().toDouble()
    waitingQueueRepository.enqueue(userId, score)

    val position = (waitingQueueRepository.getPosition(userId) ?: 0L) + 1
    val estimatedWaitSeconds = (position * SECONDS_PER_USER).toLong().coerceAtLeast(1)

    return QueueEntryResult.queued(position, estimatedWaitSeconds)
}
```

내부적으로 Redis의 `ZADD NX`(존재하지 않을 때만 추가)를 쓰기 때문에, 이미 대기열에 있는 사용자는 중복 등록되지 않고 기존 순번을 그대로 유지합니다.
이미 입장 토큰이 발급된 사용자는 대기열을 거치지 않고 바로 `ALREADY_AUTHORIZED`를 반환하고요.

스케줄러가 100ms마다 Sorted Set에서 score가 가장 낮은(가장 먼저 온) N명을 `ZPOPMIN`으로 꺼내서, 각각에게 UUID 기반 입장 토큰을 발급합니다.

```kotlin
@Scheduled(fixedDelay = 100)
fun processQueue() {
    val userIds = waitingQueueRepository.dequeueTopN(BATCH_SIZE)
    if (userIds.isEmpty()) return

    for (userId in userIds) {
        val token = UUID.randomUUID().toString()
        entryTokenRepository.issueToken(userId, token, TOKEN_TTL_SECONDS)
    }
}
```

토큰을 받은 사용자만 주문 API를 호출할 수 있어요.
`CreateOrderUseCase`의 첫 줄에서 토큰 존재 여부를 확인하고, 없으면 403으로 거부합니다.

```kotlin
if (!entryTokenRepository.hasToken(userId)) {
    throw CoreException(ErrorType.FORBIDDEN, "대기열 입장 토큰이 없습니다. 대기열에 먼저 진입해주세요.")
}
```

주문이 완료되면 토큰을 삭제해서, 한 번 입장한 사용자가 토큰을 재사용하지 못하게 했어요.

![Redis 대기열 + 입장 토큰 구조](./02-queue-architecture.svg)

---

## 🔢 배치 크기 18은 어디서 나온 숫자인가요?

이 숫자를 감으로 잡으면 안 되겠다고 생각했어요.
너무 크면 대기열 없이 몰리는 것과 다를 바 없고, 너무 작으면 사용자 대기 시간이 불필요하게 길어지니까요.

계산은 DB 처리량에서 역산했습니다.

DB 커넥션 풀이 50개이고, 주문 1건의 평균 처리 시간이 200ms라면, 이론적 최대 TPS는 `50 / 0.2 = 250`이에요.
다만 커넥션 풀을 100% 쓰면 주문 외의 API(상품 조회, 브랜드 목록 등)가 커넥션을 못 얻으니까, 안전 마진 70%를 적용해서 175 TPS로 잡았습니다.

스케줄러가 100ms마다 실행되니까, 한 번에 입장시킬 수 있는 인원은 `175 * 0.1 = 17.5`, 반올림해서 18명이에요.

```
커넥션 풀: 50
주문 처리 시간: 200ms
이론적 최대 TPS: 50 / 0.2 = 250
안전 마진 70%: 175 TPS
스케줄러 주기: 100ms
배치 크기: 175 × 0.1 ≈ 18명
```

안전 마진을 70%로 잡은 건, 커넥션 풀의 30%를 읽기 전용 API에 남겨두기 위해서예요.
50%로 잡으면 배치 크기가 12~13으로 줄어들어서 대기 시간이 늘어나고, 90%로 잡으면 주문 트래픽이 몰릴 때 읽기 API까지 영향을 받을 수 있습니다.

스케줄러 주기를 100ms로 잡은 것도 비슷한 맥락이에요.
1초로 늘리면 배치 크기를 175로 올릴 수 있지만, 175명이 한꺼번에 `FOR UPDATE`를 때리면 순간적으로 락 경합이 발생합니다.
100ms 간격으로 18명씩 흘려보내면 DB 입장에서는 거의 일정한 부하가 유지돼요.

📌 **포기한 것** — 동적 배치 크기 조절(현재 active 커넥션 수를 보고 배치 크기를 줄이는 방식)은 구현 복잡도 대비 효과가 불확실해서 넣지 않았어요.
고정 배치 크기가 안전 마진 안에서 동작하는 걸 테스트로 확인한 뒤, 정적 값으로 유지하기로 판단했습니다.

---

## ⏱️ 토큰 TTL은 왜 300초인가요?

입장 토큰에 TTL이 없으면, 토큰을 받고 주문하지 않은 사용자가 영원히 "입장한 상태"로 남습니다.
그 사용자 수만큼 실질적인 동시 접속 수가 줄지 않아서, 뒤에서 기다리는 사용자의 대기 시간이 늘어나요.

300초(5분)로 잡은 건, 일반적인 커머스 주문 흐름(상품 확인, 배송지 입력, 결제)이 3~5분 안에 끝난다는 가정에서예요.

60초로 줄이면 회전율은 올라가지만, 결제 중간에 토큰이 만료되어 주문이 실패하는 UX 문제가 생길 수 있습니다.
600초로 늘리면 UX는 편하지만, 토큰만 받아두고 이탈한 사용자가 10분간 슬롯을 점유하게 돼요.

현재 구조에서는 주문 완료 시 토큰을 즉시 삭제하기 때문에, 정상적인 사용자는 TTL과 무관하게 빠르게 슬롯을 반환합니다.
TTL 300초는 "토큰을 받고 이탈한 사용자"를 위한 안전망이에요.

📌 **포기한 것** — 토큰 갱신(heartbeat) 방식도 고려했어요.
사용자가 주문 페이지에 머무는 동안 주기적으로 토큰을 연장하면 "결제 중 만료" 문제를 근본적으로 해결할 수 있지만, 클라이언트에서 polling 로직을 추가해야 하고 Redis 쓰기 부하도 늘어나서 빠졌습니다.

---

## 🧪 대기열을 만들었으면, 동시성은 정말 안전한 건가요?

대기열이 DB로 가는 요청 수를 조절해주더라도, 동시성 제어 자체가 뚫리면 의미가 없어요.
재고가 음수가 되거나, 쿠폰이 두 번 사용되거나, 좋아요 수가 어긋나면 안 되니까요.

그래서 세 가지 시나리오에 대해 동시성 테스트를 작성했습니다.

![세 가지 동시성 전략과 DB 레벨 방어](./03-concurrency-strategies.svg)

### 재고 차감

100개 스레드가 동시에 수량 10씩 주문하면, 재고 1000개가 정확히 0이 되어야 합니다.
재고 50개에 100개 스레드가 수량 1씩 주문하면, 50건만 성공하고 나머지 50건은 `ProductException`으로 실패해야 하고요.

```kotlin
@Test
fun `재고 50개 상품에 100개 스레드가 수량 1씩 주문하면 50건만 성공한다`() {
    val productId = registerProduct(stock = 50)
    val userIds = (1..100).map { registerUser("limu$it") }
    userIds.forEach { entryTokenRepository.issueToken(it, "token-$it", 300) }

    val result = executeConcurrently(userIds) { userId ->
        createOrderUseCase.create(
            userId,
            CreateOrderCommand(
                items = listOf(OrderItemCommand(productId = productId, quantity = 1)),
            ),
        )
    }

    assertThat(result.successCount).isEqualTo(50)
    assertThat(result.failures).hasSize(50)
    assertThat(result.failures).allSatisfy { e ->
        assertThat(e).isInstanceOf(ProductException::class.java)
    }

    val product = productRepository.findById(productId)!!
    assertThat(product.stock.quantity).isEqualTo(0)
}
```

`SELECT FOR UPDATE`가 트랜잭션 간 직렬화를 보장하고, `WHERE stock >= ?`가 DB 레벨에서 음수를 막아주기 때문에, 100개 스레드가 동시에 때려도 정확히 50건만 성공하는 걸 확인했어요.

### 쿠폰 이중 사용

같은 쿠폰으로 100개 스레드가 동시에 주문하면, 1건만 성공해야 합니다.

`UserCoupon`에도 `findByIdForUpdate`로 비관적 락을 걸어뒀기 때문에, 한 트랜잭션이 쿠폰 상태를 USED로 바꾸고 커밋하면 다음 트랜잭션에서는 `assertUsableBy()`가 실패합니다.
99건이 전부 `CouponException`으로 떨어지는 걸 확인했어요.

### 좋아요 카운트

좋아요는 재고나 쿠폰과는 다른 전략을 씁니다.
`INSERT IGNORE`로 중복 삽입을 원자적으로 막고, 삽입이 성공했을 때만 `UPDATE product SET like_count = like_count + 1`을 실행해요.

같은 사용자가 100번 동시에 좋아요를 눌러도 `INSERT IGNORE`가 1번만 성공하니까, `likeCount`는 정확히 1이 됩니다.
100명이 동시에 좋아요를 누르면 100번 전부 `INSERT IGNORE`가 성공하고, `likeCount`는 100이 되고요.

```kotlin
@Test
fun `100명이 동시에 좋아요하면 likeCount는 100이어야 한다`() {
    val productId = registerProduct(stock = 100)
    val userIds = (1..100).map { registerUser("mlik$it") }

    val result = executeConcurrently(userIds) { userId ->
        addLikeUseCase.add(userId, productId)
    }

    assertThat(result.successCount).isEqualTo(100)
    assertThat(result.failures).isEmpty()

    val product = productRepository.findById(productId)!!
    assertThat(product.likeCount).isEqualTo(100)
}
```

좋아요 취소도 마찬가지예요.
100명이 좋아요한 뒤 동시에 취소하면, `DELETE` 쿼리가 각각 `affected=1`을 반환하고, `like_count = like_count - 1 WHERE like_count > 0` 조건이 음수를 막아줍니다.

테스트 인프라 자체도 신경을 썼어요.
`CountDownLatch` 두 개를 써서 모든 스레드가 준비 완료된 뒤 동시에 출발하도록 했습니다.
`readyLatch`로 N개 스레드가 전부 `await` 상태에 들어갈 때까지 기다리고, `startLatch.countDown()`으로 한꺼번에 풀어주는 방식이에요.

이렇게 하지 않으면 먼저 시작한 스레드가 이미 끝나버려서, 실제 동시 요청 상황을 재현하지 못합니다.

---

## 🕳️ 아직 풀지 못한 것들

대기열이 해결해주는 건 "DB 커넥션 풀 보호"까지예요.
그 너머의 문제들은 여전히 남아있습니다.

**대기열 순번의 정확도.** Redis Sorted Set의 `ZRANK`는 O(log N)이라 빠르지만, 스케줄러가 `ZPOPMIN`으로 앞쪽을 계속 빼내기 때문에 사용자가 polling할 때마다 순번이 바뀌어요.
"342번째입니다"라고 알려줬는데 다음에 보면 "215번째입니다"가 되어있으면 UX가 혼란스러울 수 있습니다.
순번 대신 "예상 대기 시간"만 보여주는 게 더 나을 수도 있어요.

**Redis 장애 시 대기열 전체가 날아가는 문제.** Redis가 죽으면 대기열 데이터와 발급된 토큰이 전부 사라집니다.
AOF persistence를 켜면 어느 정도 복구 가능하지만, 복구까지의 공백 시간에는 대기열이 동작하지 않아요.
failover 동안 대기열을 bypass해서 직접 주문을 허용할지, 아니면 "잠시 후 다시 시도해주세요"로 막을지는 비즈니스 판단의 영역이에요.

**예상 대기 시간의 부정확함.** `SECONDS_PER_USER = 0.006`으로 고정해뒀는데, 실제 주문 처리 시간은 상품 수, 쿠폰 적용 여부, DB 부하에 따라 달라집니다.
대기열 앞에 10명이 있다고 해서 반드시 0.06초 뒤에 입장하는 게 아니에요.
정확하게 예측하려면 최근 N건의 실제 처리 시간을 기반으로 동적 계산해야 하는데, 지금은 그 정도의 정밀함이 필요한 규모가 아니라서 고정값으로 두었습니다.

---

## 💭 돌아보면

처음에는 "락만 잘 걸어두면 동시성은 해결되는 거 아닌가?" 싶었어요.

실제로 정합성은 락으로 보장됐습니다.
재고가 음수가 되거나 쿠폰이 이중 사용되는 일은 없었어요.

그런데 "정합성이 보장된다"와 "서비스가 정상 동작한다"는 다른 문제라는 걸 동시성 테스트를 작성하면서 느꼈어요.
100개 스레드가 동시에 `FOR UPDATE`를 때리면 결과는 정확하지만, 그 과정에서 커넥션 풀이 고갈되어 다른 API가 죽을 수 있습니다.

대기열은 이 간극을 메워주는 구조였어요.
DB가 처리할 수 있는 속도에 맞춰 요청을 흘려보내면, 락은 여전히 정합성을 지켜주면서도 커넥션 풀이 고갈되지 않습니다.

배치 크기 18, 토큰 TTL 300초, 스케줄러 주기 100ms — 이 숫자들은 전부 DB 커넥션 풀 50개와 주문 처리 시간 200ms에서 역산한 값이에요.
전제가 달라지면 숫자도 달라져야 하고, 그래서 산정 근거를 코드 주석과 이 글에 남겨두었습니다.

동시성 테스트에서 재고 1000개가 정확히 0이 되고, 쿠폰 100건 중 1건만 성공하고, 좋아요 카운트가 100명분 정확히 반영되는 걸 확인한 뒤에야, "이 구조가 지금 조건에서는 맞았다"고 말할 수 있게 됐어요.