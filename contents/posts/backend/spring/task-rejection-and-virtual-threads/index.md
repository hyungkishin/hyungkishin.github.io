---
title: "5,235건이 사라진 자리, 코드 어느 줄에서 일어났을까요"
description: "작업 큐가 차면 누가 예외를 받을까? 이벤트 5,235건이 사라진 서비스에서 작업을 제출한 스레드와 실행하는 스레드를 따라갔다."
date: 2026-05-02
update: 2026-11-14
tags:
- Spring
- ThreadPoolTaskExecutor
- SimpleAsyncTaskExecutor
- VirtualThreads
- 동시성
- 런타임
---

[이벤트 5,235건이 유실된 장애 회고](/company/work/why6/)에서 큐가 꽉 찬 것까지 확인했다. 제출한 작업은 누가 거부하고, 예외는 어느 스레드에 남을까. 이번에는 실행기의 소스를 따라간다.

- `ThreadPoolTaskExecutor`는 큐가 차면 작업을 버립니다. 의도된 동작이에요. `AbortPolicy`가 기본값입니다.
- `SimpleAsyncTaskExecutor` + `concurrencyLimit`는 큐 자체가 없어요. 대신 caller thread를 막습니다. `ReentrantLock + Condition.await()` 으로요.
- 작업을 제출한 가상 스레드가 대기 중에 언마운트되면 운반 스레드에서 다른 작업을 실행할 수 있습니다. 플랫폼 스레드를 쓰는 경우에는 풀에서 대기 중인 스레드 수를 함께 봐야 합니다.
- Little의 법칙에서 평균 동시 작업 수는 평균 처리율 × 평균 체류 시간입니다. 외부 API의 초당 요청 한도는 별도로 지켜야 합니다.

## 회고에서 안 본 자리가 어디였을까요

회고에서 본 것은 이렇습니다.

- 배치가 2,100건 상태 전이를 만들었다
- 리스너 3개가 fan-out 되어 6,300 태스크가 단일 executor로 몰렸다
- 큐가 거부했다. 5,235건이 영구 유실되었다

회고에서 안 본 것이 있었어요.

- 큐가 거부할 때 어떤 코드 경로가 작업을 버리는가
- 그 자리를 메운 `concurrencyLimit`이 어떻게 caller를 막는가
- 이 전략이 왜 Virtual Thread를 전제로 해야 하는가
- 50이라는 숫자가 어디서 나와야 하는가

이 글은 그 자리들에 대한 deep dive 입니다.

---

## 1. 작업이 사라진 코드 경로: `TaskRejectedException`

### Spring 실제 소스

`ThreadPoolTaskExecutor.execute()` 본체

```java
// org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor
public void execute(Runnable task) {
    Executor executor = getThreadPoolExecutor();
    try {
        executor.execute(task);
    }
    catch (RejectedExecutionException ex) {
        throw new TaskRejectedException(executor, task, ex);
    }
}
```

`getThreadPoolExecutor()`는 `java.util.concurrent.ThreadPoolExecutor`를 반환한다.
거부가 일어나면 `RejectedExecutionException`을 잡아서 Spring 타입(`TaskRejectedException`)으로 다시 던진다.

### 거부는 누가 결정하는가: `RejectedExecutionHandler`

`ThreadPoolExecutor`는 작업 거부 시점에 `RejectedExecutionHandler`를 호출한다. 기본값은 **`AbortPolicy`**.

```java
// java.util.concurrent.ThreadPoolExecutor.AbortPolicy
public static class AbortPolicy implements RejectedExecutionHandler {
    public void rejectedExecution(Runnable r, ThreadPoolExecutor e) {
        throw new RejectedExecutionException(
            "Task " + r.toString() + " rejected from " + e.toString());
    }
}
```

### 거부가 호출되는 정확한 자리: `ThreadPoolExecutor.execute`

`ThreadPoolExecutor.execute(Runnable)` 본체는: 3단계 결정

```java
// java.util.concurrent.ThreadPoolExecutor.execute (OpenJDK)
public void execute(Runnable command) {
    int c = ctl.get();
    // 1) 활성 worker가 corePoolSize 미만 -> 새 worker 만들어 실행
    if (workerCountOf(c) < corePoolSize) {
        if (addWorker(command, true))
            return;
        c = ctl.get();
    }
    // 2) workQueue.offer 성공 -> 큐에 적재
    if (isRunning(c) && workQueue.offer(command)) {
        ...
    }
    // 3) maxPoolSize 미만이면 새 worker, 아니면 reject
    else if (!addWorker(command, false))
        reject(command);   // <- 여기서 RejectedExecutionHandler 호출
}

final void reject(Runnable command) {
    handler.rejectedExecution(command, this);
}
```

거부가 일어나는 정확한 조건
- `workerCount >= corePoolSize`
- `workQueue.offer()` 실패 (= 큐가 가득 참)
- `addWorker(command, false)` 실패 (= `maxPoolSize` 도달)

세 조건이 동시에 만족되어야 reject. 하나라도 비면 거부 안 됨. 우리 사고 자리는: `corePoolSize`/`maxPoolSize`가 작은 데다 `queueCapacity`가 빨리 차서 세 조건이 동시에 만족.

거부 = 예외를 던진다. 그게 전부다.
호출 코드에서 잡지 않으면 그 작업은 **사라진다.** 멱등 재시도 없으면 영구 유실.

### 이게 버그일까요, 설계일까요

