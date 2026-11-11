package bench;

import java.util.Arrays;
import java.util.concurrent.TimeUnit;
import org.openjdk.jmh.annotations.Benchmark;
import org.openjdk.jmh.annotations.BenchmarkMode;
import org.openjdk.jmh.annotations.Fork;
import org.openjdk.jmh.annotations.Level;
import org.openjdk.jmh.annotations.Measurement;
import org.openjdk.jmh.annotations.Mode;
import org.openjdk.jmh.annotations.OutputTimeUnit;
import org.openjdk.jmh.annotations.Param;
import org.openjdk.jmh.annotations.Scope;
import org.openjdk.jmh.annotations.Setup;
import org.openjdk.jmh.annotations.State;
import org.openjdk.jmh.annotations.TearDown;
import org.openjdk.jmh.annotations.Warmup;

@State(Scope.Thread)
@BenchmarkMode(Mode.AverageTime)
@OutputTimeUnit(TimeUnit.NANOSECONDS)
@Fork(3)
@Warmup(iterations = 3, time = 1)
@Measurement(iterations = 5, time = 1)
public class CopyLengthBench {
    private static final int CAPACITY = 100_000;

    @Param({"10000", "100000"})
    public int count;

    private int[] source;
    private int[] destination;

    @Setup(Level.Trial)
    public void allocate() {
        source = new int[CAPACITY];
        destination = new int[CAPACITY];
        Arrays.setAll(source, index -> index + 1);
    }

    @Setup(Level.Iteration)
    public void clearDestination() {
        Arrays.fill(destination, 0);
    }

    @Benchmark
    public int[] copy() {
        System.arraycopy(source, 0, destination, 0, count);
        return destination;
    }

    @TearDown(Level.Iteration)
    public void checkContents() {
        for (int index = 0; index < destination.length; index++) {
            int expected = index < count ? source[index] : 0;
            if (destination[index] != expected) {
                throw new AssertionError("unexpected value at index " + index);
            }
        }
    }
}
