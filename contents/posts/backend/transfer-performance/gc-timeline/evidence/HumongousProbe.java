import java.lang.ref.Reference;

public final class HumongousProbe {
    public static void main(String[] args) {
        int length = Integer.parseInt(args[0]);
        byte[][] live = new byte[3][];
        for (int index = 0; index < live.length; index++) {
            live[index] = new byte[length];
            live[index][0] = (byte) (index + 1);
        }
        System.out.println("live arrays = " + live.length + ", payload bytes per array = " + length);
        System.gc();
        System.out.println("retained first bytes = " + (live[0][0] + live[1][0] + live[2][0]));
        Reference.reachabilityFence(live);
    }
}
