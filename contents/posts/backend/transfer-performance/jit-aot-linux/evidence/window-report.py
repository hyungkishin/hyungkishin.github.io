"""Summarize 'jfr print --json' for the events recorded by HotPathProbe."""
import json
import sys
from datetime import datetime
from decimal import Decimal

def timestamp_ns(value):
    whole, _, fractional = value.removesuffix("Z").partition(".")
    second = int(datetime.fromisoformat(whole + "+00:00").timestamp())
    return second * 1_000_000_000 + int(fractional.ljust(9, "0"))

def duration_ns(value):
    return int(Decimal(value.removeprefix("PT").removesuffix("S")) * 1_000_000_000)

with open(sys.argv[1]) as source:
    events = json.load(source)["recording"]["events"]

def interval(event):
    values = event["values"]
    start = timestamp_ns(values["startTime"])
    return start, start + duration_ns(values.get("duration", "PT0S"))

print("phase                       wall_ms   cpu_ms  runq_ms  compiles  traps  GC_pause_ms")
for window in (e for e in events if e["type"] == "lab.Window"):
    start, end = interval(window)
    compilations = traps = pause = 0
    for event in events:
        t0, t1 = interval(event)
        overlap = max(0, min(end, t1) - max(start, t0))
        if event["type"] == "jdk.Compilation" and overlap:
            compilations += 1
        elif event["type"] == "jdk.Deoptimization" and start <= t0 < end:
            traps += 1
        elif event["type"] == "jdk.GCPhasePause":
            pause += overlap
    v = window["values"]
    print(f'{v["phase"]:24} {(end-start)/1e6:8.3f} {v["threadCpuNanos"]/1e6:8.3f}'
          f' {v["runQueueNanos"]/1e6:8.3f} {compilations:9} {traps:6} {pause/1e6:12.3f}')
