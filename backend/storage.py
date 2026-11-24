"""Small JSON-file persistence helpers (thread-safe, atomic writes)."""
import json
import os
import threading
from pathlib import Path

DATA_DIR = Path(os.environ.get("COSMOS_DATA_DIR", Path(__file__).resolve().parent / "data"))
DATA_DIR.mkdir(parents=True, exist_ok=True)

_lock = threading.RLock()


class JsonStore:
    """A dict persisted to a single JSON file."""

    def __init__(self, filename: str):
        self.path = DATA_DIR / filename

    def load(self) -> dict:
        with _lock:
            if not self.path.exists():
                return {}
            try:
                return json.loads(self.path.read_text(encoding="utf-8") or "{}")
            except json.JSONDecodeError:
                return {}

    def save(self, data: dict) -> None:
        with _lock:
            tmp = self.path.with_suffix(".tmp")
            tmp.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
            os.replace(tmp, self.path)

    def update(self, fn):
        """Load, mutate with fn(data) and save atomically. Returns fn's result."""
        with _lock:
            data = self.load()
            result = fn(data)
            self.save(data)
            return result
