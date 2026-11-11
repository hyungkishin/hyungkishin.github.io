---
title: "같은 자바 코드가 실행 중에 달라지는 이유"
description: "같은 수수료 호출에 정률과 정액 정책을 넣었다. 바이트코드의 호출 위치와 HotSpot 로그를 맞춰 인라인된 메서드를 확인한다."
date: 2026-11-04
update: 2026-11-11
tags:
  - JVM
  - Java
  - JIT
  - 바이트코드
---

송금 수수료를 계산하는 코드를 한 번 컴파일한 뒤 JVM을 두 개 띄웠다. 한쪽에는 송금액의 1%를 받는 정책을, 다른 쪽에는 건당 100원을 받는 정책을 넣었다. 두 JVM이 읽은 클래스 파일에는 똑같이 `policy.fee(amountWon)`을 호출하는 바이트코드가 있다.

여러 번 실행한 뒤의 로그에는 한쪽에 `RateFee`, 다른 쪽에 `FlatFee`가 찍혔다. HotSpot의 JIT 컴파일러가 자주 호출된 수수료 계산을 호출자 코드 안에 넣은 것이다. 이 결정을 인라이닝이라고 한다. 바이트코드와 로그에 공통으로 찍힌 숫자 하나로 어느 호출에서 일어났는지 찾아갈 수 있다.

## 반복문에서 바이트코드의 주소 읽기

`Hello World`를 열 번 출력하는 반복문부터 보자. `javac -g HelloLoop.java`로 컴파일하고 `javap -c -l HelloLoop`로 클래스 파일을 열면, 소스의 한 줄이 여러 명령으로 나뉜다. [예제 소스](./evidence/HelloLoop.java) · [전체 바이트코드](./evidence/javap.txt) · [실행 출력](./evidence/stdout.txt)

```java
for (int i = 0; i < 10; i++) {
    System.out.println("Hello World");
}
```

```text
 0: iconst_0
 1: istore_1
 2: iload_1
 3: bipush        10
 5: if_icmpge     22
 8: getstatic     #7     // System.out
11: ldc           #13    // String Hello World
13: invokevirtual #15    // PrintStream.println
16: iinc          1, 1
19: goto          2
22: return
```

왼쪽의 `2`, `3`, `5`는 메서드 첫 바이트부터 센 거리다. 명령마다 길이가 달라 숫자가 하나씩 늘지는 않는다. 오른쪽의 `goto 2`는 오프셋 2의 명령으로 돌아가라는 뜻이다. 반면 `iload_1`의 `1`은 지역변수 번호다. 이 메서드에서 슬롯 0에는 `main`의 인자 `args`가, 슬롯 1에는 `i`가 들어 있다.

