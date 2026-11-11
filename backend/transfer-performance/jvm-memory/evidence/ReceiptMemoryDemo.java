import java.lang.ref.ReferenceQueue;
import java.lang.ref.WeakReference;

public class ReceiptMemoryDemo {
    record Receipt(int feeWon) {}

    static Receipt saved;

    static Receipt make(int feeWon) {
        Receipt receipt = new Receipt(feeWon);
        return receipt;
    }

    static WeakReference<Receipt> saveForLater(ReferenceQueue<Receipt> queue) {
        Receipt local = make(100);
        saved = local;
        System.out.println("local == saved: " + (local == saved));
        return new WeakReference<>(local, queue);
    }

    public static void main(String[] args) throws InterruptedException {
        ReferenceQueue<Receipt> queue = new ReferenceQueue<>();
        WeakReference<Receipt> watched = saveForLater(queue);
        System.out.println("saved.feeWon(): " + saved.feeWon());

        saved = null;
        System.gc();
        boolean enqueued = queue.remove(2_000) == watched;
        System.out.println("enqueued within 2 s: " + enqueued);
        System.out.println("weak reference cleared: " + watched.refersTo(null));
    }
}
