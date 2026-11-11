import java.util.Arrays;

public final class ReferencePaths {
    static void copyStrings(String[] source, String[] target, int length) {
        System.arraycopy(source, 0, target, 0, length);
    }

    static void copyChecked(Object[] source, String[] target, int length) {
        System.arraycopy(source, 0, target, 0, length);
    }

    public static void main(String[] args) {
        String[] strings = {"first", "second", "third"};
        Object[] objects = {"first", "second", "third"};
        String[] target = {"-", "-", "-"};
        for (int i = 0; i < 40_000; i++) {
            int length = 1 + i % 3;
            copyStrings(strings, target, length);
            copyChecked(objects, target, length);
        }
        System.out.println("before=" + Arrays.toString(target));
        try {
            copyChecked(new Object[]{"written", Integer.valueOf(7), "skipped"}, target, 3);
            throw new AssertionError("expected ArrayStoreException");
        } catch (ArrayStoreException expected) {
            System.out.println("exception=" + expected.getClass().getSimpleName());
            System.out.println("after=" + Arrays.toString(target));
        }
    }
}