첫 반복에서 `iload_1`은 슬롯 1의 값 `0`을 피연산자 스택에 복사한다. `bipush 10`이 그 위에 비교값 `10`을 얹는다. `if_icmpge`는 두 값을 꺼낸다. 아직 `0 >= 10`이 거짓이므로 출력으로 이어진다. 출력이 끝난 뒤 `iinc 1, 1`은 슬롯 1에 바로 1을 더한다. 다음 바퀴의 비교는 `1`에서 시작한다. [JVM의 명령 정의](https://docs.oracle.com/javase/specs/jvms/se25/html/jvms-6.html#jvms-6.5.iinc)

![첫 반복에서 비교 명령은 스택의 0과 10을 꺼내고, 출력 뒤 iinc는 지역변수 i를 1로 바꾼다.](./01-stack-machine.svg)

피연산자 스택은 메서드 하나의 계산 공간이다. `println`을 호출할 때 이 스택에서 꺼내는 값은 출력 대상인 `PrintStream` 참조와 문자열 참조다. 메서드가 호출될 때마다 생기는 프레임을 쌓는 **호출 스택**과는 용도가 다르다. 이 구분은 수수료 예제에서도 드러난다. 바이트코드에 호출 명령이 있어도 JIT가 만든 기계어에 별도의 호출과 프레임이 그대로 남는다는 보장은 없다. [JVM 명세의 프레임](https://docs.oracle.com/javase/specs/jvms/se25/html/jvms-2.html#jvms-2.6)

## 수수료 계산의 호출 위치

예제의 `quote`는 송금액을 받아 수수료를 돌려준다. 금액은 원 단위 정수다. 인자로 받은 객체가 정률 정책이면 금액을 100으로 나눠 원 미만을 버린다. 정액 정책이면 100원을 반환한다. `quote`의 소스에는 어느 정책을 쓸지 고르는 분기가 없다. [실행 가능한 FeeDemo.java](./evidence/FeeDemo.java)

```java
static int quote(FeePolicy policy, int amountWon) {
    return policy.fee(amountWon);
}
```

`javap -c FeeDemo`로 읽은 `quote`에는 명령이 네 개 있다. 앞의 두 명령은 정책 객체와 금액을 스택에 올린다. 오프셋 **2**에서 인터페이스 메서드 `fee`를 호출한다. 오프셋 7에서 계산된 정수를 반환한다. 아래 주석은 읽기 쉽게 줄였다. [javap 출력](./evidence/fee-javap.txt)

```text
0: aload_0
1: iload_1
2: invokeinterface #7,  2    // FeePolicy.fee(int)
7: ireturn
```

이제 찾을 곳은 하나다. HotSpot이 실행 중에 `quote`를 기계어로 컴파일할 때, **오프셋 2의 호출**을 어떻게 처리했는지 보면 된다.

## 두 JVM의 로그에서 같은 호출 찾기

아래 명령은 Temurin OpenJDK 25.0.4.1에서 실행했다. 소스는 한 번만 컴파일한다. 두 프로세스 모두 두 정책 객체를 만들어 두지만 각 프로세스가 `quote`에 넘기는 정책은 한 종류다. 송금액을 1원부터 100만 원까지 1원씩 늘리며 호출한다. 마지막 줄의 합계는 정률 실행에서 4,999,510,000원, 정액 실행에서 100,000,000원이었다. [JDK 버전](./evidence/java-version.txt)

```bash
javac -g FeeDemo.java
java -Xbatch -XX:+UnlockDiagnosticVMOptions \
  -XX:+PrintCompilation -XX:+PrintInlining FeeDemo > rate.log
java -Xbatch -XX:+UnlockDiagnosticVMOptions -DflatFee=true \
  -XX:+PrintCompilation -XX:+PrintInlining FeeDemo > flat.log
```

`PrintCompilation`은 어떤 메서드를 컴파일했는지, `PrintInlining`은 그 안의 호출을 어떻게 처리했는지 기록한다. `-Xbatch`는 컴파일을 포그라운드에서 실행하도록 한 옵션이다. 여기서 보는 것은 컴파일 결정이다. 이 옵션을 켠 실행 시간으로 운영 지연을 추정할 수는 없다. [Java 25 진단 옵션](https://docs.oracle.com/en/java/javase/25/docs/specs/man/java.html#advanced-jit-compiler-options-for-java)

각 로그에서 `FeeDemo::quote`를 찾으면 그 아래에 `@ 2`로 시작하는 줄이 나온다. **이 숫자 2가 앞에서 본 바이트코드의 주소다.** 아래는 정률 실행에서 컴파일 레벨과 호출 위치만 남긴 발췌다. 왼쪽 숫자는 `quote`의 컴파일 레벨이고, 들여쓴 줄은 그때의 인라이닝 결정이다. [정률 실행 로그 발췌](./evidence/fee-jit-rate.txt)

```text
3  FeeDemo::quote
     @ 2  FeeDemo$FeePolicy::fee   failed to inline: no static binding
4  FeeDemo::quote
     @ 2  FeeDemo$RateFee::fee     inline (hot)
```

HotSpot은 같은 메서드를 여러 단계에 걸쳐 컴파일할 수 있다. 첫 줄은 레벨 3에서 `quote`를 컴파일한 기록이다. 이때 컴파일러는 호출 대상을 하나로 정하지 못해 인터페이스 호출을 인라인하지 않았다. 프로그램은 그대로 수수료를 계산했다. 뒤의 레벨 4 컴파일에서는 구체적인 이름 `RateFee::fee`가 나타났다. `inline (hot)`은 그 실행에서 자주 호출된 정률 계산을 `quote` 안에 포함했다는 기록이다.

![두 JVM 모두 바이트코드 오프셋 2에서 수수료를 호출한다. 같은 위치의 JIT 로그에는 각 실행에서 사용한 수수료 정책이 나타난다.](./02-jit-lifecycle.svg)

정액 정책만 전달한 두 번째 JVM에서도 호출 위치는 `@ 2`였다. 이번에 인라인된 메서드는 `FlatFee::fee`다. 두 실행의 클래스 파일에는 같은 인터페이스 호출이 남아 있다. 서로 다른 것은 HotSpot이 메모리에 만든 코드에 포함한 수수료 계산이다. 이 로그로 인라이닝 여부는 알 수 있지만 절약한 시간은 알 수 없다. [정액 실행 로그 발췌](./evidence/fee-jit-flat.txt)

## 송금 시간을 비교할 때의 워밍업

가령 송금 서비스가 배포 직후 정액 정책으로만 송금 요청을 미리 보내 워밍업했다고 하자. 곧이어 정률 정책을 쓰는 요청이 몰린다면, 준비 구간에서 JVM이 본 호출 대상과 실제 트래픽의 호출 대상이 달라진다. 위 실험은 정책별로 JVM을 새로 띄웠다. 한 JVM에서 중간에 정책을 바꿨을 때 기존 코드가 언제 무효화되거나 다시 컴파일되는지까지 보여 주지는 않는다.

[앞 글](/backend/transfer-performance/01-measurement/)에서 정한 측정 구간에 이 차이를 반영할 수 있다. 배포 직후 첫 송금이 느린 문제라면 첫 요청을 측정에 남긴다. 충분히 실행한 서비스의 수수료 계산 비용을 비교한다면 각 버전을 별도 JVM에서 시작한 뒤 측정할 때와 비슷한 정책 비율로 워밍업한다. 벤치마크 도구 JMH에서 fork는 JVM을 새로 띄우는 설정이다. warmup 횟수는 그 JVM에서 측정 전에 몇 차례 연습할지를 정한다. [OpenJDK JMH의 fork 예제](https://github.com/openjdk/jmh/blob/master/jmh-samples/src/main/java/org/openjdk/jmh/samples/JMHSample_12_Forking.java)

수수료 호출이 인라인됐다는 로그가 있어도 송금 한 건이 언제 끝났는지는 여전히 모른다. 그 시간에는 잔액을 기록하고 송금을 확정하기까지의 대기도 들어간다. [다음 글에서는 송금 성공을 언제 약속할 수 있는지 살펴본다.](/backend/transfer-performance/03-transfer-contract/)
