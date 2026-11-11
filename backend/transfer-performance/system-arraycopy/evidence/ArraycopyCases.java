import java.util.Arrays;

public class ArraycopyCases {
    public static void main(String[] args) {
        compareOverlapDirections();
        compareWithSnapshot();
        rejectOutOfBounds();
        rejectInvalidArrayKinds();
        checkReferenceElements();
    }

    static void compareOverlapDirections() {
        String[] before = {"A", "B", "C", "D", "E"};
        String[] right = before.clone();
        System.arraycopy(right, 0, right, 1, 4);
        require(Arrays.equals(right, new String[]{"A", "A", "B", "C", "D"}));
        System.out.println("arraycopy right: " + Arrays.toString(right));

        String[] left = before.clone();
        System.arraycopy(left, 1, left, 0, 4);
        require(Arrays.equals(left, new String[]{"B", "C", "D", "E", "E"}));
        System.out.println("arraycopy left:  " + Arrays.toString(left));

        String[] forward = before.clone();
        for (int i = 0; i < 4; i++) {
            forward[i + 1] = forward[i];
        }
        require(Arrays.equals(forward, new String[]{"A", "A", "A", "A", "A"}));
        System.out.println("for loop right:  " + Arrays.toString(forward));
    }

    static void compareWithSnapshot() {
        int cases = 0;
        int zeroLength = 0;
        for (int size = 0; size <= 8; size++) {
            int[] before = new int[size];
            Arrays.setAll(before, i -> 100 + i);
            for (int length = 0; length <= size; length++) {
                for (int src = 0; src <= size - length; src++) {
                    for (int dest = 0; dest <= size - length; dest++) {
                        int[] expected = before.clone();
                        for (int i = 0; i < length; i++) {
                            expected[dest + i] = before[src + i];
                        }
                        int[] actual = before.clone();
                        System.arraycopy(actual, src, actual, dest, length);
                        if (!Arrays.equals(actual, expected)) {
                            throw new AssertionError("size=" + size + ", src=" + src
                                    + ", dest=" + dest + ", length=" + length);
                        }
                        cases++;
                        if (length == 0) zeroLength++;
                    }
                }
            }
        }
        System.out.println("snapshot matches: " + cases + ", zero length: " + zeroLength);
    }

    static void rejectOutOfBounds() {
        int[] src = {1, 2, 3};
        int[][] invalid = {
            {-1, 0, 1}, {0, -1, 1}, {0, 0, -1}, {2, 0, 2}, {0, 2, 2},
            {4, 0, 0}, {0, 4, 0}, {1, 1, Integer.MAX_VALUE}
        };
        for (int[] range : invalid) {
            int[] dest = {4, 5, 6};
            expect(IndexOutOfBoundsException.class,
                    () -> System.arraycopy(src, range[0], dest, range[1], range[2]));
            require(Arrays.equals(dest, new int[]{4, 5, 6}));
        }
        System.out.println("range failures with destination unchanged: " + invalid.length);
    }

    static void rejectInvalidArrayKinds() {
        Object[] references = {"old"};
        int[] numbers = {7};
        long[] longs = {8L};
        expect(NullPointerException.class, () -> System.arraycopy(null, 0, references, 0, 0));
        expect(NullPointerException.class, () -> System.arraycopy(references, 0, null, 0, 0));
        expect(ArrayStoreException.class, () -> System.arraycopy("text", 0, references, 0, 0));
        expect(ArrayStoreException.class, () -> System.arraycopy(references, 0, "text", 0, 0));
        expect(ArrayStoreException.class, () -> System.arraycopy(numbers, 0, longs, 0, 1));
        expect(ArrayStoreException.class, () -> System.arraycopy(numbers, 0, longs, 0, 0));
        expect(ArrayStoreException.class, () -> System.arraycopy(numbers, 0, references, 0, 1));
        expect(ArrayStoreException.class, () -> System.arraycopy(references, 0, numbers, 0, 1));
        require(Arrays.equals(references, new Object[]{"old"}));
        require(Arrays.equals(numbers, new int[]{7}));
        require(Arrays.equals(longs, new long[]{8L}));
        System.out.println("null -> NullPointerException; non-array / incompatible array kinds -> ArrayStoreException");
        System.out.println("int[] -> long[], length 0 -> ArrayStoreException");
    }

    static void checkReferenceElements() {
        Object[] mixed = {"ok", 42, "later"};
        String[] dest = {"x", "y", "z"};
        expect(ArrayStoreException.class, () -> System.arraycopy(mixed, 0, dest, 0, 3));
        require(Arrays.equals(dest, new String[]{"ok", "y", "z"}));
        System.out.println("mixed -> String[] after ArrayStoreException: " + Arrays.toString(dest));

        System.arraycopy(new Integer[]{42}, 0, dest, dest.length, 0);
        require(Arrays.equals(dest, new String[]{"ok", "y", "z"}));
        System.out.println("Integer[] -> String[], length 0: unchanged");

        Object[] compatible = {"first", null, "last"};
        System.arraycopy(compatible, 0, dest, 0, 3);
        require(Arrays.equals(dest, new String[]{"first", null, "last"}));
        System.out.println("Object[] -> String[]: " + Arrays.toString(dest));

        StringBuilder[] source = {new StringBuilder("A")};
        StringBuilder[] copy = new StringBuilder[1];
        System.arraycopy(source, 0, copy, 0, 1);
        require(source != copy && source[0] == copy[0]);
        copy[0].append("B");
        require(source[0].toString().equals("AB"));
        System.out.println("same element reference: " + (source[0] == copy[0])
                + ", value seen from source: " + source[0]);
    }

    static void expect(Class<? extends RuntimeException> expected, Runnable action) {
        try {
            action.run();
        } catch (RuntimeException failure) {
            if (expected.isInstance(failure)) return;
            throw new AssertionError("Expected " + expected.getSimpleName(), failure);
        }
        throw new AssertionError("Missing " + expected.getSimpleName());
    }

    static void require(boolean condition) {
        if (!condition) throw new AssertionError();
    }
}
