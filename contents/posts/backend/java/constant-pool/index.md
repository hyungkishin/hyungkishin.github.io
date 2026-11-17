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

**상수 풀은 클래스 파일 안에서 번호를 붙여 상수와 이름을 기록해 둔 표다.** 숫자나 문자열은 여기에 들어갈 만하다. 그런데 왜 메서드 이름인 `println`까지 *상수* 풀에 들어갈까? 이 질문은 컴파일이 끝난 뒤에도 JVM이 알아내야 할 것이 무엇인지 생각하면 풀린다.

## 컴파일할 때 어디까지 알 수 있을까

`App`에서 다른 클래스의 `Message.text()`를 호출한다고 해보자. 컴파일러는 그 메서드가 있는지, 인수를 몇 개 받는지, 반환 타입이 무엇인지 검사할 수 있다. 하지만 이 시점에는 배포할 서버의 자바 프로세스조차 떠 있지 않다. 그 메서드의 실행 주소를 파일에 적어 둘 수 있을까?

자바 클래스 파일에는 대상을 다시 찾는 데 필요한 정보를 남긴다. 이 예에서는 클래스 이름 `Message`, 메서드 이름 `text`, 인수 없이 `String`을 반환한다는 타입 정보다. 이렇게 이름과 타입으로 대상을 지정한 것을 **심볼 참조**라고 한다. 이 참조를 상수 풀에 한 번 기록하면 같은 클래스의 여러 호출 지점에서 그 번호를 쓸 수 있다. 호출받는 쪽의 구현은 별도의 클래스 파일에 들어간다.

## javac가 HelloWorld.class에 남긴 것

조금 더 익숙한 한 줄로 실제 파일을 열어 봤다.

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

같은 번호라도 클래스 파일이 달라지면 뜻이 달라진다. 여기서 13번은 문자열인데, 앞서 예로 든 `App.class`의 13번을 열면 `Message.text()`가 나온다. 각 클래스 파일이 자기 상수 풀을 갖기 때문이다.

한 항목만 실제 출력대로 펼쳐 보자. `getstatic #7`의 7번에는 아래처럼 번호 두 개가 더 있다.

```text
 #7 = Fieldref       #8.#9
 #8 = Class          #10
 #9 = NameAndType    #11:#12
#10 = Utf8           java/lang/System
#11 = Utf8           out
#12 = Utf8           Ljava/io/PrintStream;
```

7번은 **필드 참조** 형식이다. 첫 번호를 따라가면 어느 클래스인지 나오고, 둘째 번호를 따라가면 필드 이름과 선언 타입이 나온다. `javap`가 명령 옆에 붙여 주는 주석 `Field java/lang/System.out:Ljava/io/PrintStream;`은 바로 이 항목들을 풀어 쓴 것이다. 여기까지 파일에서 확인할 수 있는 건 **어느 필드를 읽으라는지**다. 그 필드가 지금 가리키는 출력 객체는 프로그램을 실행해야 알 수 있다.

## JVM은 실행할 때 그 번호를 어떻게 쓸까

`java HelloWorld`를 실행하면 JVM은 `HelloWorld` 클래스를 만들면서 파일의 상수 풀을 바탕으로 이 클래스의 **런타임 상수 풀**을 구성한다. 이제 `main`에서 쓰는 심볼 참조를 실행 중인 JVM의 실제 필드나 메서드와 연결할 수 있다. JVM 명세에서는 이 과정을 *해석(resolution)*이라고 부른다. 구현에 따라 미리 해석할 수도 있고 처음 필요할 때 해석할 수도 있다. [JVM 명세 5.1절과 5.4절](https://docs.oracle.com/javase/specs/jvms/se21/html/jvms-5.html#jvms-5.1)

실제로 `main`을 한 명령씩 따라가면 번호의 용도가 드러난다.

1. `getstatic #7`을 실행하면 JVM은 7번으로 식별한 `System.out` 필드의 **현재 값**을 읽는다. 그 값은 출력 객체의 참조다. 이 참조가 `main`의 피연산자 스택에 올라간다.
2. `ldc #13`은 문자열 리터럴에 해당하는 `String` 객체의 참조를 그 위에 올린다. 스택에는 이제 출력 객체와 출력할 문자열이 차례로 있다.
3. `invokevirtual #15`는 출력 객체를 수신자로 삼고 문자열을 인수로 넘겨 `println`을 호출한다. 터미널에서 보는 글자는 이 호출의 결과다.

`System.setOut`으로 출력 대상을 파일로 바꾼 뒤 같은 `main`을 다시 호출해도 7번은 여전히 `System.out`을 뜻한다. 바뀌는 건 첫 명령이 스택에 올리는 참조값이다. 상수 풀에 터미널이나 파일의 주소가 들어 있다고 보면 이 결과를 설명할 수 없다.

## 호출하는 클래스는 그대로 두고 호출받는 쪽만 바꾸면

처음 질문으로 돌아가서, 이름과 타입만 기록해도 되는지 직접 확인했다. 아래 코드를 각각 `App.java`와 `Message.java`로 저장했다.

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

이번 출력은 `second`였다. 전후에 확인한 `App.class`의 SHA-1은 같았다. `javap -c App`으로 보면 호출 명령도 그대로다.

```text
3: invokestatic #13   // Method Message.text:()Ljava/lang/String;
```

`App.class`의 13번에는 처음 출력한 `first`도, 두 번째로 출력한 `second`도 들어 있지 않다. 거기 남은 건 `Message.text:()Ljava/lang/String;`이다. 그래서 새 JVM에서 같은 호출 명령을 실행해도 교체한 `Message.class`의 메서드가 호출된다. 컴파일할 때 남긴 이름과 타입이 실제로 쓰이는 순간이다.

클래스 파일에서 각 항목을 바이트 단위로 확인하려면 번호 옆의 종류부터 보면 된다. 위 예제에서 사용한 `Fieldref`, `String`, `Methodref`의 형식은 [JVM 명세 4.4절](https://docs.oracle.com/javase/specs/jvms/se21/html/jvms-4.html#jvms-4.4)에 정리되어 있다.
