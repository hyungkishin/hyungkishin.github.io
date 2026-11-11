---
title: "메서드가 끝났는데 영수증은 왜 남아 있을까?"
description: "JVM 메모리에서 수수료 100원짜리 영수증을 따라간다. 메서드가 끝난 뒤 힙에 무엇이 남는지, 마지막 참조를 놓으면 GC가 언제 반응하는지 그림과 실행 로그로 살펴봤다."
date: 2026-11-11
update: 2026-11-11
tags:
  - JVM
  - Java
  - 힙
  - 스택
  - GC
---

송금 수수료 100원을 영수증에 담아 돌려주는 메서드가 있다. 메서드가 끝나면 그 안에서 쓰던 지역 변수에는 더 이상 접근할 수 없다. 그런데 호출한 쪽은 그 뒤에도 수수료를 읽는다. 100원은 어디에 남아 있을까?

![반환 전에는 make의 receipt가, 반환 뒤에는 호출자의 local이 수수료 100원인 같은 영수증을 가리킨다.](./01-frame-and-heap.svg)

그림에서 영수증을 향한 화살표의 출발점을 보자. 반환 직전에는 `make`의 변수 `receipt`다. 반환하고 나면 호출자의 변수 `local`이다. 두 장면에 등장하는 영수증은 하나다.

## 메서드에서 돌아오는 값은 무엇일까?

영수증에는 원 단위 수수료 하나만 담았다. 아래는 실행한 예제의 일부다. `make`의 마지막 줄에서 어떤 값이 호출자에게 넘어갈까? [전체 Java 소스](./evidence/ReceiptMemoryDemo.java)

```java
record Receipt(int feeWon) {}

static Receipt make(int feeWon) {
    Receipt receipt = new Receipt(feeWon);
    return receipt;
}
```

