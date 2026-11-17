"""The quickstart's free demo.

A fresh `npx @samata-oss/cli` install has no provider keys of its own. It gets a
`sk_demo_...` token from Samata's demo proxy (`demo-proxy/`) instead, and saves
it as the workspace's Deepgram and OpenRouter key. The proxy speaks both
providers' own APIs, so the only difference is where requests go: a demo key is
sent to the proxy, any other key straight to the provider.

The control plane makes the same choice for the model (`server/demo.ts`).
"""

from __future__ import annotations

import os

DEMO_KEY_PREFIX = "sk_demo_"
DEFAULT_DEMO_URL = "https://demo.samata.dev"
DEEPGRAM_URL = "https://api.deepgram.com"


def is_demo_key(api_key: str | None) -> bool:
    return bool(api_key) and api_key.startswith(DEMO_KEY_PREFIX)


def demo_url() -> str:
    """The proxy's address; `SAMATA_DEMO_URL` points it somewhere else (testing)."""
    return (os.environ.get("SAMATA_DEMO_URL", "").strip() or DEFAULT_DEMO_URL).rstrip("/")


def deepgram_endpoint(api_key: str, path: str) -> str:
    """Where Deepgram's `/v1/<path>` (`listen` or `speak`) is for this key."""
    base = demo_url() if is_demo_key(api_key) else DEEPGRAM_URL
    return f"{base}/v1/{path}"
