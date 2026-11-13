---
title: "같은 JAR인데 JVM은 왜 다른 클래스라고 할까?"
description: "plug.Entry를 plug.Entry로 바꿀 수 없다는 예외가 나왔다. JAR과 로더를 하나씩 바꿔 보며 JVM이 호출할 메서드를 찾는 기준과 플러그인이 언로드되는 조건을 확인했다."
date: 2026-11-12
update: 2026-11-13
tags:
  - JVM
  - 클래스 로더
  - 클래스패스
  - 런타임 상수 풀
---

`Cannot cast plug.Entry to plug.Entry`. 예외 메시지의 앞뒤를 다시 읽어도 이름이 똑같다. 실험에 쓴 JAR도 하나뿐이었다. 달랐던 건 그 파일을 읽은 클래스 로더였다.

클래스 이름만 믿으면 놓치는 게 하나 더 있다. `Entry.class`를 제대로 찾아도 호출자가 기대한 메서드가 없으면 호출은 실패한다. 그래서 같은 `Caller.class`를 그대로 두고 실행할 때 읽는 JAR과 로더를 하나씩 바꿔 봤다.

## 소스에서 첫 호출까지

`javac`가 만든 클래스 파일을 열어 보면 다른 클래스의 메서드를 이름과 타입으로 가리키는 곳이 있다. JVM은 실행할 때 이 이름으로 실제 타입과 메서드를 찾아야 한다.

먼저 이진 이름에 해당하는 바이트를 구해 클래스를 정의한다(**로딩**). **연결**할 때는 클래스 파일과 바이트코드를 검증하고 클래스 변수의 자리를 마련해 기본값을 넣는다. 이름과 디스크립터로 적힌 참조를 실제 클래스·필드·메서드에 맞춰 보는 일을 **해석**(resolution)이라고 한다. JVM은 해석을 미리 할 수도, 그 참조를 처음 쓸 때까지 미룰 수도 있다.