JVM에서 메서드를 호출하면 그 호출에 쓸 **프레임**이 생긴다. 지금 실행하는 스레드의 스택에 놓이는 작업 공간이다. `make`의 프레임에는 인자인 정수 `feeWon`과 지역 변수 `receipt`가 있다. `receipt`에 담긴 값은 영수증을 가리키는 **참조**다. 영수증 같은 객체는 JVM의 여러 스레드가 공유하는 **힙**에 할당된다. [JVM 명세의 프레임](https://docs.oracle.com/javase/specs/jvms/se25/html/jvms-2.html#jvms-2.6) · [JVM 명세의 힙](https://docs.oracle.com/javase/specs/jvms/se25/html/jvms-2.html#jvms-2.5.3)

`return receipt`는 그 참조를 호출자에게 건넨다. `make`의 프레임은 호출이 끝나면 사라진다. 호출자 `saveForLater`는 반환받은 참조를 자기 프레임의 `local`에 저장한다. 나중에도 읽으려고 클래스의 `static` 필드 `saved`에 대입한다.

```java
Receipt local = make(100);
saved = local;
System.out.println("local == saved: " + (local == saved));
```

`==`가 비교하는 것은 두 변수가 **같은 객체**를 가리키는지다. 이 줄의 출력은 `true`였다. `saveForLater`까지 끝난 뒤에는 `main`에서 `saved.feeWon()`을 호출했고 `100`을 읽었다. 여전히 영수증으로 가는 길이 하나 남아 있었기 때문이다. [실행 출력](./evidence/receipt-stdout.txt)

## new 한 줄에서 참조는 어떻게 생길까?

[앞 글](/backend/transfer-performance/02-jvm-execution/)에서는 `javap`로 수수료 계산을 호출한 위치를 찾았다. 이번에는 `make`의 `new Receipt(feeWon)`을 열어 보자. 아래 그림은 각 명령을 실행한 직후 프레임 안의 **피연산자 스택**에 무엇이 남는지 보여 준다. 이 스택은 계산에 넣을 값이나 호출 직후 돌려받은 값을 잠시 두는 곳이다.

![new와 dup가 같은 미초기화 객체의 참조를 스택에 놓는다. 생성자 호출이 끝나면 초기화된 영수증의 참조 하나가 남는다.](./02-new-and-init.svg)

오프셋 `0`의 `new`는 새 영수증의 참조를 스택에 놓는다. 아직 생성자를 호출하기 전이라 그림에 `U`로 표시했다. `3: dup` 뒤에 U가 두 개 보인다. 복사한 것은 맨 위의 참조 값이다. 둘 다 같은 영수증을 가리킨다. 이어서 `4: iload_0`이 인자 `100`을 올린다.

`5: invokespecial`은 참조 하나와 `100`을 꺼내 생성자 `<init>(int)`를 호출한다. 생성자가 정상적으로 끝나면 남겨 둔 참조로 초기화된 영수증을 쓸 수 있다. 그림의 `R`이다. 생성자의 반환 타입은 `void`다. 여기서 쓸 수 있는 참조는 `dup`에서 한 벌 남겨 둔 값이다. [JVM 명세의 new 명령](https://docs.oracle.com/javase/specs/jvms/se25/html/jvms-6.html#jvms-6.5.new)

마지막 세 명령은 그림에서 본 화살표를 코드와 연결해 준다. `8: astore_1`은 그 참조를 지역 변수 슬롯 1에 저장한다. `9: aload_1`이 같은 값을 다시 스택에 올리면 `10: areturn`이 호출자에게 돌려준다. 클래스 파일의 지역 변수 표에서 슬롯 1의 이름도 `receipt`로 확인할 수 있다. [javap 출력](./evidence/receipt-javap.txt)

여기서 읽은 것은 클래스 파일의 명령이다. 그림 속 화살표는 어느 변수가 어느 객체를 가리키는지 보여 준다. HotSpot은 힙에서 객체를 만들 때 스레드별로 확보해 둔 공간인 TLAB을 쓸 수 있다. 컴파일러는 객체의 쓰임에 따라 필드 값을 따로 계산해 객체 할당을 생략하기도 한다. `javap`의 `new` 한 줄로 이 실행이 어느 할당 경로를 탔는지 알 수는 없다. [HotSpot의 탈출 분석](https://docs.oracle.com/en/java/javase/25/vm/java-hotspot-virtual-machine-performance-enhancements.html#GUID-6BD8FCB5-995B-4AE9-BFAA-B2C7DE2BA5CD) · [Java 실행 옵션의 TLAB 설명](https://docs.oracle.com/en/java/javase/25/docs/specs/man/java.html)

## 마지막 참조를 놓으면 바로 사라질까?

`main`은 수수료를 읽은 직후 `saved = null`을 실행한다. 그때 무슨 일이 일어나는지 보려고 `saveForLater`에서 작은 관찰 장치를 하나 준비했다. 영수증을 `WeakReference`로 감싸 두고 그 약한 참조가 처리되면 통지를 받을 `ReferenceQueue`를 연결했다.

![saved를 비우기 전에는 클래스의 필드를 통해 영수증에 닿는다. 비운 뒤에는 WeakReference에서 출발하는 약한 연결만 남는다.](./03-gc-reachability.svg)

위 그림에서 `saved`를 비우기 전에는 살아 있는 클래스의 필드를 따라 영수증에 닿을 수 있다. 가비지 컬렉터(GC)는 프로그램이 계속 쓸 수 있는 객체를 찾으려고 참조를 따라간다. 그 출발점이 **GC 루트**다. 실행 중인 스레드가 앞으로 사용할 지역 참조도 그런 출발점의 예다. 루트에서 일반 참조를 따라 닿는 동안에는 영수증이 **강하게 도달 가능**하다. [Java의 도달 가능성 정의](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/lang/ref/package-summary.html#reachability)

이제 `make`와 `saveForLater`는 모두 끝났고 `saved`도 비었다. `main`에 남은 것은 약한 참조 객체 `watched`다. 약한 참조는 가리키는 영수증을 계속 살려 두지 않는다. GC가 영수증에 약한 참조로만 닿는다고 판정하면 그 연결을 지운다. 큐에 등록한 약한 참조는 그때 또는 그 뒤에 큐에 들어간다. 큐에서 꺼낸 값이 우리가 등록한 `watched`인지 비교하면, 영수증을 다시 꺼내지 않고도 통지가 왔는지 알 수 있다. [WeakReference API](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/lang/ref/WeakReference.html)

## 같은 코드에서 GC 요청만 바꿔 봤다

Temurin OpenJDK 25.0.4.1에서 가비지 컬렉터로 G1을 쓰고 힙을 32MiB로 고정했다. 첫 실행에서는 `saved`를 비운 뒤 `System.gc()`를 호출했다. 큐에서 기다릴 시간은 2초로 설정했다.

```bash
javac -g ReceiptMemoryDemo.java
java -Xms32m -Xmx32m -XX:+UseG1GC -Xlog:gc:file=receipt-gc.txt ReceiptMemoryDemo
```

아래는 프로그램이 출력한 네 줄이다. 셋째 줄은 기다리던 `watched`를 큐에서 받았는지를 보여 준다. 마지막 줄은 `watched.refersTo(null)`로 확인한 결과다.

```text
local == saved: true
saved.feeWon(): 100
enqueued within 2 s: true
weak reference cleared: true
```

같은 조건으로 새 JVM에서 다섯 번 실행해 모두 큐 통지를 받았다. 한 실행의 G1 로그에는 `Pause Full (System.gc())`와 `1M->1M(32M)`이 찍혔다. 앞뒤의 `1M`은 힙 전체의 사용량을 이 단위로 표시한 값이다. 영수증 하나의 크기나 그 메모리가 재사용된 순간은 이 줄에서 읽을 수 없다. [G1 로그](./evidence/receipt-gc.txt)

대조 실행에서는 같은 명령에 `-XX:+DisableExplicitGC`만 더했다. 애플리케이션이 요청한 명시적 GC를 무시하는 옵션이다. 이번에도 수수료는 `100`이었지만 2초 동안 큐 통지가 오지 않았다. 확인할 때까지 약한 참조도 지워지지 않았다. 두 실행 모두 같은 줄에서 마지막 강한 참조를 끊었다. 그 줄에 도달한 시점과 GC가 약한 참조를 처리한 시점은 이렇게 다를 수 있다. [대조 실행 명령과 출력](./evidence/receipt-no-explicit-gc.txt) · [System.gc()의 동작 범위](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/lang/System.html#gc())

송금 서비스에서 영수증이 오래 남는다면 먼저 누가 그 영수증을 계속 가리키는지 본다. 재조회에 필요해 보관하는 동안에는 살아 있는 게 맞다. 보관 기한이 끝났는데도 영수증을 목록에서 지우지 않아 계속 쌓인다면 메모리 누수를 의심할 수 있다. GC는 그 보관 기한을 알지 못한다.

이 예제의 `saved`는 실행 중인 JVM 안에만 있는 값이다. 프로세스가 재시작해도 고객에게 송금 결과를 알려 주려면 무엇을 기록해야 할까? [다음 글에서 송금 접수와 확정을 구분하는 이유로 이어진다.](/backend/transfer-performance/03-transfer-contract/)
