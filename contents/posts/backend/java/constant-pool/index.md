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

터미널에 `Hello` 한 줄을 찍는 프로그램이다. 컴파일하면 이 다섯 글자는 클래스 파일 어디에 들어갈까?

```java
public class HelloWorld {
    public static void main(String[] args) {
        System.out.println("Hello");
    }
}
```

Microsoft OpenJDK 21.0.12.1에서 컴파일하고 실행했다.

```sh
javac HelloWorld.java
java HelloWorld
```

```text
Hello
```

## Hello는 어디에 적혀 있을까

```sh
javap -v HelloWorld
```

`javac`가 만든 `HelloWorld.class`를 `javap`로 읽었다. 방금 실행한 `main`에는 명령이 네 개 있다.

```text
         0: getstatic     #7                  // Field java/lang/System.out:Ljava/io/PrintStream;
         3: ldc           #13                 // String Hello
         5: invokevirtual #15                 // Method java/io/PrintStream.println:(Ljava/lang/String;)V
         8: return
```

둘째 줄의 `ldc`는 상수 하나를 스택에 올리는 명령이다. 오른쪽의 `// String Hello`는 `javap`가 붙인 주석이다. 실제 명령에는 `ldc #13`이라고 적혀 있다. 무엇을 올려야 하는지는 같은 파일의 `Constant pool:` 아래에서 찾을 수 있다.

```text
  #13 = String             #14            // Hello
  #14 = Utf8               Hello
```

13번에 적힌 `String #14`는 “문자열이고, 글자는 14번에 있다”는 뜻이다. 14번을 읽으면 `Hello`가 나온다. `javap`도 이 두 항목을 읽었기 때문에 명령 옆에 `// String Hello`를 붙일 수 있다.

**상수 풀은 클래스 파일 안에서 여러 명령이 함께 쓸 값과 이름을 번호로 찾아볼 수 있게 모아 둔 곳이다.** 이 파일에서는 13번이 문자열을, 7번이 읽을 필드를, 15번이 호출할 메서드를 가리킨다. 번호는 `javac`가 그 클래스 파일을 만들 때 붙인다.

그런데 문자열을 한 번 출력하려고 굳이 번호를 써야 할까? `main`에 `System.out.println("Hello");`를 한 줄 더 넣고 컴파일하면 차이가 보인다.

```text
 3: ldc           #13                 // String Hello
11: ldc           #13                 // String Hello
```

왼쪽의 3과 11은 두 명령이 놓인 위치다. **명령은 두 곳에 있는데 둘 다 같은 13번을 쓴다.** 글자는 14번에 한 번만 적혀 있다. 두 줄의 문자열을 모두 `Hello from the JVM`으로 바꿨을 때도 두 명령의 크기는 각각 2바이트 그대로였다. 글자가 길어진 만큼 커진 곳은 상수 풀이다.

<details>
<summary>javap -v HelloWorld 전체 출력</summary>

