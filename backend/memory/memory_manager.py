"""Offline persistent farm memory with pluggable local vector-search interface."""
from collections import Counter
from hashlib import blake2b
import json
import math
import re
from typing import Protocol
from uuid import uuid4

from backend.db import Database, now_iso
from backend.domain.repository import field


class VectorIndex(Protocol):
    def embed(self, text: str) -> list[float]: ...
    def similarity(self, left: list[float], right: list[float]) -> float: ...


class LocalHashVectorIndex:
    """Tiny deterministic character n-gram index; swap for FAISS without changing memory callers."""
    DIMENSIONS = 128

    def embed(self, text: str) -> list[float]:
        tokens = re.findall(r"\w+", text.casefold(), flags=re.UNICODE)
        grams = [token[i:i+3] for token in tokens for i in range(max(1, len(token)-2))]
        counts = Counter(tokens + grams)
        vector = [0.] * self.DIMENSIONS
        for word, count in counts.items():
            digest = blake2b(word.encode("utf-8"), digest_size=8).digest()
            index = int.from_bytes(digest, "big") % self.DIMENSIONS
            vector[index] += math.log1p(count)
        norm = math.sqrt(sum(v*v for v in vector)) or 1
        return [round(v/norm, 6) for v in vector]

    def similarity(self, left: list[float], right: list[float]) -> float:
        return sum(a*b for a, b in zip(left, right))


class MemoryManager:
    def __init__(self, db: Database, vector_index: VectorIndex | None = None):
        self.db = db
        self.index = vector_index or LocalHashVectorIndex()

    def _queue(self, conn, memory: dict, operation: str) -> None:
        op_id = f"memory:{memory['id']}:{memory['version']}"
        conn.execute("INSERT OR IGNORE INTO sync_outbox (op_id,entity,payload_json,created_at) VALUES (?,?,?,?)",
                     (op_id, "memory", json.dumps({**memory, "operation": operation}, ensure_ascii=False), now_iso()))

    def store_memory(self, content: str, category: str, field_id: str | None = None,
                     metadata: dict | None = None, memory_id: str | None = None) -> dict:
        if not content.strip() or len(content) > 4000:
            raise ValueError("Memory must be 1–4000 characters")
        if field_id and not field(self.db, field_id):
            raise ValueError("Unknown field")
        mid = memory_id or str(uuid4())
        existing = self.retrieve_memory(mid)
        if existing:
            return existing  # idempotent imports from offline clients
        result = {"id": mid, "field_id": field_id, "category": category[:64],
                  "content": content.strip(), "metadata": metadata or {}, "version": 1,
                  "updated_at": now_iso(), "deleted": False, "origin": "local"}
        with self.db.connection() as conn:
            conn.execute("INSERT INTO memories VALUES (?,?,?,?,?,?,?,?,?,?)",
                         (mid, field_id, result["category"], result["content"],
                          json.dumps(result["metadata"], ensure_ascii=False),
                          json.dumps(self.index.embed(content)), 1, result["updated_at"], 0, "local"))
            self._queue(conn, result, "upsert")
        return result

    def retrieve_memory(self, memory_id: str) -> dict | None:
        with self.db.connection() as conn:
            row = conn.execute("SELECT * FROM memories WHERE id=?", (memory_id,)).fetchone()
        if not row:
            return None
        result = dict(row)
        result["metadata"] = json.loads(result.pop("metadata_json"))
        result.pop("embedding_json")
        result["deleted"] = bool(result["deleted"])
        return result

    def search_memory(self, query: str, field_id: str | None = None, limit: int = 5) -> list[dict]:
        with self.db.connection() as conn:
            rows = conn.execute("SELECT * FROM memories WHERE deleted=0 AND (field_id=? OR field_id IS NULL) "
                                "ORDER BY updated_at DESC LIMIT 500", (field_id,)).fetchall()
        needle = self.index.embed(query)
        scored = []
        for row in rows:
            similarity = self.index.similarity(needle, json.loads(row["embedding_json"]))
            if similarity <= 0:
                continue
            item = self.retrieve_memory(row["id"])
            scored.append({**item, "similarity": round(similarity, 3)})
        return sorted(scored, key=lambda x: x["similarity"], reverse=True)[:min(limit, 20)]

    def update_memory(self, memory_id: str, content: str, metadata: dict | None = None) -> dict:
        old = self.retrieve_memory(memory_id)
        if not old or old["deleted"]:
            raise ValueError("Memory not found")
        if not content.strip() or len(content) > 4000:
            raise ValueError("Memory must be 1–4000 characters")
        new = {**old, "content": content.strip(), "metadata": metadata if metadata is not None else old["metadata"],
               "version": old["version"] + 1, "updated_at": now_iso()}
        with self.db.connection() as conn:
            conn.execute("UPDATE memories SET content=?,metadata_json=?,embedding_json=?,version=?,updated_at=? WHERE id=?",
                         (new["content"], json.dumps(new["metadata"], ensure_ascii=False),
                          json.dumps(self.index.embed(content)), new["version"], new["updated_at"], memory_id))
            self._queue(conn, new, "upsert")
        return new

    def delete_memory(self, memory_id: str) -> dict:
        old = self.retrieve_memory(memory_id)
        if not old:
            raise ValueError("Memory not found")
        if old["deleted"]:
            return old
        new = {**old, "version": old["version"] + 1, "updated_at": now_iso(), "deleted": True}
        with self.db.connection() as conn:
            conn.execute("UPDATE memories SET deleted=1,version=?,updated_at=? WHERE id=?",
                         (new["version"], new["updated_at"], memory_id))
            self._queue(conn, new, "delete")
        return new

    def sync_memory(self, incoming: list[dict]) -> dict:
        """Version-aware merge: equal-version divergent writes become conflicts, never silent overwrites."""
        accepted, conflicts = [], []
        for item in incoming:
            mid = item.get("id")
            if not isinstance(mid, str) or not mid:
                conflicts.append({"id": mid, "reason": "missing id"})
                continue
            existing = self.retrieve_memory(mid)
            version = int(item.get("version", 1))
            if existing and version < existing["version"]:
                conflicts.append({"id": mid, "reason": "local version is newer", "local": existing})
                continue
            if existing and version == existing["version"]:
                if existing["content"] != item.get("content") or existing["deleted"] != bool(item.get("deleted", False)):
                    conflicts.append({"id": mid, "reason": "concurrent edit", "local": existing})
                else:
                    accepted.append(mid)  # idempotent replay
                continue
            content = str(item.get("content", ""))
            field_id = item.get("field_id")
            if not content or len(content) > 4000 or (field_id and not field(self.db, field_id)):
                conflicts.append({"id": mid, "reason": "invalid memory"})
                continue
            with self.db.connection() as conn:
                conn.execute("""INSERT INTO memories (id,field_id,category,content,metadata_json,embedding_json,
                                version,updated_at,deleted,origin) VALUES (?,?,?,?,?,?,?,?,?,?)
                                ON CONFLICT(id) DO UPDATE SET field_id=excluded.field_id,category=excluded.category,
                                content=excluded.content,metadata_json=excluded.metadata_json,
                                embedding_json=excluded.embedding_json,version=excluded.version,
                                updated_at=excluded.updated_at,deleted=excluded.deleted,origin=excluded.origin""",
                             (mid, field_id, str(item.get("category", "note"))[:64], content,
                              json.dumps(item.get("metadata", {})), json.dumps(self.index.embed(content)),
                              version, str(item.get("updated_at", now_iso())), int(bool(item.get("deleted", False))),
                              "remote"))
            accepted.append(mid)
        return {"accepted": accepted, "conflicts": conflicts}
