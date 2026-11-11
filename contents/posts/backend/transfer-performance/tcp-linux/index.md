---
title: "TCP 소켓에 쓴 바이트는 어떻게 도착할까"
description: "연결의 두 시퀀스 번호에서 시작해 Linux의 송신 큐, 세그먼트 전송, 수신 ACK와 애플리케이션 읽기까지 따라간다."
date: 2026-11-12
update: 2026-11-12
tags:
  - TCP
  - Linux
  - 네트워크
  - 송금
---

TCP는 연결의 양 끝에 순서가 있는 바이트 스트림을 제공한다. 각 방향의 TCP는 보낸 바이트에 순서 번호를 붙이고, 상대에게서 받은 바이트를 어디까지 확인했는지 ACK로 알린다. 프로그램이 한 번에 쓴 길이, 네트워크가 나눠 실은 길이, 상대 프로그램이 한 번에 읽은 길이는 서로 다를 수 있다. [RFC 9293의 TCP 서비스](https://www.rfc-editor.org/rfc/rfc9293.html#section-2.2)

## 연결의 시작점은 어떻게 정해지나

TCP 연결을 구분하는 값은 송신 측과 수신 측의 IP 주소 및 포트 번호 네 개다. 같은 서버 포트에 접속한 클라이언트 두 개도 상대 주소나 포트가 다르면 별도 연결이다. 각 연결에서 **양쪽은 자신의 송신 순서 번호를 따로 정한다**. [RFC 9293의 연결과 소켓 쌍](https://www.rfc-editor.org/rfc/rfc9293.html#section-3.4.1)

보통의 3단계 핸드셰이크에서 클라이언트는 초기 번호 `x`를 SYN에 싣는다. 서버는 자기 번호 `y`를 담은 SYN과 함께 `ACK x+1`로 답한다. 클라이언트가 `ACK y+1`을 보내면 양쪽의 시작점을 확인한 셈이다. SYN이 순서 번호 하나를 쓰므로, SYN에 데이터를 싣지 않은 이 예에서 첫 데이터는 각 방향의 초기 번호 다음부터 센다. [RFC 9293의 연결 수립 예시](https://www.rfc-editor.org/rfc/rfc9293.html#section-3.5)

![연결 수립 뒤 순서 번호 1000부터 8바이트를 받으면 수신 TCP는 다음 번호 1008을 ACK로 보낼 수 있다. 애플리케이션은 별도 호출로 그 데이터를 읽는다.](./01-ack-before-read.svg)

그림에서 수신 TCP가 빈틈없이 받은 데이터는 1000번부터 1007번까지다. ACK에 들어가는 `1008`은 **다음에 기다리는 바이트 번호**다. 이 번호는 수신 프로그램이 그 데이터를 읽었는지 알려주지 않는다. [RFC 9293의 시퀀스 번호](https://www.rfc-editor.org/rfc/rfc9293.html#section-3.4)

## write에서 tcp_sendmsg까지

평문 TCP 연결을 연 자바 코드에서 `socket.getOutputStream().write(bytes)`를 호출했다고 하자. OpenJDK 25 GA의 기본 소켓 구현 `NioSocketImpl`은 요청한 길이를 채울 때까지 쓰기를 진행한다. Unix의 `SocketDispatcher.write0`은 파일 디스크립터에 `write(fd, buf, len)`를 호출한다. 반환을 마쳤다는 사실은 로컬 쓰기가 끝났다는 뜻이다. 상대가 보낸 ACK는 커널이 별도로 처리한다. [OpenJDK의 소켓 쓰기](https://github.com/openjdk/jdk/blob/6c48f4ed707bf0b15f9b6098de30db8aae6fa40f/src/java.base/share/classes/sun/nio/ch/NioSocketImpl.java#L395-L455) · [Unix 네이티브 호출](https://github.com/openjdk/jdk/blob/6c48f4ed707bf0b15f9b6098de30db8aae6fa40f/src/java.base/unix/native/libnio/ch/SocketDispatcher.c#L68-L75)

커널 구현은 **Linux v6.12** 소스의 일반 IPv4 TCP 경로를 따라간다. 소켓 파일에 `write`하면 `sock_write_iter`로, `send`와 `sendto`는 `__sys_sendto`로 들어온다. 두 경로가 `__sock_sendmsg`에서 합쳐지고, IPv4의 `inet_sendmsg`가 소켓에 맞는 프로토콜을 고른다. [write 진입점](https://github.com/torvalds/linux/blob/adc218676eef25575469234709c2d87185ca223a/net/socket.c#L1148-L1166) · [send 진입점](https://github.com/torvalds/linux/blob/adc218676eef25575469234709c2d87185ca223a/net/socket.c#L2182-L2236) · [IPv4의 송신 함수 선택](https://github.com/torvalds/linux/blob/adc218676eef25575469234709c2d87185ca223a/net/ipv4/af_inet.c#L846-L855)

TCP에서는 `tcp_sendmsg`가 소켓을 잠근 뒤 `tcp_sendmsg_locked`를 호출한다. 이 함수는 데이터를 담을 자리가 있으면 기존 송신 버퍼를 이어 쓰고, 필요하면 새 `sk_buff`를 송신 큐에 붙인다. 버퍼 여유가 없으면 블로킹 쓰기가 여기서 기다릴 수도 있다. [TCP 송신 버퍼와 대기](https://github.com/torvalds/linux/blob/adc218676eef25575469234709c2d87185ca223a/net/ipv4/tcp.c#L1137-L1358)

## 세그먼트의 크기와 전송 시점

`write`로 9바이트를 두 번 넘겨도 전송 단위를 두 개로 지정한 셈은 아니다. Linux의 `tcp_write_xmit`은 전송 대기 중인 데이터를 보면서 MSS(세그먼트에 담을 TCP 데이터의 최대 크기)와 두 가지 윈도우를 확인한다. **수신 윈도우**는 상대가 더 받을 수 있다고 알린 범위다. **혼잡 윈도우**는 경로의 사정을 고려해 송신 측이 아직 확인받지 않고도 보낼 수 있는 양을 제한한다. 수신 버퍼가 넉넉해도 혼잡 윈도우에 여유가 없으면 일반적인 새 데이터 전송은 대기한다. [Linux의 전송 판단과 세그먼트 분할](https://github.com/torvalds/linux/blob/adc218676eef25575469234709c2d87185ca223a/net/ipv4/tcp_output.c#L2734-L2828) · [RFC 5681의 혼잡·수신 윈도우](https://www.rfc-editor.org/rfc/rfc5681.html#section-2)

전송할 수 있으면 `tcp_transmit_skb`가 하위 계층으로 넘긴다. TCP 세그멘테이션 오프로딩(TSO)을 쓰는 경로에서는 큰 버퍼를 넘겨 하위 계층에 분할을 맡긴다. 손실이 생기면 송신 측은 중복 ACK 등으로 손실을 추정하거나 재전송 타이머가 만료된 뒤 해당 데이터를 다시 보낸다. 재전송한 바이트에도 처음과 같은 시퀀스 번호가 붙으므로 수신 측은 중복을 식별할 수 있다. [Linux의 세그먼테이션 오프로딩](https://github.com/torvalds/linux/blob/adc218676eef25575469234709c2d87185ca223a/Documentation/networking/segmentation-offloads.rst) · [빠른 재전송](https://www.rfc-editor.org/rfc/rfc5681.html#section-3.2) · [재전송 타이머](https://www.rfc-editor.org/rfc/rfc6298.html#section-5)

## 수신 커널의 ACK와 애플리케이션의 read

IPv4 TCP 세그먼트는 수신 측의 `tcp_v4_rcv`로 들어온다. 연결이 성립한 소켓에서는 `tcp_v4_do_rcv`가 `tcp_rcv_established`로 넘긴다. 순서대로 도착한 보통의 데이터는 수신 큐에 들어가고, 커널은 이어서 ACK를 보낼지 정한다. 순서가 어긋난 데이터는 따로 보관할 수 있다. 중간 바이트가 비어 있으면 그 뒤의 데이터를 받아도 누적 ACK는 빈 구간을 건너뛰지 않는다. ACK는 조건에 따라 늦춰 보낼 수도 있으므로 매 `write`마다 ACK 하나가 돌아오리라고 셀 수 없다. [IPv4 TCP 진입점](https://github.com/torvalds/linux/blob/adc218676eef25575469234709c2d87185ca223a/net/ipv4/tcp_ipv4.c#L2176) · [연결된 소켓의 수신](https://github.com/torvalds/linux/blob/adc218676eef25575469234709c2d87185ca223a/net/ipv4/tcp_ipv4.c#L1894-L1916) · [수신 큐와 ACK 판단](https://github.com/torvalds/linux/blob/adc218676eef25575469234709c2d87185ca223a/net/ipv4/tcp_input.c#L6208-L6267)

수신 애플리케이션이 일반 소켓 `read`나 `recv`를 호출하면 이번에는 `tcp_recvmsg`가 수신 큐에서 애플리케이션 버퍼로 데이터를 복사한다. 한 번에 복사하는 길이는 앱이 요청한 길이와 지금 읽을 수 있는 데이터 등에 따라 달라진다. [읽기 함수](https://github.com/torvalds/linux/blob/adc218676eef25575469234709c2d87185ca223a/net/ipv4/tcp.c#L2836-L2853) · [사용자 버퍼로 복사](https://github.com/torvalds/linux/blob/adc218676eef25575469234709c2d87185ca223a/net/ipv4/tcp.c#L2742-L2755)

## 실험에서 ACK와 read의 순서 확인하기

루프백으로 연결한 TCP 소켓 두 개를 한 스레드에서 열었다. 송신 소켓에는 식별자와 금액을 한 줄씩 썼다. 수신 소켓은 열어만 두었다. 별도의 캡처 소켓으로 두 번째 줄의 끝을 확인하는 ACK를 본 다음에야 수신 소켓의 첫 `recv`를 호출했다.

```text
send(b'T17 1000\n') -> 9
send(b'T18 2000\n') -> 9
capture: cumulative ACK +18; receiver recv() calls so far: 0
recv(4) -> b'T17 '
recv(8) -> b'1000\nT18'
recv(6) -> b' 2000\n'
```

`+18`은 첫 데이터 바이트의 시퀀스 번호를 기준으로 계산했다. TCP의 누적 ACK 번호는 수신 측이 다음에 기다리는 바이트를 가리킨다. 이번 ACK는 앞의 18바이트가 빈틈없이 도착했다는 뜻이다. 두 번째 `recv`에서 첫 줄의 끝과 다음 줄의 시작이 함께 나왔다. 두 줄을 복원하는 기준은 애플리케이션이 정한 줄바꿈이다. [RFC 9293의 시퀀스 번호](https://www.rfc-editor.org/rfc/rfc9293.html#section-3.4)

실행 환경은 Docker Desktop의 Linux 7.0.12-linuxkit, aarch64, Python 3.12.16이다. 다음 명령은 외부 네트워크를 끈 컨테이너에서 `lo` 인터페이스만 캡처한다. 이 로그로 확인한 것은 ACK와 읽기의 순서다. 물리망에서의 패킷 수나 지연은 측정하지 않았다. [재현 코드](./evidence/ack_before_read.py) · [실행 출력](./evidence/loopback.txt)

```bash
docker run --rm --network none -i python:3.12-slim python - < ack_before_read.py
```

송금 서비스에서 클라이언트가 ACK를 받았는데 응답이 오지 않았다면 어느 단계에 와 있을까? [앞 글에서 본 GC 정지](/backend/transfer-performance/gc-timeline/) 중에도 커널은 버퍼 여유가 있는 동안 TCP 데이터를 받아 둘 수 있다. 또 서버가 이미 금액을 읽어 계좌에 기록한 후 응답만 유실됐을 수도 있다. 결과가 불명확한 송금을 다시 보내기 전에는 기존 식별자로 처리 상태를 확인해야 한다. 그렇다면 서로 독립적인 조회 두 건을 기다릴 때는 어떻게 시간을 줄일 수 있을까? [다음 글에서 외부 API 호출을 동시에 시작하고 실패한 작업을 정리하는 과정을 살펴본다.](/backend/transfer-performance/parallel-io/)