```text
Classfile /private/tmp/hello-javap.L2daqd/HelloWorld.class
  Last modified 2026. 11. 17.; size 419 bytes
  SHA-256 checksum 61cd1f5e83d26931f6265f50a34404160f6ab8e9fb820b8bce9ac6f558f05938
  Compiled from "HelloWorld.java"
public class HelloWorld
  minor version: 0
  major version: 65
  flags: (0x0021) ACC_PUBLIC, ACC_SUPER
  this_class: #21                         // HelloWorld
  super_class: #2                         // java/lang/Object
  interfaces: 0, fields: 0, methods: 2, attributes: 1
Constant pool:
   #1 = Methodref          #2.#3          // java/lang/Object."<init>":()V
   #2 = Class              #4             // java/lang/Object
   #3 = NameAndType        #5:#6          // "<init>":()V
   #4 = Utf8               java/lang/Object
   #5 = Utf8               <init>
   #6 = Utf8               ()V
   #7 = Fieldref           #8.#9          // java/lang/System.out:Ljava/io/PrintStream;
   #8 = Class              #10            // java/lang/System
   #9 = NameAndType        #11:#12        // out:Ljava/io/PrintStream;
  #10 = Utf8               java/lang/System
  #11 = Utf8               out
  #12 = Utf8               Ljava/io/PrintStream;
  #13 = String             #14            // Hello
  #14 = Utf8               Hello
  #15 = Methodref          #16.#17        // java/io/PrintStream.println:(Ljava/lang/String;)V
  #16 = Class              #18            // java/io/PrintStream
  #17 = NameAndType        #19:#20        // println:(Ljava/lang/String;)V
  #18 = Utf8               java/io/PrintStream
  #19 = Utf8               println
  #20 = Utf8               (Ljava/lang/String;)V
  #21 = Class              #22            // HelloWorld
  #22 = Utf8               HelloWorld
  #23 = Utf8               Code
  #24 = Utf8               LineNumberTable
  #25 = Utf8               main
  #26 = Utf8               ([Ljava/lang/String;)V
  #27 = Utf8               SourceFile
  #28 = Utf8               HelloWorld.java
{
  public HelloWorld();
    descriptor: ()V
    flags: (0x0001) ACC_PUBLIC
    Code:
      stack=1, locals=1, args_size=1
         0: aload_0
         1: invokespecial #1                  // Method java/lang/Object."<init>":()V
         4: return
      LineNumberTable:
        line 1: 0

  public static void main(java.lang.String[]);
    descriptor: ([Ljava/lang/String;)V
    flags: (0x0009) ACC_PUBLIC, ACC_STATIC
    Code:
      stack=2, locals=1, args_size=1
         0: getstatic     #7                  // Field java/lang/System.out:Ljava/io/PrintStream;
         3: ldc           #13                 // String Hello
         5: invokevirtual #15                 // Method java/io/PrintStream.println:(Ljava/lang/String;)V
         8: return
      LineNumberTable:
        line 3: 0
        line 4: 8
}
SourceFile: "HelloWorld.java"
```

</details>

## 두 번째 줄에서 out만 err로 바꾸면

두 줄에서 같이 쓴 건 `Hello`만이 아니다. 둘 다 `System.out`을 읽고, 둘 다 `println`을 호출했다. 두 번째 줄의 `out`만 `err`로 바꿔 다시 컴파일했다.

```java
System.out.println("Hello");
System.err.println("Hello");
```

`javap -c HelloWorld`에서 두 줄의 첫 명령을 비교했다.

```text
       0: getstatic     #7                  // Field java/lang/System.out:Ljava/io/PrintStream;
       8: getstatic     #21                 // Field java/lang/System.err:Ljava/io/PrintStream;
```

둘 다 정적 필드를 읽으니 명령은 `getstatic`으로 같다. 달라진 건 **어느 필드를 읽느냐**다. 7번에는 `System`의 `out`, 21번에는 같은 클래스의 `err`가 적혀 있다. 둘의 선언 타입은 모두 `PrintStream`이다. 필드가 달라도 그 뒤의 `ldc #13`과 `invokevirtual #15`는 그대로였다.

컴파일할 때 `javac`가 확인할 수 있는 건 여기까지다. 두 필드에 실제로 어떤 출력 객체가 들어 있는지는 프로그램을 실행해야 읽을 수 있다. 그래서 파일에 남기는 건 클래스 이름, 필드 이름, 필드 타입이다. 실행할 때 JVM이 그 정보로 필드를 찾아 현재 값을 읽는다.

## out은 그대로 두고 println만 print로 바꾸면

이번에는 두 번째 줄도 다시 `System.out`을 쓰게 하고, 끝에서 줄을 바꾸지 않도록 `print`를 호출했다.

```java
System.out.println("Hello");
System.out.print("Hello");
```

