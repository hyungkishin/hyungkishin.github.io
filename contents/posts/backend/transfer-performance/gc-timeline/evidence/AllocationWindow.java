public class AllocationWindow {
    public static void main(String[] args) {
        byte[][] recent = new byte[128][];
        byte[][] history = new byte[5_120][];
        int historySlot = 0;

        for (int i = 0; i < 2_097_152; i++) {
            byte[] payload = new byte[4_096];
            payload[0] = (byte) (i >>> 8);
            recent[i % recent.length] = payload;
            if (i % 4 == 0) {
                history[historySlot] = payload;
                historySlot = (historySlot + 1) % history.length;
            }
        }

        long checksum = 0;
        for (byte[] payload : recent) {
            checksum += Byte.toUnsignedInt(payload[0]);
        }
        for (byte[] payload : history) {
            checksum += Byte.toUnsignedInt(payload[0]);
        }
        System.out.println("checksum=" + checksum);
    }
}
