---
title: "바이트코드는 언제 기계어가 될까?"
description: "메서드를 한 번만 호출했는데 JIT 로그에는 컴파일 기록이 세 줄 남았다. 같은 계산을 AOT로 빌드한 뒤에는 java가 없는 컨테이너에서도 실행해 봤다."
date: 2026-11-12
update: 2026-11-13
tags:
  - JVM
  - JIT
  - AOT
  - GraalVM
  - Linux
---

메서드를 자주 호출하면 JIT가 컴파일한다고 배웠다. 그래서 `longLoop`를 딱 한 번만 호출하고 그 안의 반복문을 1,200만 번 돌려 봤다. 컴파일 로그에서 `longLoop`를 찾아보니 세 줄이나 나온다. 두 줄 끝에는 `@ 6`까지 붙어 있다. 같은 메서드에 들어가는 길을 왜 여러 개 만들었을까?

![바이트코드 해석은 명령마다 준비된 처리 루틴을 고른다. JIT는 실행 중 메서드를 컴파일한다. Native Image는 빌드에서 실행 파일을 만든다.](./01-execution-paths.svg)

## 바이트코드 한 줄을 실행하는 세 가지 경로

`javac`가 클래스 파일에 남긴 정수 덧셈은 `iadd`다. CPU는 이 명령 번호를 그대로 실행할 수 없다. 인터프리터로 실행할 때는 HotSpot이 `iadd`에 맞춰 준비해 둔 처리 루틴으로 간다. CPU가 그 루틴의 기계어를 실행하면서 스택에서 두 정수를 꺼내 더하고 다음 명령으로 넘어간다. 같은 덧셈을 만나면 다시 그 루틴으로 간다. [HotSpot의 바이트코드 진입점 설정](https://github.com/openjdk/jdk25u/blob/fda231468e56663992785ec199a6efb8eca3cc7a/src/hotspot/share/interpreter/templateInterpreterGenerator.cpp#L277-L285)

반복문을 오래 돌면 같은 바이트코드를 다시 읽는 비용도 그만큼 쌓인다. HotSpot의 **JIT(Just-In-Time) 컴파일러**는 실행 중에 메서드를 골라 기계어로 만들고 코드 캐시(code cache)에 둔다. 다음 호출부터는 거기 설치한 기계어로 곧장 들어가기도 한다. 그 메서드 안에서 자주 부르는 작은 메서드의 본문까지 함께 넣는 경우가 [앞 글에서 확인한 인라이닝](/backend/transfer-performance/02-jvm-execution/)이다. [C2가 호출 위치에서 인라이닝을 검토하는 코드](https://github.com/openjdk/jdk25u/blob/fda231468e56663992785ec199a6efb8eca3cc7a/src/hotspot/share/opto/doCall.cpp#L189-L204)

GraalVM Native Image로 빌드하면 기계어를 만드는 시점이 배포 전으로 옮겨 간다. 이런 컴파일 방식을 **AOT(Ahead-Of-Time)**라고 한다. 빌더가 `main`부터 따라갈 수 있는 코드를 찾아 대상 OS와 CPU에 맞는 실행 파일에 앱 코드, 런타임, GC를 담는다. 배포한 곳에서는 그 파일을 실행하면 된다. 다만 실행 중 이름을 받아 찾는 클래스나 리소스까지 빌드 때 알아내기는 어려워서, 그런 항목은 메타데이터로 알려 줘야 한다. [GraalVM의 빌드와 런타임 설명](https://www.graalvm.org/jdk25/reference-manual/native-image/)

### 정수 덧셈 하나가 ARM64 명령이 되기까지

`return left + right`의 바이트코드는 두 인자를 올리고 `iadd`를 실행한다. C2 파서의 `_iadd` 분기는 스택에서 두 값을 꺼내 중간 표현인 `AddINode`를 만든다. 최적화를 거친 그래프에 두 레지스터의 정수 덧셈이 남으면 ARM64 백엔드의 `addI_reg_reg` 규칙이 이를 32비트 덧셈 명령으로 바꾼다. [C2 파서의 iadd 처리](https://github.com/openjdk/jdk25u/blob/fda231468e56663992785ec199a6efb8eca3cc7a/src/hotspot/share/opto/parse2.cpp#L2212-L2215) · [ARM64의 명령 선택과 인코딩](https://github.com/openjdk/jdk25u/blob/fda231468e56663992785ec199a6efb8eca3cc7a/src/hotspot/cpu/aarch64/aarch64.ad#L9890-L9900)

실제 기계어에서 덧셈 한 줄을 찾으려면 덧셈 메서드가 호출자에게 인라인되면 곤란하다. 이 덧셈 메서드에 한해 인라이닝을 막고 Linux에서 C2가 만든 바이트 `20 00 02 0b`를 역어셈블했다. `add w0, w1, w2`. 32비트 레지스터 `w1`, `w2`의 값을 더해 `w0`에 쓰는 바로 그 명령이다. [덧셈 예제](./evidence/AddWarmup.java) · [javap부터 기계어까지 재현한 명령과 출력](./evidence/add-aarch64.txt)

### 한 번 호출한 루프에 두 진입점이 생긴 이유

처음의 `longLoop`로 돌아가 보자. Linux ARM64의 Temurin 25.0.5+8에서 누적값을 계산하는 루프를 1,200만 번 돌렸다. `longLoop`의 호출도 반환도 한 번씩이다. 아래 세 줄 맨 왼쪽의 `54`, `55`, `56`은 각각 다른 컴파일 작업 번호다.

```text
54  %  3  HotPathProbe::longLoop @ 6
55     3  HotPathProbe::longLoop
56  %  4  HotPathProbe::longLoop @ 6
```

55번에는 `@ 6`이 없다. 다음에 누군가 메서드를 처음부터 호출할 때 들어갈 코드다. 그런데 이미 한창 돌고 있는 루프는 다음 호출을 기다리면 기계어를 써 볼 기회도 없이 끝난다. **`%`가 붙은 54번과 56번은 그 루프가 실행 도중 갈아탈 진입점을 만들었다.** `@ 6`은 반복 조건을 읽는 바이트코드 위치다. 프레임의 인덱스와 지금까지 구한 누적값, 잡고 있는 모니터가 있다면 그 상태까지 옮겨서 계산을 계속한다. 이게 온스택 치환(on-stack replacement, OSR)이다. 루프가 끝날 무렵에는 56번 코드의 종료 분기에서 역최적화 이벤트도 찍혔다. 최종 체크섬은 인터프리터 전용 실행과 같았다. [실행 코드](./evidence/HotPathProbe.java) · [javap와 실제 컴파일 기록](./evidence/osr-windows.txt) · [OpenJDK의 OSR 상태 이동](https://github.com/openjdk/jdk25u/blob/fda231468e56663992785ec199a6efb8eca3cc7a/src/hotspot/share/runtime/sharedRuntime.cpp#L3269-L3279)

그럼 JVM은 어디서 루프가 바쁘다는 걸 알았을까. 54번 작업이 큐에 들어간 순간 메서드 진입은 **1회**였고, 루프 뒤에서 앞으로 돌아간 횟수인 백에지(backedge) 계수는 **60,416**이었다. 반면 다른 메서드 `quote`는 진입 횟수 256에서 C1 레벨 3, 6,656에서 C2 레벨 4 작업이 등록됐다. C2는 C1이 수집한 실행 횟수와 수신 객체 타입을 보고 코드를 최적화했다.

OpenJDK 소스에도 기준이 둘이다. 메서드 진입용 컴파일은 호출 계수 하나, 또는 최소 호출 계수와 호출·백에지의 합을 본다. OSR은 백에지를 본다. 거기에 설정, 컴파일 단계와 큐 부하까지 영향을 준다. 한 번 호출한 `longLoop`의 로그만 봐도 왜 ‘2만 번 호출’을 고정 기준으로 외우면 안 되는지 알 수 있다. [진입·백에지 정책](https://github.com/openjdk/jdk25u/blob/fda231468e56663992785ec199a6efb8eca3cc7a/src/hotspot/share/compiler/compilationPolicy.cpp#L307-L361) · [큐에 따른 기준 조정](https://github.com/openjdk/jdk25u/blob/fda231468e56663992785ec199a6efb8eca3cc7a/src/hotspot/share/compiler/compilationPolicy.cpp#L386-L403)

### 정률만 보던 호출에 정액 정책이 처음 들어오면

인라이닝할 때 관찰한 타입이 도중에 바뀌는 경우도 궁금했다. 두 수수료 클래스는 시작부터 로드해 두고 정률 객체만 20만 번 넘겼다. 처음 정액 객체를 넘긴 자리에서 JFR에 **컴파일 번호 58, 호출 위치 3, 사유 `class_check`**가 찍혔다. 정률일 거라고 가정한 기계어로는 이 호출을 계속할 수 없어 그 코드를 빠져나왔다. 이런 복귀를 역최적화라고 한다. 타입 검사에서 벗어난 값을 별도 분기로 처리하는 코드도 있는데, 이번 실행은 trap 기록까지 남겼다. [타입 교체와 trap 결과](./evidence/osr-windows.txt)

인라이닝으로 여러 자바 호출이 물리 프레임 하나에 들어가도 HotSpot은 역최적화 지점에 논리 호출별 메서드, 바이트코드 위치, 지역 변수와 피연산자 위치를 기록해 둔다. 복구 시 레지스터와 스택의 값을 읽어 해당 지점에 필요한 인터프리터 프레임들로 펼친다. 이번 타입 검사 실패는 정액 메서드 본문에 들어가기 전이어서 `quote`의 인터페이스 호출을 다시 처리한다. 로그는 실패 지점을 보여 주고 프레임 복구 과정은 구현에서 확인할 수 있다. [논리 호출의 디버그 정보](https://github.com/openjdk/jdk25u/blob/fda231468e56663992785ec199a6efb8eca3cc7a/src/hotspot/share/code/scopeDesc.hpp#L46-L83) · [인터프리터 프레임 복구](https://github.com/openjdk/jdk25u/blob/fda231468e56663992785ec199a6efb8eca3cc7a/src/hotspot/share/runtime/deoptimization.cpp#L888-L905)

## 컴파일을 맡은 스레드를 누가 실행할까?

`longLoop`를 컴파일하는 동안 누가 그 루프를 돌리고 있을까. 둘은 같은 스레드일 필요가 없다. HotSpot의 `CompileBroker`가 작업을 큐에 넣으면 컴파일러 스레드가 하나씩 꺼내 C1이나 C2를 호출한다. 그 사이 요청을 받은 스레드는 자기 코드를 계속 실행할 수 있다. 아래 OpenJDK 링크는 실험과 같은 `25.0.5+8` 소스다. [컴파일 작업 등록](https://github.com/openjdk/jdk25u/blob/fda231468e56663992785ec199a6efb8eca3cc7a/src/hotspot/share/compiler/compileBroker.cpp#L1626-L1638) · [작업을 꺼내는 compiler_thread_loop](https://github.com/openjdk/jdk25u/blob/fda231468e56663992785ec199a6efb8eca3cc7a/src/hotspot/share/compiler/compileBroker.cpp#L1936-L1975)

소스에서 `CompilerThread`의 부모 타입은 `JavaThread`다. 여기서 `JavaThread`는 HotSpot 내부의 C++ 타입이다. 애플리케이션이 플랫폼 스레드를 시작할 때는 `JVM_StartThread`가 자바의 `run`으로 이어질 진입 함수를 지정한다. 컴파일러 스레드의 진입 함수는 컴파일 작업 루프로 간다. 각 스레드는 자기 진입 함수를 실행하고 종료 시 정리 절차를 밟는다. [플랫폼 스레드 생성](https://github.com/openjdk/jdk25u/blob/fda231468e56663992785ec199a6efb8eca3cc7a/src/hotspot/share/prims/jvm.cpp#L2820-L2828) · [CompilerThread의 타입](https://github.com/openjdk/jdk25u/blob/fda231468e56663992785ec199a6efb8eca3cc7a/src/hotspot/share/compiler/compilerThread.hpp#L38-L47) · [컴파일러 스레드의 진입점](https://github.com/openjdk/jdk25u/blob/fda231468e56663992785ec199a6efb8eca3cc7a/src/hotspot/share/compiler/compilerThread.cpp#L61-L68) · [JavaThread 실행과 종료](https://github.com/openjdk/jdk25u/blob/fda231468e56663992785ec199a6efb8eca3cc7a/src/hotspot/share/runtime/javaThread.cpp#L762-L790)

Linux 구현을 따라가면 결국 `pthread_create`가 나온다. HotSpot이 다음에 컴파일할 메서드를 고르면 커널 스케줄러는 실행 가능한 태스크 중 누구에게 CPU를 줄지 고른다. 이 둘이 어디서 만나는지 보려고 실행 중인 JVM의 `/proc/<pid>/task`를 열었다. 거기에 `C1 CompilerThre`와 `C2 CompilerThre`가 각각 한 줄씩 있었다. 철자가 잘린 것까지 Linux의 `comm`에 찍힌 그대로다. [HotSpot의 pthread_create](https://github.com/openjdk/jdk25u/blob/fda231468e56663992785ec199a6efb8eca3cc7a/src/hotspot/os/linux/os_linux.cpp#L1086-L1092) · [스레드 관찰 명령과 출력](./evidence/elf-and-threads.txt)

같은 버전의 Windows 구현도 플랫폼 스레드를 만든다. `os::create_thread`가 C 런타임의 `_beginthreadex`를 호출해 스레드 핸들을 받는다. Linux 쪽의 `pthread_create`와 Windows 쪽의 이 호출이 같은 자바 API 아래에서 갈라지는 지점이다. 위의 실행 기록은 Linux에서 수집했다. [OpenJDK의 Windows 스레드 생성](https://github.com/openjdk/jdk25u/blob/fda231468e56663992785ec199a6efb8eca3cc7a/src/hotspot/os/windows/os_windows.cpp#L758-L772)

커널 코드에서 **kthread**라는 이름을 만날 때는 출발점이 다르다. Linux가 자기 작업을 실행하려고 만드는 커널 스레드로, 커널의 `kthread()`가 넘겨받은 `threadfn(data)`를 부른다. JVM 프로세스 안에서 네이티브 스레드로 일하는 C2와는 진입 함수도 일감도 다르다. 커널 코드는 Linux v6.12에서 읽었다. 실제 실행 환경의 커널 버전은 아래 실험에 따로 적었다. [커널 스레드의 진입 함수](https://github.com/torvalds/linux/blob/adc218676eef25575469234709c2d87185ca223a/kernel/kthread.c#L341-L393) · [스케줄러의 다음 태스크 선택과 문맥 교환](https://github.com/torvalds/linux/blob/adc218676eef25575469234709c2d87185ca223a/kernel/sched/core.c#L6642-L6695)

## Linux가 실행 파일을 여는 순간

두 배포 방식을 파일부터 비교해 봤다. 셸에서 `java FeeRuns`를 치면 Linux가 여는 실행 파일은 `java` 런처다. Native Image의 `./fee-native`에는 처음부터 앱의 기계어가 들어 있다. 그런데 `readelf`로 두 헤더를 읽으니 둘 다 Linux AArch64용 ELF64다. 옆에 놓고 본 `FeeRuns.class`만 첫 4바이트가 `ca fe ba be`였다. [두 ELF 헤더와 클래스 파일 앞부분](./evidence/elf-and-threads.txt)

![java 런처와 fee-native는 같은 Linux ELF 로더를 거치지만 사용자 공간으로 돌아간 뒤 서로 다른 코드를 실행한다.](./02-elf-entry.svg)

`execve` 요청을 받은 커널은 해당 파일 형식을 처리할 로더를 찾는다. ELF를 맡은 `load_elf_binary()`는 헤더를 확인하고 프로그램 헤더에 따라 실행 파일의 세그먼트를 프로세스 주소 공간에 매핑한다. 이번 두 파일에는 모두 `PT_INTERP`로 `/lib/ld-linux-aarch64.so.1`가 지정돼 있었다. 그래서 먼저 사용자 공간의 동적 로더에서 실행이 시작된다. 여기서 *interpreter*는 공유 라이브러리를 연결하는 ELF 동적 로더를 가리킨다. [실행 형식에 맞는 로더 호출](https://github.com/torvalds/linux/blob/adc218676eef25575469234709c2d87185ca223a/fs/exec.c#L1730-L1753) · [ELF 헤더와 PT_INTERP 처리](https://github.com/torvalds/linux/blob/adc218676eef25575469234709c2d87185ca223a/fs/binfmt_elf.c#L843-L881) · [동적 로더 진입점](https://github.com/torvalds/linux/blob/adc218676eef25575469234709c2d87185ca223a/fs/binfmt_elf.c#L1234-L1254) · [실행 레지스터 설정](https://github.com/torvalds/linux/blob/adc218676eef25575469234709c2d87185ca223a/fs/binfmt_elf.c#L1330-L1343)

둘은 여기까지 같은 길로 들어왔다. 동적 로더가 라이브러리를 연결한 뒤부터 갈라진다. 런처를 실행한 쪽에서는 사용자 공간의 HotSpot이 `FeeRuns`를 읽고 바이트코드를 처리한다. `fee-native` 쪽은 빌드할 때 함께 넣어 둔 런타임과 앱의 기계어를 실행한다. ELF 헤더에 *interpreter*라고 적혀 있어도 이 로더가 자바 메서드를 컴파일하는 것은 아니다.

## 커널 안에서 기계어를 만드는 경우

여기까지 읽으면 커널은 파일을 띄우고 스레드를 스케줄할 뿐인 것 같다. 자바 메서드에 대해서는 그게 맞다. 그런데 소켓에 **BPF 필터**를 붙이는 순간에는 커널 안에서도 기계어를 만든다. 입력이 패킷을 통과시킬지 결정하는 필터 명령이다. Linux 자체를 빌드할 때 Kbuild가 GCC나 Clang으로 C 파일을 오브젝트 파일로 만드는 일은 부팅 전에 이미 끝났다. [Kbuild의 C 컴파일 규칙](https://github.com/torvalds/linux/blob/adc218676eef25575469234709c2d87185ca223a/scripts/Makefile.build#L144-L147)

아래는 소켓 필터의 명령 하나다. 반환값 0은 메시지를 버리라는 뜻이다. 예제는 Unix 데이터그램 소켓 한 쌍을 만들고 수신 쪽에 이 필터를 붙인다. A를 보내면 수신 큐가 비어 있다. 허용할 바이트 수를 최댓값으로 바꿔 필터를 다시 붙이면 B는 도착한다.

```c
struct sock_filter code[] = { BPF_STMT(BPF_RET | BPF_K, 0) };
```

v6.12의 ARM64 구현을 읽을 때는 두 곳을 나란히 보면 된다. `net/core/filter.c`에서 이 고전 BPF 명령은 반환 레지스터에 상수를 넣고 종료하는 eBPF 명령으로 바뀐다. 이어 `bpf_prog_select_runtime`은 아키텍처별 JIT를 호출한다. ARM64의 `build_insn`은 마지막 `EXIT`에서 함수 종료 코드로 그대로 이어 가고, 종료 코드는 ARM64의 `RET`를 내보낸다. HotSpot의 JIT는 같은 CPU를 대상으로 자바 메서드를 컴파일하지만, 이 소켓 필터가 지나는 커널 코드는 별개다. [필터 변환](https://github.com/torvalds/linux/blob/adc218676eef25575469234709c2d87185ca223a/net/core/filter.c#L812-L820) · [JIT 선택](https://github.com/torvalds/linux/blob/adc218676eef25575469234709c2d87185ca223a/kernel/bpf/core.c#L2396-L2430) · [ARM64의 EXIT 처리](https://github.com/torvalds/linux/blob/adc218676eef25575469234709c2d87185ca223a/arch/arm64/net/bpf_jit_comp.c#L1392-L1401) · [RET 생성](https://github.com/torvalds/linux/blob/adc218676eef25575469234709c2d87185ca223a/arch/arm64/net/bpf_jit_comp.c#L877-L884)

예제는 ARM64 Linux 7.0.12에서 실행했다. 커널의 `CONFIG_BPF_JIT_ALWAYS_ON` 설정과 필터 교체 전후의 수신 결과를 기록했다. 생성된 기계어 버퍼는 이 실험에서 덤프하지 않았다. [실행할 C 코드](./evidence/KernelFilter.c) · [재현 명령과 출력](./evidence/kernel-filter.txt)

## 같은 합계를 세 방식으로 계산해 보니

실제로 배포 파일을 바꿔도 계산까지 같을지, 수수료 1%를 송금액에 더하는 `quote`로 확인했다. `main`이 1원부터 100만 원까지 1원씩 올려 가며 반환값을 더한다. 마지막 합계 하나로 세 실행을 대조할 수 있다. [실행한 FeeRuns.java](./evidence/FeeRuns.java)

```java
static int fee(int amountWon) {
    return amountWon / 100;
}

static int quote(int amountWon) {
    return amountWon + fee(amountWon);
}
```

소스는 macOS arm64의 Temurin `javac 25.0.4.1`로 한 번 컴파일했다. 그 클래스 파일을 Linux arm64로 옮겨 Temurin 25.0.5+8에서 두 번 실행했다. 첫 번째는 `java -Xint FeeRuns`로 바이트코드를 해석했다. 두 번째는 JIT를 켜고 컴파일 결정을 기록했다. 두 실행의 합계는 모두 `505000010000`이었다. [재현 명령과 출력](./evidence/execution.txt)

두 번째 실행에서만 `quote`의 레벨 4 컴파일 뒤에 `@ 2   FeeRuns::fee (5 bytes)   inline (hot)`이 붙었다. 오프셋 2의 `fee` 호출이 `quote` 안으로 들어간 자리다. 두 프로그램의 합계는 같았다. 이 실행에서는 시간을 재지 않았으니 인라이닝으로 몇 초를 아꼈는지는 알 수 없다.

세 번째에는 Linux arm64의 GraalVM CE 25.0.2로 `fee-native`를 만들었다. 빌드 로그에 대상 CPU `armv8.1-a`와 Serial GC가 찍혔다. 이 파일만 Debian 13 컨테이너로 옮긴 뒤 `command -v java`부터 확인했다. PATH에 Java 런처가 없었는데도 `./fee-native`는 같은 합계를 냈다. 커널은 Docker의 `7.0.12-linuxkit`이었고 OS·CPU와 동적 라이브러리도 빌드 결과와 맞았다. [빌드·실행에 사용한 이미지와 로그](./evidence/execution.txt)

### 워밍업 중 1ms를 무엇이 차지했나

첫 정률 호출 묶음과 같은 입력의 두 번째 묶음에 JFR 사용자 이벤트로 경계를 표시했다. 각 경계 안에서 컴파일 이벤트와 겹친 횟수, 애플리케이션 정지 이벤트의 겹친 시간, 메인 스레드의 CPU 시간을 셌다. Linux의 `/proc/thread-self/schedstat` 둘째 값은 이 스레드가 실행 가능했지만 CPU를 배정받기까지 기다린 시간을 합산한다. 구간 앞뒤의 차이를 쟀다. [구간을 기록한 코드](./evidence/HotPathProbe.java) · [Linux schedstat 필드](https://docs.kernel.org/scheduler/sched-stats.html)

| 한 JVM의 연속 구간 | 경과 | 메인 스레드 CPU | 겹친 컴파일 | GC 정지 |
| --- | ---: | ---: | ---: | ---: |
| 정률 첫 10만 호출 | 1.923ms | 1.704ms | 2건 | 0ms |
| 같은 정률 다음 10만 호출 | 1.280ms | 1.214ms | 0건 | 0ms |
| 별도 배열 할당 구간 | 8.726ms | 4.547ms | 0건 | 4.009ms |

첫 정률 구간에서 다음 구간을 빼면 0.643ms다. 이걸 그대로 JIT 비용으로 쓰고 싶지만 컴파일러 스레드는 메인 스레드와 동시에 일할 수 있다. 두 정률 구간의 실행 큐 대기는 기록상 0이었다. 옆의 배열 할당 구간에서는 8.726ms 중 4.009ms가 실제 GC 정지와 겹쳤다. 이 4.009ms는 이미 경과 시간에 들어 있다.

이 표는 JVM 하나를 켜는 동안 남긴 기록이다. 운영에서 체감할 지연을 비교하려면 같은 입력으로 새 JVM을 여러 번 띄워 첫 요청과 워밍업 뒤의 분포를 각각 재야 한다. 진단 옵션을 껐을 때도 차이가 남는지 볼 필요가 있다. [기록을 집계하는 코드](./evidence/window-report.py) · [재현 명령과 구간별 결과](./evidence/osr-windows.txt)

## JDK의 AOT 캐시로도 실행 파일을 만들 수 있을까?

하나가 더 남았다. JDK 25에 붙은 `AOTCache`도 방금 만든 `fee-native`처럼 단독으로 실행할 수 있을까? 같은 클래스를 `fees.jar`로 묶고 학습 실행으로 `fees.aot`를 만들었다. 두 번째 명령에서 눈에 띄는 건 캐시 파일 앞의 `java`다.

```bash
java -XX:AOTCacheOutput=fees.aot -cp fees.jar FeeRuns
java -Xlog:aot=info,class+load=info -XX:AOTCache=fees.aot -cp fees.jar FeeRuns
```

두 번째 명령의 클래스 로드 로그는 `FeeRuns source: shared objects file`이었다. HotSpot이 공유 아카이브에서 클래스를 읽었다는 뜻이다. JDK 25는 미리 로드·링크한 클래스와 학습 때 모은 메서드 프로파일 등을 다음 JVM 시작에 쓸 수 있다. `fees.aot`를 배포할 때도 이 캐시를 읽을 JVM이 필요하다. 앞에서 Linux가 직접 실행한 파일은 `fee-native`였다. 클래스 출처만 찍힌 이 한 줄로는 `quote`의 기계어까지 재사용했는지 판별할 수 없다. [캐시 생성과 클래스 로드 로그](./evidence/aot-cache.txt) · [Oracle의 JDK 25 AOT 변경 설명](https://docs.oracle.com/en/java/javase/25/migrate/significant-changes-jdk-25.html)

`quote`의 기계어에서 `fee` 호출 자리를 찾다 보면 한 가지가 더 걸린다. 메서드가 호출자 안으로 들어가 버리면, 그 메서드가 만든 객체의 수명은 어디까지일까? [다음 실험에서는 메서드가 반환된 후에도 힙에 남는 객체를 따라간다.](/backend/transfer-performance/jvm-memory/)