이번에는 두 줄 모두 `getstatic #7`, `ldc #13`까지 같았다. 차이는 그다음 줄에서 났다.

```text
       5: invokevirtual #15                 // Method java/io/PrintStream.println:(Ljava/lang/String;)V
      13: invokevirtual #21                 // Method java/io/PrintStream.print:(Ljava/lang/String;)V
```

15번 끝에 붙은 `(Ljava/lang/String;)V`는 문자열 하나를 받고 반환값이 없다는 뜻이다. `PrintStream`에는 정수를 받는 `println(int)`도 있으니 메서드 이름만으로는 호출 대상을 구별할 수 없다. `javac`는 `"Hello"`의 타입을 보고 `println(String)`을 골라 클래스, 메서드 이름, 인수와 반환 타입을 15번에 기록했다. 이 파일의 21번에는 `print(String)`이 들어갔다. 앞 실험에서 21번이 `err`였던 건 그때 만든 클래스 파일에서의 번호다.

처음의 `System.out.println("Hello")`를 실행하면 7번과 15번의 쓰임이 이어진다. HotSpot은 이 클래스의 런타임 상수 풀을 통해 7번이 가리키는 `System.out` 필드를 찾는다. `getstatic`이 그 필드에서 출력 객체의 참조를 읽어 스택에 올리고, `ldc #13`이 그 위에 문자열의 참조를 올린다. 마지막 `invokevirtual #15`가 그 출력 객체에 `println(String)`을 호출한다. 메서드의 코드는 JDK 쪽에 있고, `HelloWorld.class`에는 어떤 메서드를 호출할지 식별하는 정보가 남는다.

<details>
<summary>7번의 이름과 타입을 HotSpot은 어떻게 실제 필드와 연결할까?</summary>

`Constant pool` 출력에서 7번은 다음처럼 적혀 있다.

```text
 #7 = Fieldref       #8.#9
 #8 = Class          #10
 #9 = NameAndType    #11:#12
#10 = Utf8           java/lang/System
#11 = Utf8           out
#12 = Utf8           Ljava/io/PrintStream;
```

7번의 첫 번호를 따라가면 필드를 찾을 클래스 `java/lang/System`이 나온다. 둘째 번호에는 필드 이름 `out`과 선언 타입 `PrintStream`이 묶여 있다. 이렇게 이름과 타입으로 대상을 지정한 항목을 **심볼 참조**라고 한다. 같은 필드를 여러 군데서 읽는다면 각 명령에 같은 상수 풀 번호를 쓸 수 있다.



첫 명령 `getstatic #7`에서 참조를 아직 해석하지 않은 경우를 보자. OpenJDK 21 HotSpot의 인터프리터는 메인 스레드에서 `InterpreterRuntime::resolve_get_put`을 호출한다. 이 함수가 현재 메서드의 상수 풀을 가져오고, `LinkResolver`가 필드를 찾는다. 실제 조회는 이 줄이다.

```cpp
Klass* sel_klass = resolved_klass->find_field(field, sig, &fd);
```

여기서 `resolved_klass`는 `System`이다. HotSpot은 먼저 `HelloWorld`를 정의한 로더를 기준으로 `java/lang/System`을 해석한다. 일반적인 JDK 실행에서는 부모 로더로 위임해 부트스트랩 로더가 정의한 클래스를 쓴다. 이미 이 클래스 참조를 해석해 뒀다면 그 결과를 쓴다.

이제 `find_field`가 그 클래스에서 이름이 `out`이고 타입이 `Ljava/io/PrintStream;`인 필드를 찾을 수 있다. 접근 권한과 정적 필드 여부까지 확인하면 HotSpot은 필드를 선언한 클래스와 그 안에서의 위치(오프셋)를 캐시에 기록할 수 있다. 파일에 적힌 심볼 참조를 실제 필드에 연결하는 과정이 **필드 해석**이다. JVM은 이 일을 첫 접근보다 앞서 해 둘 수도 있다.


