import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.URI;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;

public class FanoutLab {
    record Part(String path, String value) {}
    private final HttpClient client = HttpClient.newBuilder().version(HttpClient.Version.HTTP_1_1)
            .connectTimeout(Duration.ofSeconds(1)).build();
    private final Semaphore permits = new Semaphore(2);
    private final CountDownLatch slowStarted = new CountDownLatch(1);
    private final CountDownLatch slowFinished = new CountDownLatch(1);
    private final AtomicInteger slowEffects = new AtomicInteger();
    private final HttpServer server;
    private final URI base;

    FanoutLab(ExecutorService serverWorkers) throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 16);
        server.setExecutor(serverWorkers);
        server.createContext("/", this::handle);
        server.start();
        base = URI.create("http://127.0.0.1:" + server.getAddress().getPort());
    }

    private void handle(HttpExchange exchange) throws IOException {
        String path = exchange.getRequestURI().getPath();
        int status = 200;
        try (exchange) {
            try {
                switch (path) {
                    case "/a" -> Thread.sleep(150);
                    case "/b" -> Thread.sleep(300);
                    case "/slow" -> {
                        slowStarted.countDown();
                        Thread.sleep(600);
                        slowEffects.incrementAndGet();
                        slowFinished.countDown();
                    }
                    case "/fail" -> {
                        if (!slowStarted.await(1, TimeUnit.SECONDS)) throw new IOException("slow request not received");
                        status = 503;
                    }
                    case "/warm" -> { }
                    default -> status = 404;
                }
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                throw new IOException(e);
            }
            byte[] body = path.getBytes(StandardCharsets.US_ASCII);
            exchange.sendResponseHeaders(status, body.length);
            exchange.getResponseBody().write(body);
        }
    }

    private static long remaining(long deadline) throws TimeoutException {
        long ns = deadline - System.nanoTime();
        if (ns <= 0) throw new TimeoutException("budget expired");
        return ns;
    }

    private Part fetch(String path, long deadline) throws Exception {
        if (!permits.tryAcquire(remaining(deadline), TimeUnit.NANOSECONDS))
            throw new TimeoutException("admission deadline");
        try {
            var request = HttpRequest.newBuilder(base.resolve(path))
                    .timeout(Duration.ofNanos(remaining(deadline))).GET().build();
            var reply = client.send(request, HttpResponse.BodyHandlers.ofString());
            if (reply.statusCode() != 200) throw new IOException(path + " HTTP " + reply.statusCode());
            return new Part(path, reply.body());
        } finally {
            permits.release();
        }
    }

    private Map<String, String> join(ExecutorService workers, List<String> paths, long deadline)
            throws Exception {
        var completed = new ExecutorCompletionService<Part>(workers);
        var tasks = new ArrayList<Future<Part>>();
        var parts = new TreeMap<String, String>();
        try {
            for (var path : paths) tasks.add(completed.submit(() -> fetch(path, deadline)));
            for (int i = 0; i < paths.size(); i++) {
                var ready = completed.poll(remaining(deadline), TimeUnit.NANOSECONDS);
                if (ready == null) throw new TimeoutException("join deadline");
                var part = ready.get();
                parts.put(part.path(), part.value());
            }
            return parts;
        } finally {
            int cancelled = 0;
            for (var task : tasks) if (!task.isDone() && task.cancel(true)) cancelled++;
            if (parts.size() < paths.size() && cancelled > 0)
                System.out.println("unfinished_futures_cancelled=" + cancelled);
        }
    }

    private void compare() throws Exception {
        var paths = List.of("/a", "/b");
        try (var workers = Executors.newVirtualThreadPerTaskExecutor()) {
            join(workers, List.of("/warm", "/warm"), System.nanoTime() + TimeUnit.SECONDS.toNanos(2));
            for (String mode : List.of("serial", "platform", "virtual")) {
                try (var fixed = Executors.newFixedThreadPool(2)) {
                    var samples = new ArrayList<Long>();
                    for (int trial = 0; trial < 5; trial++) {
                        long start = System.nanoTime();
                        long deadline = start + TimeUnit.SECONDS.toNanos(2);
                        var parts = new TreeMap<String, String>();
                        if (mode.equals("serial")) {
                            for (var path : paths) {
                                var part = fetch(path, deadline);
                                parts.put(part.path(), part.value());
                            }
                        } else {
                            parts.putAll(join(mode.equals("platform") ? fixed : workers, paths, deadline));
                        }
                        if (!parts.equals(Map.of("/a", "/a", "/b", "/b"))) throw new AssertionError(parts);
                        samples.add(TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - start));
                    }
                    System.out.println(mode + " elapsed_ms=" + samples);
                }
            }
        }
    }

    private void fail(String mode) throws Exception {
        try (var workers = Executors.newVirtualThreadPerTaskExecutor()) {
            join(workers, List.of("/warm"), System.nanoTime() + TimeUnit.SECONDS.toNanos(2));
            var paths = mode.equals("failure") ? List.of("/slow", "/fail") : List.of("/slow", "/a");
            long budgetMs = mode.equals("failure") ? 1500 : 350;
            long start = System.nanoTime();
            try {
                join(workers, paths, start + TimeUnit.MILLISECONDS.toNanos(budgetMs));
                throw new AssertionError("both results unexpectedly available");
            } catch (ExecutionException | TimeoutException e) {
                Throwable cause = e instanceof ExecutionException ? e.getCause() : e;
                if (mode.equals("failure") && !String.valueOf(cause.getMessage()).contains("HTTP 503"))
                    throw e;
                if (mode.equals("timeout") && !(cause instanceof TimeoutException || cause instanceof HttpTimeoutException))
                    throw e;
                System.out.println(mode + " outcome=" + cause.getClass().getSimpleName()
                        + " elapsed_ms=" + TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - start)
                        + " slow_effects_at_join=" + slowEffects.get());
            }
            if (!slowFinished.await(2, TimeUnit.SECONDS) || slowEffects.get() != 1)
                throw new AssertionError("slow handler did not complete");
            System.out.println("slow_effects_after_server_finished=" + slowEffects.get());
        }
    }

    public static void main(String[] args) throws Exception {
        if (args.length != 1 || !List.of("compare", "failure", "timeout").contains(args[0]))
            throw new IllegalArgumentException("compare | failure | timeout");
        try (var serverWorkers = Executors.newVirtualThreadPerTaskExecutor()) {
            var lab = new FanoutLab(serverWorkers);
            try {
                if (args[0].equals("compare")) lab.compare();
                else lab.fail(args[0]);
            } finally {
                lab.server.stop(0);
                lab.client.close();
            }
        }
    }
}
