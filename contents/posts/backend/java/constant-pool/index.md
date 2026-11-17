---
title: "자바 상수 풀에는 무엇이 들어갈까?"
description: "println으로 Hello를 출력하고, 따옴표 안의 글자만 Bye로 바꿨다. 두 클래스 파일에서 무엇이 달라졌을까?"
date: 2026-11-17
update: 2026-11-17
tags:
  - Java
  - JVM
  - 바이트코드
---

3장에서 `println`을 호출하기 직전 스택에 있던 값은 두 개였다. 하나는 출력 객체의 참조, 다른 하나는 출력할 문자열의 참조였다. 이번에는 그 값이 올라오기 전, 컴파일한 파일부터 봤다.

```java
public class HelloWorld {
    public static void main(String[] args) {
        System.out.println("Hello");
    }
}
```

## HelloWorld.class에 적힌 7번

Microsoft OpenJDK 21에서 `HelloWorld.java`를 컴파일했다.

```sh
javac HelloWorld.java
javap -v HelloWorld
```

`javac`가 만든 파일에서 `javap`로 읽은 `main`의 바이트코드다.

```text
0: getstatic     #7
3: ldc           #13
5: invokevirtual #15
8: return
```

소스에는 `System.out`이라고 썼는데 첫 명령에는 `getstatic #7`만 있다. `getstatic`은 정적 필드의 값을 읽으라는 뜻이고, 어느 필드를 읽을지는 7번에 적혀 있다.

이 번호는 `HelloWorld.class`의 **상수 풀** 안에서 쓴다. `javac`는 문자열 같은 값과 코드에서 사용하는 필드나 메서드를 식별할 정보를 이곳에 기록한다. 같은 필드를 여러 번 읽어도 각 명령에 이름과 타입을 다시 적을 필요가 없다. 이 파일에서는 `#7`이면 된다.

| main에 쓴 명령 | 이 파일의 상수 풀에서 찾을 수 있는 것 |
| --- | --- |
| `getstatic #7` | `System.out` 필드의 클래스 이름, 필드 이름, 선언 타입 |
| `ldc #13` | 문자열 리터럴. 13번의 `String #14`에서 14번 `Utf8 Hello`로 이어진다 |
| `invokevirtual #15` | `PrintStream.println`이라는 메서드 이름과 `String` 하나를 받고 `void`를 반환하는 타입 정보 |

7번이나 15번처럼 이름과 타입으로 대상을 지정한 항목을 **심볼 참조**라고 한다. 13번에 적힌 `#14`도 같은 상수 풀의 번호다. 클래스 파일 형식에서 `String` 항목은 글자를 보관한 `Utf8` 항목의 번호(`string_index`)를 담는다. `Utf8`은 메서드 이름을 적을 때도 쓰인다. 13번의 `String` 표시가 있어야 이 글자를 **문자열 리터럴로** 쓴다는 걸 알 수 있다.

<details>
<summary>7번에서 System.out을 찾는 과정</summary>

```text
 #7 = Fieldref       #8.#9
 #8 = Class          #10
 #9 = NameAndType    #11:#12
#10 = Utf8           java/lang/System
#11 = Utf8           out
#12 = Utf8           Ljava/io/PrintStream;
```

8번에서 10번으로 가면 `java/lang/System`이 나온다. 9번은 두 갈래다. 11번이 필드 이름 `out`, 12번이 필드 타입 `Ljava/io/PrintStream;`이다. `javap`가 명령 옆에 붙여 주는 주석 `Field java/lang/System.out:Ljava/io/PrintStream;`은 바로 이 항목들을 풀어 쓴 것이다.

</details>

## 7번을 읽고 실제 System.out 필드를 찾는 곳

`java HelloWorld`를 실행하면 JVM은 애플리케이션 클래스 로더를 통해 `HelloWorld`를 로드한다. 이때 파일의 상수 풀을 바탕으로 **HelloWorld의 런타임 상수 풀**을 만든다. `main`이 호출되면 메인 스레드에 프레임이 생기고, 처음에는 피연산자 스택이 비어 있다. 첫 명령은 `getstatic #7`이다.

