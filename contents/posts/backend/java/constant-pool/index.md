---
title: "자바 상수 풀에는 무엇이 들어갈까?"
description: "클래스 파일에 남는 값과 이름을 javap로 읽고, 호출하는 쪽을 다시 컴파일하지 않아도 실행 결과가 달라지는 이유를 확인했다."
date: 2026-11-17
update: 2026-11-17
tags:
  - Java
  - JVM
  - 바이트코드
---

JVM 3장 글에서 주문 객체를 만드는 코드를 컴파일했을 때 첫 명령은 `new #7`이었다. `javap`가 옆에 달아 준 주석은 `class Order`. 그런데 아래 코드를 컴파일하면 첫 명령에 또 7번이 나온다. 이번 주석은 `System.out`이다. 같은 7번인데 왜 다른 걸 가리킬까?

7번은 **그 클래스 파일의 상수 풀에서 일곱 번째 항목**을 가리킨다. 클래스 파일마다 따로 있는 표다. 문자열이나 숫자도 담고, 코드에서 사용하는 클래스와 필드, 메서드의 이름과 타입도 기록한다.

## 메서드 이름까지 상수 풀에 넣는 이유

`App`에서 `Message.text()`를 호출한다고 해보자. `javac`가 `App.java`를 컴파일할 때 필요한 건 인수 없이 호출할 수 있는 `text`가 `Message`에 있는지, 반환 타입이 무엇인지다. `text`의 본문은 `Message.class`에 있다. 나중에 `App.class`를 다른 컴퓨터로 가져가서 실행해도 JVM이 그 메서드를 찾아 호출할 수 있어야 한다.

그래서 `javac`는 `App.class`에 클래스 이름 `Message`, 메서드 이름 `text`, 그리고 인수 없이 `String`을 반환한다는 타입 정보를 남긴다. 이름과 타입으로 호출 대상을 적어 둔 게 **심볼 참조**다. 같은 메서드를 두 군데에서 호출해도 이 정보를 두 번 길게 적을 필요가 없다. 각각의 호출 명령에 같은 상수 풀 번호를 쓰면 된다.

## HelloWorld.class의 7번에는 뭐가 있나

```java
public class HelloWorld {
    public static void main(String[] args) {
        System.out.println("Hello World");
    }
}
```

Microsoft OpenJDK 21에서 `javac HelloWorld.java`로 컴파일했다. 이때 `javac`는 인수의 타입을 보고 `println(String)`을 골라서 호출 정보를 기록한다. 생성된 파일을 `javap -v HelloWorld`로 열면 두 군데를 맞춰 볼 수 있다. `main`의 `Code`에는 무슨 동작을 할지가, `Constant pool`에는 그 동작에서 쓸 값과 대상이 들어 있다.

```text
0: getstatic     #7
3: ldc           #13
5: invokevirtual #15
8: return
```

| 이 파일의 번호 | 상수 풀 항목 | javac가 기록한 내용 |
| --- | --- | --- |
| #7 | Fieldref | System 클래스의 out 필드. 선언 타입은 PrintStream |
| #13 | String | 문자열 리터럴 Hello World에 해당하는 문자 데이터의 번호 |
| #15 | Methodref | PrintStream의 println 메서드. String 하나를 받고 반환값은 없음 |

첫 줄만 보면 `getstatic #7`이다. 상수 풀 7번을 열면 바로 `out`이라는 글자가 보일까? `javap -v` 출력에서 7번부터 잘라 왔다.

```text
 #7 = Fieldref       #8.#9
 #8 = Class          #10
 #9 = NameAndType    #11:#12
#10 = Utf8           java/lang/System
#11 = Utf8           out
#12 = Utf8           Ljava/io/PrintStream;
```

7번에는 `Fieldref #8.#9`라고 적혀 있다. 8번에서 10번으로 가면 `java/lang/System`이 나온다. 9번은 두 갈래다. 11번이 필드 이름 `out`, 12번이 필드 타입 `Ljava/io/PrintStream;`이다. `javap`가 명령 옆에 붙여 주는 주석 `Field java/lang/System.out:Ljava/io/PrintStream;`은 바로 이 항목들을 풀어 쓴 것이다. 여기까지는 파일만 열어 봤다. 7번이 가리키는 필드의 이름과 타입은 알겠는데, 정작 출력할 때 쓸 객체는 어디 있지?

