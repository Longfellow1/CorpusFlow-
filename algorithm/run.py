"""Entry point: find a free port, write it to data/algorithm.port, then start uvicorn."""
from __future__ import annotations

import socket
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(Path(__file__).parent))


def find_free_port(start: int = 8001, end: int = 9000) -> int:
    for port in range(start, end):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                s.bind(("127.0.0.1", port))
                return port
            except OSError:
                continue
    raise RuntimeError("No free port found in range 8001-9000")


if __name__ == "__main__":
    import uvicorn

    port = find_free_port()
    port_file = ROOT_DIR / "data" / "algorithm.port"
    port_file.parent.mkdir(parents=True, exist_ok=True)
    port_file.write_text(str(port))
    print(f"Algorithm service starting on port {port}")
    uvicorn.run("src.app:app", host="127.0.0.1", port=port)