`ThreadPoolExecutor`는 "처리 못 하면 버린다"가 기본값이다.

| 정책 | 거부 시 동작 | 적합한 자리 |
|---|---|---|
| `AbortPolicy` (기본) | 예외 -> 호출자가 처리 | 정합성보다 fail-fast가 중요할 때 |
| `CallerRunsPolicy` | caller thread가 직접 실행 | back-pressure 자연 발생 |
| `DiscardPolicy` | 조용히 버림 | 손실 가능 (telemetry 등) |
| `DiscardOldestPolicy` | 큐 헤드 버리고 새로 넣음 | 최신성이 중요한 큐 |

기본 정책인 `AbortPolicy`에서는 제출 시점에 예외가 발생한다. 재시도할지, 요청을 실패로 처리할지는 호출하는 쪽에서 정한다.

이벤트 발행에 이걸 그대로 쓰면 **유실 = 호출자 책임**이 된다. 근데 호출자가 어디인지 정확히 짚어야 한다: 거부의 처리 경로가 두 갈래로 갈린다.

### 두 갈래: 어디서 거부되느냐

**갈래 A: task가 실행 중에 던진 예외**
```java
// AsyncExecutionInterceptor.invoke (Spring main)
Callable<Object> task = () -> {
    try {
        Object result = invocation.proceed();   // 실제 listener 메서드 호출
        if (result instanceof Future<?> future) {
            return future.get();
        }
    }
    catch (Throwable ex) {
        handleError(ex, userMethod, invocation.getArguments());   // <- 여기로 들어옴
    }
    return null;
};
return doSubmit(task, executor, userMethod.getReturnType());
```

이 경로로 들어오면 `handleError`가 호출된다:
```java
// AsyncExecutionAspectSupport.handleError
protected void handleError(Throwable ex, Method method, ...) throws Exception {
    if (Future.class.isAssignableFrom(method.getReturnType())) {
        ReflectionUtils.rethrowException(ex);   // Future라면 호출자에게 던질 수 있음
    }
    else {
        // void 반환: 호출자에게 못 전달, AsyncUncaughtExceptionHandler로 위임
        this.exceptionHandler.obtain().handleUncaughtException(ex, method, params);
    }
}
```

void 반환 메서드면 `AsyncUncaughtExceptionHandler` 호출. 기본은 `SimpleAsyncUncaughtExceptionHandler`: **로그만 남기고 끝.**

**갈래 B: submit 자체가 거부됨 (`RejectedExecutionException`)**

이게 우리 사고 자리.
```java
// AsyncExecutionAspectSupport.doSubmit
protected Object doSubmit(Callable<Object> task, AsyncTaskExecutor executor, Class<?> returnType) {
    ...
    else if (void.class == returnType || "kotlin.Unit".equals(returnType.getName())) {
        executor.submit(task);   // <- 여기서 RejectedExecutionException 던지면
        return null;             //    catch가 없다
    }
}
```

`executor.submit(task)`가 거부되면: task는 **실행조차 시작 안 됐다.** task 안의 `try-catch`도 작동 안 한다.  

`handleError` 안 들어옴. `AsyncUncaughtExceptionHandler`도 안 호출됨.

> 예외는 `doSubmit` > `invoke` > caller로 그대로 propagate.

**여기서 잡아둘 invariant 하나.**

이 작업은 "실패한 게 아니라": **"아예 실행조차 안 된 상태로 사라졌다."**

그래서 `AsyncUncaughtExceptionHandler`도 개입 못 한다.

### 거부된 예외는 어디까지 가나

`@Async` + `@EventListener` 조합의 caller는

```kotlin
applicationEventPublisher.publishEvent(WorkflowStatusChangedEvent(...))
// ↓ AbstractApplicationContext.publishEvent
// ↓ SimpleApplicationEventMulticaster.multicastEvent
// ↓ invokeListener(listener, event): 동기 호출
// ↓ ApplicationListenerMethodAdapter.onApplicationEvent
// ↓ @Async AOP proxy -> AsyncExecutionInterceptor.invoke
// ↓ doSubmit -> executor.submit -> RejectedExecutionException
// ↓ TaskRejectedException 으로 wrap (ThreadPoolTaskExecutor.execute 내부)
// ↓ doSubmit 안에 catch 없음 -> invoke 그대로 throw
// ↓ invokeListener의 호출자로 propagate
```

`SimpleApplicationEventMulticaster.invokeListener`에 `errorHandler`가 set 되어 있으면 거기서 catch. 기본 `null`. 즉, 그대로 propagate.

```java
// SimpleApplicationEventMulticaster
private void invokeListener(ApplicationListener<?> listener, ApplicationEvent event) {
    ErrorHandler errorHandler = getErrorHandler();
    if (errorHandler != null) {
        try {
            doInvokeListener(listener, event);
        }
        catch (Throwable err) {
            errorHandler.handleError(err);
        }
    }
    else {
        doInvokeListener(listener, event);   // <- 기본 경로, 예외 그냥 throw
    }
}
```

결국 `publishEvent` 호출자(`@Service` 메서드)까지 도달.

### 그 다음이 사고의 진짜 분기점이었어요

`publishEvent` 호출자 코드가 어떤 자리에 있느냐로 결과가 갈린다

**옵션 A: `@Transactional` 안에서 publishEvent**
- 거부 예외 -> `@Transactional`이 catch -> DB rollback
- DB도 안 바뀜, 이벤트도 안 나감
- **정합성은 유지**: 다만 배치 자체가 실패

