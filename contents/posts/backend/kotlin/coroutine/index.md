---
title: "코틀린 코루틴이 멈췄다가 다시 시작하는 과정"
description: "보통 함수는 호출한 자리로 돌아온다. 코루틴이 중간에 멈췄다가 다음 줄에서 이어가려면 실행 위치와 지역 변수는 어디에 저장될까?"
date: 2024-02-12
update: 2026-11-15
tags:
  - kotlin
---

커피를 몇 잔 마셨는지 출력하는 함수를 하나 만들었다. 아래 코드에서 커피보다 먼저 `sleep`을 출력할 방법이 있을까?

```kotlin
fun main() {
    println("wake up")
    goToCompany()
    println("sleep")
}

fun goToCompany() {
    val num1 = 1
    val num2 = 2
    println("오늘도 커피 ${num1 + num2} 잔 ...")
}
```

마지막 `println`은 `goToCompany()` 호출 아래에 있다. 그래서 지금은 `wake up`, 커피 세 잔, `sleep` 순서로 찍힌다. 커피를 출력하기 전에 호출한 쪽이 먼저 실행을 이어가려면 어떻게 해야 할까?

![일반 함수의 실행 순서](img.png)

## 같은 스레드에서 두 코루틴 실행하기

`goToCompany()`를 자식 코루틴에서 실행하고, 두 함수에 `yield()`를 한 번씩 넣어 보자. 출력할 때 스레드 이름도 찍는다.

```kotlin
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.yield

fun main(): Unit = runBlocking {
    printWithThread("wake up")
    launch { goToCompany() }
    yield()
    printWithThread("sleep")
}

suspend fun goToCompany() {
    val num1 = 1
    val num2 = 2
    yield()
    printWithThread("오늘도 커피 ${num1 + num2} 잔 ...")
}

fun printWithThread(message: String) {
    println("${Thread.currentThread().name} : $message")
}
```

Kotlin 2.2.21, kotlinx.coroutines 1.10.2, JDK 21에서 실행했을 때는 이렇게 찍혔다.

```text
main : wake up
main : sleep
main : 오늘도 커피 3 잔 ...
```

원하는 순서로 바뀌었다. 그런데 `sleep` 앞에도, 커피 앞에도 찍힌 스레드 이름은 `main`이다. 디스패처를 따로 지정하지 않은 이 예에서 두 코루틴은 같은 `runBlocking` 이벤트 루프를 썼다.

![커피 잔 두 개를 놓고 자리를 비운 사람 대신 다른 사람이 같은 타자기에 앉아 sleep 줄을 먼저 찍는다.](./scene-one-stool-typewriter.webp)

부모가 첫 번째 `yield()`에 도달하면 자식이 실행될 수 있다. 자식은 두 변수를 선언하고 다시 `yield()`를 호출한다. 그사이에 부모가 `sleep`을 출력하고, 자식이 재개되면 커피 잔 수가 찍힌다. `yield()`를 호출해도 다른 코루틴이 실행된다는 보장은 없다. [kotlinx.coroutines의 yield 문서](https://kotlinlang.org/api/kotlinx.coroutines/kotlinx-coroutines-core/kotlinx.coroutines/yield.html)

## 두 번째 yield 다음 줄로 어떻게 돌아올까?

자식 코루틴은 커피 잔 수를 구하는 도중 실행을 멈췄다. 그사이 같은 스레드에서 부모가 `sleep`을 출력했다. 자식이 자기 차례를 다시 받으면 합계 계산에 필요한 값은 어디서 찾아올까?

코틀린 컴파일러는 중단 지점이 있는 함수를 여러 단계로 나눈다. 중단 후에도 필요한 지역 변수와 재개할 단계 번호를 `Continuation` 구현 객체에 저장할 수 있다. 재개할 때는 그 번호에 따라 중단 지점 다음 코드를 실행한다. 이 예에서 필요한 건 합계를 출력하는 데 쓸 값이다. 상수까지 각각 별도 필드가 되는지는 컴파일 결과에 따라 다르다. [코틀린 명세의 코루틴 상태 머신](https://kotlinlang.org/spec/asynchronous-programming-with-coroutines.html#coroutine-state-machine)

<span id="article-section-3"></span>

![일반 함수가 반환되는 순서와 코루틴이 멈췄다가 다시 실행되는 순서](img_1.png)
