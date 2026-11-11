public class FeeDemo {
    interface FeePolicy {
        int fee(int amountWon);
    }

    static final class RateFee implements FeePolicy {
        @Override
        public int fee(int amountWon) {
            return amountWon / 100;
        }
    }

    static final class FlatFee implements FeePolicy {
        @Override
        public int fee(int amountWon) {
            return 100;
        }
    }

    static int quote(FeePolicy policy, int amountWon) {
        return policy.fee(amountWon);
    }

    public static void main(String[] args) {
        FeePolicy rate = new RateFee();
        FeePolicy flat = new FlatFee();
        FeePolicy policy = Boolean.getBoolean("flatFee") ? flat : rate;
        long totalFeesWon = 0;
        for (int amountWon = 1; amountWon <= 1_000_000; amountWon++) {
            totalFeesWon += quote(policy, amountWon);
        }
        System.out.println(totalFeesWon);
    }
}
