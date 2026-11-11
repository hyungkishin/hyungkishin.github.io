public class AddWarmup {
    static int sum(int left, int right) {
        return left + right;
    }

    public static void main(String[] args) {
        int value = 0;
        for (int i = 0; i < 100_000; i++)
            value = sum(value, i);
        System.out.println(value);
    }
}
