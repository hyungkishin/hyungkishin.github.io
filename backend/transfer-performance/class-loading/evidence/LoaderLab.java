import java.lang.ref.WeakReference;
import java.net.URL;
import java.net.URLClassLoader;
import java.nio.file.Path;
import java.util.concurrent.CountDownLatch;

public final class LoaderLab {
    private static final CountDownLatch started = new CountDownLatch(2);
    private static ClassLoader pluginRegistry;

    public static void main(String[] args) throws Exception {
        switch (args[0]) {
            case "chain" -> {
                for (ClassLoader loader = LoaderLab.class.getClassLoader(); loader != null; loader = loader.getParent()) {
                    System.out.println(loader.getName());
                }
                System.out.println("String defining loader = " + String.class.getClassLoader());
            }
            case "initialization" -> {
                System.out.println("recursive read = " + Recursive.value);
                for (int attempt = 1; attempt <= 2; attempt++) {
                    try {
                        System.out.println(Broken.value);
                        throw new AssertionError("expected initialization failure");
                    } catch (LinkageError failure) {
                        System.out.println("attempt " + attempt + " = " + failure.getClass().getSimpleName()
                                + ", cause = " + failure.getCause().getClass().getSimpleName());
                    }
                }
            }
            case "identity" -> {
                try (var first = loader(args[1]); var second = loader(args[1])) {
                    Class<?> a = first.loadClass("plug.Entry");
                    Class<?> b = second.loadClass("plug.Entry");
                    var value = b.getConstructor().newInstance();
                    System.out.println("same name = " + a.getName().equals(b.getName()) + ", same Class = " + (a == b));
                    try {
                        a.cast(value);
                        throw new AssertionError("cross-loader cast succeeded");
                    } catch (ClassCastException failure) {
                        System.out.println(failure);
                    }
                }
            }
            case "unload" -> {
                var reference = install(args[1]);
                System.gc();
                System.out.println("registry populated; loader reachable = " + !reference.refersTo(null));
                pluginRegistry = null;
                for (int i = 0; i < 20 && !reference.refersTo(null); i++) System.gc();
                System.out.println("registry cleared; loader collected = " + reference.refersTo(null));
            }
            case "cycle" -> {
                Thread.ofPlatform().name("init-A").daemon().start(() -> System.out.println(A.value));
                Thread.ofPlatform().name("init-B").daemon().start(() -> System.out.println(B.value));
                started.await();
                System.out.println("both initializers entered");
                // Keep the process available for an external thread dump until stdin closes.
                System.in.read();
            }
            default -> throw new IllegalArgumentException(args[0]);
        }
    }

    private static URLClassLoader loader(String jar) throws Exception {
        return new URLClassLoader(new URL[]{Path.of(jar).toUri().toURL()}, ClassLoader.getPlatformClassLoader());
    }

    private static WeakReference<ClassLoader> install(String jar) throws Exception {
        try (var loader = loader(jar)) {
            loader.loadClass("plug.Entry").getConstructor().newInstance();
            pluginRegistry = loader;
            return new WeakReference<>(loader);
        }
    }

    static final class Broken {
        static final int value = Integer.parseInt("broken");
    }
    static final class Recursive {
        static final int value = read() + 1;
        static int read() { return value; }
    }
    static final class A {
        static final int value = initialize();
        static int initialize() { meet(); return B.value; }
    }
    static final class B {
        static final int value = initialize();
        static int initialize() { meet(); return A.value; }
    }
    static void meet() {
        started.countDown();
        try {
            started.await();
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException(interrupted);
        }
    }
}
