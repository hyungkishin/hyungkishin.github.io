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

자바에서 글자 한 줄을 출력할 때 쓰는 코드다.

```java
public class HelloWorld {
    public static void main(String[] args) {
        System.out.println("Hello");
    }
}
```

따옴표 안의 `Hello`를 `Bye`로 바꾸면 출력도 바뀐다. 그럼 컴파일한 파일에서는 어디가 바뀔까?

**상수 풀은 클래스 파일 안에 있는 표다.** 이 예제에서 `javac`는 출력할 문자열과 호출할 메서드 정보를 표에 적는다. `main`의 바이트코드에는 표의 몇 번 항목을 쓸지 적는다. 같은 문자열을 여러 줄에서 써도 각 명령이 그 항목을 가리킬 수 있다.

## Hello는 파일 어디에 적혀 있을까

위 코드를 `HelloWorld.java`에 저장했다. Microsoft OpenJDK 21에서 다음 두 명령을 실행했다.

```sh
javac HelloWorld.java
javap -v HelloWorld
```

첫 명령이 `HelloWorld.class`를 만든다. 두 번째 명령은 그 파일에 적힌 내용을 보여 준다. `main`에서 문자열을 가져오는 줄과 상수 풀에서 그 줄이 가리키는 항목만 골라 봤다.

```text
3: ldc #13

#13 = String  #14
#14 = Utf8    Hello
```

왜 13번에서 또 14번으로 갈까? 클래스 파일 형식에서 `String` 항목은 **이 문자열 리터럴의 글자가 몇 번에 있는지** 기록한다. 그 번호를 담는 필드가 `string_index`이고, 이 파일에서는 값이 14다. 글자 자체는 14번 `Utf8` 항목에 기록한다. `Utf8`은 메서드 이름 같은 텍스트에도 쓰인다. 13번의 `String`이라는 표시가 있어야 JVM은 이 글자를 자바 문자열 상수로 사용할 수 있다.

![클래스 파일에서는 13번 String 항목이 14번 Utf8의 Hello를 가리킨다. 실행 직후에는 출력 객체의 참조 위에 문자열 객체의 참조가 올라간다.](./ldc-string.svg)

그림 위쪽은 `javap`로 본 **파일의 기록**이다. 아래쪽은 `java HelloWorld`를 실행해 **방금 ldc를 마친 순간**이다. JVM은 런타임 상수 풀의 13번에 해당하는 `String` 객체의 참조를 스택에 올린다. 같은 내용의 문자열이 이미 인턴되어 있으면 그 객체를 사용한다. 숫자 14와 글자 다섯 개는 이때 스택에 복사되지 않는다.

## println도 상수 풀을 쓴다

출력할 글자를 알았으니, 이제 어디에 어떻게 출력하는지 보자. `main`의 명령을 앞뒤로 한 줄씩 더 읽으면 이렇게 된다.

```text
0: getstatic     #7    // System.out
3: ldc           #13   // "Hello"
5: invokevirtual #15   // PrintStream.println(String)
```

오른쪽 주석은 읽기 쉽게 줄였다. 7번에는 어느 필드를 읽을지, 15번에는 어느 메서드를 호출할지 적혀 있다. 컴파일할 때 `javac`는 인수가 문자열인 걸 보고 `println(String)`을 고른다. 나중에 JVM이 그 메서드를 찾을 수 있도록 클래스 이름과 메서드 이름, 인수와 반환 타입을 기록한다. 이런 정보를 **심볼 참조**라고 한다.

<details>
<summary>7번에서 System.out을 찾는 과정</summary>

첫 줄만 보면 `getstatic #7`이다. 상수 풀 7번을 열면 바로 `out`이라는 글자가 보일까? `javap -v` 출력에서 7번부터 잘라 왔다.

```text
 #7 = Fieldref       #8.#9
 #8 = Class          #10
 #9 = NameAndType    #11:#12
#10 = Utf8           java/lang/System
#11 = Utf8           out
#12 = Utf8           Ljava/io/PrintStream;
```

