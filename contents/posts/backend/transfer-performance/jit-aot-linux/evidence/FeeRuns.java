public final class FeeRuns {
    static int fee(int amountWon) {
        return amountWon / 100;
    }

    static int quote(int amountWon) {
        return amountWon + fee(amountWon);
    }

    public static void main(String[] args) throws Exception {
        long total = 0;
        for (int amount = 1; amount <= 1_000_000; amount++) {
            total += quote(amount);
        }
        System.out.println("totalWon=" + total);
        if (args.length == 1 && args[0].equals("hold")) {
            System.in.read();
        }
    }
}
