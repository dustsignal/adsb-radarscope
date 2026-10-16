# Overall: ADSB-BL2.0-APP10001-BETA-VER2.5.0-BETA.67-BUILD0067-SCO0067
#!/usr/bin/env python3
"""Standalone local runtime for an ADSB Radarscope release.

Run ``python serve.py`` from an extracted release. The server binds only to the
local computer, opens the application in a browser, and provides the same-origin
relay used for ADS-B receivers that do not send browser CORS headers.
"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.parse
import urllib.request
import webbrowser
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Sequence


SERVER_VERSION = "1.1.0"
LOCAL_HOST = "127.0.0.1"
DEFAULT_PORT = 8080
PROXY_PATH = "/__adsb_proxy"
PROXY_TIMEOUT_SECONDS = 20
PROXY_MAX_BYTES = 32 * 1024 * 1024


def configure_console_encoding() -> None:
    """Keep status glyphs readable in Windows, macOS, Linux, and redirected logs."""

    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)
        if reconfigure is None:
            continue
        try:
            reconfigure(encoding="utf-8", errors="replace", line_buffering=True)
        except (LookupError, OSError):
            pass


class LocalReleaseHandler(SimpleHTTPRequestHandler):
    """Serve release files and relay a configured remote aircraft feed."""

    server_version = f"ADSB-Radarscope-Local/{SERVER_VERSION}"

    def end_headers(self) -> None:
        # Local releases can change at the same URL between test builds.
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def send_head(self):
        # Do not let an older release receive 304 for a reused asset filename.
        for header in ("If-Modified-Since", "If-None-Match"):
            if header in self.headers:
                del self.headers[header]
        return super().send_head()

    def log_message(self, _format: str, *_args: object) -> None:
        """Keep routine browser asset requests out of the runtime interface."""

    def do_OPTIONS(self) -> None:
        parsed = urllib.parse.urlsplit(self.path)
        if parsed.path != PROXY_PATH:
            self.send_error(404)
            return
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Accept, Content-Type")
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self) -> None:
        parsed = urllib.parse.urlsplit(self.path)
        if parsed.path == PROXY_PATH:
            self._relay_feed(parsed.query)
            return
        super().do_GET()

    def _send_response(self, status: int, body: bytes, content_type: str) -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(body)

    def _send_error(self, status: int, message: str) -> None:
        body = json.dumps({"error": message}).encode("utf-8")
        self._send_response(status, body, "application/json; charset=utf-8")

    def _relay_feed(self, query: str) -> None:
        targets = urllib.parse.parse_qs(query, keep_blank_values=True).get("url", [])
        if len(targets) != 1 or not targets[0]:
            self._send_error(400, "A single non-empty url parameter is required.")
            return

        target = targets[0]
        parsed_target = urllib.parse.urlsplit(target)
        if parsed_target.scheme not in {"http", "https"} or not parsed_target.hostname:
            self._send_error(400, "Only absolute HTTP or HTTPS feed URLs are allowed.")
            return

        request = urllib.request.Request(
            target,
            headers={
                "Accept": "application/json, text/plain;q=0.9, */*;q=0.1",
                "User-Agent": self.server_version,
            },
        )
        try:
            with urllib.request.urlopen(request, timeout=PROXY_TIMEOUT_SECONDS) as response:
                final_url = urllib.parse.urlsplit(response.geturl())
                if final_url.scheme not in {"http", "https"}:
                    self._send_error(502, "Feed redirected to an unsupported URL scheme.")
                    return
                body = response.read(PROXY_MAX_BYTES + 1)
                if len(body) > PROXY_MAX_BYTES:
                    self._send_error(502, "Feed response exceeds the 32 MiB safety limit.")
                    return
                content_type = response.headers.get(
                    "Content-Type", "application/json; charset=utf-8"
                )
                self._send_response(response.status, body, content_type)
        except urllib.error.HTTPError as exc:
            body = exc.read(PROXY_MAX_BYTES)
            content_type = exc.headers.get(
                "Content-Type", "application/json; charset=utf-8"
            )
            self._send_response(exc.code, body, content_type)
        except (OSError, urllib.error.URLError) as exc:
            self._send_error(502, f"Could not reach ADS-B feed: {exc}")


def create_server(
    release_dir: Path,
    *,
    host: str = LOCAL_HOST,
    port: int = DEFAULT_PORT,
) -> ThreadingHTTPServer:
    """Create a loopback release server for CLI use and automated tests."""

    handler = partial(LocalReleaseHandler, directory=str(release_dir))
    return ThreadingHTTPServer((host, port), handler)


def is_compiled_release(directory: Path) -> bool:
    """Return whether a directory contains the minimum compiled app shell."""

    return (
        (directory / "index.html").is_file()
        and (directory / "assets" / "index.js").is_file()
        and (directory / "assets" / "index.css").is_file()
    )


def resolve_release_dir(script_dir: Path, requested: str | None = None) -> Path:
    """Select a compiled release and never serve the uncompiled TSX source tree."""

    if requested:
        candidate = Path(requested).expanduser()
        if not candidate.is_absolute():
            candidate = script_dir / candidate
        candidate = candidate.resolve()
        if not is_compiled_release(candidate):
            raise FileNotFoundError(
                f"{candidate} is not a compiled ADSB Radarscope release."
            )
        return candidate

    if is_compiled_release(script_dir):
        return script_dir

    default_build = script_dir / "dist"
    if is_compiled_release(default_build):
        return default_build.resolve()

    raise FileNotFoundError(
        f"No compiled release was found. Run '{sys.executable} build.py' first."
    )


def make_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Start ADSB Radarscope locally with its ADS-B CORS relay."
    )
    parser.add_argument("--port", type=int, default=DEFAULT_PORT, help="Local HTTP port")
    parser.add_argument("--no-open", action="store_true", help="Do not open a browser")
    parser.add_argument(
        "--directory",
        help="Compiled release folder (defaults to this folder or ./dist)",
    )
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    configure_console_encoding()
    parser = make_parser()
    args = parser.parse_args(argv)
    if not 1 <= args.port <= 65535:
        parser.error("--port must be between 1 and 65535")

    script_dir = Path(__file__).resolve().parent
    try:
        release_dir = resolve_release_dir(script_dir, args.directory)
    except FileNotFoundError as exc:
        print(f"[FAIL] {exc}", file=sys.stderr)
        return 1

    try:
        server = create_server(release_dir, port=args.port)
    except OSError as exc:
        print(f"[FAIL] Could not start local server on {LOCAL_HOST}:{args.port}: {exc}", file=sys.stderr)
        return 1

    address = f"http://localhost:{server.server_address[1]}"
    print("═" * 72)
    print("  ◉ ADS-B RADARSCOPE // LOCAL RUNTIME")
    print("─" * 72)
    print(f"  APPLICATION      {address}")
    print(f"  RELEASE FOLDER   {release_dir}")
    print(f"  ADS-B CORS       ENABLED • {PROXY_PATH}")
    print("  NETWORK ACCESS   LOOPBACK ONLY")
    print("═" * 72)
    print("  [INFO] Press Ctrl+C to stop the server")

    if not args.no_open:
        try:
            opened = webbrowser.open(address)
        except webbrowser.Error:
            opened = False
        if not opened:
            print(f"  [WARN] Open {address} in a browser.")

    try:
        server.serve_forever(poll_interval=0.25)
    except KeyboardInterrupt:
        print("\n  [INFO] Local server stopped")
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
