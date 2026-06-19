---
title: "5,235건이 사라진 자리, 코드 어느 줄에서 일어났을까요"
date: 2026-05-02
update: 2026-05-02
tags:
- Spring
- ThreadPoolTaskExecutor
- SimpleAsyncTaskExecutor
- VirtualThreads
- 동시성
- 런타임
---

> **TL;DR**
>
> 사고 회고는 [/why6/](/why6/) 에 있어요.  
> 이 글은 그 사고가 코드 어느 줄에서 일어났는지를 봅니다.
>
> - `ThreadPoolTaskExecutor`는 큐가 차면 작업을 버립니다. 의도된 동작이에요. `AbortPolicy`가 기본값입니다.
> - `SimpleAsyncTaskExecutor` + `concurrencyLimit`는 큐 자체가 없어요. 대신 caller thread를 막습니다. `ReentrantLock + Condition.await()` 으로요.
> - 이 전략이 성립하는 건 Virtual Thread 덕분입니다. Platform Thread였다면 caller blocking은 thread starvation으로 번져요.
> - `concurrencyLimit = 50` 은 직관이 아니라 Little's Law로 잡혀야 합니다. 외부 latency × concurrency = throughput.

---

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

기본이 `AbortPolicy`라는 건: Spring/JDK는 "거부된 작업의 운명은 호출자 책임" 이라고 말하고 있다.

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

큐가 없으니 `RejectedExecutionException`도 없다.
대신 **무한히 스레드를 만들 수 있다는 게 문제**가 된다: 외부 API가 느려지면 스레드가 무한히 누적.

`concurrencyLimit`이 그걸 막는 자리.

### `concurrencyLimit`은 caller를 막는다

`SimpleAsyncTaskExecutor.execute()`에서 `concurrencyLimit > 0`이면

```java
// SimpleAsyncTaskExecutor.execute(Runnable task, long startTimeout)
if (isThrottleActive() && startTimeout > TIMEOUT_IMMEDIATE) {
    this.concurrencyThrottle.beforeAccess();   // <- 여기서 막힌다
    try {
        doExecute(new TaskTrackingRunnable(taskToUse, future));
    }
    catch (Throwable ex) {
        this.concurrencyThrottle.afterAccess();
        throw new TaskRejectedException("Failed to start execution thread", ex);
    }
}
```

`beforeAccess()`는 부모 클래스 `ConcurrencyThrottleSupport`에 있다.

`ReentrantLock + Condition` 구현은 **Spring 6.1+ 부터** (2023-11 릴리즈). 그 전엔 `synchronized + wait/notify`였다: VT 환경에서 carrier pin이 일어나는 코드. **6.1 이후로 pin 회피 가능해진 게 의미 있다.** 우리 환경(Spring 6.2.8)도 안전 구간.

```java
// org.springframework.util.ConcurrencyThrottleSupport (Spring 6.1+)
private final Lock concurrencyLock = new ReentrantLock();
private final Condition concurrencyCondition = this.concurrencyLock.newCondition();
private int concurrencyLimit = UNBOUNDED_CONCURRENCY;
private int concurrencyCount = 0;

protected void beforeAccess() {
    if (this.concurrencyLimit > 0) {
        this.concurrencyLock.lock();
        try {
            if (this.concurrencyCount >= this.concurrencyLimit) {
                onLimitReached();   // <- await()
            }
            this.concurrencyCount++;
        }
        finally {
            this.concurrencyLock.unlock();
        }
    }
}

protected void onLimitReached() {
    while (this.concurrencyCount >= this.concurrencyLimit) {
        try {
            this.concurrencyCondition.await();   // <- caller가 여기서 멈춘다
        }
        catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
        }
    }
}
```

`Semaphore`가 아니다. `ReentrantLock` + `Condition.await()`.
효과는 동등하지만 **잡는 자리는 다르다**: Semaphore는 `acquire()`가 막는다. 여기는 `Condition.await()`이 막는다.

### 정리