**옵션 B: DB commit 후 publishEvent (예: `@TransactionalEventListener(AFTER_COMMIT)`)**
- DB는 이미 commit
- 이벤트 발행만 거부됨
- 호출자가 catch 안 하면 **DB는 변경, 이벤트는 영구 유실**
- **정합성 깨짐**

회고에서 5,235건이 사라진 자리는 **옵션 B**.
DB의 `EXPIRED_AUTO` 상태 전이는 commit됐다. 그 뒤의 `@Async` 리스너 호출에서 큐 거부 -> 호출자(트랜잭션 밖)가 잡지 않으니 stack trace 한 줄로 끝.

`AsyncUncaughtExceptionHandler`는 이 흐름에 **개입하지 않는다.** 그게 도달하려면 task가 실행되고 있어야 한다. 거부는 실행 전이다.  
handler를 아무리 잘 설정해도 이 자리는 못 잡는다.

**진짜 자리는 두 군데:**
1. `executor.submit`이 거부할 가능성 자체 (큐 한도)
2. `AFTER_COMMIT`처럼 commit 이후에 발행하는 시점

Outbox가 답인 정확한 이유: DB 변경과 outbox INSERT를 **같은 트랜잭션**에 묶으면, "이벤트 발행 의도"가 DB에 영구 기록된다. 발행은 별도 publisher의 책임. 거부되면 retry. 옵션 B의 정합성 구멍이 닫힌다.

---

## 2. caller blocking 전략: `ConcurrencyThrottleSupport`

### `SimpleAsyncTaskExecutor`는 큐가 없다

복구 1차로 들어간 코드

```kotlin
SimpleAsyncTaskExecutor("workflow-event-").apply {
    setVirtualThreads(true)
    concurrencyLimit = 50
    setTaskTerminationTimeout(30_000L)
}
```

`SimpleAsyncTaskExecutor`가 다른 자리: **큐가 없다.**

- 기본: 매 task -> 새 스레드 (`newThread(task).start()`)
- `concurrencyLimit` 설정 시: **한도까지 fire-and-forget, 초과 시 caller blocking**

```java
// SimpleAsyncTaskExecutor
protected void doExecute(Runnable task) {
    newThread(task).start();
}
```

이 설정은 큐 포화로 인한 거부를 대기로 바꾼다. 종료된 실행기에 제출하면 Spring 6.2.8도 `TaskRejectedException`을 던진다.
대신 **무한히 스레드를 만들 수 있다는 게 문제**가 된다: 외부 API가 느려지면 스레드가 무한히 누적.

`concurrencyLimit`이 그걸 막는 자리.

### 작업을 제출한 스레드는 어디서 기다리나

Spring 6.2.8의 일반 제출 경로에는 다음 두 호출이 차례로 있다. 한도 검사를 통과해야 작업 스레드가 시작된다.

```java
this.concurrencyThrottle.beforeAccess();
doExecute(new TaskTrackingRunnable(taskToUse));
```

