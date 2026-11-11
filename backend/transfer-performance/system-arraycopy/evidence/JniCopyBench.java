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
public class JniCopyBench {
    @Param({"16", "4096"})
    public int count;
    private int[] source;
    private int[] target;

    static { System.loadLibrary("copybench"); }
    private static native void copyElements(int[] src, int[] dst, int n);
    private static native void copyRegions(int[] src, int[] dst, int n);
    private static native boolean elementAccessCopied(int[] array);

    @Setup(Level.Trial)
    public void setup() {
        source = new int[count];
        target = new int[count];
        Arrays.setAll(source, i -> 17 + i);
    }

    @Setup(Level.Iteration)
    public void clear() { Arrays.fill(target, 0); }

    @TearDown(Level.Iteration)
    public void check() {
        if (!Arrays.equals(source, target)) throw new AssertionError();
    }

    @Benchmark
    public int[] intrinsic() {
        System.arraycopy(source, 0, target, 0, count);
        return target;
    }

    @Benchmark
    public int[] jniElements() {
        copyElements(source, target, count);
        return target;
    }

    @Benchmark
    public int[] jniRegions() {
        copyRegions(source, target, count);
        return target;
    }

    public static void main(String[] args) {
        for (int size : new int[]{16, 4096}) {
            System.out.printf("length=%d GetIntArrayElements.isCopy=%s%n",
                    size, elementAccessCopied(new int[size]));
        }
    }

    @State(Scope.Thread)
    @BenchmarkMode(Mode.AverageTime)
    @OutputTimeUnit(TimeUnit.NANOSECONDS)
    @Fork(3)
    @Warmup(iterations = 2, time = 500, timeUnit = TimeUnit.MILLISECONDS)
    @Measurement(iterations = 3, time = 500, timeUnit = TimeUnit.MILLISECONDS)
    public static class CallOnly {
        static { System.loadLibrary("copybench"); }
        @Param({"17"})
        public int value;
        private static native int echo(int value);

        @Benchmark
        public int javaEcho() { return value; }

        @Benchmark
        public int jniEcho() { return echo(value); }
    }
}