## JVM은 실행할 때 그 번호를 어떻게 쓸까

`java HelloWorld`를 실행하면 JVM은 `HelloWorld` 클래스를 만들면서 파일의 상수 풀을 바탕으로 이 클래스의 **런타임 상수 풀**을 구성한다. JVM은 7번에 적힌 클래스 이름과 필드 이름, 타입으로 실제 `System.out` 필드를 찾는다. 심볼 참조가 어느 필드나 메서드를 뜻하는지 이렇게 결정하는 과정을 명세에서는 *해석(resolution)*이라고 한다. 구현에 따라 미리 해석할 수도 있고 처음 필요할 때 해석할 수도 있다.

`System.out`에 들어 있는 값을 읽는 건 `main`의 첫 명령을 실행할 때다.

1. `getstatic #7`을 실행하면 JVM은 7번으로 식별한 `System.out` 필드의 **현재 값**을 읽는다. 그 값은 출력 객체의 참조다. 이 참조가 `main`의 피연산자 스택에 올라간다.
2. `ldc #13`은 문자열 리터럴에 해당하는 `String` 객체의 참조를 그 위에 올린다. 스택에는 이제 출력 객체와 출력할 문자열이 차례로 있다.
3. `invokevirtual #15`는 출력 객체를 수신자로 삼고 문자열을 인수로 넘겨 `println`을 호출한다. 터미널에서 보는 글자는 이 호출의 결과다.

`System.setOut`으로 출력 대상을 파일로 바꾼 뒤 같은 `main`을 다시 호출해도 7번은 여전히 `System.out`을 뜻한다. 첫 호출 때 스택에 올라간 건 터미널에 쓰던 출력 객체의 참조다. 두 번째 호출 때는 파일에 쓰는 객체의 참조가 올라간다. 그사이 `HelloWorld.class`를 고칠 일은 없다.

## 호출하는 클래스는 그대로 두고 호출받는 쪽만 바꾸면

아까 `App`은 `Message.text()`의 이름과 타입만 갖고 있다고 했다. 그러면 `text()`에서 돌려주는 문자열을 바꿔도 `App.java`까지 다시 컴파일할 필요가 있을까? 두 클래스를 파일 두 개로 나눠서 돌려 봤다.

```java
class App {
    public static void main(String[] args) {
        System.out.println(Message.text());
    }
}
```

```java
class Message {
    static String text() { return "first"; }
}
```

`javac App.java Message.java`로 둘 다 컴파일하고 `java App`을 실행하자 `first`가 찍혔다. 다음에는 `Message.java`에서 반환하는 문자열만 `second`로 고쳤다.

```sh
javac Message.java
java App
```

`second`가 찍혔다. 두 번째에 컴파일한 건 `Message.java` 하나다. `App.class`는 전후의 SHA-1도 같았다. `javap -c App`에서 `text()`를 호출하는 줄은 이렇다.

```text
3: invokestatic #13   // Method Message.text:()Ljava/lang/String;
```

여기도 13번이다. 아까 `HelloWorld.class`에서는 13번에 문자열이 있었는데, `App.class`에서는 `Message.text:()Ljava/lang/String;`이 나온다. `java App`을 다시 실행했을 때 JVM은 그 이름과 타입으로 새 `Message.class`의 메서드를 찾았다. `first`를 `second`로 고치고도 호출하는 쪽은 그대로 둘 수 있었던 이유다.

## 참고

- [3장. 자바 가상 머신 개요](https://hyungkishin.github.io/books/optimizing-java/chapter-03-jvm/)
- [JVM 명세, 클래스 파일의 상수 풀](https://docs.oracle.com/javase/specs/jvms/se21/html/jvms-4.html#jvms-4.4)
- [JVM 명세, 런타임 상수 풀](https://docs.oracle.com/javase/specs/jvms/se21/html/jvms-5.html#jvms-5.1)
- [JVM 명세, 심볼 참조 해석](https://docs.oracle.com/javase/specs/jvms/se21/html/jvms-5.html#jvms-5.4.3)
- [JVM 명세, getstatic 명령](https://docs.oracle.com/javase/specs/jvms/se21/html/jvms-6.html#jvms-6.5.getstatic)