7번에는 `Fieldref #8.#9`라고 적혀 있다. 8번에서 10번으로 가면 `java/lang/System`이 나온다. 9번은 두 갈래다. 11번이 필드 이름 `out`, 12번이 필드 타입 `Ljava/io/PrintStream;`이다. `javap`가 명령 옆에 붙여 주는 주석 `Field java/lang/System.out:Ljava/io/PrintStream;`은 바로 이 항목들을 풀어 쓴 것이다. 여기서 확인한 건 필드의 이름과 타입이다.

</details>

## JVM은 실행할 때 그 번호를 어떻게 쓸까

`java HelloWorld`를 실행하면 JVM은 `HelloWorld` 클래스를 만들면서 파일의 상수 풀을 바탕으로 이 클래스의 **런타임 상수 풀**을 구성한다. JVM은 7번에 적힌 클래스 이름과 필드 이름, 타입으로 실제 `System.out` 필드를 찾는다. 심볼 참조가 어느 필드나 메서드를 뜻하는지 이렇게 결정하는 과정을 명세에서는 *해석(resolution)*이라고 한다. 구현에 따라 미리 해석할 수도 있고 처음 필요할 때 해석할 수도 있다.

`System.out`에 들어 있는 값을 읽는 건 `main`의 첫 명령을 실행할 때다.

1. `getstatic #7`을 실행하면 JVM은 7번으로 식별한 `System.out` 필드의 **현재 값**을 읽는다. 그 값은 출력 객체의 참조다. 이 참조가 `main`의 피연산자 스택에 올라간다.
2. `ldc #13`은 문자열 리터럴에 해당하는 `String` 객체의 참조를 그 위에 올린다. 스택에는 이제 출력 객체와 출력할 문자열이 차례로 있다.
3. `invokevirtual #15`는 출력 객체를 수신자로 삼고 문자열을 인수로 넘겨 `println`을 호출한다. 터미널에서 보는 글자는 이 호출의 결과다.

## Hello를 Bye로 바꿔 봤다

`java HelloWorld`를 실행하면 터미널에 `Hello`가 한 줄 찍힌다. 같은 파일에서 `println("Hello")`를 `println("Bye")`로 고치고 다시 컴파일했다. 이번에도 `javap -v HelloWorld`로 같은 자리를 열어 봤다.

| 확인한 곳 | 처음 컴파일했을 때 | 글자를 바꿔 다시 컴파일했을 때 |
| --- | --- | --- |
| 문자열을 읽는 명령 | `ldc #13` | `ldc #13` |
| 상수 풀 14번 | `Utf8 Hello` | `Utf8 Bye` |
| `java HelloWorld` 출력 | `Hello` | `Bye` |

이 두 파일에서는 명령도 번호도 같았다. 바뀐 건 13번을 따라갔을 때 나오는 글자다. 그래서 똑같이 `ldc #13`을 실행해도 이번에는 `println`에 `Bye`가 넘어간다.

## 참고

- [JVM 명세, 문자열 상수의 클래스 파일 형식](https://docs.oracle.com/javase/specs/jvms/se21/html/jvms-4.html#jvms-4.4.3)
- [JVM 명세, ldc 명령](https://docs.oracle.com/javase/specs/jvms/se21/html/jvms-6.html#jvms-6.5.ldc)
- [3장. 자바 가상 머신 개요](https://hyungkishin.github.io/books/optimizing-java/chapter-03-jvm/)
- [JVM 명세, 클래스 파일의 상수 풀](https://docs.oracle.com/javase/specs/jvms/se21/html/jvms-4.html#jvms-4.4)
- [JVM 명세, 런타임 상수 풀](https://docs.oracle.com/javase/specs/jvms/se21/html/jvms-5.html#jvms-5.1)
- [JVM 명세, 심볼 참조 해석](https://docs.oracle.com/javase/specs/jvms/se21/html/jvms-5.html#jvms-5.4.3)
- [JVM 명세, getstatic 명령](https://docs.oracle.com/javase/specs/jvms/se21/html/jvms-6.html#jvms-6.5.getstatic)