`beforeAccess()`는 락 안에서 진행 중인 작업 수를 비교한다. 제한에 닿으면 기본 구현은 `Condition.await()`로 기다린다. 작업 하나가 끝나 `afterAccess()`에서 카운터를 줄이고 신호를 주면 대기자가 조건을 다시 검사한다. 이 동작을 적용하려면 `rejectTasksWhenLimitReached`가 기본값인 `false`여야 한다. `true`로 바꾸면 초과 제출을 거부한다. 같은 Spring 6.x 안에서도 구현은 다르다. 6.1.0 소스는 모니터의 `wait`를 쓰고 6.2.8은 `ReentrantLock`과 `Condition`을 쓴다. [Spring 6.2.8의 제출과 거부 분기](https://github.com/spring-projects/spring-framework/blob/v6.2.8/spring-core/src/main/java/org/springframework/core/task/SimpleAsyncTaskExecutor.java#L273-L291), [6.2.8의 대기와 해제](https://github.com/spring-projects/spring-framework/blob/v6.2.8/spring-core/src/main/java/org/springframework/util/ConcurrencyThrottleSupport.java#L111-L180), [6.1.0의 구현](https://github.com/spring-projects/spring-framework/blob/v6.1.0/spring-core/src/main/java/org/springframework/util/ConcurrencyThrottleSupport.java#L105-L154)

작업이 끝날 때 `TaskTrackingRunnable`이 호출 슬롯을 되돌려준다. 제출 시점과 종료 시점의 카운터를 보면 작업 수가 왜 한도를 넘지 않는지 드러난다.

```text
제출   lock → count ≥ limit이면 await → count 증가 → unlock → 작업 시작
종료   lock → count 감소 → signal → unlock
```

| 그때 쓰던 설정 | 작업을 받아들일 공간이 없을 때 | 호출자가 보는 것 |
|---|---|---|
| ThreadPoolTaskExecutor + 유계 큐 + AbortPolicy | 제출 시 거부 | TaskRejectedException |
| SimpleAsyncTaskExecutor + concurrencyLimit + 기본 대기 정책 | 작업이 하나 끝날 때까지 제출자 대기 | 제출 호출이 아직 반환하지 않음 |

이 사고에서는 이전 실행기의 유계 큐가 차면 예외를 처리하지 못해 이벤트가 유실됐다. 바꾼 설정에서는 제출자가 자리가 날 때까지 기다린다. 프로세스가 내려가는 동안 이벤트를 보존하려면 별도의 내구성 있는 저장소가 필요하다.

## 3. 플랫폼 스레드와 가상 스레드는 대기 비용이 다르다

플랫폼 스레드를 쓰는 풀에서는 외부 응답이나 동시성 자리를 기다리는 동안에도 작업자가 풀 한 칸을 차지한다. 기다리는 작업이 모든 자리를 차지하고 그 대기를 풀 작업까지 같은 풀에 제출하면 풀 안에서 서로를 기다리는 상황이 생긴다. 가상 스레드에서도 무엇이 기다리는지 봐야 한다. `setVirtualThreads(true)`는 제출한 **작업을 실행할 스레드**를 정한다. 이미 실행 중인 **제출자**가 플랫폼 스레드라면 `beforeAccess()`에서 대기하는 쪽은 여전히 플랫폼 스레드다. [Spring 6.2.8의 스레드 생성](https://github.com/spring-projects/spring-framework/blob/v6.2.8/spring-core/src/main/java/org/springframework/core/task/SimpleAsyncTaskExecutor.java#L330-L350)

가상 스레드가 지원되는 대기 지점에서 중단되면 스케줄러는 운반 스레드(carrier)에 다른 가상 스레드를 올릴 수 있다. 대기가 끝난 가상 스레드는 이전과 다른 운반 스레드에서 재개될 수도 있다. 네트워크 연결이나 외부 API의 용량은 별도로 제한한다. [JEP 444의 스케줄링과 블로킹](https://openjdk.org/jeps/444)

### Spring에서 Continuation.yield까지

이 사례가 사용한 Spring 6.2.8과 JDK 21 계열 소스를 펼치면 대기 호출이 다음 순서로 내려간다. 신호가 이미 왔거나 인터럽트가 걸려 바로 끝나는 길도 있다. 아래는 실제로 대기가 필요한 경우의 경로다.

```text
SimpleAsyncTaskExecutor.execute
  ConcurrencyThrottleAdapter.beforeAccess
    ConcurrencyThrottleSupport.beforeAccess / onLimitReached
      AbstractQueuedSynchronizer.ConditionObject.await
        ForkJoinPool.managedBlock / ConditionNode.block
          LockSupport.park
            VirtualThread.park
              yieldContinuation
                Continuation.yield / yield0
```

AQS의 `ConditionObject`는 조건 대기열에 현재 스레드를 등록하고 락을 놓는다. `ConditionNode.block()`은 깨울 조건이 생길 때까지 `LockSupport.park()`를 호출한다. 신호를 받은 쪽은 락을 다시 얻고 나서 동시 작업 수를 검사한다. [JDK 21u의 대기 노드](https://github.com/openjdk/jdk21u/blob/jdk-21.0.12%2B7/src/java.base/share/classes/java/util/concurrent/locks/AbstractQueuedSynchronizer.java#L492-L524), [ConditionObject.await](https://github.com/openjdk/jdk21u/blob/jdk-21.0.12%2B7/src/java.base/share/classes/java/util/concurrent/locks/AbstractQueuedSynchronizer.java#L1728-L1774)

`VirtualThread.park()`는 이미 허가를 받았거나 인터럽트된 상태면 반환한다. 기다려야 하면 `PARKING` 상태에서 continuation 양도를 시도한다. 성공한 스레드는 나중에 재개되어 이 호출에서 돌아온다. 양도가 실패한 경우 다음 분기가 운반 스레드 자체를 재운다.

```java
if (!yielded) {
    parkOnCarrierThread(false, 0);
}
```

JDK 21u의 `parkOnCarrierThread`는 시간 제한 유무에 따라 `TIMED_PINNED` 또는 `PINNED` 상태를 기록하고 빠져나올 때 `RUNNING`으로 되돌린다. 해당 경로에서 JFR 이벤트의 측정을 시작하고 끝낸다. [VirtualThread.park의 분기](https://github.com/openjdk/jdk21u/blob/jdk-21.0.12%2B7/src/java.base/share/classes/java/lang/VirtualThread.java#L585-L608), [Continuation.yield 구현](https://github.com/openjdk/jdk21u/blob/jdk-21.0.12%2B7/src/java.base/share/classes/jdk/internal/vm/Continuation.java#L343-L383), [parkOnCarrierThread와 JFR 기록](https://github.com/openjdk/jdk21u/blob/jdk-21.0.12%2B7/src/java.base/share/classes/java/lang/VirtualThread.java#L660-L696)

### JDK 21과 25에서 같은 코드를 관측한 결과

JDK 21에서는 `synchronized` 안에서 긴 블로킹 작업을 하면 운반 스레드에 고정될 수 있다. JDK 24에 정식 반영된 JEP 491은 모니터를 잡은 가상 스레드도 그 상태로 운반 스레드에서 분리될 수 있게 했다. JDK 25에서는 네이티브 호출이 다시 Java로 들어와 블로킹하는 경로 등이 남아 있다. JFR의 `jdk.VirtualThreadPinned` 이벤트에서 JDK 버전, 호출 스택, 고정된 시간을 함께 본다. JDK 21의 `-Djdk.tracePinnedThreads`는 JDK 24부터 효과가 없다. 모니터를 잡고 외부 응답을 기다리면 JDK 25에서도 같은 락을 기다리는 요청은 지연된다. [JEP 491의 변경 범위와 진단](https://openjdk.org/jeps/491), [JDK 21과 25에서 직접 실행한 JFR 실험](/backend/transfer-performance/parallel-io/#section-4)

운영에서 기록을 다시 열 때는 `jfr print --events jdk.VirtualThreadPinned recording.jfr`로 이벤트의 스택과 시간을 확인한다. JDK 21의 `-Djdk.tracePinnedThreads=full`은 별도 재현 환경에서 스택을 확인하는 용도다. JFR 설정의 threshold보다 짧은 대기는 기록에서 빠질 수 있다. JDK 25를 조사하면서 21의 이벤트 스택과 같은 원인을 전제하면 대기 자리를 놓친다.

---

## 4. 동시성 50과 초당 요청 한도

Little의 법칙은 관측 창과 시스템 경계가 같은 세 평균값을 연결한다. 평균 진행 건수 `L = λ × W`에서 `λ`는 초당 처리 건수, `W`는 건당 평균 체류 시간(초)이다. 처리율이 초당 100건이고 평균이 0.2초라면 평균 진행 건수는 20건이다. p50이나 p99를 평균 자리에 넣을 수 없다. 20은 관측한 평균이므로 풀의 안전한 상한을 바로 결정해 주지도 않는다. [평균과 풀 크기의 차이](/backend/transfer-performance/01-measurement/)

**동시성 한도**는 시작한 뒤 아직 끝나지 않은 호출을 센다. **요청률 한도**는 일정 시간에 시작하는 호출을 제한한다. 동시성을 1로 정해도 응답이 매번 100ms면 한 스레드에서 초당 약 10건이 순차로 시작한다. Slack 같은 목적지의 할당량은 메서드, 채널, 워크스페이스 중 어디에 한도를 적용하는지 먼저 확인한다. 그 범위의 토큰 버킷으로 시작 속도와 버스트를 관리하고, 별도의 세마포어로 동시에 점유할 연결 수를 제한할 수 있다. [Slack의 메시지 게시 한도](https://docs.slack.dev/apis/web-api/rate-limits/#posting-messages), [외부 조회의 동시 요청 수와 초당 요청 수 제한](/backend/transfer-performance/parallel-io/#section-3)

### 같은 실행기를 쓰던 Slack 전송과 Amplitude 적재

회고에서 50은 "외부 API rate limit이 100이니까 절반"으로 잡은 초기 설정이었다. Slack 메시지 전송 한 건과 Amplitude 이벤트 한 묶음을 같은 작업자 풀에 제출해도, 할당량 적용 단위와 처리 시간은 다를 수 있다. Slack은 채널별 게시 제한과 워크스페이스 제약을 함께 확인한다. Amplitude는 사용 중인 API 버전과 프로젝트에 따라 이벤트를 어떻게 처리하고 요청을 언제 제한하는지 확인한다. 이벤트 수와 HTTP 요청 수도 따로 센다. [Slack chat.postMessage](https://docs.slack.dev/reference/methods/chat.postMessage/), [Amplitude HTTP V2](https://amplitude.com/docs/apis/analytics/http-v2)

가령 목표를 각각 0.8건/초와 800건/초로 놓고 평균 외부 호출 시간이 양쪽 모두 0.2초라고 가정해 보자. 평균 진행 건수는 각각 **0.16건과 160건**이다. 이는 계산 예시다. 첫 번째 API의 동시성을 1로 반올림하는 것만으로는 초당 시작 건수를 제한하지 못한다. 반대로 두 번째 숫자를 그대로 풀 크기로 쓰면 지연이 증가했을 때 필요한 대기 시간과 상대의 허용 범위를 놓친다.

다음은 원래 검토했던 목적지별 실행기 구성이다. 한 요청률 제한기의 토큰은 해당 목적지로 외부 요청을 보내기 직전에 소비한다. 여러 메시지를 한 요청에 묶는 경우에는 공급자가 세는 단위에 맞춰 소비량을 정한다.

```kotlin
val slackExecutor = SimpleAsyncTaskExecutor("slack-").apply {
    setVirtualThreads(true)
    concurrencyLimit = 1
}

val amplitudeExecutor = SimpleAsyncTaskExecutor("amp-").apply {
    setVirtualThreads(true)
    concurrencyLimit = 100
}
```

별도의 토큰 버킷은 저장할 토큰 수와 재충전 속도를 정한다. 앞 예제에서 `slackExecutor`가 잠깐 비어도 토큰이 없다면 호출을 시작하지 않는다. 한 곳의 대기가 다른 곳의 작업자를 다 차지하는 상황을 막고, 429가 발생하면 해당 할당량 범위의 `Retry-After`를 따른다. [Slack의 429와 Retry-After](https://docs.slack.dev/apis/web-api/rate-limits/#headers)

### 운영에서 숫자를 다시 정할 때

사고 당시 50은 실측 전의 설정값이다. 목적지별 평균 응답 시간, 지연 분포, 연결 풀 획득 대기, 429와 시간 초과를 함께 기록하고 부하를 올려 대기가 급증하는 지점을 찾는다. 느린 API 하나가 다른 API의 자리를 전부 차지하면 목적지별로 한도를 나눌 이유가 생긴다.

## 5. 변태 디깅: 분산 환경에서 in-memory throttle은 안전한가

`concurrencyLimit = 50`은 **단일 JVM 안의 한도**다.  
pod이 N대면 클러스터 전체로는 N × 50.

### 우리 자리에 대입

EKS rolling deploy 후 admin-api pod이 4대라고 보자.  
각 pod이 `concurrencyLimit = 50`을 들고 있다.

배치는 한 pod에서 실행되니 그 pod의 50만 활성. 여기까진 OK.

다른 pod에서도 독립적인 이벤트가 생겨 같은 외부 API로 요청을 보낸다고 가정하자.
즉 **클러스터 전체 동시 호출이 4 × 50 = 200까지 가능.**

200은 동시에 진행할 수 있는 호출 수다. 실제 초당 시작 건수는 응답 시간과 별도의 요청률 제한에 따라 달라진다.

### 여러 프로세스가 같은 한도를 쓸 때

각 JVM의 카운터는 자기 프로세스 안의 호출만 센다. 할당량을 공유하는 목적지라면 호출 주체를 한 곳으로 모으는 방법이 있다. 인스턴스에 나누어 할당한 예산의 합을 총량 안에 두거나 공유 제한기에서 원자적으로 차감하는 방법도 있다. 공유 제한기를 두면 그 저장소를 한 번 더 호출해야 한다. 저장소에 장애가 났을 때 요청을 거절할지 대기시킬지도 정해야 한다.

Spring의 애플리케이션 이벤트는 한 컨텍스트 안에서 전달된다. 여러 pod에 리스너가 등록됐다는 사실만으로 같은 이벤트가 다른 pod에 전파되지는 않는다. 여러 pod에서 실제 외부 호출이 시작되는지는 배치의 실행 위치, 브로커 구독과 publisher 배치를 확인해야 한다.

### 검토한 운영 대안

| 제한을 두는 곳 | 유지하는 상태와 대가 |
|---|---|
| Resilience4j의 JVM별 RateLimiter | 프로세스 안에서 기간별 허용 횟수를 갱신한다. 모든 pod가 같은 전체 한도를 복제하면 총 허용량도 늘어난다. |
| Bucket4j와 공유 저장소 | 같은 quota key의 남은 토큰과 마지막 충전 시각을 원자적으로 갱신한다. 저장소 왕복 지연과 단절 시 실패 정책이 필요하다. |
| 공통 egress 게이트웨이 | 외부로 나가는 모든 발신 경로가 게이트웨이를 지나야 정책이 적용된다. 우회 경로, 게이트웨이 장애, 다중 복제의 상태 공유가 운영 조건이다. |

P0에서 Outbox publisher를 한 개만 둘 수 있고 다른 발신 경로가 없다면 프로세스 내 제한으로 시작한다. 인스턴스를 늘리면 같은 제한 키를 공유하는 pod 수와 롤링 배포 중 겹치는 수까지 포함해 다시 계산한다. 이 판단은 작업이 유실되지 않게 DB에 기록하는 트랜잭션 경계와 별개다. [Resilience4j의 JVM별 구현](https://resilience4j.readme.io/docs/ratelimiter), [Bucket4j 분산 버킷](https://bucket4j.com/)

---

## 6. 변태 디깅: `@Async` + `@EventListener` 의 트랜잭션 경계

5,235건이 사라진 자리는 **트랜잭션 경계와 이벤트 발행 시점의 불일치**가 만든 자리.
이걸 정확히 짚어야 Outbox가 왜 답인지 보인다.

### 4가지 조합

| 리스너 종류 | `@Async` 유무 | 트랜잭션 경계 | 거부 시 결과 |
|---|---|---|---|
| `@EventListener` | 없음 | 같은 트랜잭션 (동기 호출) | rollback (DB도 안 바뀜) |
| `@EventListener` | 있음 | 분리 (별도 스레드) | DB는 commit 됨, 이벤트만 유실 |
| `@TransactionalEventListener(BEFORE_COMMIT)` | 없음 | 같은 트랜잭션 | rollback |
| `@TransactionalEventListener(AFTER_COMMIT)` | 있음 | DB commit 후 발행 | **DB는 commit, 이벤트 유실** |

마지막 두 줄이 우리 사고 자리.

### `@Async` + `@TransactionalEventListener(AFTER_COMMIT)`의 함정

흐름
```
@Transactional 시작
  ├ DB 변경 (status = EXPIRED_AUTO)
  ├ publishEvent(WorkflowStatusChanged) <- 등록만 됨
  ├ commit
  └ AFTER_COMMIT phase
      └ @Async 리스너 호출
          └ executor.submit -> RejectedExecutionException
              └ 호출자(AFTER_COMMIT runner)가 잡지 않으면 끝
```

`AFTER_COMMIT` runner는 `TransactionSynchronizationManager` 안에서 호출됨. 거기서 발생한 예외는: 트랜잭션이 이미 commit된 상태라 **rollback 불가능.** 그냥 stack trace 한 줄.

DB는 영구 변경, 이벤트는 영구 유실. **정합성 깨짐.**

### Outbox가 푸는 정확한 자리

Outbox 패턴의 본질

```kotlin
@Transactional
fun expireWorkflows(...) {
    val transitioned = /* DB 변경 */
    repo.saveAll(transitioned)
    outboxRepository.saveAll(transitioned.map(::toOutbox))   // 같은 트랜잭션
    // publishEvent 호출 X: outbox에 위임
}
```

같은 트랜잭션에 `outbox INSERT`가 들어간다.  
DB 변경과 "이벤트 발행 의도"가 함께 commit되거나 함께 rollback된다.

발행은 별도

```kotlin
@Scheduled(fixedDelay = 5_000)
fun publish() {
    outboxRepository.findPending(limit = 100).forEach { event ->
        runCatching { send(event) }
            .onSuccess { outboxRepository.markSent(event.id) }
            .onFailure { outboxRepository.incrementRetry(event.id) }
    }
}
```

publisher가 거부 만나면 retry. outbox 레코드는 DB에 있으니 **유실 불가능.**

### 정합성 경계의 이동

| 처방 | 정합성 경계 | DB ≠ 이벤트 가능성 |
|---|---|---|
| `@TransactionalEventListener(AFTER_COMMIT)` + `@Async` (BEFORE) | DB commit까지만 | **있음** |
| `concurrencyLimit` + VT (1차 봉합) | DB commit까지만 (변화 없음) | **있음** (지연될 뿐) |
| Outbox (NEXT) | DB + outbox INSERT 같은 트랜잭션 | **없음** |

`concurrencyLimit + VT`가 "거부를 지연으로 옮긴" 봉합이라는 의미는: 정합성 경계를 **옮기지 못했다**는 의미. Outbox만이 경계를 옮긴다.

### 코드 한 줄로 보면

봉합 후에도 남는 위험
```kotlin
@TransactionalEventListener(phase = AFTER_COMMIT)
@Async("workflowEventExecutor")
fun on(e: WorkflowStatusChanged) {
    slackClient.send(e)   // 이 자리가 거부되면? AFTER_COMMIT이라 못 막음
}
```

Outbox 후
```kotlin
@Scheduled
fun publish() {
    outbox.findPending().forEach { e ->
        try { slackClient.send(e); outbox.markSent(e.id) }
        catch (ex: Throwable) { outbox.incrementRetry(e.id) }
    }
}
```

거부/실패가 일어나도 **레코드가 DB에 남아 있다.** 다음 폴링에서 다시 시도. 정합성 경계가 DB로 통일됨.

---

## 트레이드오프 / 한계

### `SimpleAsyncTaskExecutor` + VT 조합의 한계

| 항목 | 한계 |
|---|---|
| 메모리 | VT가 carrier에서 unmount될 때 stack은 heap에 남아요. 무한히 늘어나면 OOM. |
| 모니터링 | VT는 thread dump에서 안 보일 수 있어요. JFR + `jcmd Thread.dump_to_file` 필요. |
| 운반 스레드 고정 | JDK 21의 모니터 내부 블로킹과 JDK 24 이후의 네이티브 경로를 구분해 JFR에서 확인합니다. |
| `ThreadLocal` | VT마다 새 인스턴스 생성. `ThreadLocal` heavy한 코드는 메모리가 폭발합니다. |

### 이 전략이 풀지 못하는 것이 있어요

> caller blocking은 거부를 지연으로 옮깁니다.

정합성 경계는 옮기지 않아요. DB 커밋과 이벤트 발행 사이는 그대로 분리됩니다.  
executor pod이 죽으면 in-memory 상태는 유실됩니다.

> **포기한 것**: caller blocking이 막는 건 큐 거부의 한 자리뿐이에요. pod 죽음에 의한 유실은 그대로 남습니다.

DB에 이벤트를 남기는 후속안은 [Outbox 도입을 검토한 회고](/company/work/why6/)에서 다룹니다.
이 글은 그 봉합이 어떻게 작동하는가를 설명할 뿐, 봉합이 답이라고 말하지 않습니다.

---

## 정리

이 글이 답한 여섯 가지를 정리해두면 이렇습니다.

1. **5,235건은 어디서 사라졌나요**. `AbortPolicy` 에서 `RejectedExecutionException` 으로, `TaskRejectedException` 으로, `AsyncExecutionInterceptor` 가 그대로 propagate, `AFTER_COMMIT` runner 에서 잡히지 않고 끝났습니다. `AsyncUncaughtExceptionHandler` 는 이 흐름에 개입 안 했어요.
2. **`concurrencyLimit` 은 어떻게 막나요**. `ReentrantLock + Condition.await()`. Semaphore 아님. 큐도 없음. 한도까지 fire-and-forget, 초과 시 caller blocking.
3. **누가 기다리나요?** 제출자와 작업 스레드는 다를 수 있습니다. 제출한 가상 스레드가 대기 중에 언마운트되는지도 확인합니다.
4. **50은 어디서 나와야 하나요**. Little's Law (`L = λW`). 목적지마다 평균 체류 시간, 연결 대기, 할당량을 확인해 동시성과 초당 시작 건수를 각각 정합니다.
5. **분산 환경에서 in-memory throttle 안전할까요**. pod N대면 클러스터 한도는 N × `concurrencyLimit`. 같은 외부 할당량을 공유하면 인스턴스별 예산을 나누거나 공통 제한기를 둡니다.
6. **왜 Outbox가 답인가요**. `@TransactionalEventListener(AFTER_COMMIT) + @Async` 조합은 DB commit 후 발행이라, 거부되면 정합성이 깨져요. Outbox는 DB 변경과 outbox INSERT를 같은 트랜잭션에 묶어 정합성 경계를 DB로 통일합니다.

회고 글이 "무엇을 깨달았는가" 라면, 이 글은 그 깨달음이 코드 어느 줄에 박혀 있는가 입니다.  
둘 다 있어야 사고가 다음에 또 안 일어나요.

---

## References

### JEP / 공식 문서

- [JEP 444: Virtual Threads](https://openjdk.org/jeps/444): Java 21 final, Loom의 unmount/mount 모델 정의
- [JEP 491: Synchronize Virtual Threads without Pinning](https://openjdk.org/jeps/491): JDK 24 정식 반영, 모니터 관련 고정 해소
- [JEP 425: Virtual Threads (Preview)](https://openjdk.org/jeps/425): JDK 19 preview, 초기 설계 의도
- [JEP 480: Structured Concurrency](https://openjdk.org/jeps/480): VT 시대의 task 묶음 모델
- [자바 언어 명세 17장 Threads and Locks](https://docs.oracle.com/javase/specs/jls/se21/html/jls-17.html): 모니터 락 정의

### OpenJDK 소스

- [`VirtualThread.java`](https://github.com/openjdk/jdk/blob/master/src/java.base/share/classes/java/lang/VirtualThread.java): `park()`, `parkOnCarrierThread()`, 상태 머신 (`PARKING`, `PINNED`, `TIMED_PINNED`)
- [`LockSupport.java`](https://github.com/openjdk/jdk/blob/master/src/java.base/share/classes/java/util/concurrent/locks/LockSupport.java): `park()`의 VT 분기 (`Thread.currentThread().isVirtual()`)
- [`AbstractQueuedSynchronizer.java`](https://github.com/openjdk/jdk/blob/master/src/java.base/share/classes/java/util/concurrent/locks/AbstractQueuedSynchronizer.java): `acquireQueued`에서 `LockSupport.park` 호출
- [`ThreadPoolExecutor.java`](https://github.com/openjdk/jdk/blob/master/src/java.base/share/classes/java/util/concurrent/ThreadPoolExecutor.java): `execute()` 3단계 결정, `reject()`, `AbortPolicy`

### Spring Framework 소스

- [`ThreadPoolTaskExecutor.execute()`](https://github.com/spring-projects/spring-framework/blob/v6.2.8/spring-context/src/main/java/org/springframework/scheduling/concurrent/ThreadPoolTaskExecutor.java): `RejectedExecutionException` -> `TaskRejectedException` wrap
- [`SimpleAsyncTaskExecutor.java`](https://github.com/spring-projects/spring-framework/blob/v6.2.8/spring-core/src/main/java/org/springframework/core/task/SimpleAsyncTaskExecutor.java): `doExecute`, `setVirtualThreads`, `concurrencyLimit`
- [`ConcurrencyThrottleSupport.java`](https://github.com/spring-projects/spring-framework/blob/v6.2.8/spring-core/src/main/java/org/springframework/util/ConcurrencyThrottleSupport.java): Spring 6.2.8의 대기와 해제
- [`AsyncExecutionInterceptor.java`](https://github.com/spring-projects/spring-framework/blob/v6.2.8/spring-aop/src/main/java/org/springframework/aop/interceptor/AsyncExecutionInterceptor.java): `@Async` AOP intercept
- [`AsyncExecutionAspectSupport.handleError()`](https://github.com/spring-projects/spring-framework/blob/v6.2.8/spring-aop/src/main/java/org/springframework/aop/interceptor/AsyncExecutionAspectSupport.java): task 실행 중 예외 처리 (submit 거부에는 도달 X)
- [`SimpleApplicationEventMulticaster.java`](https://github.com/spring-projects/spring-framework/blob/v6.2.8/spring-context/src/main/java/org/springframework/context/event/SimpleApplicationEventMulticaster.java): `multicastEvent`, `invokeListener`, `errorHandler`

### Spring 릴리즈 노트

- [Spring Framework 6.1 Release Notes](https://github.com/spring-projects/spring-framework/wiki/What%27s-New-in-Spring-Framework-6.x#whats-new-in-spring-framework-61): 가상 스레드 지원
- [Spring Framework 6.0 Release Notes](https://github.com/spring-projects/spring-framework/wiki/Upgrading-to-Spring-Framework-6.x)

### 외부 API rate limit 공식 문서

- [Slack `chat.postMessage` rate limits](https://api.slack.com/methods/chat.postMessage#rate_limiting): 메시지 게시 범위별 한도
- [Slack rate limit tiers](https://api.slack.com/apis/rate-limits): Tier 1~4 + special
- [Amplitude HTTP API V2](https://amplitude.com/docs/apis/analytics/http-v2): events 처리 한도

### Pin 감지 / 모니터링

- [`-Djdk.tracePinnedThreads`](https://docs.oracle.com/en/java/javase/21/core/virtual-threads.html#GUID-DC4306FC-D6C1-4BCC-AECE-48C32C1A8DAA): JDK 21 진단 옵션
- JFR `jdk.VirtualThreadPinned` 이벤트: `jfr configure` 또는 `jcmd JFR.start`
- [JDK Flight Recorder Event Reference](https://docs.oracle.com/en/java/javase/21/jfapi/flight-recorder-configurations.html)

### 분산 throttle / Resilience

- [Bucket4j docs](https://bucket4j.com/): token bucket, distributed (Hazelcast / Redis / Ignite 백업)
- [Resilience4j RateLimiter](https://resilience4j.readme.io/docs/ratelimiter): in-memory token bucket
- [Bucket4j with Redis](https://bucket4j.com/8.10.1/toc.html#bucket4j-redis): distributed throttle 예시

### Outbox 패턴

- Chris Richardson, [Pattern: Transactional Outbox](https://microservices.io/patterns/data/transactional-outbox.html)
- [Debezium Outbox Event Router](https://debezium.io/documentation/reference/stable/transformations/outbox-event-router.html): CDC 기반 publisher

### 사고 회고 (관련 글)

- [why6: VT로 봉합하고 '큐 거부 0건'을 성공이라고 부른 직후, 진짜 답은 Outbox](/company/work/why6/): 이 글의 사고 회고 원본
