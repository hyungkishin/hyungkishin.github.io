#include <errno.h>
#include <limits.h>
#include <linux/filter.h>
#include <stdio.h>
#include <stdlib.h>
#include <sys/socket.h>
#include <unistd.h>

static void fail(const char *operation) {
    perror(operation);
    exit(EXIT_FAILURE);
}

static void attach_verdict(int receiver, unsigned int bytes_to_keep) {
    struct sock_filter code[] = { BPF_STMT(BPF_RET | BPF_K, bytes_to_keep) };
    struct sock_fprog program = { .len = 1, .filter = code };
    if (setsockopt(receiver, SOL_SOCKET, SO_ATTACH_FILTER, &program, sizeof(program)) < 0)
        fail("setsockopt");
}

int main(void) {
    int pair[2];
    char byte;
    if (socketpair(AF_UNIX, SOCK_DGRAM, 0, pair) < 0)
        fail("socketpair");

    attach_verdict(pair[1], 0);
    if (send(pair[0], "A", 1, 0) != 1)
        fail("send A");
    ssize_t received = recv(pair[1], &byte, 1, MSG_DONTWAIT);
    if (received != -1 || (errno != EAGAIN && errno != EWOULDBLOCK)) {
        fputs("unexpected receive after drop\n", stderr);
        return EXIT_FAILURE;
    }
    puts("RET 0: A sent, receiver queue empty");

    attach_verdict(pair[1], UINT_MAX);
    if (send(pair[0], "B", 1, 0) != 1)
        fail("send B");
    if (recv(pair[1], &byte, 1, MSG_DONTWAIT) != 1 || byte != 'B') {
        fputs("expected B after accept\n", stderr);
        return EXIT_FAILURE;
    }
    puts("RET UINT_MAX: B sent, B received");
    close(pair[0]);
    close(pair[1]);
    return EXIT_SUCCESS;
}