| 비교 | `ThreadPoolTaskExecutor` (BEFORE) | `SimpleAsyncTaskExecutor` + `concurrencyLimit` (AFTER) |
|---|---|---|
| 큐 | 유계 큐 (`queueCapacity`) | 없음 |
| 한도 초과 시 | `RejectedExecutionException` -> 작업 drop | `Condition.await()` -> caller blocking |
| 작업 운명 | **유실** | 지연 후 실행 |
| 호출자에게 보이는 것 | 예외 | 호출이 안 돌아옴 |

큐가 아니라 caller가 막힌다.  
거부가 아니라 지연이 발생한다.

이건 정합성 보장이 아니다: 회고에서 짚었듯, 유실 자리만 옮긴 것이다.  
근데 그 옮김이 작동하는 건 다음 절의 이유 때문이다.

---

## 3. Virtual Thread가 이 전략을 가능하게 한 이유

### Platform Thread로 같은 짓을 하면

`concurrencyLimit = 50`을 Platform Thread에서 걸면

- 50개가 외부 API 호출 중 -> 모두 OS thread에서 blocking I/O
- 51번째 작업이 들어옴 -> caller thread가 `Condition.await()`에서 멈춤
- caller thread도 OS thread

배치가 2,100건을 일직선으로 submit한다고 보자.
51번째부터 모두 caller blocking -> caller thread도 다 OS thread를 점유.
배치 스레드 자체가 멈춰서 다음 작업을 못 만든다.

OS thread는 비싸다. 일반적으로 200~2,000개가 한계.
**caller blocking + OS thread = thread starvation의 다른 이름.**

### Virtual Thread는 blocking이 다르다

JDK 21+ Virtual Thread

- VT는 **carrier thread**(OS thread) 위에서 실행
- VT가 blocking I/O / `Condition.await()` 같은 걸 만나면 -> **carrier에서 unmount**
- carrier는 다른 VT를 실행할 수 있게 풀려남
- blocking이 끝나면 VT는 다시 schedule되어 carrier 위에 mount

`concurrencyLimit`의 `Condition.await()`도 Loom의 instrumentation 대상.
caller가 막히면 그 caller의 VT는 unmount된다. carrier는 다른 일을 한다.

### 변태 디깅: 무엇이 unmount를 가능하게 하는가

VT가 blocking을 만났을 때 carrier에서 unmount되려면: 그 blocking 지점이 **JDK가 instrument한 자리**여야 한다. 모든 blocking이 unmount되는 게 아니다.

**Unmount 되는 자리 (안전):**
- `Object.wait()` (Loom이 가로챔)
- `Thread.sleep()`
- `LockSupport.park()` / `parkNanos()`
- `java.util.concurrent.locks.ReentrantLock.lock()`
- `Condition.await()`
- `BlockingQueue.take()`
- NIO `Selector.select()`, `SocketChannel` blocking I/O

**Pin 되는 자리 (carrier 못 풀어줌):**
- `synchronized` 블록 / 메서드 (JVM 모니터 락)
- JNI native call 안의 blocking
- `Object.wait()`도 `synchronized` 안에서 호출되면 monitor 점유 상태로 wait -> 실제로 pinned

### 왜 synchronized는 pin하고 ReentrantLock은 안 하나

핵심 차이는 **락의 구현 레벨**이다.

`synchronized`는 JVM 레벨 모니터 락이다. JVM이 carrier thread의 OS thread에 락 ownership을 새긴다: `monitorenter` / `monitorexit`. 바이트코드가 OS thread를 점유.  

VT가 unmount되려면 carrier에서 분리되어야 한다. 분리되면 OS thread가 가진 모니터 락 ownership이 깨짐. 그래서 Loom은 분리를 포기하고 carrier를 그대로 점유한 채 wait: 이게 "pin".

`ReentrantLock`은 `AbstractQueuedSynchronizer`(AQS) 기반으로 Java 레벨에서 구현.  
락 대기는 결국 `LockSupport.park(this)` 호출.  

`LockSupport.park`는 Loom이 명시적으로 instrument한 메서드: VT면 carrier에서 unmount, 깨워질 때 다시 schedule.

```java
// java.util.concurrent.locks.AbstractQueuedSynchronizer
private void acquireQueued(...) {
    ...
    LockSupport.park(this);   // <- VT라면 여기서 carrier unmount
    ...
}
```