OpenJDK 21 HotSpot의 인터프리터에서 7번 필드 참조가 아직 해석되지 않았다면, 메인 스레드는 `InterpreterRuntime::resolve_get_put`을 호출한다. 이 함수는 지금 실행하는 메서드가 `HelloWorld.main`이므로 **HelloWorld의 상수 풀**을 가져와 필드 조회를 `LinkResolver`에 맡긴다. 여기서 디스크의 클래스 파일을 다시 열지는 않는다.

7번에 적힌 클래스는 `java/lang/System`이다. HotSpot은 `java/lang/System`에 해당하는 클래스가 이미 이 참조에 연결돼 있으면 그 결과를 쓴다. 아직이면 `HelloWorld`를 정의한 로더를 기준으로 이름을 해석한다. 일반적인 JDK 실행에서 애플리케이션 로더가 부모에게 위임하면 `java.lang.System`은 부트스트랩 로더가 정의한 클래스로 연결된다. 이미 로드된 `System`을 이때 새로 만들 필요는 없다.

`LinkResolver`가 그 클래스에서 `out`을 찾는 코드는 다음과 같다.

```cpp
Klass* sel_klass = resolved_klass->find_field(field, sig, &fd);
```

이 예제에서 `resolved_klass`는 방금 찾은 `System`, `field`는 `out`, `sig`는 `Ljava/io/PrintStream;`이다. `find_field`는 클래스에 선언된 필드 정보에서 이름과 타입이 일치하는 필드를 찾아 결과를 `fd`에 채운다. 이어서 `LinkResolver`는 `HelloWorld`에서 이 필드에 접근할 수 있는지, `getstatic`에 맞는 정적 필드인지 검사한다. 이 과정이 끝나면 HotSpot은 필드를 선언한 클래스와 필드의 **오프셋**(기준 위치에서 몇 바이트 떨어져 있는지)을 캐시에 기록할 수 있다. 파일 속 심볼 참조를 실제 필드에 연결하는 이 작업을 **해석(resolution)**이라고 한다. JVM은 참조를 미리 해석할 수도 있다.

## 스택에 올라가는 값

OpenJDK 21의 AArch64 인터프리터에서 `getstatic`은 캐시에 기록된 선언 클래스로부터 `System.class` 객체를 얻는다. HotSpot이 `System`의 정적 필드 값을 보관하는 곳이다. 인터프리터는 이 객체의 시작 위치에 `out`의 오프셋을 더한 자리에서 **현재 들어 있는 참조값**을 읽어 `main`의 피연산자 스택에 올린다. 이제 스택에는 출력 객체의 참조가 하나 있다. 다음번에도 필드 위치는 재사용할 수 있지만 값은 그때 다시 읽는다.

두 번째 명령 `ldc #13`은 문자열 리터럴 `"Hello"`에 해당하는 `String` 객체의 참조를 그 위에 올린다. 파일의 14번에서 본 것은 문자 데이터였다. JVM은 같은 내용으로 인턴된 객체가 있으면 그 참조를 쓰고, 없으면 객체를 만들어 등록한다. 이 참조는 첫 `ldc` 전에 이미 준비돼 있을 수도 있다.

세 번째 명령 `invokevirtual #15`까지 오면 스택에 값이 둘이다. 위에 있는 문자열을 인수로, 아래의 출력 객체를 호출 대상으로 삼아 `println(String)`을 호출한다. 표준 출력이 터미널에 연결된 이 예제에서는 여기서 `Hello` 한 줄이 찍힌다. 마지막 `return`에서 `main`이 끝난다.

## Hello를 Bye로 바꾸면 13번도 바뀔까?

`println("Hello")`에서 따옴표 안의 글자만 `Bye`로 고치고 다시 컴파일했다. 출력할 글자가 바뀌었는데도 `main`에는 여전히 `ldc #13`이 적혀 있었다.

| | 수정 전 | 수정 후 |
| --- | --- | --- |
| `main`의 명령 | `ldc #13` | `ldc #13` |
| 상수 풀 13번 | `String #14` | `String #14` |
| 상수 풀 14번 | `Utf8 Hello` | `Utf8 Bye` |
| `java HelloWorld` 출력 | `Hello` | `Bye` |

## 다른 클래스도 같은 Hello를 쓴다면

