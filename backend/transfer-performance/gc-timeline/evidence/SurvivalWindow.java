public final class SurvivalWindow {
    public static void main(String[] args) {
        var window = new byte[Integer.parseInt(args[0])][];
        for (int i = 0; i < 262_144; i++) {
            var payload = new byte[4_096];
            payload[0] = (byte) (i & 127);
            window[i % window.length] = payload;
        }
        long checksum = 0;
        for (byte[] item : window) checksum += item[0];
        System.out.println("retained=" + window.length + ", checksum=" + checksum);
    }
}