오프셋을 얻고도 아직 한 번 더 읽어야 한다. OpenJDK 21의 AArch64 인터프리터는 정적 필드 값이 보관된 `System.class` 객체에서 `out`의 오프셋만큼 떨어진 곳을 읽는다. 거기에 들어 있는 `PrintStream` 객체의 참조가 스택에 올라간다. 다음번에도 필드 위치는 재사용할 수 있고, 값은 그때 다시 읽는다.

</details>

## Hello를 Bye로 바꾼 결과

`println("Hello")`를 `println("Bye")`로 고쳐 다시 컴파일했다. 명령 옆의 주석은 `// String Bye`로 바뀌었는데, 그 왼쪽은 여전히 `ldc #13`이었다.

| | 처음 파일 | 다시 컴파일한 파일 |
| --- | --- | --- |
| 문자열을 읽는 명령 | `ldc #13` | `ldc #13` |
| 상수 풀 13번 | `String #14` | `String #14` |
| 상수 풀 14번 | `Utf8 Hello` | `Utf8 Bye` |
| 터미널 출력 | `Hello` | `Bye` |

<details>
<summary>두 출력문의 실제 바이트와 파일 크기</summary>

`main`에 같은 출력문을 한 줄 더 넣고 컴파일했다.

```java
System.out.println("Hello");
System.out.println("Hello");
```

`javap -v HelloWorld`에서 두 출력문에 해당하는 `ldc`는 따로 나오는데, 그 옆의 번호는 같다.

```text
 3: ldc #13    // String Hello
11: ldc #13    // String Hello
```

클래스 파일에서 두 명령은 각각 `12 0d` 두 바이트였다. `12`는 명령 번호인 0x12, `0d`는 상수 풀 인덱스 13이다. `Hello` 다섯 글자는 상수 풀 14번에 한 번만 기록됐다. 첫 번째 출력문도 두 번째 출력문도 같은 문자열 항목을 쓴다.

두 줄 모두 `"Hello from the JVM"`으로 바꾸면 어떨까? 글자가 13바이트 늘었는데 두 `ldc`는 여전히 `12 0d`였고, 각각의 다음 명령도 그대로 5번과 13번 위치에서 시작했다. `main`의 명령은 전부 합쳐 여전히 17바이트였다. 클래스 파일은 431바이트에서 444바이트로 딱 13바이트 늘었다. 두 곳에서 출력해도 길어진 글자를 한 곳에만 썼기 때문이다.

</details>

<details>
<summary>첫 번째 ldc와 두 번째 ldc는 각각 무엇을 읽을까?</summary>

두 줄 모두 다시 `println("Hello")`로 두자. 파일에서 13번과 14번을 따라가면 문자열의 **내용**을 알 수 있다. 하지만 실행 중인 `println`에 넘길 값은 힙에 있는 **문자열 객체의 참조**다. HotSpot은 그 참조를 얻으면 `HelloWorld` 클래스에 마련한 배열에 보관한다. 두 출력문은 같은 13번을 쓰므로 이 배열에서도 같은 칸을 읽는다.

**첫 줄, `3: ldc #13`.** 그 칸이 아직 비어 있다고 하자. HotSpot은 `Hello`라는 내용으로 이미 등록된 문자열을 찾는다. 있으면 그 객체를 쓰고, 없으면 만들어 등록한다. 얻은 참조는 두 곳에 쓰인다. 클래스의 배열에 저장하고, 지금 실행 중인 `main`의 피연산자 스택에도 올린다. 첫 번째 `println`이 스택에서 문자열을 인수로 꺼내 써도 **배열에 저장한 참조는 그대로 남는다.**

**둘째 줄, `11: ldc #13`.** HotSpot이 같은 칸을 읽으면 첫 줄에서 쓴 객체의 참조가 나온다. 그 참조를 다시 스택에 올리면 두 번째 `println`에 넘길 준비가 끝난다. 클래스 파일의 14번에서 글자를 다시 읽거나 `Hello`라는 내용으로 검색할 일이 없다.

