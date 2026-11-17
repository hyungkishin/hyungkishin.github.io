---
title: "getstatic #7에서 7번을 열면 System.out이 있을까?"
description: "HelloWorld.class에서 B2 00 07을 찾았다. JVM이 7번 상수 풀 항목으로 어느 필드를 읽을지 알아내는 과정과, 실행 중 System.out을 바꿨을 때의 출력을 따라간다."
date: 2026-11-17
update: 2026-11-17
tags:
  - Java
  - JVM
  - 바이트코드
---

`System.out.println("Hello World")`를 컴파일했더니 첫 명령이 `getstatic #7`이었다. 7번에 뭐가 들었길래 이 세 바이트로 출력 객체를 가져올 수 있을까?

```java
public class HelloWorld {
    public static void main(String[] args) {
        System.out.println("Hello World");
    }
}
```

Microsoft OpenJDK 21에서 다음 두 명령을 실행했다.

```sh
javac HelloWorld.java
javap -c HelloWorld
```

```text
0: getstatic     #7   // Field java/lang/System.out:Ljava/io/PrintStream;
3: ldc           #13  // String Hello World
5: invokevirtual #15  // Method java/io/PrintStream.println:(Ljava/lang/String;)V
8: return
```

첫 줄 오른쪽에 벌써 답이 나와 있다. 그런데 저 주석은 누가 썼지? 소스에는 저런 주석을 단 적이 없다. 실제 클래스 파일에서 `main`의 첫 명령을 보면 `B2 00 07`이 전부다. `B2`는 정적 필드의 값을 읽는 명령이고, 뒤의 두 바이트를 정수로 읽으면 7이다. 파일의 일곱 번째 바이트로 가라는 뜻일까?

## 7번 항목에도 out이라는 글자는 없다

`javap -v HelloWorld`로 같은 파일의 **상수 풀(constant pool)**을 펼쳐 봤다. 클래스 파일마다 이런 표가 하나씩 있다. 이 예제에서 7은 그 표 안의 항목 번호다.

```text
 #7 = Fieldref       #8.#9
 #8 = Class          #10
 #9 = NameAndType    #11:#12
#10 = Utf8           java/lang/System
#11 = Utf8           out
#12 = Utf8           Ljava/io/PrintStream;
```

7번 항목의 실제 바이트는 `09 00 08 00 09`다. 첫 바이트 `09`가 **태그**다. 이 값이 9이면 이 항목을 필드 참조(`Fieldref`) 형식으로 읽는다. 그래서 그 뒤 네 바이트를 두 바이트씩 나눠 읽을 수 있다. `00 08`은 클래스를 찾을 번호, `00 09`는 필드 이름과 타입을 찾을 번호다. 맨 앞의 9와 맨 끝의 9는 숫자만 같고 용도가 다르다.

먼저 8번에서 10번으로 가면 `java/lang/System`이 나온다. 다음으로 9번을 보면 번호가 둘이다. 11번에는 필드 이름 `out`, 12번에는 타입 표기인 `Ljava/io/PrintStream;`이 들어 있다. 맨 앞의 `L`부터 끝의 `;`까지가 클래스 타입을 나타내는 JVM 디스크립터다.

이제 첫 줄의 주석을 직접 읽을 수 있다. **System 클래스에서 이름이 out이고 타입이 PrintStream인 필드.** 이게 7번에 기록된 심볼 참조다. 여기까지는 `java HelloWorld`를 한 번도 실행하지 않고 알아낸 내용이다.

## 같은 7번을 두 번 읽었는데 출력이 다른 곳으로 갔다

7번을 다 따라가도 터미널이라는 말은 안 나온다. 그러면 출력을 파일로 돌린 뒤 똑같은 `HelloWorld.main`을 다시 호출하면 어떻게 될까? 위에서 만든 `HelloWorld.class`를 그대로 두고 호출하는 쪽만 추가했다.

```java
import java.io.PrintStream;

class Redirect {
    public static void main(String[] args) throws Exception {
        HelloWorld.main(args);
        try (PrintStream file = new PrintStream("out.txt")) {
            System.setOut(file);
            HelloWorld.main(args);
        }
    }
}
```

```sh
javac Redirect.java
java Redirect
cat out.txt
```

`java Redirect`를 실행한 터미널에는 한 줄만 찍혔다. 두 번째 줄은 `cat out.txt`를 쳤을 때 나타났다. 두 호출 모두 같은 `getstatic #7`을 실행했다. 그 사이에 바뀐 건 `System.out` 필드의 값이다.

JVM은 클래스를 로드할 때 클래스 파일의 상수 풀을 바탕으로 **런타임 상수 풀**을 만든다. 필드 참조를 해석할 때는 클래스와 필드 이름, 디스크립터를 사용해 실제 필드를 찾는다. JVM은 이 연결을 앞서 해 둘 수도 있고 처음 필요할 때 해도 된다. 연결이 끝나도 그 필드에 앞으로 들어갈 값까지 고정되지는 않는다.

`getstatic`이 실행되는 순간에는 그 필드의 **현재 값**을 읽어 `main` 프레임의 피연산자 스택에 올린다. 여기서 값은 출력 객체의 참조다. 첫 호출에서는 터미널로 쓰는 객체가, 두 번째 호출에서는 `out.txt`로 쓰는 객체가 올라갔다. 그다음 `ldc`가 같은 문자열을 올리고 `invokevirtual`이 각각의 출력 객체에 `println`을 호출했다.

### 참고자료

- [JVM 명세 4.4.2절, 필드와 메서드 참조의 클래스 파일 형식](https://docs.oracle.com/javase/specs/jvms/se21/html/jvms-4.html#jvms-4.4.2)
- [JVM 명세 5.4.3.2절, 필드 참조 해석](https://docs.oracle.com/javase/specs/jvms/se21/html/jvms-5.html#jvms-5.4.3.2)
- [JVM 명세 6장, getstatic의 실행](https://docs.oracle.com/javase/specs/jvms/se21/html/jvms-6.html#jvms-6.5.getstatic)
