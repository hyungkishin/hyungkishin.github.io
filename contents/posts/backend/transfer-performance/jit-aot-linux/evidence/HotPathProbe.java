import java.lang.management.ManagementFactory;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import jdk.jfr.Event;
import jdk.jfr.Name;
import jdk.jfr.Recording;

public class HotPathProbe {
    interface Rule { int value(int price); }
    static final class Rate implements Rule { public int value(int p) { return p / 100; } }
    static final class Flat implements Rule { public int value(int p) { return 7; } }
    static volatile byte[] allocation;
    static long checksum;

    @Name("lab.Window")
    static class Window extends Event {
        String phase;
        long threadCpuNanos;
        long runQueueNanos;
    }

    static int quote(Rule rule, int price) {
        return price + rule.value(price);
    }

    static long longLoop(int iterations) {
        long state = 17;
        for (int i = 0; i < iterations; i++) {
            state = (state ^ i) * 31 + 7;
        }
        return state;
    }

    static long schedulerWait() throws Exception {
        return Long.parseLong(Files.readString(Path.of("/proc/thread-self/schedstat"))
                .trim().split("\\s+")[1]);
    }

    static void window(String name, Runnable operation) throws Exception {
        var threads = ManagementFactory.getThreadMXBean();
        if (!threads.isCurrentThreadCpuTimeSupported()) throw new IllegalStateException();
        if (!threads.isThreadCpuTimeEnabled()) threads.setThreadCpuTimeEnabled(true);
        Window event = new Window();
        event.phase = name;
        long waited = schedulerWait();
        long cpu = threads.getCurrentThreadCpuTime();
        event.begin();
        operation.run();
        event.end();
        event.threadCpuNanos = threads.getCurrentThreadCpuTime() - cpu;
        event.runQueueNanos = schedulerWait() - waited;
        event.commit();
    }

    static void quotes(Rule rule) {
        long total = 0;
        for (int i = 1; i <= 100_000; i++) total += quote(rule, i);
        checksum += total;
    }

    public static void main(String[] args) throws Exception {
        Rule rate = new Rate();
        Rule flat = new Flat();
        try (Recording r = new Recording()) {
            r.enable(Window.class);
            r.enable("jdk.Compilation").withThreshold(Duration.ZERO);
            r.enable("jdk.GCPhasePause").withThreshold(Duration.ZERO);
            r.enable("jdk.Deoptimization");
            r.start();
            window("one-long-invocation", () -> checksum += longLoop(12_000_000));
            window("first-rate", () -> quotes(rate));
            window("same-rate", () -> quotes(rate));
            window("first-flat", () -> quotes(flat));
            window("allocation-control", () -> {
                for (int i = 0; i < 4096; i++) allocation = new byte[32 * 1024];
            });
            r.stop();
            r.dump(Path.of("hot.jfr"));
        }
        System.out.println("checksum=" + checksum);
    }
}
