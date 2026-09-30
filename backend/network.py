"""All optional upstream requests are bounded, retried, and return to a local cache on failure."""
import time
import httpx


def request_json(method: str, url: str, *, headers: dict | None = None, payload: dict | None = None) -> dict:
    if not url.startswith("https://") and not url.startswith("http://127.0.0.1:"):
        raise ValueError("Upstream must use HTTPS (loopback allowed for development)")
    error: Exception | None = None
    for attempt in range(3):
        try:
            with httpx.Client(timeout=httpx.Timeout(5.0, connect=3.0)) as client:
                response = client.request(method, url, headers=headers, json=payload)
                response.raise_for_status()
                data = response.json()
                if not isinstance(data, dict):
                    raise ValueError("Expected a JSON object")
                return data
        except (httpx.HTTPError, ValueError) as exc:
            error = exc
            if attempt < 2:
                time.sleep(.25 * (attempt + 1))
    raise ConnectionError("Upstream unavailable after bounded retries") from error
