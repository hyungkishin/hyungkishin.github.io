---
title: "System.arraycopy는 겹친 배열을 어떻게 복사할까?"
description: "다섯 자리 중 네 개의 이름표를 오른쪽으로 한 칸 밀어 본다. Java 명세의 ‘임시 배열’이 무슨 뜻인지 32MiB 힙 실험으로 확인하고 HotSpot이 만든 ARM64 명령과 복사 도중 타입 오류가 난 배열을 읽는다."
date: 2026-11-12
update: 2026-11-12
tags:
  - Java
  - JVM
  - HotSpot
  - 배열
---

```java
String[] seats = {"A", "B", "C", "D", "E"};
System.arraycopy(seats, 0, seats, 1, 4);
```

결과는 `[A, A, B, C, D]`다. 그런데 같은 일을 한다고 생각하고 `seats[i + 1] = seats[i]`를 앞에서부터 네 번 실행하면 다섯 칸이 전부 A가 된다. 첫 번째 쓰기가 B를 지웠는데, `arraycopy`는 어디서 B를 다시 읽었을까?

## 명세에 나온 임시 배열은 어디에 있을까?

Java 명세는 출발지와 도착지가 같은 배열일 때 **“as if”**라는 말을 쓴다. 원래 구간을 임시 배열에 먼저 복사한 것처럼(“were first copied to a temporary array”) 목적지의 값이 정해진다는 뜻이다. 위 호출에서 `0`과 `1`은 각각 시작 인덱스이고 `4`는 복사할 **원소 수**다. 호출자는 이미 있는 목적지 배열을 건넨다. 메서드는 그 안의 값을 바꾼다. [Java SE 25의 arraycopy 계약](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/lang/System.html#arraycopy(java.lang.Object,int,java.lang.Object,int,int))

C를 쓴다면 `memmove`가 떠오른다. 두 구간이 겹쳐도 호출 전의 원본을 기준으로 결과가 정해진다는 점이 같다. `memmove`의 길이 단위는 바이트다. Java에서는 `int[]`의 네 원소와 `String[]`의 네 참조가 서로 다른 복사 작업이다. C의 `memcpy`는 구간이 겹치면 동작이 정의되지 않는다. [Linux 매뉴얼의 memmove](https://man7.org/linux/man-pages/man3/memmove.3.html) · [memcpy의 겹침 조건](https://man7.org/linux/man-pages/man3/memcpy.3.html)

다섯 자리의 이름표를 지운 뒤 다시 쓸 수 있다고 하자. 맨 앞자리는 그대로 두고 A부터 D까지를 한 자리씩 오른쪽에 적어야 한다. D를 먼저 맨 끝에 적으면 원래 D가 있던 자리에 C를 적어도 된다. 반대로 A부터 쓰면 다음에 읽을 B가 사라진다. 왼쪽으로 당길 때는 앞자리부터 쓰면 된다.

![같은 다섯 칸을 오른쪽으로 복사한다. 앞에서부터 쓴 쪽과 뒤에서부터 쓴 쪽의 값이 네 단계에 걸쳐 달라진다.](./01-overlap.svg)

이제 두 가지 예측을 시험해 보자. **쓰기 순서만 잘 정해도** 결과는 복사 직전의 배열에서 읽은 값과 같을 것이다. **JVM이 매번 복사 길이만 한 임시 배열을 힙에 만든다면**, 원본과 사본을 함께 담을 수 없는 힙에서는 이 호출도 실패할 것이다.

## 17MiB 배열 하나만 들어갈 때

먼저 길이 0부터 8까지의 `int[]`에서 가능한 출발 위치, 도착 위치, 복사 길이를 모두 조합했다. 기대값은 따로 보관해 둔 원본에서 읽어서 만들었다. 실제 호출은 한 배열 안에서 읽고 썼다. 825개 조합이 모두 일치했다. 출발지와 도착지가 같은 경우도 포함했다. 825개 중 285개는 복사 길이가 0이었다. 기본 JVM과 인터프리터 모드(`-Xint`)에서 출력이 같았다. [테스트 소스](./evidence/ArraycopyCases.java) · [재현 명령과 결과](./evidence/cases.txt)

다음은 공간을 제한한 실험이다. 32MiB 고정 힙에 17MiB짜리 `byte[]` 하나를 만들었다. 각 칸에 넣을 바이트 값은 그 칸의 인덱스로 계산했다. Linux ARM64의 Temurin 25.0.5+8과 Serial GC를 사용해 두 조건을 별도 JVM에서 실행했다.

| 같은 배열을 오른쪽으로 한 칸 미는 방법 | 관찰한 결과 |
| --- | --- |
| `arraycopy(data, 0, data, 1, data.length - 1)` 한 번 | 복사 성공. 첫 칸까지 포함한 17,825,792칸의 값이 모두 맞았다. |
| `new byte[data.length - 1]`에 담은 다음 다시 복사 | 임시 배열을 만드는 줄에서 `OutOfMemoryError`가 발생했다. |

첫 실행에서는 같은 길이의 Java 힙 배열을 하나 더 만들 공간이 없었는데도 복사가 끝났다. 매번 그런 배열을 할당한다는 가설은 이 결과로 기각된다. 이 큰 바이트 배열에서 어떤 CPU 명령이 실행됐는지는 측정하지 않았다. 이번에는 `int` 네 개로 복사 길이를 줄이고 별도 실행에서 JVM이 만든 기계어를 읽어 보자. [두 조건의 Java 코드](./evidence/HeapLimitProbe.java) · [힙 옵션과 실제 출력](./evidence/heap-limit.txt)

## System에서 CPU의 load와 store까지

`System.`으로 시작하는 이유는 `java.lang.System`이 이 메서드를 `static`으로 선언했기 때문이다. 매개변수 타입 `Object`에는 `int[]`도 `String[]`도 전달할 수 있다. 선언에는 Java 본문이 없는 `native`와 HotSpot이 이 호출을 특별히 컴파일할 수 있다는 표식 `@IntrinsicCandidate`가 붙는다. 리눅스에서 실행해도 이 이름이 곧 시스템 콜을 뜻하지는 않는다. [OpenJDK의 Java 선언](https://github.com/openjdk/jdk25u/blob/fda231468e56663992785ec199a6efb8eca3cc7a/src/java.base/share/classes/java/lang/System.java#L479-L482)

**일반 네이티브 경로.** OpenJDK의 `System.c`는 이름과 시그니처를 VM 함수 `JVM_ArrayCopy`에 연결한다. 이 함수는 null을 확인하고 출발지의 실제 클래스에 `copy_array`를 요청한다. 기본형 배열을 맡은 `TypeArrayKlass`에서는 목적지 기본형과 범위를 확인한다. 참조 배열을 맡은 `ObjArrayKlass`에서는 두 배열의 런타임 타입을 보고 원소별 검사가 필요한지 결정한다. [네이티브 등록](https://github.com/openjdk/jdk25u/blob/fda231468e56663992785ec199a6efb8eca3cc7a/src/java.base/share/native/libjava/System.c#L42-L44) · [JVM 진입점](https://github.com/openjdk/jdk25u/blob/fda231468e56663992785ec199a6efb8eca3cc7a/src/hotspot/share/prims/jvm.cpp#L295-L307) · [기본형 검사](https://github.com/openjdk/jdk25u/blob/fda231468e56663992785ec199a6efb8eca3cc7a/src/hotspot/share/oops/typeArrayKlass.cpp#L108-L150) · [참조형 분기](https://github.com/openjdk/jdk25u/blob/fda231468e56663992785ec199a6efb8eca3cc7a/src/hotspot/share/oops/objArrayKlass.cpp#L186-L216)

**JIT가 컴파일한 경로.** HotSpot의 최적화 컴파일러 C2는 클래스·이름·시그니처로 이 메서드를 알아보고 배열 복사를 나타내는 `ArrayCopyNode`를 만든다. 실험에서는 `int[]` 복사를 감싼 메서드를 반복 호출했다. C2 로그에서 바이트코드 위치 6의 호출이 `(intrinsic)`으로 찍혔다. 그 자리에 생성된 ARM64의 `bl`(함수 호출) 목적지 주소는 같은 JVM이 출력한 `StubRoutines::jint_arraycopy`의 시작 주소와 일치했다. **stub**은 여기서 JVM이 미리 만들어 둔 기계어 복사 루틴이다. 이 intrinsic을 끄자 같은 자리의 로그가 `native method`로 바뀌었다. 최종 배열과 체크섬은 같았다. [HotSpot의 intrinsic 식별자](https://github.com/openjdk/jdk25u/blob/fda231468e56663992785ec199a6efb8eca3cc7a/src/hotspot/share/classfile/vmIntrinsics.hpp#L283-L286) · [C2의 복사 노드 생성](https://github.com/openjdk/jdk25u/blob/fda231468e56663992785ec199a6efb8eca3cc7a/src/hotspot/share/opto/library_call.cpp#L5966-L5982) · [반복 호출 코드](./evidence/IntrinsicProbe.java)

그 루틴은 목적지와 원본의 시작 주소 차이를 복사할 바이트 수와 **부호 없이** 비교한다. 목적지가 원본보다 왼쪽이거나 원본 끝 이후라면 앞에서 읽어도 안전하다. 목적지가 원본 구간 안쪽의 오른편이면 겹침을 처리하는 경로로 간다. 그렇다고 네 칸을 한 칸씩 역순으로 써야만 할까? `int` 네 개는 16바이트다. 이 크기에 해당하는 분기에서 생성된 명령은 다음과 같다. [ARM64의 주소 비교와 분기](https://github.com/openjdk/jdk25u/blob/fda231468e56663992785ec199a6efb8eca3cc7a/src/hotspot/cpu/aarch64/stubGenerator_aarch64.cpp#L1778-L1802) · [8~16바이트 복사 코드 생성부](https://github.com/openjdk/jdk25u/blob/fda231468e56663992785ec199a6efb8eca3cc7a/src/hotspot/cpu/aarch64/stubGenerator_aarch64.cpp#L1330-L1340)

```text
ldr  x3, [x0]        // 원본의 첫 8바이트를 x3에 읽는다
ldur x4, [x17, #-8]  // 원본 끝의 8바이트를 x4에 읽는다
str  x3, [x1]        // 목적지 앞쪽에 쓴다
stur x4, [x16, #-8]  // 목적지 끝쪽에 쓴다
```

**첫 번째 쓰기 전에 네 값이 모두 레지스터에 있다.** 그래서 목적지의 앞쪽부터 써도 원래 값이 살아남는다. 이름표 그림은 손으로 풀 수 있는 해법 하나다. 이 ARM64 코드에서는 레지스터 두 개로 같은 문제를 풀었다. 위 네 줄은 해당 JVM이 생성한 코드를 역어셈블한 발췌다. CPU가 실행한 명령을 한 줄씩 기록한 트레이스와는 구별된다. [실행 옵션·호출 주소·역어셈블 원본](./evidence/intrinsic.txt)

## 42에서 실패하면 첫 칸은 무엇일까?

```java
Object[] src = {"ok", 42, "later"};
String[] dst = {"x", "y", "z"};
System.arraycopy(src, 0, dst, 0, 3);
```

`String[]`에는 문자열과 `null`을 담을 수 있다. 출발지의 실제 배열 타입이 `Object[]`이면 모든 칸이 이 조건을 만족한다고 미리 결론 내릴 수 없다. 첫 칸의 `"ok"`는 들어간다. 둘째 칸의 `Integer` 값 42는 들어갈 수 없어 `ArrayStoreException`이 발생한다. 예외를 잡은 뒤 출력한 목적지는 **`[ok, y, z]`**였다. 실패한 원소 앞까지 복사하고 그 뒤를 그대로 두는 것은 명세의 보장이다. [부분 복사에 관한 원문](https://github.com/openjdk/jdk25u/blob/fda231468e56663992785ec199a6efb8eca3cc7a/src/java.base/share/classes/java/lang/System.java#L447-L464)

![0번의 문자열은 써지고 1번의 정수 42에서 복사가 멈춘다. 예외 직후 목적지에는 ok, y, z가 남는다.](./02-store-check.svg)

이 차이는 컴파일 결과에도 보였다. `String[] → String[]`를 받는 메서드에는 참조를 한꺼번에 복사하는 루틴이, `Object[] → String[]`를 받는 메서드의 재컴파일 결과에는 개별 타입을 확인하는 `checkcast_arraycopy` 경로도 있었다. [두 호출을 비교한 Java 코드](./evidence/ReferencePaths.java) · [C2의 타입 검사 루틴 호출](https://github.com/openjdk/jdk25u/blob/fda231468e56663992785ec199a6efb8eca3cc7a/src/hotspot/share/opto/macroArrayCopy.cpp#L1125-L1155) · [실험 로그](./evidence/intrinsic.txt)

| 입력을 하나만 바꾸면 | 결과와 이유 |
| --- | --- |
| 위 코드에서 `42`를 `null`로 바꾼다 | 세 칸 모두 복사할 수 있다. 출발지 배열의 선언만으로 실패가 결정되지는 않는다. |
| `int[] → long[]`, 길이 0 | `ArrayStoreException`. 기본형 배열끼리는 원소 타입부터 같아야 한다. 자동 숫자 변환은 없다. |
| `Integer[] → String[]`, 유효한 위치에서 길이 0 | 성공한다. 두 참조 배열 사이에서 실제로 검사할 원소가 없다. |
| 복사 구간이 배열 끝을 넘는다 | `IndexOutOfBoundsException`. 이 오류는 쓰기 전에 정해진다. 잘못된 범위 8개에서 목적지가 그대로였다. |

그러면 참조 배열의 한 칸에서 다른 칸으로 무엇이 옮겨졌을까? 테스트에서는 복사 뒤 두 칸이 가리키는 `StringBuilder`가 `==`로 같았다. 목적지 쪽에서 `"B"`를 덧붙이자 원본 쪽에서도 `"AB"`가 보였다. 이렇게 참조를 덮어쓸 때 G1에는 추가 작업이 생긴다. 예를 들어 동시 마킹 중에 이미 채워진 목적지를 덮으면 쓰기 전 장벽이 이전 참조를 기록할 수 있다. 쓰기 후 장벽은 변경한 참조가 들어 있는 메모리 구간(카드)을 추적한다. `int[]` 값에는 GC가 따라갈 참조가 없어 이 장벽을 건너뛴다. [참조 복사에만 장벽을 적용하는 코드](https://github.com/openjdk/jdk25u/blob/fda231468e56663992785ec199a6efb8eca3cc7a/src/hotspot/cpu/aarch64/gc/shared/modRefBarrierSetAssembler_aarch64.cpp#L30-L44) · [G1의 배열 복사 장벽](https://github.com/openjdk/jdk25u/blob/fda231468e56663992785ec199a6efb8eca3cc7a/src/hotspot/cpu/aarch64/gc/g1/g1BarrierSetAssembler_aarch64.cpp#L47-L97)

## 면접에서 “안전한 복사인가요?”라고 묻는다면

같은 배열 안의 겹침을 묻는다면 **그렇다**. 다른 스레드가 배열을 동시에 바꾸지 않는 조건에서 호출 직전의 원소를 보존한 것과 같은 결과를 얻는다. OpenJDK의 `ArrayList.add(index, element)`도 같은 성질을 쓴다. 삽입 위치부터 끝까지 한 칸 오른쪽으로 복사한 후 빈자리에 새 원소를 쓴다. [ArrayList에서 삽입 공간을 여는 네 줄](https://github.com/openjdk/jdk25u/blob/fda231468e56663992785ec199a6efb8eca3cc7a/src/java.base/share/classes/java/util/ArrayList.java#L517-L521)

**예외를 잡고 같은 목적지로 재시도해도 될까?** 어느 검사에서 실패했는지 봐야 한다. 범위를 벗어난 복사는 시작 전에 거절된다. 참조 타입 오류는 성공한 앞부분을 남길 수 있다.

**다른 스레드도 완성본만 볼까?** `arraycopy` 호출 자체에는 스레드 사이의 동기화 보장이 없다. 한 독자가 이전 버전 또는 완성된 새 버전만 봐야 한다면, 예를 들어 안정된 원본에서 별도 배열을 다 채운 뒤 그 참조를 `volatile` 필드에 게시한다. 독자는 그 필드를 한 번 읽어 같은 배열을 쓴다. 게시한 배열은 더 수정하지 않는다. [Java 메모리 모델의 happens-before 규칙](https://docs.oracle.com/javase/specs/jls/se25/html/jls-17.html#jls-17.4.5)

**직접 쓴 루프보다 얼마나 빠를까?** 이번 실험에서 확인한 것은 호출 경로와 값의 정확성이다. 속도를 비교하려면 두 코드가 먼저 같은 겹침 규칙을 지켜야 한다. 그 뒤에 원소 타입, 길이, 겹침 방향, 워밍업을 맞춰 시간을 재야 한다. 새 배열을 만드는 비용까지 알고 싶으면 `Arrays.copyOf`를 따로 비교할 수 있다. [OpenJDK의 int 배열 copyOf](https://github.com/openjdk/jdk25u/blob/fda231468e56663992785ec199a6efb8eca3cc7a/src/java.base/share/classes/java/util/Arrays.java#L3587-L3595)

참조를 덮어쓴 뒤 G1은 언제 카드를 읽을까? 그때 애플리케이션은 얼마나 멈출까? [다음 편에서 G1의 실제 로그를 시간순으로 읽는다.](/backend/transfer-performance/gc-timeline/)
