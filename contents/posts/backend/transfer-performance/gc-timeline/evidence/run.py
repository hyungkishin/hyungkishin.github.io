"""Run with Python 3 and a JDK on PATH. Supply an empty output directory."""
import csv
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import time

out = Path(sys.argv[1])
out.mkdir(parents=True, exist_ok=True)
if any(out.iterdir()):
    sys.exit("Choose an empty output directory.")
source = Path(__file__).resolve().with_name("AllocationWindow.java")
pause_pattern = re.compile(r"^\[\d+ns\]\[gc\s*\]\s+GC\(\d+\) (Pause .*?) ([\d.]+)ms$", re.M)
with tempfile.TemporaryDirectory() as classes, (out / "runs.csv").open("w", newline="") as summary:
    subprocess.run(["javac", "-d", classes, str(source)], check=True)
    writer = csv.writer(summary, lineterminator="\n")
    writer.writerow(["order", "heap_MiB", "wall_ms", "pause_count", "pause_sum_ms", "max_pause_ms", "full_count", "stdout"])
    for order, heap in enumerate([48, 96, 96, 48, 48, 96, 96, 48], start=1):
        log = out / f"run-{order:02d}-{heap}m.log"
        command = [
            "java", "-cp", classes, "-XX:+UseG1GC", "-XX:ActiveProcessorCount=4",
            f"-Xms{heap}m", f"-Xmx{heap}m",
            f"-Xlog:gc,gc+start,gc+marking:file={log}:uptimenanos,tags",
            "AllocationWindow",
        ]
        start = time.perf_counter_ns()
        result = subprocess.run(command, capture_output=True, text=True, check=True)
        wall_ms = (time.perf_counter_ns() - start) / 1_000_000
        pauses = pause_pattern.findall(log.read_text())
        durations = [float(duration) for _, duration in pauses]
        writer.writerow([
            order, heap, f"{wall_ms:.3f}", len(pauses), f"{sum(durations):.3f}",
            f"{max(durations):.3f}", sum(label.startswith("Pause Full") for label, _ in pauses),
            result.stdout.strip(),
        ])
