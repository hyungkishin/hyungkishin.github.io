public class HeapLimitProbe {
    static byte initialValue(int i) {
        return (byte) (i ^ (i >>> 8));
    }

    public static void main(String[] args) {
        if (args.length != 1 || !(args[0].equals("direct") || args[0].equals("temporary"))) {
            throw new IllegalArgumentException("usage: HeapLimitProbe direct|temporary");
        }
        byte[] data = new byte[17 * 1024 * 1024];
        for (int i = 0; i < data.length; i++) {
            data[i] = initialValue(i);
        }
        int count = data.length - 1;
        System.out.println("mode=" + args[0] + ", elements=" + count);
        if (args[0].equals("direct")) {
            System.arraycopy(data, 0, data, 1, count);
        } else {
            byte[] snapshot = new byte[count];
            System.arraycopy(data, 0, snapshot, 0, count);
            System.arraycopy(snapshot, 0, data, 1, count);
        }
        for (int i = 0; i < data.length; i++) {
            int originalIndex = i == 0 ? 0 : i - 1;
            if (data[i] != initialValue(originalIndex)) {
                throw new AssertionError("wrong value at " + i);
            }
        }
        System.out.println("verified=" + data.length);
    }
}
