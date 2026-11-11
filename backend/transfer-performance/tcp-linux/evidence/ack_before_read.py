"""Observe a cumulative TCP ACK before the accepted socket is read.

Run on Linux in an isolated network namespace with CAP_NET_RAW.
"""
import platform
import socket
import struct
import time
from contextlib import closing

FIRST = b"T17 1000\n"
SECOND = b"T18 2000\n"


def wait_for_ack(capture, client_port, server_port, expected):
    # Linux exposes loopback IPv4 packets with an Ethernet header to AF_PACKET.
    first_seq = None
    deadline = time.monotonic() + 5
    while time.monotonic() < deadline:
        capture.settimeout(max(0.001, deadline - time.monotonic()))
        frame = capture.recv(65535)
        if frame[12:14] != b"\x08\x00" or frame[23] != socket.IPPROTO_TCP:
            continue
        ip = frame[14:]
        tcp = ip[(ip[0] & 15) * 4 : int.from_bytes(ip[2:4], "big")]
        source, dest, seq, ack = struct.unpack_from("!HHII", tcp)
        payload = tcp[(tcp[12] >> 4) * 4 :]
        if (source, dest) == (client_port, server_port) and payload.startswith(FIRST):
            first_seq = seq
        elif (source, dest) == (server_port, client_port) and first_seq is not None:
            if tcp[13] & 0x10 and (ack - first_seq) % (1 << 32) == expected:
                return expected
    raise TimeoutError("The requested cumulative ACK was not captured")


def main():
    print(f"{platform.system()} {platform.release()} {platform.machine()}, Python {platform.python_version()}")
    with socket.socket() as listener, socket.socket() as sender:
        listener.settimeout(5)
        sender.settimeout(5)
        listener.bind(("127.0.0.1", 0))
        listener.listen(1)
        sender.connect(listener.getsockname())
        with closing(listener.accept()[0]) as receiver, socket.socket(
            socket.AF_PACKET, socket.SOCK_RAW, socket.htons(0x0003)
        ) as capture:
            capture.bind(("lo", 0))
            receiver.settimeout(5)
            # The same thread holds the receiver. No recv can run during capture.
            for message in (FIRST, SECOND):
                written = sender.send(message)
                if written != len(message):
                    raise RuntimeError(f"partial send: {written}/{len(message)}")
                print(f"send({message!r}) -> {written}")
            expected = len(FIRST + SECOND)
            acked = wait_for_ack(capture, sender.getsockname()[1], receiver.getsockname()[1], expected)
            print(f"capture: cumulative ACK +{acked}; receiver recv() calls so far: 0")
            received = bytearray()
            limits = iter((4, 8))
            while len(received) < expected:
                limit = next(limits, expected - len(received))
                part = receiver.recv(limit)
                if not part:
                    raise EOFError("stream ended before both requests were read")
                received.extend(part)
                print(f"recv({limit}) -> {part!r}")
            if received != FIRST + SECOND:
                raise RuntimeError(f"unexpected bytes: {received!r}")
            print(f"newline-delimited records: {bytes(received).splitlines()}")

if __name__ == "__main__":
    main()