첫 줄부터 참조가 이미 준비돼 있었다면 첫 번째 `ldc`도 둘째 줄과 똑같이 처리한다. 위의 두 주소는 `javap`로 확인한 명령 위치이고, 첫 줄에서 칸이 비어 있었다는 건 두 실행 경로를 비교하기 위해 둔 조건이다.

파일에서 본 13은 상수 풀 번호다. `Rewriter::maybe_rewrite_ldc`는 문자열을 읽는 두 명령을 메모리에서 내부 명령 `_fast_aldc`로 바꾸고, 두 명령에 같은 참조 배열 인덱스를 넣는다. 이 배열이 `resolved_references`다. 내부 인덱스가 파일의 13과 같은 숫자일 필요는 없다.

AArch64 인터프리터의 `fast_aldc`는 그 인덱스로 참조 하나를 읽는다. 참조가 있으면 그대로 쓰고, 빈 칸이면 `InterpreterRuntime::resolve_ldc`를 호출한다. 문자열을 처리하는 `ConstantPool::string_at_impl`에서는 `StringTable::intern`으로 참조를 얻어 배열에 저장한다.

</details>

<details>
<summary>클래스가 달라도 같은 Hello 객체를 쓸까?</summary>

앞선 실험에서 14번의 글자를 고치면 출력이 바뀌는 건 확인했다. 이번에는 글자를 그대로 두고, 같은 JVM에서 클래스 두 개가 각각 `"Hello"`를 반환하게 했다. 클래스 파일이 둘이면 돌려주는 문자열 객체도 두 개일까?

```java
class A { static String hello() { return "Hello"; } }
class B { static String hello() { return "Hello"; } }

class Same {
    public static void main(String[] args) {
        System.out.println(A.hello() == B.hello());
    }
}
```

`Same.java`로 저장해 컴파일한 뒤 `java Same`을 실행했더니 `true`가 찍혔다. 여기서 `==`는 두 참조가 같은 객체를 가리킬 때 참이다. A와 B의 상수 풀은 따로 있어도 두 메서드가 돌려준 문자열 객체는 하나였다.

![클래스 A와 B의 resolved_references는 따로 있다. StringTable에서 얻은 두 참조는 힙의 같은 Hello 객체를 가리킨다.](./ldc-string.svg)

HotSpot은 B의 런타임 상수 풀에 딸린 참조 배열(`resolved_references`)부터 확인한다. 여기에 참조가 없으면 JVM에서 공유하는 인턴 문자열 표(`StringTable`)에서 내용이 `Hello`인 객체를 찾는다. A가 쓴 객체가 이미 등록돼 있으니 B는 그 참조를 **자기 배열**에 저장한다. A가 처음 찾았을 때도 등록된 객체가 없었다면, 그때 JVM이 문자열 객체를 만들어 인턴한다.

B에서 같은 `ldc`를 다시 실행할 때는 B의 배열에 참조가 들어 있다. 그 참조를 이번 호출의 피연산자 스택에 올리면 된다. 앞 예제의 `#13`은 클래스 파일 안의 번호이고, HotSpot은 여기에 대응하는 내부 인덱스로 배열을 읽는다. 다른 클래스에서 같은 리터럴을 몇 번에 기록했는지는 상관없다.

</details>

## 참고

- [OpenJDK 21, 문자열 ldc에 참조 배열 인덱스를 넣는 코드](https://github.com/openjdk/jdk/blob/jdk-21-ga/src/hotspot/share/interpreter/rewriter.cpp#L300-L325)
- [OpenJDK 21, AArch64 인터프리터에서 문자열 참조를 읽는 코드](https://github.com/openjdk/jdk/blob/jdk-21-ga/src/hotspot/cpu/aarch64/templateTable_aarch64.cpp#L379-L405)
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