이번에는 한 JVM에서 클래스 A가 `"Hello"`를 출력한 뒤 B도 `"Hello"`를 출력하는 경우다. A의 문자열은 이미 인턴돼 있고 B의 참조 배열은 비어 있다고 하자.

![클래스 A와 B의 resolved_references는 따로 있다. StringTable에서 얻은 두 참조는 힙의 같은 Hello 객체를 가리킨다.](./ldc-string.svg)

HotSpot은 B의 런타임 상수 풀에 딸린 참조 배열(`resolved_references`)부터 확인한다. 여기에 참조가 없으면 JVM에서 공유하는 인턴 문자열 표(`StringTable`)에서 내용이 `Hello`인 객체를 찾는다. A가 쓴 객체가 이미 등록돼 있으니 B는 그 참조를 **자기 배열**에 저장한다. A가 처음 찾았을 때도 등록된 객체가 없었다면, 그때 JVM이 문자열 객체를 만들어 인턴한다.

B에서 같은 `ldc`를 다시 실행할 때는 B의 배열에 참조가 들어 있다. 그 참조를 이번 호출의 피연산자 스택에 올리면 된다. 앞 예제의 `#13`은 클래스 파일 안의 번호이고, HotSpot은 여기에 대응하는 내부 인덱스로 배열을 읽는다. 다른 클래스에서 같은 리터럴을 몇 번에 기록했는지는 상관없다.

## 참고

- [OpenJDK 21, 인터프리터의 필드 해석 요청과 캐시 기록](https://github.com/openjdk/jdk/blob/jdk-21-ga/src/hotspot/share/interpreter/interpreterRuntime.cpp#L657-L727)
- [OpenJDK 21, 상수 풀의 클래스 이름 해석](https://github.com/openjdk/jdk/blob/jdk-21-ga/src/hotspot/share/oops/constantPool.cpp#L490-L535)
- [OpenJDK 21, 필드의 이름과 타입 조회 및 접근 검사](https://github.com/openjdk/jdk/blob/jdk-21-ga/src/hotspot/share/interpreter/linkResolver.cpp#L952-L1000)
- [OpenJDK 21, AArch64 인터프리터의 정적 필드 기준 위치](https://github.com/openjdk/jdk/blob/jdk-21-ga/src/hotspot/cpu/aarch64/templateTable_aarch64.cpp#L2283-L2307)
- [OpenJDK 21, AArch64 인터프리터의 필드값 읽기](https://github.com/openjdk/jdk/blob/jdk-21-ga/src/hotspot/cpu/aarch64/templateTable_aarch64.cpp#L2489-L2535)
- [OpenJDK 21 HotSpot, StringTable 구현](https://github.com/openjdk/jdk/blob/jdk-21-ga/src/hotspot/share/classfile/stringTable.cpp)
- [OpenJDK 21 HotSpot, 문자열 상수의 참조를 읽고 저장하는 코드](https://github.com/openjdk/jdk/blob/jdk-21-ga/src/hotspot/share/oops/constantPool.cpp#L1246-L1255)
- [JVM 명세, 문자열 상수의 클래스 파일 형식](https://docs.oracle.com/javase/specs/jvms/se21/html/jvms-4.html#jvms-4.4.3)
- [JVM 명세, ldc 명령](https://docs.oracle.com/javase/specs/jvms/se21/html/jvms-6.html#jvms-6.5.ldc)
- [3장. 자바 가상 머신 개요](https://hyungkishin.github.io/books/optimizing-java/chapter-03-jvm/)
- [JVM 명세, 클래스 파일의 상수 풀](https://docs.oracle.com/javase/specs/jvms/se21/html/jvms-4.html#jvms-4.4)
- [JVM 명세, 런타임 상수 풀](https://docs.oracle.com/javase/specs/jvms/se21/html/jvms-5.html#jvms-5.1)
- [JVM 명세, 심볼 참조 해석](https://docs.oracle.com/javase/specs/jvms/se21/html/jvms-5.html#jvms-5.4.3)
- [JVM 명세, getstatic 명령](https://docs.oracle.com/javase/specs/jvms/se21/html/jvms-6.html#jvms-6.5.getstatic)
