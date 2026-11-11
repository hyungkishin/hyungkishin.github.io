import kotlinx.coroutines.*

private suspend fun part(gate: CompletableDeferred<Unit>, value: String): String {
    val caller = Thread.currentThread()
    println("A waiting")
    gate.await()
    println("A resumed on same thread=" + (Thread.currentThread() === caller))
    return value.uppercase()
}

fun main() = runBlocking {
    val gate = CompletableDeferred<Unit>()
    val a = async(start = CoroutineStart.UNDISPATCHED) { part(gate, "a") }
    val b = async { println("B releases A"); gate.complete(Unit); "B" }
    check(awaitAll(a, b) == listOf("A", "B"))

    var cleaned = false
    try {
        coroutineScope {
            launch(start = CoroutineStart.UNDISPATCHED) {
                try { awaitCancellation() } finally { cleaned = true }
            }
            launch { error("required child failed") }
        }
    } catch (e: IllegalStateException) {
        check(e.message == "required child failed")
    }
    check(cleaned)
    println("sibling finally ran=" + cleaned)
}
