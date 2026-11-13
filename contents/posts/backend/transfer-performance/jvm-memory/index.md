---
title: "JVM 메모리 구조와 객체의 생명주기"
description: "스레드가 하나 늘면 메모리 그림에서 무엇을 더 그려야 할까. 힙과 스택을 나눠 그린 뒤, 메서드 밖에서 수수료 100원이 찍힌 영수증을 다시 읽어 봤다."
date: 2026-11-11
update: 2026-11-13
tags:
  - JVM
  - Java
  - 힙
  - 스택
  - GC
---

JVM 메모리 그림에 스레드를 하나 더 그려 봤다. 새로 필요했던 건 **그 스레드가 쓸 JVM 스택과 프로그램 카운터(PC)**였다. 힙과 메서드 영역은 처음 그린 하나씩이면 된다. 두 스레드가 같은 객체를 읽더라도 어느 메서드의 몇 번째 명령을 실행 중인지는 각자 기억해야 하기 때문이다.

그런데 객체를 만든 메서드가 끝나 스택에서 빠지면 누가 그 객체를 계속 쓸까? 영수증을 하나 만들어 두고 메서드 밖에서 다시 꺼내 봤다.

## JVM의 런타임 데이터 영역

![스레드가 하나 늘면 실행 위치와 호출 스택도 하나씩 늘어난다. 두 스레드는 같은 힙과 메서드 영역을 쓴다.](./00-runtime-areas.svg)

그림에서 **스레드마다 하나씩** 있는 PC는 현재 실행 중인 JVM 명령의 위치를 가리킨다. JVM 스택에는 아직 끝나지 않은 메서드 호출들이 쌓인다. 자바 메서드에서 C로 작성한 네이티브 메서드로 넘어가면 명세는 그동안의 PC 값을 정하지 않는다. 이때 별도의 네이티브 메서드 스택을 쓰는 JVM 구현도 있다.

