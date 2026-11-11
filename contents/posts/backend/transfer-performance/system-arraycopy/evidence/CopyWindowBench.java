package bench;

import java.util.Arrays;
import java.util.concurrent.TimeUnit;
import org.openjdk.jmh.annotations.*;

@State(Scope.Thread)
@BenchmarkMode(Mode.AverageTime)
@OutputTimeUnit(TimeUnit.NANOSECONDS)
@Fork(3)
@Warmup(iterations = 2, time = 500, timeUnit = TimeUnit.MILLISECONDS)
@Measurement(iterations = 3, time = 500, timeUnit = TimeUnit.MILLISECONDS)
public class CopyWindowBench {
    private static final int CHUNK = 1024;
    @Param({"1", "256", "16384"})
    public int slots;
    private int[] source;
    private int[] target;
    private int slot;

    @Setup(Level.Trial)
    public void setup() {
        source = new int[slots * CHUNK];
        target = new int[source.length];
        Arrays.setAll(source, i -> i + 1);
    }

    @Benchmark
    public int[] copy() {
        slot = (slot + 37) & (slots - 1);
        int offset = slot * CHUNK;
        System.arraycopy(source, offset, target, offset, CHUNK);
        return target;
    }

    @TearDown(Level.Trial)
    public void check() {
        if (!Arrays.equals(source, target)) throw new AssertionError();
    }
}