즉 Spring 6.1이 `ConcurrencyThrottleSupport`를 `synchronized + wait/notify` 에서 `ReentrantLock + Condition`으로 바꾼 게: **VT 환경에서 pin 안 일어나게 하기 위해** 였다.

### 코드 체인: Spring부터 Continuation.yield까지

`concurrencyLimit`이 caller를 막는 자리에서, 코드가 어디까지 내려가는지 한 줄씩 따라가 보면:

```
SimpleAsyncTaskExecutor.execute(task)
  └ ConcurrencyThrottleAdapter.beforeAccess()     // Spring
      └ ConcurrencyThrottleSupport.onLimitReached()
          └ this.concurrencyCondition.await()     // ReentrantLock.Condition
              └ AbstractQueuedSynchronizer.ConditionObject.await()
                  └ LockSupport.park(this)        // JDK
                      └ if (Thread.currentThread().isVirtual()) {
                            JLA.parkVirtualThread();
                        }
                        └ VirtualThread.park()    // JDK
                            └ yieldContinuation() // <- 여기가 unmount의 진짜 자리
```

`LockSupport.park()`의 JDK 21+ 실제 코드
```java
// java.util.concurrent.locks.LockSupport
public static void park() {
    if (Thread.currentThread().isVirtual()) {
        JLA.parkVirtualThread();   // <- VT면 분기
    } else {
        U.park(false, 0L);
    }
}
```

`JLA`는 `JavaLangAccess`: internal API로 `VirtualThread.park()` 호출.

### `VirtualThread.park()`: pin이 일어나는 정확한 자리

```java
// java.lang.VirtualThread (OpenJDK main)
@Override
void park() {
    assert Thread.currentThread() == this;

    // permit 있으면 즉시 return
    if (getAndSetParkPermit(false) || interrupted)
        return;

    // park 시도
    boolean yielded = false;
    setState(PARKING);
    try {
        yielded = yieldContinuation();   // <- Continuation.yield() 시도
    } catch (OutOfMemoryError e) {
        // park on carrier
    } finally {
        if (!yielded) {
            setState(RUNNING);
        }
    }

    // yield 실패 -> carrier에 park (= PIN)
    if (!yielded) {
        parkOnCarrierThread(false, 0);   // <- 여기 도달하면 pin
    }
}
```

결정 자리는 `yieldContinuation()`. 이게 **`true` 반환하면 unmount 성공.** carrier OS thread가 풀려나서 다른 VT를 실행한다.

`yieldContinuation()`이 **`false` 반환하면: yield 실패.** 그 다음 줄에서 `parkOnCarrierThread`로 fallback.  

이 자리가 **pin의 정확한 자리**.

```java
// VirtualThread.parkOnCarrierThread
private void parkOnCarrierThread(boolean timed, long nanos) {
    assert state() == RUNNING;

    setState(timed ? TIMED_PINNED : PINNED);   // <- 상태 자체가 PINNED
    try {
        if (!parkPermit) {
            ...
        }
    } finally {
        ...
    }
}
```

상태 머신에 `PINNED` 라는 명시적 상태가 있다. JFR이 감지하는 게 이 상태 전이.

### `yieldContinuation()`이 실패하는 자리 = `synchronized`

`Continuation.yield()`는: 현재 스택 프레임을 heap에 저장하고 carrier를 풀어준다. 근데 스택에 **VM이 unmount할 수 없는 프레임**이 있으면 yield 실패.

VM이 unmount 못 하는 프레임:
1. **`monitorenter` 바이트코드로 잡은 모니터 락**: JVM이 carrier OS thread에 ownership을 새겼다. 분리 불가.
2. **JNI native frame**: native call 안에서는 Java VM이 스택을 저장 못 함.
3. **Class initializer (`<clinit>`)**: 초기화 중 yield하면 클래스 로딩 깨짐.

대부분의 운영 환경에서 1번이 거의 전부다. third-party 라이브러리(JDBC 드라이버, HTTP 클라이언트)가 `synchronized`를 쓰면 거기서 pin.