그 클래스의 `static` 필드 초기화식이나 `static` 블록을 실행하는 것은 **초기화**다. `new`로 인스턴스를 만들거나, 상수 변수가 아닌 `static` 필드를 읽거나, `static` 메서드를 호출할 때 초기화가 필요하다. [JVM 명세의 연결](https://docs.oracle.com/javase/specs/jvms/se25/html/jvms-5.html#jvms-5.4) · [클래스 초기화가 필요한 시점](https://docs.oracle.com/javase/specs/jls/se25/html/jls-12.html#jls-12.4.1)

그럼 `Entry.class`를 가져다줄 로더는 어떻게 정해질까. 기본 `ClassLoader.loadClass`는 이미 로드했는지 확인하고 부모에게 먼저 찾기를 맡긴다. 부모도 못 찾았을 때 자기 `findClass` 차례가 온다. 예제에서 애플리케이션 로더의 부모를 출력하니 `platform`이 나왔다. `String.class.getClassLoader()`를 찍은 값은 `null`이었다. API가 부트스트랩 로더를 이렇게 표시한다. 이름 있는 모듈의 경우에는 그 모듈을 맡은 로더도 탐색에 관여한다. [ClassLoader의 기본 위임 규칙](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/lang/ClassLoader.html) · [모듈과 내장 로더의 위임](https://openjdk.org/jeps/261)

Java 8 자료에는 가운데에 확장(extension) 로더가 나온다. 당시에는 애플리케이션 로더에서 확장 로더를 거쳐 부트스트랩 로더로 올라갔다. JDK 9에서 확장 메커니즘이 사라지고 플랫폼 로더가 들어왔다. 그래서 JDK 25 서버에서 표준 클래스가 어디 있나 찾아볼 때도, 예전 `rt.jar`가 있던 디렉터리를 뒤질 필요가 없다. 클래스와 리소스가 있는 모듈 이미지(`jrt:/`)를 보면 된다. [JDK 런타임 이미지의 변화](https://openjdk.org/jeps/220) · [모듈 시스템 도입](https://openjdk.org/jeps/261)

## 같은 호출자에 JAR만 바꿔 끼운 결과

`Caller`를 컴파일할 때 쓴 v1에는 `String`을 돌려주는 `plug.Entry.text()`가 있다. `javap -v -c`로 `Caller.class`를 열고 `invokestatic` 옆의 `#21`을 상수 풀에서 찾아봤다. 메서드 이름뿐 아니라 반환 타입까지 박혀 있다. JVM은 이 클래스 파일의 상수 풀로부터 클래스별 런타임 상수 풀을 만든다. 오프셋 17에서 호출할 메서드를 가리키는 `#21`이 심볼릭 참조의 한 예다. [JVM의 런타임 상수 풀](https://docs.oracle.com/javase/specs/jvms/se25/html/jvms-2.html#jvms-2.5.5)

```text
#21 = Methodref  #22.#23  // plug/Entry.text:()Ljava/lang/String;
 17: invokestatic #21     // Method plug/Entry.text:()Ljava/lang/String;
```

| 실행 조건 | 가장 먼저 드러난 결과 |
| --- | --- |
| 클래스패스에 v1이 있다 | `v1` 출력. `-Xlog:class+load=info`에도 `plug.Entry`의 출처가 `v1.jar`로 찍혔다. |
| JAR을 빼고 `Class.forName("plug.Entry")` 실행 | 이름으로 명시적으로 찾던 코드에 `ClassNotFoundException`이 전달됐다. |
| JAR을 빼고 위 `invokestatic` 실행 | JVM이 대상 클래스를 연결하지 못해 `NoClassDefFoundError`가 났다. 원인 체인에 `ClassNotFoundException`이 남았다. |
| 문자열 대신 `int`를 반환하는 v2만 배포 | 클래스는 찾았다. 하지만 `()Ljava/lang/String;`에 맞는 메서드가 없어 `NoSuchMethodError`가 났다. |

v2를 넣은 마지막 줄에서 좀 더 볼 게 있다. v2에도 `Entry`가 있고 `text()`라는 메서드까지 있다. 바뀐 건 반환 타입뿐인데 호출자는 여전히 `#21`에 적힌 `String`을 찾는다. 그래서 `NoSuchMethodError`가 난다. 이 로그로 짚을 수 있는 시점은 실패가 호출자에게 드러난 순간까지다. JVM 내부에서 언제부터 심볼을 찾고 있었는지는 나오지 않는다. [심볼릭 참조의 해석과 실패](https://docs.oracle.com/javase/specs/jvms/se25/html/jvms-5.html#jvms-5.4.3) · [명령과 실제 예외 원인 체인](./evidence/loader-output.txt)

운영에서 이 세 오류를 만난다면 맨 처음 실패한 호출의 `Caused by`부터 보겠다. 그런 다음 같은 컨테이너, 같은 사용자 권한에서 실행 중인 JVM과 서버에 배포된 JAR을 대조한다. 내 빌드 폴더에 있는 JAR을 열면 정작 플러그인 로더가 어떤 파일을 읽었는지는 놓치기 쉽다.

1. `jcmd <pid> VM.command_line`과 `VM.system_properties`에서 실행한 JDK, `-cp`, `-jar`, 모듈 경로와 시작 모듈을 확인한다. `java -jar`로 실행했다면 JAR의 매니페스트와 애플리케이션 런처의 의존성 배치도 본다.
2. 서버가 실제로 읽는 JAR에 `jar tf`를 실행해 클래스 경로와 중복 버전을 찾는다. 모듈이면 `jar --describe-module --file app.jar`와 재현 실행의 `--show-module-resolution`으로 모듈 그래프를 대조한다. 클래스는 있는데 패키지가 열려 있지 않은 리플렉션 접근은 접근 권한 오류로 구별한다.
3. `jcmd <pid> VM.classloaders`로 로더 트리를 본다. 같은 기동 인자로 재현하면서 `-Xlog:class+load=info,class+resolve=debug`를 켜고 실패한 이름의 출처와 호출자의 로더를 확인한다. 찾은 바이트는 `javap -v -cp <배포된-JAR> <클래스>`로 호출자가 요구한 디스크립터와 비교한다. [JDK 25 jcmd](https://docs.oracle.com/en/java/javase/25/docs/specs/man/jcmd.html) · [Java 런처의 실행 모드](https://docs.oracle.com/en/java/javase/25/docs/specs/man/java.html)

## 같은 파일에서 서로 다른 타입이 생긴다

![같은 plug.Entry 파일을 A와 B가 각각 정의하면 이름이 같아도 서로 다른 타입이다.](./01-loader-identity.svg)

처음에 본 예외는 `URLClassLoader` 두 개에 같은 `v1.jar`를 건네서 만들었다. 두 로더의 부모는 플랫폼 로더다. 그쪽에는 이 플러그인 JAR이 없다. 결국 A도 B도 직접 `plug.Entry`를 정의했다. `getName()`은 같았고 두 `Class`를 `==`로 비교한 값은 `false`였다. B가 만든 인스턴스를 A의 타입으로 바꾸려니 `Cannot cast plug.Entry to plug.Entry`가 나온다. JVM이 일반 클래스를 구별할 때는 **이진 이름과 그 클래스를 정의한 로더**가 모두 같아야 한다. [JVM 명세의 클래스 생성](https://docs.oracle.com/javase/specs/jvms/se25/html/jvms-5.html#jvms-5.3)

플러그인 안에서만 쓰는 라이브러리는 플러그인이 자기 버전부터 찾게 할 수 있다. 문제는 호스트에 넘길 객체다. 양쪽이 공유할 API까지 각 JAR에 복사해 두면 방금 본 예외를 그대로 만들 수 있다. 공유 API와 JDK 클래스는 공통 부모가 한 번 정의하게 두고 먼저 찾을 범위는 플러그인의 자체 패키지로 좁힌다.

이 로딩 규칙을 직접 쓸 때는 `getClassLoadingLock(name)` 안에서 `findLoadedClass`로 중복 정의부터 막는다. 자체 탐색에서 클래스를 못 찾았을 때 부모에게 넘기면 된다. 검증이나 접근 권한 오류까지 무시하면 원래 실패를 숨겨 버린다. 또 로더를 나눠도 플러그인이 파일을 열거나 네트워크에 접근할 권한은 그대로다. JDK 24부터 Security Manager는 영구 비활성화됐으므로 신뢰할 수 없는 플러그인은 OS 권한을 제한한 별도 프로세스에 둔다. [ClassLoader API](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/lang/ClassLoader.html) · [JEP 486](https://openjdk.org/jeps/486)

## 첫 초기화와 두 번째 접근의 예외가 다른 이유

JAR을 빼지 않고도 `NoClassDefFoundError`를 낼 수 있다. 정적 필드 초기화식에 `Integer.parseInt("broken")`을 넣고 같은 로더에서 두 번 접근했다. 처음에는 `NumberFormatException`을 원인으로 둔 `ExceptionInInitializerError`가 나왔다. 두 번째가 `NoClassDefFoundError`였다. 그 사이 파일은 건드리지 않았다. 첫 번째 실패 때 JVM이 이 클래스의 초기화를 실패로 기록했기 때문이다. 두 번째 로그만 읽고 JAR부터 다시 배포하면 원인은 그대로 남는다. [JLS의 상세 초기화 절차](https://docs.oracle.com/javase/specs/jls/se25/html/jls-12.html#jls-12.4.2)

초기화 도중에 같은 스레드가 자기 클래스의 값을 읽는 경우도 돌려 봤다. `static final int value = read() + 1`에서 `read()`가 읽은 값은 0이다. 아직 대입 전인데 같은 스레드가 재진입했으니 자신을 기다리지 않고 기본값을 읽었다. 그래서 최종값이 1이 된다.

스레드를 둘로 늘리니 결과가 달랐다. A의 정적 초기화식은 B의 값을 읽고 B의 초기화식은 A의 값을 읽게 했다. 두 플랫폼 스레드를 동시에 진입시키고 덤프를 뜨니 `init-A`는 B의 초기화 완료를, `init-B`는 A의 초기화 완료를 기다리고 있었다. 다른 스레드가 시작한 초기화는 끝날 때까지 기다려야 한다. 이 경우에는 둘 다 돌아올 수 없다. 상대 클래스나 외부 작업을 기다리는 일을 정적 초기화식에서 빼면 기다림의 고리를 끊을 수 있다. [실제 스레드 덤프](./evidence/loader-output.txt)

## 플러그인을 내렸는데 클래스가 남는 경우

마지막으로 플러그인 인스턴스 하나를 만들고 JAR을 닫았다. 메서드도 끝났으니 G1에 수집을 요청했는데 로더에 걸어 둔 약한 참조가 여전히 살아 있었다. 호스트의 정적 레지스트리에 플러그인 로더를 등록해 둔 게 남아 있었다.

레지스트리에서 그 항목까지 빼고 다시 수집을 요청했다. 이번에는 `unloading class plug.Entry`가 찍혔고 약한 참조도 지워졌다. 인스턴스와 파일을 정리한 뒤에도 **그 클래스를 정의한 로더**를 누군가 붙들고 있으면 일반 클래스는 남는다. 로더를 놓은 뒤 실제로 언제 언로드할지는 JVM이 정한다. [클래스 언로딩의 조건](https://docs.oracle.com/javase/specs/jls/se25/html/jls-12.html#jls-12.7)

실서비스에서 재배포할 때마다 메타스페이스가 늘면 `jcmd <pid> VM.classloader_stats`로 이전 로더 종류의 개수와 클래스 수를 배포 전후에 비교한다. 같은 부하에서 여러 차례 수집 후에도 오래된 로더가 늘어나는지 `class+unload` 로그와 맞춰 본다. 원인을 확정하려면 안전하게 수집한 힙 덤프에서 오래된 로더까지의 **GC 루트 경로**를 찾는다. 예제에서는 정적 레지스트리가 한 경로이고, 실제 서비스에서는 장수 스레드의 context class loader나 정리하지 않은 콜백도 조사 대상이다. [jcmd 진단 명령](https://docs.oracle.com/en/java/javase/25/docs/specs/man/jcmd.html)

실험은 macOS ARM64의 Temurin 25.0.4.1에서 실행했다. Python 3와 같은 JDK의 `java`, `javac`, `javap`, `jar`, `jcmd`가 있는 macOS·Linux 환경에서 두 파일을 같은 폴더에 두고 `python3 run-loaders.py`를 실행하면 된다. 스크립트는 임시 폴더 안에서 두 JAR을 만들고 순환 초기화용 JVM의 덤프를 얻은 뒤 프로세스를 종료한다. [Java 실험 소스](./evidence/LoaderLab.java) · [재현 스크립트](./evidence/run-loaders.py) · [실행 결과](./evidence/loader-output.txt)

로더가 골라 준 `Entry.text()`까지 찾아왔으니 이제 그 안에 적힌 명령을 실행할 차례다. [피연산자 스택과 JIT 인라이닝](/backend/transfer-performance/02-jvm-execution/)
