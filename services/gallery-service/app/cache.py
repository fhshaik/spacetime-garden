"""
Tiny LRU cache with TTL. Purpose-built so we don't pull in cachetools for
one feature. Module-level instance lives in routers/gallery.py.

Not thread-safe across processes (gunicorn workers each have their own),
but workers are independent and the TTL is short — eventual consistency
is fine for a public gallery.
"""

import time
from collections import OrderedDict


class TTLCache[K, V]:
    def __init__(self, maxsize: int = 128, ttl_seconds: float = 60.0) -> None:
        self._maxsize = maxsize
        self._ttl = ttl_seconds
        self._data: OrderedDict[K, tuple[float, V]] = OrderedDict()

    def get(self, key: K) -> V | None:
        entry = self._data.get(key)
        if entry is None:
            return None
        expires_at, value = entry
        if time.monotonic() >= expires_at:
            self._data.pop(key, None)
            return None
        self._data.move_to_end(key)
        return value

    def set(self, key: K, value: V) -> None:
        self._data[key] = (time.monotonic() + self._ttl, value)
        self._data.move_to_end(key)
        while len(self._data) > self._maxsize:
            self._data.popitem(last=False)

    def clear(self) -> None:
        self._data.clear()

    def __len__(self) -> int:
        return len(self._data)