두 스레드가 **함께 쓰는 쪽**에는 힙과 메서드 영역이 있다. 클래스의 인스턴스와 배열은 힙에 둔다. 메서드 영역에는 클래스마다 어떤 필드와 메서드가 있는지, 메서드의 바이트코드는 무엇인지 기록한다. 각 클래스나 인터페이스의 **런타임 상수 풀**도 여기에 있다. 내 코드에서 다른 클래스의 메서드를 호출할 때 JVM이 그 이름과 타입을 어디서 읽나 했더니 바로 이 풀이다. [JVM 명세 §2.5 런타임 데이터 영역](https://docs.oracle.com/javase/specs/jvms/se25/html/jvms-2.html#jvms-2.5)

그림에서는 힙과 메서드 영역을 역할에 따라 따로 그렸다. JVM 명세를 보면 메서드 영역도 논리적으로 힙의 일부다. 이 영역에서 GC를 하거나 빈 공간을 모을지는 구현에 맡긴다. [JVM 명세 §2.5.4 메서드 영역](https://docs.oracle.com/javase/specs/jvms/se25/html/jvms-2.html#jvms-2.5.4)

이 그림을 프로세스의 메모리 사용량과 맞춰 보려면 힙 밖도 봐야 한다. OpenJDK의 JVM인 HotSpot은 클래스 메타데이터 대부분을 네이티브 메모리의 **메타스페이스**에 두고, JIT가 만든 기계어는 **코드 캐시**에 둔다. 직접 버퍼가 쓰는 데이터 역시 힙 밖에 있기도 하다. `-Xmx`는 힙의 최댓값이어서, 프로세스 전체가 쓰는 메모리에는 이런 공간이 더 들어간다. [HotSpot의 클래스 메타데이터](https://docs.oracle.com/en/java/javase/25/gctuning/other-considerations.html) · [HotSpot 코드 캐시](https://docs.oracle.com/en/java/javase/25/vm/java-hotspot-virtual-machine-performance-enhancements.html) · [Java 직접 버퍼](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/nio/ByteBuffer.html#direct)

## 스택 프레임 하나가 생기고 사라질 때

메서드를 호출할 때마다 JVM 스택에 그 호출이 쓸 **프레임**을 올린다. 재귀 호출에서는 같은 코드를 실행하면서도 바깥쪽 호출의 인자와 안쪽 호출의 인자를 따로 기억해야 한다. 각 프레임에는 인자와 지역 변수를 넣는 슬롯, 계산할 값을 잠시 두는 **피연산자 스택**, 현재 메서드가 속한 클래스의 런타임 상수 풀을 가리키는 참조가 있다. 재귀가 너무 깊어져 허용된 스택 크기를 넘기면 `StackOverflowError`가 난다. [JVM 명세 §2.6 프레임](https://docs.oracle.com/javase/specs/jvms/se25/html/jvms-2.html#jvms-2.6)

스택이라는 말이 벌써 두 번 나왔다. 정수 덧셈 명령 `iadd`가 3과 4를 꺼내 7을 올려놓는 곳은 지금 실행 중인 프레임 **안쪽**의 피연산자 스택이다. `iadd`에는 더할 두 값의 위치를 적을 필요가 없다. JVM을 **스택 머신**이라고 부르는 이유다. 덧셈을 하는 동안 호출 스택에서는 어떤 프레임도 빠지지 않는다. [JVM 명세 §2.6.2 피연산자 스택](https://docs.oracle.com/javase/specs/jvms/se25/html/jvms-2.html#jvms-2.6.2)

```java
record Box(int value) {}

static Box make(int value) {
    Box box = new Box(value);
    return box;
}
```

`Box result = make(7)`을 호출하면 정수 7이 두 군데에 들어간다. 하나는 `make`가 인자로 받은 지역 변수 `value`, 또 하나는 힙에 만든 `Box` 안의 필드다. 지역 변수 `box`에 담은 것은 그 객체를 가리키는 참조다.

![make가 반환하면 그 프레임은 사라진다. 호출자의 result는 반환받은 참조로 같은 Box를 읽는다.](./01-frame-and-heap.svg)

`return box`에서 호출자에게 건네는 값도 그 참조다. `make` 프레임이 사라진 다음에도 호출자는 자기 쪽에 남은 `result`로 아까 그 `Box`의 필드를 읽는다.

## new가 공간을 얻고 생성자가 값을 채우는 순서

소스에는 `new Box(value)` 한 줄뿐인데 바이트코드 그림에는 `new`와 `invokespecial`이 따로 보인다. `Box` 클래스가 아직 초기화되지 않았다면 JVM은 클래스부터 초기화한다. 그다음 새 인스턴스의 공간을 확보하고 필드를 기본값으로 준비한다. 여기까지 `int` 필드의 값은 0이다. 생성자가 실행돼야 비로소 7이 들어간다. [JVM 명세의 new 명령](https://docs.oracle.com/javase/specs/jvms/se25/html/jvms-6.html#jvms-6.5.new)

![각 행은 명령 하나가 끝난 직후다. dup 다음의 U 두 개는 같은 객체를 가리킨다. 생성자 호출이 끝나면 초기화된 참조 R 하나가 남는다.](./02-new-and-init.svg)

가운데 `dup`이 있어서 객체가 두 개처럼 보인다. 여기서 복제하는 것은 스택 맨 위의 참조다. `invokespecial`이 참조 하나와 7을 꺼내 생성자를 호출하고 나면 참조 하나가 남는다. `astore_1`은 남은 참조를 지역 변수 `box`에 저장하고, `aload_1`은 그 참조를 다시 올린다. 마지막 `areturn`이 호출자에게 돌려주는 값이다. [앞 글에서 본 피연산자 스택](/backend/transfer-performance/02-jvm-execution/#diagram-01-stack-machine)

HotSpot 객체에는 필드 외에도 타입과 잠금 상태 등을 기록하는 헤더가 있다. `Box` 하나를 만들 때 필요한 공간에는 이 헤더와 정렬에 필요한 여백까지 들어간다. [HotSpot 객체 헤더](https://docs.oracle.com/en/java/javase/25/gctuning/other-considerations.html)

모든 스레드가 힙을 같이 쓴다면 객체 하나를 만들 때마다 다음 빈자리를 두고 경쟁할까? HotSpot은 각 스레드에 공유 힙의 일부를 **TLAB**(스레드별 할당 버퍼)으로 내줄 수 있다. 여유가 있는 동안 그 스레드는 자기 버퍼에서 다음 빈 위치를 객체 크기만큼 옮기면 된다. 따로 쓰는 것은 할당 위치다. 거기서 만든 객체도 다른 스레드에 참조를 건네면 함께 쓸 수 있다. [OpenJDK 25의 TLAB 할당 코드](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/share/gc/shared/memAllocator.cpp)

JIT가 필요한 필드 값만으로 계산을 끝낼 수 있으면 실제 할당을 생략하기도 한다. 바이트코드의 `new` 개수만 세서는 힙 사용량을 계산하기 어렵다. [HotSpot의 탈출 분석](https://docs.oracle.com/en/java/javase/25/vm/java-hotspot-virtual-machine-performance-enhancements.html#GUID-6BD8FCB5-995B-4AE9-BFAA-B2C7DE2BA5CD)

## GC가 살아 있는 객체를 찾고 공간을 회수하는 과정

`make`는 끝났지만 호출자의 `result`로 `Box`에 닿을 수 있었다. GC도 실행 중인 스레드가 계속 사용할 참조 같은 **GC 루트**에서 출발해 객체 사이의 연결을 따라간다. 일반 참조를 따라 루트에서 닿는 객체는 살아 있다. 도중에 다른 객체의 필드나 배열을 거쳐도 마찬가지다.

![루트에서 보관 목록을 거쳐 객체에 닿는다. 목록에서 마지막 연결을 끊으면 GC가 그 객체의 공간을 회수할 수 있다.](./03-gc-reachability.svg)

목록에서 마지막 항목을 지웠을 때 끊기는 것은 그 객체로 가는 길이다. 이렇게 루트에서 그 객체까지 갈 수 있는지를 **도달 가능성**이라고 한다. 두 객체가 서로 가리키고 있어도 루트에서 어느 쪽으로도 갈 길이 없으면 둘 다 회수 대상이다. 반대로 이미 기한이 지난 항목도 살아 있는 목록에 계속 두면 GC를 몇 번을 해도 남는다. [Java의 도달 가능성 정의](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/lang/ref/package-summary.html#reachability)

클래스 정보의 수명에는 **그 클래스를 정의한 로더**가 관여한다. 플러그인 인스턴스를 모두 지워도 프로그램이 해당 로더를 계속 보관하면 그 로더가 정의한 일반 클래스는 남는다. 그 로더 자체가 GC의 회수 대상이 되어야 클래스도 언로딩 대상이 된다. 어느 수집 때 실제로 언로드할지는 보장되지 않는다. 부트스트랩 로더가 로드한 클래스는 언로딩 대상에서 제외된다. [Java 언어 명세 §12.7 클래스와 인터페이스의 언로딩](https://docs.oracle.com/javase/specs/jls/se25/html/jls-12.html#jls-12.7)

실제로 빈 공간을 만드는 방식은 수집기마다 다르다. **G1**은 힙을 같은 크기의 리전(region)으로 나눈다. 작은 새 객체는 보통 Eden 리전에 들어간다. 젊은 세대 수집에서 살아남은 객체는 Survivor나 Old 리전으로 옮긴다. 일반적인 대피(evacuation) 과정에서는 선택한 리전의 살아 있는 객체를 다른 리전으로 복사하고 참조를 고친다. 대피를 마친 리전은 통째로 다시 할당에 쓸 수 있다. [JDK 25 G1의 힙 배치와 회수 과정](https://docs.oracle.com/en/java/javase/25/gctuning/garbage-first-g1-garbage-collector1.html)

## 짧은 실험으로 확인한 객체의 수명

`Box`를 수수료 100원이 찍힌 영수증으로 바꿔서 실행했다. `saveForLater` 안에서 영수증을 만들고 그 참조를 `static` 필드 `saved`에 넣었다. 메서드 밖에서 `saved.feeWon()`을 찍어 보니 100이 나왔다.

그다음에는 `saved = null`로 마지막 강한 참조를 끊었다. 영수증을 확인하려고 강한 참조를 하나 더 남겨 두면 그 참조 때문에 영수증이 살아남는다. 미리 걸어 둔 `WeakReference`가 큐에 들어오는지만 최대 2초 기다렸다. [실행할 Java 소스](./evidence/ReceiptMemoryDemo.java) · [바이트코드 발췌](./evidence/receipt-javap.txt)

| 같은 코드, 다른 실행 조건 | 2초 안에 큐에서 약한 참조를 받았나? |
| --- | --- |
| G1에서 `System.gc()` 요청 허용 | 새 JVM에서 다섯 번 모두 받았다. |
| `-XX:+DisableExplicitGC`로 명시적 요청 무시 | 한 번 실행했다. 기다리는 동안 통지는 없었다. |

Temurin 25.0.4.1에 32MiB 힙을 주고 `System.gc()` 요청을 받아들이는지만 바꿨다. 영수증으로 가는 마지막 길은 두 경우 모두 `saved = null`에서 끊겼다. 차이가 난 건 2초 안에 GC가 약한 참조를 처리했는지였다. 그 통지로 영수증이 쓰던 바이트를 다음 객체가 재사용한 시각까지 알 수는 없다. [기본 실행 출력](./evidence/receipt-stdout.txt) · [G1 로그](./evidence/receipt-gc.txt) · [대조 실행 명령과 출력](./evidence/receipt-no-explicit-gc.txt)

## 자료의 그림을 실제 코드와 맞춰 보기

네이버 D2의 2011년 그림에 스레드를 하나 더 그릴 때도 스택과 PC만 추가하면 된다. 다만 거기에 적힌 PermGen을 이 실험의 JDK 25에서 찾으면 나오지 않는다. 여기서 HotSpot이 클래스 메타데이터를 보관하는 곳은 메타스페이스다. [D2의 JVM Internal](https://d2.naver.com/helloworld/1230)

Pratik T의 예제처럼 지역 변수에서 객체로 화살표를 긋고 그 객체 안에 `int` 필드를 하나 그려 넣었다. “기본형은 어디에 저장되나?”라는 질문에는 그림 속 어느 `int`를 가리키는지부터 물어야 한다. `make(7)`의 인자도, `Box`의 필드도 `int`이기 때문이다. 이 그림은 자바 코드의 참조 관계를 보여 준다. 실제로 JIT가 할당을 없애면 힙에 `Box` 한 개가 그대로 생기지는 않는다. [Understanding JVM Memory Allocation](https://medium.com/@pratik.941/understanding-jvm-memory-allocation-a-tutorial-d06e830e615f) · [HotSpot의 탈출 분석](https://docs.oracle.com/en/java/javase/25/vm/java-hotspot-virtual-machine-performance-enhancements.html)

AdoptOpenJDK의 보관된 JDK 11 소스에서는 `ClassFileParser`가 로더 데이터를 넘겨 상수 풀을 할당한 뒤 클래스 파일의 항목을 읽는 두 호출을 차례로 볼 수 있다. 그림에서 클래스마다 하나씩 두었던 상수 풀이 여기서 생긴다. [JDK 11의 상수 풀 할당과 파싱](https://github.com/AdoptOpenJDK/openjdk-jdk11/blob/19fb8f93c59dfd791f62d41f332db9e306bc1422/src/hotspot/share/classfile/classFileParser.cpp#L6061-L6070) · [클래스 로딩 오류 재현](/backend/transfer-performance/class-loading/)

이 글을 읽고 그림 없이 설명해 볼 만한 대목은 `return`과 `saved = null` 사이다. 앞에서 없어진 것은 프레임 하나고, 뒤에서야 영수증에 닿는 마지막 강한 참조가 사라졌다. [JVM 면접 연습 25문항과 『자바 최적화』 6·7장 복습](./evidence/interview.html)

참조를 하나 더 만들어도 `Box`는 여전히 하나였다. 배열에서는 어떨까. 참조를 다른 칸에 복사할 때, 특히 아직 읽지 않은 원본 칸과 목적지가 겹칠 때 무슨 일이 생기는지 이어서 실험했다. [System.arraycopy에서 CPU의 복사 명령까지](/backend/transfer-performance/system-arraycopy/)
