import java.nio.file.*;
import java.time.Duration;
import java.util.concurrent.locks.LockSupport;
import jdk.jfr.Recording;
import jdk.jfr.consumer.RecordingFile;

public class PinProbe {
    private static final Object monitor = new Object();
    static native void callback();
    static void waitInJava() { LockSupport.parkNanos(Duration.ofMillis(150).toNanos()); }

    public static void main(String[] args) throws Exception {
        if (args.length != 1 || !(args[0].equals("monitor") || args[0].equals("native")))
            throw new IllegalArgumentException("monitor | native");
        if (args[0].equals("native")) System.loadLibrary("pinprobe");
        Path file = Files.createTempFile("pin-probe-", ".jfr");
        try (var recording = new Recording()) {
            recording.enable("jdk.VirtualThreadPinned").withThreshold(Duration.ofMillis(20)).withStackTrace();
            recording.start();
            Thread.startVirtualThread(() -> {
                if (args[0].equals("native")) callback();
                else synchronized (monitor) { waitInJava(); }
            }).join();
            recording.stop();
            recording.dump(file);
            int matches = 0;
            for (var event : RecordingFile.readAllEvents(file)) {
                if (!event.getEventType().getName().equals("jdk.VirtualThreadPinned") ||
                    event.getStackTrace() == null) continue;
                if (event.getStackTrace().getFrames().stream().anyMatch(frame ->
                        frame.getMethod().getType().getName().equals("PinProbe") &&
                        frame.getMethod().getName().equals("waitInJava"))) {
                    matches++;
                    System.out.println(event.getEventType().getName() + " duration_ms=" + event.getDuration().toMillis());
                }
            }
            System.out.println("java=" + Runtime.version() + " mode=" + args[0] + " matching_events=" + matches);
        } finally {
            Files.deleteIfExists(file);
        }
    }
}