### Pin 감지: JFR과 -Djdk.tracePinnedThreads

VT가 pin되는지 운영에서 확인하려면:

```bash
# 시스템 프로퍼티로 stack trace 출력
-Djdk.tracePinnedThreads=full

# 또는 JFR 이벤트
jfr configure jdk.VirtualThreadPinned=enabled
```

JFR `jdk.VirtualThreadPinned` 이벤트가 발생하면: 어디선가 synchronized로 carrier를 점유하고 있다는 신호.  

third-party 라이브러리(드라이버, 클라이언트)가 synchronized를 쓰면 거기서 pin. 우리가 모르고 도입할 수 있는 자리.

### JEP 491: Java 24 (preview)에서 synchronized pin 해소

JDK 24 preview의 [JEP 491: Synchronize Virtual Threads without Pinning](https://openjdk.org/jeps/491)는: synchronized 블록도 unmount 가능하게 바꾼다. 정확히는 JVM 모니터 락의 ownership을 OS thread가 아니라 **VT 자체**로 옮긴다. 이게 들어오면:

- 기존 synchronized 코드도 VT-friendly
- 그래도 ReentrantLock의 다른 이점(timeout, fairness)은 남음
- 마이그레이션 부담이 줄어듦

지금 우리 환경(Java 21)에서는 이게 아직 없으니 **synchronized 회피가 운영 룰**.

### 즉, 이렇게 묶인다

`SimpleAsyncTaskExecutor`의 디자인은: 매 작업마다 새 스레드를 만든다.
이게 Platform Thread 시대엔 안티패턴이었다 (스레드 생성 비용 + 한도).
VT 시대엔 **딱 맞는 모델**이 된다: 생성 비용 거의 0, 한도는 메모리 한도까지.

거기에 `concurrencyLimit`을 얹으면: 외부 시스템 보호용 throttle.
caller blocking이 일어나도 carrier는 자유로움: **`ReentrantLock + Condition` 으로 구현된 덕분.**

```
Platform Thread:  concurrencyLimit + blocking = thread starvation
Virtual Thread:   concurrencyLimit + blocking = scheduler가 알아서 (단, pin 없을 때)
```

VT 없이는 이 전략이 성립하지 않는다.
Spring 6.0 이하 + VT 조합에서는 이 전략이 **반쯤만** 성립한다 (synchronized pin).

---

## 4. concurrency 50은 어디서 나와야 하는 숫자인가: Little's Law

회고에서 솔직하게 적은 부분

> **VT concurrencyLimit 50**: 50이라는 숫자가 운영 측정값이 아니라 "외부 API rate limit이 100이니까 절반" 직관

이 숫자는 **Little's Law**로 잡혀야 한다.

### Little's Law

> L = λ × W
>
> - L: 시스템 안의 평균 작업 수 (concurrency)
> - λ: 처리량 (throughput, req/s)
> - W: 평균 응답 시간 (latency)

직관적으로

```
초당 처리량 = concurrency / latency
```

즉: concurrency를 정하려면 **latency와 목표 throughput**을 알아야 한다.

### 우리 자리: 두 외부 API가 한 executor에 묶여 있었다

| API | 실제 rate limit |
|---|---|
| Slack `chat.postMessage` | 분당 ~60건 (= **1 req/s**, Tier 1 standard) |
| Amplitude `httpapi/track` | ~1000 req/s+ |

**Slack이 진짜 병목.** rate limit이 두 자릿수 차이.

`concurrency = 50` + p50 200ms 가정으로 계산:

| 기준 API | 산출 throughput | rate limit 대비 |
|---|---|---|
| Slack | 250 req/s | **rate limit의 250배**: 49건이 즉시 429 |
| Amplitude | 250 req/s | 여유 통과 |

같은 concurrency 숫자 하나로 두 API를 잡을 수 없다.

### 단일 executor + 단일 concurrencyLimit의 한계

Slack 기준으로 안전한 concurrency
- 목표 throughput 0.8 req/s (rate limit 80%)
- p50 200ms -> `concurrency = 0.8 × 0.2 = 0.16` -> **현실적으로 1**

Amplitude 기준 안전 concurrency
- 목표 throughput 800 req/s
- p50 200ms -> `concurrency = 800 × 0.2 = 160`

같은 executor로 가면 **둘 중 하나는 항상 잘못 잡힌다.**

### 진짜 답: API별 separate throttle

```kotlin
// 각 API별 독립 throttle
val slackExecutor = SimpleAsyncTaskExecutor("slack-").apply {
    setVirtualThreads(true)
    concurrencyLimit = 1     // Slack tier 1
}

val amplitudeExecutor = SimpleAsyncTaskExecutor("amp-").apply {
    setVirtualThreads(true)
    concurrencyLimit = 100   // Amplitude는 여유
}
```

또는 token bucket throttle을 API별로

```kotlin
val slackBucket = Bucket.builder()
    .addLimit(Bandwidth.simple(1, Duration.ofSeconds(1)))
    .build()
```

`50`이라는 숫자가 **API 비대칭을 못 본** 결과라는 게 정확한 진단.
"100의 절반이니까 50"이라는 직관은: 어느 100을 쓰는지 자체가 두 API에서 다르다는 걸 놓쳤다.

### 측정값 없이 잡으면 안 되는 자리

이게 회고의 "안 푼 것"에 들어간 이유.
숫자 자체보다 **숫자의 근거가 측정이어야 한다**는 게 핵심.
P0(Outbox) 머지 전에는 50으로 간다. 실측 + API별 분리 후 재산정해야 한다.

---

## 5. 변태 디깅: 분산 환경에서 in-memory throttle은 안전한가

`concurrencyLimit = 50`은 **단일 JVM 안의 한도**다.  
pod이 N대면 클러스터 전체로는 N × 50.

### 우리 자리에 대입

EKS rolling deploy 후 admin-api pod이 4대라고 보자.  
각 pod이 `concurrencyLimit = 50`을 들고 있다.

배치는 한 pod에서 실행되니 그 pod의 50만 활성. 여기까진 OK.

근데 알림 리스너는 다른 pod에서도 발동될 수 있다: `app-api`,   `core-domain`도 같은 enum 변경에 반응.  
즉 **클러스터 전체 동시 호출이 4 × 50 = 200까지 가능.**

Slack rate limit 1 req/s 기준으로는 200배 over.

### in-memory throttle의 한계

- `ConcurrencyThrottleSupport`는 JVM heap 안의 카운터
- 다른 pod의 카운터를 모름
- 진정한 cluster-wide throttle은 **외부 카운터** 필요

### 후보들

**Resilience4j `RateLimiter`**
- in-memory, 같은 한계
- 단일 JVM 안에서는 token bucket으로 작동
- 클러스터 throttle은 못 함

**Bucket4j + Hazelcast / Redis / Ignite**
- 분산 카운터 백업
- Redis 기준: `INCR` + TTL로 token bucket 구현
- 한 토큰 소비 = Redis round trip (~1ms intra-AZ)
- Slack tier 1 (1 req/s) 같은 빡빡한 rate에서는 OK
- Amplitude (1000 req/s)에서는 round trip 비용이 throughput을 깎음

**API Gateway / Service Mesh 레벨 throttle**
- Istio EnvoyFilter, AWS API Gateway throttle
- 외부 호출 자체에 hard limit
- pod 죽음과 무관, 외부 의존 죽음에도 깨지지 않음. 대신 운영 추가

### 우리 자리의 정답

배치는 한 pod에서만 실행 + 알림 리스너는 같은 pod 안에서만 처리되도록 설계 -> **single-pod throttle로 충분.**

근데 그게 보장되는 구조인가?
- `@EventListener`가 모든 pod에 등록되어 있으면 같은 enum 변경 이벤트가 여러 pod에서 발동
- 우리 사고는 단일 pod 배치에서 시작했으니 영향 받은 건 한 pod의 in-memory 큐
- 향후 Outbox + publisher 분리 -> publisher가 단독 pod이면 single-pod throttle OK
- publisher가 여러 pod이면 분산 throttle 필수

**진짜 답은 "어디에 throttle 책임을 둘지" 의 아키텍처 결정.**
in-memory `concurrencyLimit`은 publisher pod 1대일 때만 정답. 그 외엔 분산 카운터 또는 gateway 레벨.

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
| pinned | `synchronized` 블록이 carrier를 pin 시켜서 unmount 안 됩니다. `ReentrantLock` 은 pin 안 합니다 (Spring 6.1+ 변경이 의미 있는 이유). |
| `ThreadLocal` | VT마다 새 인스턴스 생성. `ThreadLocal` heavy한 코드는 메모리가 폭발합니다. |

### 이 전략이 풀지 못하는 것이 있어요

> caller blocking은 거부를 지연으로 옮깁니다.

정합성 경계는 옮기지 않아요. DB 커밋과 이벤트 발행 사이는 그대로 분리됩니다.  
executor pod이 죽으면 in-memory 상태는 유실됩니다.

> **포기한 것**: caller blocking이 막는 건 큐 거부의 한 자리뿐이에요. pod 죽음에 의한 유실은 그대로 남습니다.

근본 답은 [why6](/why6/) 에서 짚은 Outbox.  
이 글은 그 봉합이 어떻게 작동하는가를 설명할 뿐, 봉합이 답이라고 말하지 않습니다.

---

## 정리

이 글이 답한 여섯 가지를 정리해두면 이렇습니다.

1. **5,235건은 어디서 사라졌나요**. `AbortPolicy` 에서 `RejectedExecutionException` 으로, `TaskRejectedException` 으로, `AsyncExecutionInterceptor` 가 그대로 propagate, `AFTER_COMMIT` runner 에서 잡히지 않고 끝났습니다. `AsyncUncaughtExceptionHandler` 는 이 흐름에 개입 안 했어요.
2. **`concurrencyLimit` 은 어떻게 막나요**. `ReentrantLock + Condition.await()`. Semaphore 아님. 큐도 없음. 한도까지 fire-and-forget, 초과 시 caller blocking.
3. **VT가 왜 필수일까요**. caller blocking이 OS thread를 점유하지 않게 해주는 유일한 방법이에요. 단, `synchronized` 로 감싸면 pin이 됩니다. Spring 6.1+의 `ReentrantLock` 변경이 의미 있는 자리예요.
4. **50은 어디서 나와야 하나요**. Little's Law (`L = λW`). Slack 1 req/s, Amplitude 1000 req/s 비대칭이라 단일 concurrency로 못 잡습니다. API별 separate throttle이 답.
5. **분산 환경에서 in-memory throttle 안전할까요**. pod N대면 클러스터 한도는 N × `concurrencyLimit`. publisher가 단독 pod일 때만 정답. 그 외엔 Bucket4j + Redis 또는 gateway 레벨.
6. **왜 Outbox가 답인가요**. `@TransactionalEventListener(AFTER_COMMIT) + @Async` 조합은 DB commit 후 발행이라, 거부되면 정합성이 깨져요. Outbox는 DB 변경과 outbox INSERT를 같은 트랜잭션에 묶어 정합성 경계를 DB로 통일합니다.

회고 글이 "무엇을 깨달았는가" 라면, 이 글은 그 깨달음이 코드 어느 줄에 박혀 있는가 입니다.  
둘 다 있어야 사고가 다음에 또 안 일어나요.

---

## References

### JEP / 공식 문서

- [JEP 444: Virtual Threads](https://openjdk.org/jeps/444): Java 21 final, Loom의 unmount/mount 모델 정의
- [JEP 491: Synchronize Virtual Threads without Pinning](https://openjdk.org/jeps/491): Java 24 preview, `synchronized` pin 해소
- [JEP 425: Virtual Threads (Preview)](https://openjdk.org/jeps/425): JDK 19 preview, 초기 설계 의도
- [JEP 480: Structured Concurrency](https://openjdk.org/jeps/480): VT 시대의 task 묶음 모델
- [Java Language Specification §17 Threads and Locks](https://docs.oracle.com/javase/specs/jls/se21/html/jls-17.html): 모니터 락 정의

### OpenJDK 소스

- [`VirtualThread.java`](https://github.com/openjdk/jdk/blob/master/src/java.base/share/classes/java/lang/VirtualThread.java): `park()`, `parkOnCarrierThread()`, 상태 머신 (`PARKING`, `PINNED`, `TIMED_PINNED`)
- [`LockSupport.java`](https://github.com/openjdk/jdk/blob/master/src/java.base/share/classes/java/util/concurrent/locks/LockSupport.java): `park()`의 VT 분기 (`Thread.currentThread().isVirtual()`)
- [`AbstractQueuedSynchronizer.java`](https://github.com/openjdk/jdk/blob/master/src/java.base/share/classes/java/util/concurrent/locks/AbstractQueuedSynchronizer.java): `acquireQueued`에서 `LockSupport.park` 호출
- [`ThreadPoolExecutor.java`](https://github.com/openjdk/jdk/blob/master/src/java.base/share/classes/java/util/concurrent/ThreadPoolExecutor.java): `execute()` 3단계 결정, `reject()`, `AbortPolicy`

### Spring Framework 소스

- [`ThreadPoolTaskExecutor.execute()`](https://github.com/spring-projects/spring-framework/blob/main/spring-context/src/main/java/org/springframework/scheduling/concurrent/ThreadPoolTaskExecutor.java): `RejectedExecutionException` -> `TaskRejectedException` wrap
- [`SimpleAsyncTaskExecutor.java`](https://github.com/spring-projects/spring-framework/blob/main/spring-core/src/main/java/org/springframework/core/task/SimpleAsyncTaskExecutor.java): `doExecute`, `setVirtualThreads`, `concurrencyLimit`
- [`ConcurrencyThrottleSupport.java`](https://github.com/spring-projects/spring-framework/blob/main/spring-core/src/main/java/org/springframework/util/ConcurrencyThrottleSupport.java): `ReentrantLock + Condition` 구현 (Spring 6.1+)
- [`AsyncExecutionInterceptor.java`](https://github.com/spring-projects/spring-framework/blob/main/spring-aop/src/main/java/org/springframework/aop/interceptor/AsyncExecutionInterceptor.java): `@Async` AOP intercept
- [`AsyncExecutionAspectSupport.handleError()`](https://github.com/spring-projects/spring-framework/blob/main/spring-aop/src/main/java/org/springframework/aop/interceptor/AsyncExecutionAspectSupport.java): task 실행 중 예외 처리 (submit 거부에는 도달 X)
- [`SimpleApplicationEventMulticaster.java`](https://github.com/spring-projects/spring-framework/blob/main/spring-context/src/main/java/org/springframework/context/event/SimpleApplicationEventMulticaster.java): `multicastEvent`, `invokeListener`, `errorHandler`

### Spring 릴리즈 노트

- [Spring Framework 6.1 Release Notes](https://github.com/spring-projects/spring-framework/wiki/What%27s-New-in-Spring-Framework-6.x#whats-new-in-spring-framework-61): `setVirtualThreads`, `ConcurrencyThrottleSupport` Loom-friendly 변경
- [Spring Framework 6.0 Release Notes](https://github.com/spring-projects/spring-framework/wiki/Upgrading-to-Spring-Framework-6.x)

### 외부 API rate limit 공식 문서

- [Slack `chat.postMessage` rate limits](https://api.slack.com/methods/chat.postMessage#rate_limiting): Tier 1 standard = 1 req/s
- [Slack rate limit tiers](https://api.slack.com/apis/rate-limits): Tier 1~4 + special
- [Amplitude HTTP API V2](https://amplitude.com/docs/apis/analytics/http-v2): events 처리 한도

### Pin 감지 / 모니터링

- [`-Djdk.tracePinnedThreads`](https://docs.oracle.com/en/java/javase/21/core/virtual-threads.html#GUID-DC4306FC-D6C1-4BCC-AECE-48C32C1A8DAA): JVM 옵션, pin 발생 시 stack trace
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

- [why6: VT로 봉합하고 '큐 거부 0건'을 성공이라고 부른 직후, 진짜 답은 Outbox](/why6/): 이 글의 사고 회고 원본
