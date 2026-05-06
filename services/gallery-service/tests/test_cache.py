"""Unit tests for the TTLCache. These are independent of the DB or HTTP."""

import time

from app.cache import TTLCache


def test_set_then_get_returns_value() -> None:
    cache: TTLCache[str, int] = TTLCache(maxsize=10, ttl_seconds=60)
    cache.set("a", 1)
    assert cache.get("a") == 1


def test_get_missing_returns_none() -> None:
    cache: TTLCache[str, int] = TTLCache()
    assert cache.get("missing") is None


def test_expired_entry_returns_none_and_evicts() -> None:
    cache: TTLCache[str, int] = TTLCache(ttl_seconds=0.01)
    cache.set("k", 7)
    time.sleep(0.02)
    assert cache.get("k") is None
    assert len(cache) == 0


def test_lru_eviction_when_maxsize_exceeded() -> None:
    cache: TTLCache[str, int] = TTLCache(maxsize=2, ttl_seconds=60)
    cache.set("a", 1)
    cache.set("b", 2)
    cache.set("c", 3)
    assert cache.get("a") is None  # evicted (oldest)
    assert cache.get("b") == 2
    assert cache.get("c") == 3


def test_get_promotes_to_most_recently_used() -> None:
    cache: TTLCache[str, int] = TTLCache(maxsize=2, ttl_seconds=60)
    cache.set("a", 1)
    cache.set("b", 2)
    cache.get("a")  # `a` is now MRU
    cache.set("c", 3)  # should evict `b`, not `a`
    assert cache.get("a") == 1
    assert cache.get("b") is None


def test_clear_empties_cache() -> None:
    cache: TTLCache[str, int] = TTLCache()
    cache.set("a", 1)
    cache.set("b", 2)
    cache.clear()
    assert len(cache) == 0
    assert cache.get("a") is None
