"""In-memory event log — a bounded ring buffer the frontend polls to show a
live activity feed (which company is being processed, API summaries, etc.).

Not persisted; it's a live tail. Kept small so polling stays cheap.
"""
import itertools
import time
from collections import deque

_events: deque[dict] = deque(maxlen=1000)
_counter = itertools.count(1)


def log_event(message: str, source: str = "api", level: str = "info") -> None:
    _events.append({
        "id": next(_counter),
        "ts": time.time(),
        "level": level,      # info | success | warn | error
        "source": source,    # http | snapshot | picker | …
        "message": message,
    })


def get_events(after: int = 0, limit: int = 500) -> list[dict]:
    out = [e for e in _events if e["id"] > after]
    return out[-limit:]


def clear_events() -> None:
    _events.clear()
