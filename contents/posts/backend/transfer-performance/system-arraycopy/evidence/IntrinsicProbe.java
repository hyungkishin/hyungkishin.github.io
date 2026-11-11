import java.util.Arrays;

public final class IntrinsicProbe {
    static void copy(int[] source, int from, int[] target, int to, int count) {
        System.arraycopy(source, from, target, to, count);
    }

    public static void main(String[] args) {
        int[] source = new int[128];
        int[] target = new int[128];
        for (int i = 0; i < source.length; i++) {
            source[i] = i;
        }
        long checksum = 0;
        for (int i = 0; i < 100_000; i++) {
            int from = i & 15;
            int to = (i >>> 4) & 15;
            int count = 64 + (i & 7);
            int[] destination = (i & 1) == 0 ? target : source;
            copy(source, from, destination, to, count);
            checksum += destination[to + count - 1];
        }
        int[] right = {0, 1, 2, 3, 4, 5};
        int[] left = right.clone();
        copy(right, 0, right, 2, 4);
        copy(left, 2, left, 0, 4);
        System.out.println("checksum=" + checksum);
        System.out.println("right=" + Arrays.toString(right));
        System.out.println("left=" + Arrays.toString(left));
    }
}
