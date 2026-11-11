import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;

public class AdmissionLab {
    enum Decision { START, IN_FLIGHT_LIMIT, RATE_LIMIT }

    static final class Gate {
        private final Semaphore slots = new Semaphore(1);
        private final int capacity = 2;
        private int tokens = capacity;
        private long lastRefill;

        Gate(long now) { lastRefill = now; }

        synchronized Decision tryStart(long now) {
            long period = TimeUnit.SECONDS.toNanos(1);
            long elapsedPeriods = (now - lastRefill) / period;
            if (elapsedPeriods > 0) {
                tokens = (int) Math.min(capacity, tokens + elapsedPeriods);
                lastRefill += elapsedPeriods * period;
            }
            if (!slots.tryAcquire()) return Decision.IN_FLIGHT_LIMIT;
            if (tokens == 0) {
                slots.release();
                return Decision.RATE_LIMIT;
            }
            tokens--;
            return Decision.START;
        }

        void finish() { slots.release(); } // Exactly once, in a started call's finally block.
    }

    static void check(Gate gate, long ms, Decision expected) {
        var actual = gate.tryStart(TimeUnit.MILLISECONDS.toNanos(ms));
        if (actual != expected) throw new AssertionError(actual);
        System.out.printf("t=%d ms %s%n", ms, actual);
    }

    public static void main(String[] args) {
        Gate gate = new Gate(0);
        check(gate, 0, Decision.START);
        check(gate, 0, Decision.IN_FLIGHT_LIMIT);
        gate.finish();
        check(gate, 50, Decision.START);
        gate.finish();
        check(gate, 100, Decision.RATE_LIMIT);
        check(gate, 1000, Decision.START);
        gate.finish();
    }
}
