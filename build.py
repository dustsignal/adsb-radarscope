# Overall: ADSB-BL2.0-APP10001-BETA-VER2.5.0-BETA.67-BUILD0067-SCO0067
#!/usr/bin/env python3
"""ADSB Radarscope release builder.

Run ``python build.py`` for the interactive installer-style workflow. The script
uses only the Python standard library; optional airspace dependencies are kept
inside ``.build-venv`` so the user's global Python installation stays clean.
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import queue
import shlex
import shutil
import sqlite3
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import webbrowser
from contextlib import closing
from dataclasses import dataclass
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Callable, Mapping, Sequence, TypeVar


SCRIPT_VERSION = "1.2.0"
PROJECT_ROOT = Path(__file__).resolve().parent
PUBLIC_DATA_DIR = PROJECT_ROOT / "public" / "data"
BUILD_VENV_DIR = PROJECT_ROOT / ".build-venv"
AIRSPACE_PATH = PUBLIC_DATA_DIR / "class_airspace.mbtiles"
AIRSPACE_PACKAGES = ("requests>=2.31,<3", "geojson2vt", "vt2pbf")
LOCAL_PROXY_PATH = "/__adsb_proxy"
LOCAL_SERVER_HOST = "127.0.0.1"
LOCAL_SERVER_PORT = 8080
PROXY_TIMEOUT_SECONDS = 20
PROXY_MAX_BYTES = 32 * 1024 * 1024
DEFAULT_FEED_URL = "/tar1090/data/aircraft.json"
DEFAULT_HOME_LAT = 0.0
DEFAULT_HOME_LON = 0.0
DEFAULT_RANGE_NM = 75
DEFAULT_POLL_INTERVAL_MS = 1000
UI_THEMES = ("phosphor", "console")
SCOPE_THEMES = (
    "phosphor",
    "console",
    "amber-crt",
    "arctic-blue",
    "cyberpunk",
    "parchment",
)
T = TypeVar("T")


class BuildError(RuntimeError):
    """A user-actionable release build failure."""


def configure_console_encoding() -> None:
    """Use UTF-8 for the installer glyphs, including redirected Windows output."""

    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)
        if reconfigure is not None:
            try:
                reconfigure(
                    encoding="utf-8",
                    errors="replace",
                    line_buffering=True,
                    write_through=True,
                )
            except (LookupError, OSError):
                pass


@dataclass(frozen=True)
class DatasetSpec:
    """Metadata used to download and validate an OurAirports dataset."""

    name: str
    url: str
    required_columns: frozenset[str]
    minimum_bytes: int

    @property
    def destination(self) -> Path:
        return PUBLIC_DATA_DIR / self.name


DATASETS = (
    DatasetSpec(
        name="airports.csv",
        url="https://davidmegginson.github.io/ourairports-data/airports.csv",
        required_columns=frozenset(
            {"ident", "type", "name", "latitude_deg", "longitude_deg"}
        ),
        minimum_bytes=1_000_000,
    ),
    DatasetSpec(
        name="runways.csv",
        url="https://davidmegginson.github.io/ourairports-data/runways.csv",
        required_columns=frozenset(
            {"airport_ident", "length_ft", "le_latitude_deg", "he_latitude_deg"}
        ),
        minimum_bytes=500_000,
    ),
    DatasetSpec(
        name="navaids.csv",
        url="https://davidmegginson.github.io/ourairports-data/navaids.csv",
        required_columns=frozenset(
            {"ident", "name", "type", "latitude_deg", "longitude_deg"}
        ),
        minimum_bytes=100_000,
    ),
)


@dataclass(frozen=True)
class AppDefaults:
    """Optional first-run application settings embedded in a release."""

    home_lat: float | None = None
    home_lon: float | None = None
    data_url: str | None = None
    range_nm: int | None = None
    poll_interval_ms: int | None = None
    ws_url: str | None = None
    ws_enabled: bool | None = None
    ui_theme: str | None = None
    scope_theme: str | None = None
    sound_enabled: bool | None = None

    def to_settings(self) -> dict[str, object]:
        values = {
            "homeLat": self.home_lat,
            "homeLon": self.home_lon,
            "dataUrl": self.data_url,
            "range": self.range_nm,
            "fetchIntervalMs": self.poll_interval_ms,
            "wsUrl": self.ws_url,
            "wsEnabled": self.ws_enabled,
            "uiTheme": self.ui_theme,
            "scopeTheme": self.scope_theme,
            "soundEnabled": self.sound_enabled,
        }
        return {key: value for key, value in values.items() if value is not None}


@dataclass
class BuildOptions:
    """Resolved choices for one release build."""

    output_dir: Path
    refresh_csv: bool
    refresh_airspace: bool
    skip_airspace: bool
    install_node: bool
    data_only: bool
    app_defaults: AppDefaults
    dry_run: bool


def format_bytes(value: int) -> str:
    """Format a byte count for installer output."""

    amount = float(value)
    for suffix in ("B", "KiB", "MiB", "GiB"):
        if amount < 1024 or suffix == "GiB":
            return f"{amount:.1f} {suffix}"
        amount /= 1024
    return f"{amount:.1f} GiB"


def venv_python_path(directory: Path, platform_name: str | None = None) -> Path:
    """Return the isolated environment's interpreter path on any supported OS."""

    platform = os.name if platform_name is None else platform_name
    if platform == "nt":
        return directory / "Scripts" / "python.exe"
    return directory / "bin" / "python"


def bounded_float(value: object, label: str, minimum: float, maximum: float) -> float:
    """Parse a finite floating-point value constrained to an inclusive range."""

    try:
        parsed = float(value)
    except (TypeError, ValueError) as exc:
        raise BuildError(f"{label} must be a number.") from exc
    if not minimum <= parsed <= maximum:
        raise BuildError(f"{label} must be between {minimum:g} and {maximum:g}.")
    return parsed


def bounded_int(value: object, label: str, minimum: int, maximum: int) -> int:
    """Parse an integer constrained to an inclusive range."""

    try:
        parsed = int(str(value))
    except (TypeError, ValueError) as exc:
        raise BuildError(f"{label} must be a whole number.") from exc
    if not minimum <= parsed <= maximum:
        raise BuildError(f"{label} must be between {minimum} and {maximum}.")
    return parsed


def validate_http_url(value: object) -> str:
    """Validate an absolute HTTP(S) URL or a same-origin root-relative path."""

    url = str(value).strip()
    if url.startswith("/"):
        return url
    parsed = urllib.parse.urlsplit(url)
    if parsed.scheme in {"http", "https"} and parsed.hostname:
        return url
    raise BuildError("Feeder URL must start with http://, https://, or /.")


def validate_ws_url(value: object) -> str:
    """Validate an optional absolute WebSocket URL."""

    url = str(value).strip()
    if not url:
        return ""
    parsed = urllib.parse.urlsplit(url)
    if parsed.scheme in {"ws", "wss"} and parsed.hostname:
        return url
    raise BuildError("WebSocket URL must start with ws:// or wss://.")


def validate_choice(value: object, label: str, choices: Sequence[str]) -> str:
    """Validate a case-insensitive choice and return its canonical value."""

    selected = str(value).strip().lower()
    if selected not in choices:
        raise BuildError(f"{label} must be one of: {', '.join(choices)}.")
    return selected


class ConsoleUI:
    """Small dependency-free ANSI interface inspired by classic installers."""

    RESET = "\033[0m"
    BOLD = "\033[1m"
    DIM = "\033[2m"
    CYAN = "\033[38;5;51m"
    GREEN = "\033[38;5;84m"
    AMBER = "\033[38;5;220m"
    RED = "\033[38;5;203m"
    WHITE = "\033[38;5;255m"
    DARK = "\033[38;5;30m"

    def __init__(self, *, no_color: bool = False) -> None:
        self.interactive = sys.stdin.isatty() and sys.stdout.isatty()
        self.color = self.interactive and not no_color and "NO_COLOR" not in os.environ
        self.width = max(72, min(104, shutil.get_terminal_size((92, 28)).columns))

    def style(self, text: str, *codes: str) -> str:
        if not self.color:
            return text
        return f"{''.join(codes)}{text}{self.RESET}"

    def banner(self) -> None:
        if self.color:
            print("\033[2J\033[H", end="")
        logo = (
            "    ◉ ────────┐",
            "   ╱│  ADS-B  │  RADARSCOPE RELEASE FABRICATOR",
            "  ◉─┴─────────┘  DATA // AIRSPACE // CONFIG // BUILD",
        )
        print(self.style("═" * self.width, self.DARK))
        for line in logo:
            print(self.style(line, self.BOLD, self.CYAN))
        print(
            self.style(
                f"  SYSTEM {SCRIPT_VERSION}  •  PYTHON {sys.version_info.major}.{sys.version_info.minor}  •  {time.strftime('%Y-%m-%d %H:%M')}",
                self.DIM,
                self.WHITE,
            )
        )
        print(self.style("═" * self.width, self.DARK))

    def panel(self, title: str, rows: Sequence[tuple[str, str]]) -> None:
        inner = self.width - 4
        caption = f"[ {title.upper()} ]"
        label_width = min(
            30,
            max(20, max((len(label) + 2 for label, _ in rows), default=20)),
        )
        print(self.style(f"┌─{caption}{'─' * max(0, inner - len(caption))}─┐", self.CYAN))
        for label, value in rows:
            prefix = f"{label}:"
            available = max(1, inner - label_width)
            rendered = value if len(value) <= available else f"…{value[-(available - 1):]}"
            line = f"│ {prefix:<{label_width}}{rendered:<{available}} │"
            print(self.style(line, self.WHITE))
        print(self.style(f"└{'─' * (self.width - 2)}┘", self.CYAN))

    def stage(self, current: int, total: int, title: str) -> None:
        marker = f" STAGE {current:02d}/{total:02d} "
        remaining = max(1, self.width - len(marker) - len(title) - 3)
        print()
        print(
            self.style(marker, self.BOLD, self.CYAN)
            + self.style(title.upper(), self.BOLD, self.WHITE)
            + self.style(" ─" + "─" * remaining, self.DARK)
        )

    def status(self, kind: str, message: str) -> None:
        styles = {
            "ok": ("PASS", self.GREEN),
            "info": ("INFO", self.CYAN),
            "warn": ("WARN", self.AMBER),
            "error": ("FAIL", self.RED),
            "skip": ("SKIP", self.DIM),
        }
        badge, color = styles.get(kind, (kind.upper(), self.WHITE))
        print(f"  {self.style(f'[{badge}]', self.BOLD, color)} {message}")

    def command(self, command: Sequence[str]) -> None:
        rendered = subprocess.list2cmdline(command) if os.name == "nt" else shlex.join(command)
        print(f"  {self.style('>', self.BOLD, self.CYAN)} {self.style(rendered, self.DIM, self.WHITE)}")

    def stream(self, line: str) -> None:
        print(f"    {self.style('│', self.DARK)} {line.rstrip()}")

    def activity(self, label: str, tick: int, elapsed: float) -> None:
        """Render one frame of an indeterminate activity indicator."""

        if not self.interactive:
            return
        spinner = ("◐", "◓", "◑", "◒")[tick % 4]
        bar_width = max(12, min(30, self.width - 48))
        position = tick % max(1, (bar_width * 2) - 2)
        if position >= bar_width:
            position = (bar_width * 2) - position - 2
        cells = ["░"] * bar_width
        for offset, glyph in ((-1, "▒"), (0, "█"), (1, "▒")):
            cell = position + offset
            if 0 <= cell < bar_width:
                cells[cell] = glyph
        message = f"  {spinner} {label:<30} {''.join(cells)}  {elapsed:6.1f}s"
        print(self.style(message[: self.width], self.CYAN), end="\r", flush=True)

    def clear_activity(self) -> None:
        if self.interactive:
            print(" " * self.width, end="\r", flush=True)

    def progress(self, label: str, current: int, total: int | None) -> None:
        if not self.interactive:
            return
        bar_width = max(12, min(36, self.width - 48))
        if total and total > 0:
            ratio = min(1.0, current / total)
            filled = round(ratio * bar_width)
            bar = "█" * filled + "░" * (bar_width - filled)
            detail = f"{ratio * 100:5.1f}%  {format_bytes(current)}/{format_bytes(total)}"
        else:
            filled = (current // (256 * 1024)) % bar_width
            bar = "░" * filled + "▓" + "░" * (bar_width - filled - 1)
            detail = format_bytes(current)
        text = f"  {label:<18} {bar}  {detail:<24}"
        print(self.style(text[: self.width], self.CYAN), end="\r", flush=True)

    def end_progress(self) -> None:
        if self.interactive:
            print(" " * self.width, end="\r")

    def prompt(self, label: str, default: str) -> str:
        answer = input(
            f"  {self.style('?', self.BOLD, self.CYAN)} {label} "
            f"{self.style(f'[{default}]', self.DIM)}: "
        ).strip()
        return answer or default

    def confirm(self, label: str, *, default: bool) -> bool:
        choice = "Y/n" if default else "y/N"
        answer = input(
            f"  {self.style('?', self.BOLD, self.CYAN)} {label} "
            f"{self.style(f'[{choice}]', self.DIM)}: "
        ).strip().lower()
        if not answer:
            return default
        return answer in {"y", "yes"}


def prompt_validated(
    ui: ConsoleUI,
    label: str,
    default: object,
    validator: Callable[[object], T],
) -> T:
    """Prompt until a value passes a field-specific validator."""

    while True:
        value = ui.prompt(label, str(default))
        try:
            return validator(value)
        except BuildError as exc:
            ui.status("warn", str(exc))


def validate_csv(path: Path, spec: DatasetSpec) -> tuple[bool, str]:
    """Validate file size and required CSV columns without loading the file."""

    try:
        size = path.stat().st_size
        if size < spec.minimum_bytes:
            return False, f"too small ({format_bytes(size)})"
        with path.open("r", encoding="utf-8-sig", newline="") as handle:
            header = next(csv.reader(handle), None)
        if not header:
            return False, "missing CSV header"
        missing = spec.required_columns.difference(header)
        if missing:
            return False, f"missing columns: {', '.join(sorted(missing))}"
    except (OSError, UnicodeError, csv.Error) as exc:
        return False, str(exc)
    return True, format_bytes(size)


def validate_mbtiles(path: Path) -> tuple[bool, str]:
    """Verify the MBTiles database schema, integrity, and non-empty tile table."""

    if not path.is_file():
        return False, "not found"
    try:
        uri = f"{path.resolve().as_uri()}?mode=ro"
        with closing(sqlite3.connect(uri, uri=True)) as connection:
            integrity = connection.execute("PRAGMA quick_check").fetchone()
            if not integrity or integrity[0] != "ok":
                return False, f"integrity check: {integrity[0] if integrity else 'unknown'}"
            tables = {
                row[0]
                for row in connection.execute(
                    "SELECT name FROM sqlite_master WHERE type = 'table'"
                )
            }
            if not {"metadata", "tiles"}.issubset(tables):
                return False, "missing metadata or tiles table"
            tile_count = int(connection.execute("SELECT COUNT(*) FROM tiles").fetchone()[0])
            if tile_count <= 0:
                return False, "database contains no tiles"
    except (OSError, sqlite3.Error, TypeError) as exc:
        return False, str(exc)
    return True, f"{tile_count:,} tiles • {format_bytes(path.stat().st_size)}"


def resolve_output_dir(value: str) -> Path:
    """Resolve an output path while protecting source and workspace directories."""

    candidate = Path(value).expanduser()
    if not candidate.is_absolute():
        candidate = PROJECT_ROOT / candidate
    candidate = candidate.resolve()

    try:
        candidate.relative_to(PROJECT_ROOT)
    except ValueError as exc:
        raise BuildError("Output directory must be inside the project directory.") from exc

    if candidate == PROJECT_ROOT:
        raise BuildError(f"Refusing unsafe output directory: {candidate}")

    protected = (
        PROJECT_ROOT / ".git",
        PROJECT_ROOT / ".build-venv",
        PROJECT_ROOT / "node_modules",
        PROJECT_ROOT / "public",
        PROJECT_ROOT / "src",
    )
    for protected_path in protected:
        try:
            candidate.relative_to(protected_path.resolve())
        except ValueError:
            continue
        raise BuildError(f"Refusing unsafe output directory: {candidate}")
    return candidate


def resolve_serve_dir(value: str) -> Path:
    """Resolve a read-only serving directory without applying build-output guards."""

    candidate = Path(value).expanduser()
    if not candidate.is_absolute():
        candidate = PROJECT_ROOT / candidate
    return candidate.resolve()


def find_npm(explicit: str | None = None) -> str:
    """Locate npm without invoking a shell."""

    if explicit:
        explicit_path = Path(explicit).expanduser()
        if explicit_path.is_file():
            return str(explicit_path.resolve())
        located = shutil.which(explicit)
        if located:
            return located
        raise BuildError(f"npm command was not found: {explicit}")

    for name in ("npm", "npm.cmd"):
        located = shutil.which(name)
        if located:
            return located
    raise BuildError("npm was not found. Install Node.js 18+ and rerun this command.")


def npm_environment(npm: str) -> dict[str, str]:
    """Ensure npm lifecycle commands can locate the adjacent Node executable."""

    environment = os.environ.copy()
    npm_path = Path(npm)
    if npm_path.is_file():
        current_path = environment.get("PATH", "")
        environment["PATH"] = str(npm_path.resolve().parent) + (
            os.pathsep + current_path if current_path else ""
        )
    return environment


def run_command(
    command: Sequence[str],
    *,
    ui: ConsoleUI,
    cwd: Path = PROJECT_ROOT,
    env: Mapping[str, str] | None = None,
    dry_run: bool = False,
    activity_label: str | None = None,
    suppress_output_prefixes: Sequence[str] = (),
) -> None:
    """Run a command while keeping the UI responsive and visibly active."""

    ui.command(command)
    if dry_run:
        ui.status("skip", "dry-run: command not executed")
        return
    try:
        process = subprocess.Popen(
            list(command),
            cwd=str(cwd),
            env=dict(env) if env is not None else None,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            encoding="utf-8",
            errors="replace",
        )
    except OSError as exc:
        raise BuildError(f"Could not start {command[0]}: {exc}") from exc

    output_queue: queue.Queue[object] = queue.Queue()
    output_complete = object()

    def read_output() -> None:
        assert process.stdout is not None
        try:
            for output_line in process.stdout:
                output_queue.put(output_line)
        finally:
            output_queue.put(output_complete)

    reader = threading.Thread(target=read_output, name="build-output-reader", daemon=True)
    reader.start()
    started = time.monotonic()
    last_heartbeat = started
    tick = 0
    prefixes = tuple(prefix.lower() for prefix in suppress_output_prefixes)
    output_finished = False

    if activity_label and not ui.interactive:
        ui.status("info", f"{activity_label}...")

    try:
        while not output_finished or process.poll() is None:
            try:
                item = output_queue.get(timeout=0.1)
            except queue.Empty:
                item = None

            if item is output_complete:
                output_finished = True
            elif isinstance(item, str):
                normalized = item.strip().lower()
                if not normalized.startswith(prefixes):
                    ui.clear_activity()
                    ui.stream(item)

            now = time.monotonic()
            if activity_label and not output_finished:
                if ui.interactive:
                    ui.activity(activity_label, tick, now - started)
                    tick += 1
                elif now - last_heartbeat >= 15:
                    ui.status("info", f"{activity_label} • still working ({now - started:.0f}s)")
                    last_heartbeat = now
        return_code = process.wait()
    except KeyboardInterrupt:
        process.terminate()
        process.wait()
        raise
    finally:
        ui.clear_activity()
        reader.join()
        if process.stdout is not None:
            process.stdout.close()
    if return_code != 0:
        raise BuildError(f"Command failed with exit code {return_code}: {command[0]}")


class ReleaseRequestHandler(SimpleHTTPRequestHandler):
    """Serve a built release plus a same-origin relay for local ADS-B feeds."""

    server_version = "ADSB-Radarscope-Local/1.0"

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
        """Keep routine browser requests out of the installer interface."""

    def do_OPTIONS(self) -> None:
        parsed = urllib.parse.urlsplit(self.path)
        if parsed.path != LOCAL_PROXY_PATH:
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
        if parsed.path == LOCAL_PROXY_PATH:
            self._relay_adsb_feed(parsed.query)
            return
        super().do_GET()

    def _send_proxy_response(
        self,
        status: int,
        body: bytes,
        content_type: str,
    ) -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(body)

    def _send_proxy_error(self, status: int, message: str) -> None:
        body = json.dumps({"error": message}).encode("utf-8")
        self._send_proxy_response(status, body, "application/json; charset=utf-8")

    def _relay_adsb_feed(self, query: str) -> None:
        parameters = urllib.parse.parse_qs(query, keep_blank_values=True)
        targets = parameters.get("url", [])
        if len(targets) != 1 or not targets[0]:
            self._send_proxy_error(400, "A single non-empty url parameter is required.")
            return

        target = targets[0]
        parsed_target = urllib.parse.urlsplit(target)
        if parsed_target.scheme not in {"http", "https"} or not parsed_target.hostname:
            self._send_proxy_error(400, "Only absolute HTTP or HTTPS feed URLs are allowed.")
            return

        request = urllib.request.Request(
            target,
            headers={
                "Accept": "application/json, text/plain;q=0.9, */*;q=0.1",
                "User-Agent": f"ADSB-Radarscope-Local/{SCRIPT_VERSION}",
            },
        )
        try:
            with urllib.request.urlopen(request, timeout=PROXY_TIMEOUT_SECONDS) as response:
                final_url = urllib.parse.urlsplit(response.geturl())
                if final_url.scheme not in {"http", "https"}:
                    raise BuildError("Feed redirected to an unsupported URL scheme.")
                body = response.read(PROXY_MAX_BYTES + 1)
                if len(body) > PROXY_MAX_BYTES:
                    raise BuildError(
                        f"Feed response exceeds the {format_bytes(PROXY_MAX_BYTES)} safety limit."
                    )
                content_type = response.headers.get(
                    "Content-Type", "application/json; charset=utf-8"
                )
                self._send_proxy_response(response.status, body, content_type)
        except urllib.error.HTTPError as exc:
            body = exc.read(PROXY_MAX_BYTES)
            content_type = exc.headers.get(
                "Content-Type", "application/json; charset=utf-8"
            )
            self._send_proxy_response(exc.code, body, content_type)
        except (BuildError, OSError, urllib.error.URLError) as exc:
            self._send_proxy_error(502, f"Could not reach ADS-B feed: {exc}")


def create_release_server(
    output_dir: Path,
    *,
    host: str = LOCAL_SERVER_HOST,
    port: int = LOCAL_SERVER_PORT,
) -> ThreadingHTTPServer:
    """Create the cross-platform local release server (used by CLI and tests)."""

    handler = partial(ReleaseRequestHandler, directory=str(output_dir))
    try:
        return ThreadingHTTPServer((host, port), handler)
    except OSError as exc:
        raise BuildError(f"Could not start local server on {host}:{port}: {exc}") from exc


def serve_release(
    output_dir: Path,
    *,
    ui: ConsoleUI,
    port: int,
    open_browser: bool,
) -> None:
    """Serve a release until interrupted, including the local CORS workaround."""

    index_path = output_dir / "index.html"
    if not index_path.is_file():
        raise BuildError(f"Cannot serve {output_dir}: index.html was not found.")

    server = create_release_server(output_dir, port=port)
    address = f"http://localhost:{server.server_address[1]}"
    ui.panel(
        "local runtime",
        (
            ("Application", address),
            ("Release folder", str(output_dir)),
            ("ADS-B CORS relay", f"ENABLED • {LOCAL_PROXY_PATH}"),
            ("Network exposure", "LOOPBACK ONLY"),
        ),
    )
    ui.status("info", "Press Ctrl+C to stop the local server")
    if open_browser:
        try:
            webbrowser.open(address)
        except webbrowser.Error:
            ui.status("warn", f"Could not open a browser automatically; visit {address}")
    try:
        server.serve_forever(poll_interval=0.25)
    except KeyboardInterrupt:
        print()
        ui.status("info", "Local server stopped")
    finally:
        server.server_close()


def download_dataset(spec: DatasetSpec, ui: ConsoleUI) -> None:
    """Download one dataset atomically and validate it before replacement."""

    destination = spec.destination
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_name(f".{destination.name}.{os.getpid()}.part")
    request = urllib.request.Request(
        spec.url,
        headers={"User-Agent": f"ADSB-Radarscope-Builder/{SCRIPT_VERSION}"},
    )
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            total_header = response.headers.get("Content-Length")
            total = int(total_header) if total_header and total_header.isdigit() else None
            downloaded = 0
            with temporary.open("wb") as handle:
                while True:
                    chunk = response.read(256 * 1024)
                    if not chunk:
                        break
                    handle.write(chunk)
                    downloaded += len(chunk)
                    ui.progress(spec.name, downloaded, total)
        ui.end_progress()
        valid, detail = validate_csv(temporary, spec)
        if not valid:
            raise BuildError(f"Downloaded {spec.name} failed validation: {detail}")
        os.replace(temporary, destination)
        ui.status("ok", f"{spec.name} • {detail}")
    except (OSError, urllib.error.URLError, urllib.error.HTTPError) as exc:
        raise BuildError(f"Could not download {spec.url}: {exc}") from exc
    finally:
        try:
            temporary.unlink(missing_ok=True)
        except OSError:
            pass


def prepare_airspace_environment(ui: ConsoleUI, *, dry_run: bool) -> Path:
    """Create an isolated Python environment and install airspace dependencies."""

    python_path = venv_python_path(BUILD_VENV_DIR)
    if not python_path.is_file():
        ui.status("info", "Creating isolated airspace tool environment")
        run_command(
            [sys.executable, "-m", "venv", str(BUILD_VENV_DIR)],
            ui=ui,
            dry_run=dry_run,
            activity_label="Creating Python environment",
        )

    if dry_run and not python_path.is_file():
        return python_path

    dependency_check = subprocess.run(
        [
            str(python_path),
            "-c",
            "import requests, geojson2vt, vt2pbf",
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        check=False,
    )
    if dependency_check.returncode != 0:
        ui.status("info", "Installing FAA airspace generation tools")
        run_command(
            [
                str(python_path),
                "-m",
                "pip",
                "install",
                "--disable-pip-version-check",
                *AIRSPACE_PACKAGES,
            ],
            ui=ui,
            dry_run=dry_run,
            activity_label="Installing airspace tools",
        )
    return python_path


def generate_airspace(ui: ConsoleUI, *, dry_run: bool) -> None:
    """Run the FAA airspace generator inside the isolated build environment."""

    python_path = prepare_airspace_environment(ui, dry_run=dry_run)
    run_command(
        [
            str(python_path),
            "-u",
            str(PROJECT_ROOT / "update_airspace.py"),
        ],
        ui=ui,
        dry_run=dry_run,
        activity_label="Generating FAA airspace tiles",
    )
    if not dry_run:
        valid, detail = validate_mbtiles(AIRSPACE_PATH)
        if not valid:
            raise BuildError(f"Generated airspace database is invalid: {detail}")
        ui.status("ok", f"class_airspace.mbtiles • {detail}")


def collect_app_defaults(
    args: argparse.Namespace,
    ui: ConsoleUI,
    *,
    interactive: bool,
) -> AppDefaults:
    """Resolve optional first-run application settings from CLI flags and prompts."""

    home_lat = (
        bounded_float(args.home_latitude, "Latitude", -90, 90)
        if args.home_latitude is not None
        else None
    )
    home_lon = (
        bounded_float(args.home_longitude, "Longitude", -180, 180)
        if args.home_longitude is not None
        else None
    )
    data_url = validate_http_url(args.feed_url) if args.feed_url is not None else None
    range_nm = (
        bounded_int(args.range_nm, "Radar range", 1, 1000)
        if args.range_nm is not None
        else None
    )
    poll_interval_ms = (
        bounded_int(args.poll_interval, "Polling interval", 100, 60000)
        if args.poll_interval is not None
        else None
    )
    ws_url = validate_ws_url(args.ws_url) if args.ws_url is not None else None
    ws_enabled = True if args.enable_websocket else None
    ui_theme = args.ui_theme
    scope_theme = args.scope_theme
    sound_enabled = True if args.enable_sound else None

    if interactive and ui.confirm(
        "Configure first-run station, feed, and display settings?", default=True
    ):
        home_lat = prompt_validated(
            ui,
            "Home latitude",
            home_lat if home_lat is not None else DEFAULT_HOME_LAT,
            lambda value: bounded_float(value, "Latitude", -90, 90),
        )
        home_lon = prompt_validated(
            ui,
            "Home longitude",
            home_lon if home_lon is not None else DEFAULT_HOME_LON,
            lambda value: bounded_float(value, "Longitude", -180, 180),
        )
        data_url = prompt_validated(
            ui,
            "ADS-B aircraft.json feeder URL",
            data_url or DEFAULT_FEED_URL,
            validate_http_url,
        )
        range_nm = prompt_validated(
            ui,
            "Initial radar range (nautical miles)",
            range_nm if range_nm is not None else DEFAULT_RANGE_NM,
            lambda value: bounded_int(value, "Radar range", 1, 1000),
        )
        poll_interval_ms = prompt_validated(
            ui,
            "HTTP polling interval (milliseconds)",
            poll_interval_ms
            if poll_interval_ms is not None
            else DEFAULT_POLL_INTERVAL_MS,
            lambda value: bounded_int(value, "Polling interval", 100, 60000),
        )
        ui_theme = prompt_validated(
            ui,
            "Initial UI layout (phosphor/console)",
            ui_theme or "phosphor",
            lambda value: validate_choice(value, "UI layout", UI_THEMES),
        )
        scope_theme = prompt_validated(
            ui,
            f"Initial scope theme ({'/'.join(SCOPE_THEMES)})",
            scope_theme or "phosphor",
            lambda value: validate_choice(value, "Scope theme", SCOPE_THEMES),
        )
        sound_enabled = ui.confirm(
            "Enable emergency and conflict sounds by default?",
            default=bool(sound_enabled),
        )
        configure_ws = ui.confirm(
            "Configure an optional WebSocket feeder?", default=bool(ws_url)
        )
        if configure_ws:
            ws_url = prompt_validated(
                ui,
                "WebSocket feeder URL",
                ws_url or "ws://localhost:8765",
                validate_ws_url,
            )
            ws_enabled = ui.confirm(
                "Enable the WebSocket feeder by default?", default=True
            )
        else:
            ws_url = ""
            ws_enabled = False

    if ws_enabled and not ws_url:
        raise BuildError("--enable-websocket requires --ws-url or interactive setup.")

    return AppDefaults(
        home_lat=home_lat,
        home_lon=home_lon,
        data_url=data_url,
        range_nm=range_nm,
        poll_interval_ms=poll_interval_ms,
        ws_url=ws_url,
        ws_enabled=ws_enabled,
        ui_theme=ui_theme,
        scope_theme=scope_theme,
        sound_enabled=sound_enabled,
    )


def write_runtime_config(output_dir: Path, defaults: AppDefaults) -> Path:
    """Atomically write first-run defaults into a completed release."""

    destination = output_dir / "runtime-config.json"
    temporary = destination.with_name(f".{destination.name}.{os.getpid()}.part")
    payload = {
        "version": 1,
        "generatedBy": f"ADSB Radarscope build.py {SCRIPT_VERSION}",
        "settings": defaults.to_settings(),
    }
    try:
        temporary.write_text(
            json.dumps(payload, indent=2, allow_nan=False) + "\n",
            encoding="utf-8",
        )
        os.replace(temporary, destination)
    except (OSError, ValueError) as exc:
        raise BuildError(f"Could not write {destination.name}: {exc}") from exc
    finally:
        try:
            temporary.unlink(missing_ok=True)
        except OSError:
            pass
    return destination


def build_application(
    options: BuildOptions,
    *,
    npm: str,
    ui: ConsoleUI,
) -> None:
    """Invoke the production Vite build and validate its release contents."""

    build_env = npm_environment(npm)
    run_command(
        [npm, "run", "build", "--", "--outDir", str(options.output_dir)],
        ui=ui,
        env=build_env,
        dry_run=options.dry_run,
        activity_label="Compiling production release",
    )
    if not options.dry_run:
        index_path = options.output_dir / "index.html"
        if not index_path.is_file():
            raise BuildError(f"Build completed without creating {index_path}")
        for spec in DATASETS:
            if not (options.output_dir / "data" / spec.name).is_file():
                raise BuildError(f"Build output is missing data/{spec.name}")
        if not options.skip_airspace and not (
            options.output_dir / "data" / AIRSPACE_PATH.name
        ).is_file():
            raise BuildError(f"Build output is missing data/{AIRSPACE_PATH.name}")
        try:
            shutil.copy2(PROJECT_ROOT / "serve.py", options.output_dir / "serve.py")
        except OSError as exc:
            raise BuildError(f"Could not add the local runtime launcher: {exc}") from exc
        config_path = write_runtime_config(options.output_dir, options.app_defaults)
        ui.status("ok", f"First-run settings • {config_path.name}")


def install_node_dependencies(
    options: BuildOptions,
    *,
    npm: str,
    ui: ConsoleUI,
) -> None:
    """Install the exact Node dependency graph recorded in the lockfile."""

    if not options.install_node:
        ui.status("skip", "Node dependency installation disabled")
        return
    install_action = "ci" if (PROJECT_ROOT / "package-lock.json").is_file() else "install"
    install_command = [
        npm,
        install_action,
        "--loglevel=error",
        "--no-fund",
        "--no-audit",
    ]
    run_command(
        install_command,
        ui=ui,
        env=npm_environment(npm),
        dry_run=options.dry_run,
        activity_label="Installing application dependencies",
        suppress_output_prefixes=("npm warn deprecated",),
    )
    ui.status("info", "Auditing production dependencies")
    run_command(
        [npm, "audit", "--omit=dev", "--audit-level=high", "--loglevel=error"],
        ui=ui,
        env=npm_environment(npm),
        dry_run=options.dry_run,
        activity_label="Auditing production dependencies",
    )


def inspect_data() -> tuple[list[tuple[DatasetSpec, bool, str]], tuple[bool, str]]:
    """Return validation results for all release datasets."""

    csv_results = [(spec, *validate_csv(spec.destination, spec)) for spec in DATASETS]
    return csv_results, validate_mbtiles(AIRSPACE_PATH)


def show_check(ui: ConsoleUI, npm_override: str | None) -> int:
    """Display a read-only release prerequisite report."""

    csv_results, airspace_result = inspect_data()
    rows = [
        (spec.name, f"{'READY' if valid else 'MISSING'} • {detail}")
        for spec, valid, detail in csv_results
    ]
    rows.append(
        (
            AIRSPACE_PATH.name,
            f"{'READY' if airspace_result[0] else 'MISSING'} • {airspace_result[1]}",
        )
    )
    try:
        npm = find_npm(npm_override)
        rows.append(("npm", npm))
        npm_ready = True
    except BuildError as exc:
        rows.append(("npm", str(exc)))
        npm_ready = False
    ui.panel("release readiness", rows)
    ready = all(valid for _, valid, _ in csv_results) and airspace_result[0] and npm_ready
    ui.status("ok" if ready else "warn", "Release inputs ready" if ready else "Action required")
    return 0 if ready else 1


def make_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Interactive data acquisition and release builder for ADSB Radarscope v2.",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument("--output", help="Vite release output folder inside the project")
    parser.add_argument("--feed-url", help="First-run ADS-B aircraft.json URL")
    parser.add_argument("--home-latitude", type=float, help="First-run home latitude")
    parser.add_argument("--home-longitude", type=float, help="First-run home longitude")
    parser.add_argument("--range-nm", type=int, help="First-run radar range in nautical miles")
    parser.add_argument(
        "--poll-interval",
        type=int,
        help="First-run HTTP polling interval in milliseconds",
    )
    parser.add_argument("--ws-url", help="Optional first-run WebSocket feeder URL")
    parser.add_argument(
        "--enable-websocket",
        action="store_true",
        help="Enable the configured WebSocket feeder by default",
    )
    parser.add_argument(
        "--ui-theme",
        choices=UI_THEMES,
        help="First-run application layout",
    )
    parser.add_argument(
        "--scope-theme",
        choices=SCOPE_THEMES,
        help="First-run radar scope theme",
    )
    parser.add_argument(
        "--enable-sound",
        action="store_true",
        help="Enable alert sounds by default",
    )
    parser.add_argument("--refresh-data", action="store_true", help="Redownload all OurAirports CSVs")
    parser.add_argument("--refresh-airspace", action="store_true", help="Regenerate FAA airspace MBTiles")
    parser.add_argument("--skip-airspace", action="store_true", help="Do not generate or require airspace data")
    parser.add_argument("--skip-install", action="store_true", help="Skip npm ci/npm install")
    parser.add_argument("--data-only", action="store_true", help="Prepare datasets without building the web app")
    parser.add_argument("--check", action="store_true", help="Inspect prerequisites without changing files")
    parser.add_argument("--dry-run", action="store_true", help="Show planned commands without changing files")
    parser.add_argument("--yes", action="store_true", help="Accept smart defaults without prompting")
    parser.add_argument("--npm", dest="npm_command", help="Explicit npm or npm.cmd executable")
    parser.add_argument("--no-color", action="store_true", help="Disable ANSI colors")
    parser.add_argument(
        "--serve",
        action="store_true",
        help="Serve the completed release with the local ADS-B CORS relay",
    )
    parser.add_argument(
        "--serve-only",
        action="store_true",
        help="Serve an existing output folder without rebuilding it",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=LOCAL_SERVER_PORT,
        help="Loopback port used by --serve or --serve-only",
    )
    parser.add_argument(
        "--no-open",
        action="store_true",
        help="Do not open a browser when starting the local server",
    )
    return parser


def collect_options(args: argparse.Namespace, ui: ConsoleUI) -> BuildOptions:
    """Combine CLI flags, current data health, and interactive wizard choices."""

    csv_results, airspace_result = inspect_data()
    csv_missing = any(not valid for _, valid, _ in csv_results)
    airspace_missing = not airspace_result[0]
    interactive = ui.interactive and not args.yes

    output_value = args.output or "dist"
    refresh_csv = args.refresh_data or csv_missing
    refresh_airspace = args.refresh_airspace or (airspace_missing and not args.skip_airspace)
    install_node = not args.skip_install

    if interactive:
        if not args.data_only:
            output_value = ui.prompt("Release output folder", output_value)
        if not args.refresh_data and not csv_missing:
            refresh_csv = ui.confirm(
                "Download current OurAirports CSV data?", default=False
            )
        if not args.refresh_airspace and not args.skip_airspace and not airspace_missing:
            refresh_airspace = ui.confirm(
                "Download current FAA airspace data and generate tiles?",
                default=False,
            )
        if not args.data_only and not args.skip_install:
            install_node = ui.confirm("Install exact locked Node dependencies?", default=True)

    app_defaults = (
        AppDefaults()
        if args.data_only
        else collect_app_defaults(args, ui, interactive=interactive)
    )
    output_dir = resolve_output_dir(output_value)
    options = BuildOptions(
        output_dir=output_dir,
        refresh_csv=refresh_csv,
        refresh_airspace=refresh_airspace,
        skip_airspace=args.skip_airspace,
        install_node=install_node,
        data_only=args.data_only,
        app_defaults=app_defaults,
        dry_run=args.dry_run,
    )

    configured_settings = app_defaults.to_settings()
    location = (
        f"{app_defaults.home_lat:g}, {app_defaults.home_lon:g}"
        if app_defaults.home_lat is not None and app_defaults.home_lon is not None
        else "APPLICATION DEFAULT"
    )
    connection_detail = (
        f"{app_defaults.range_nm} NM • {app_defaults.poll_interval_ms} ms"
        if app_defaults.poll_interval_ms is not None and app_defaults.range_nm is not None
        else "APPLICATION DEFAULTS"
    )

    ui.panel(
        "execution plan",
        (
            (
                "OurAirports CSVs",
                "DOWNLOAD CURRENT DATA" if refresh_csv else "VALIDATE + REUSE",
            ),
            (
                "FAA airspace",
                "SKIP"
                if args.skip_airspace
                else "DOWNLOAD + GENERATE TILES"
                if refresh_airspace
                else "VALIDATE + REUSE",
            ),
            ("Home station", location),
            ("ADS-B HTTP feed", app_defaults.data_url or "USER CONFIGURES AT RUNTIME"),
            ("Range / polling", connection_detail),
            (
                "WebSocket",
                f"ENABLED • {app_defaults.ws_url}"
                if app_defaults.ws_enabled
                else "DISABLED",
            ),
            (
                "First-run settings",
                f"{len(configured_settings)} CONFIGURED"
                if configured_settings
                else "APPLICATION DEFAULTS",
            ),
            (
                "Node dependencies",
                "NOT REQUIRED"
                if args.data_only
                else "INSTALL LOCKFILE"
                if install_node
                else "REUSE INSTALLED",
            ),
            ("Output", "DATA ONLY" if args.data_only else str(output_dir)),
        ),
    )
    if interactive and not ui.confirm("Execute this release plan?", default=True):
        raise KeyboardInterrupt
    return options


def execute(options: BuildOptions, args: argparse.Namespace, ui: ConsoleUI) -> None:
    """Execute the resolved release plan."""

    total_stages = 3 if options.data_only else 5
    ui.stage(1, total_stages, "preflight")
    if sys.version_info < (3, 9):
        raise BuildError("Python 3.9 or newer is required.")
    if not (PROJECT_ROOT / "package.json").is_file():
        raise BuildError("package.json is missing; run the builder from the project checkout.")
    ui.status("ok", f"Project root • {PROJECT_ROOT}")
    ui.status("info", "ADS-B receiver URL remains user-configurable at runtime")

    ui.stage(2, total_stages, "OurAirports reference data")
    if not options.dry_run:
        PUBLIC_DATA_DIR.mkdir(parents=True, exist_ok=True)
    for spec in DATASETS:
        valid, detail = validate_csv(spec.destination, spec)
        if options.refresh_csv or not valid:
            if options.dry_run:
                ui.status("skip", f"would download {spec.url}")
            else:
                download_dataset(spec, ui)
        else:
            ui.status("ok", f"{spec.name} cached • {detail}")

    ui.stage(3, total_stages, "FAA controlled airspace")
    airspace_valid, airspace_detail = validate_mbtiles(AIRSPACE_PATH)
    if options.skip_airspace:
        ui.status("skip", "Airspace generation disabled")
    elif options.refresh_airspace or not airspace_valid:
        generate_airspace(ui, dry_run=options.dry_run)
    else:
        ui.status("ok", f"class_airspace.mbtiles cached • {airspace_detail}")

    if not options.skip_airspace and not options.dry_run:
        from airspace_tiles import export_airspace_tiles
        count = export_airspace_tiles(AIRSPACE_PATH, PUBLIC_DATA_DIR / 'airspace')
        ui.status("ok", f"Viewport airspace package ready: {count:,} individually loadable tiles")

    if options.data_only:
        return

    npm = find_npm(args.npm_command)
    ui.stage(4, total_stages, "locked application dependencies")
    ui.status("info", f"Package manager • {npm}")
    install_node_dependencies(options, npm=npm, ui=ui)

    ui.stage(5, total_stages, "production compilation")
    build_application(options, npm=npm, ui=ui)


def main(argv: Sequence[str] | None = None) -> int:
    configure_console_encoding()
    parser = make_parser()
    args = parser.parse_args(argv)
    if args.refresh_airspace and args.skip_airspace:
        parser.error("--refresh-airspace cannot be combined with --skip-airspace")
    if not 1 <= args.port <= 65535:
        parser.error("--port must be between 1 and 65535")
    if args.serve and args.serve_only:
        parser.error("--serve cannot be combined with --serve-only")
    if args.data_only and (args.serve or args.serve_only):
        parser.error("--data-only cannot be combined with --serve or --serve-only")
    if args.dry_run and (args.serve or args.serve_only):
        parser.error("--dry-run cannot be combined with --serve or --serve-only")
    if args.check and (args.serve or args.serve_only):
        parser.error("--check cannot be combined with --serve or --serve-only")
    ui = ConsoleUI(no_color=args.no_color)
    ui.banner()

    if args.check:
        return show_check(ui, args.npm_command)

    if args.serve_only:
        try:
            default_serve_dir = "." if (PROJECT_ROOT / "index.html").is_file() else "dist"
            serve_release(
                resolve_serve_dir(args.output or default_serve_dir),
                ui=ui,
                port=args.port,
                open_browser=not args.no_open,
            )
        except BuildError as exc:
            ui.status("error", str(exc))
            return 1
        return 0

    started = time.monotonic()
    try:
        options = collect_options(args, ui)
        execute(options, args, ui)
    except KeyboardInterrupt:
        print()
        ui.status("warn", "Build cancelled; existing release files were preserved where possible")
        return 130
    except BuildError as exc:
        print()
        ui.status("error", str(exc))
        return 1

    elapsed = time.monotonic() - started
    rows = [
        ("Result", "DATA READY" if options.data_only else "RELEASE BUILD READY"),
        ("Elapsed", f"{elapsed:.1f} seconds"),
        ("Reference data", str(PUBLIC_DATA_DIR)),
    ]
    if not options.data_only:
        rows.append(("Release folder", str(options.output_dir)))
        rows.append(
            (
                "Preview",
                f"python {options.output_dir / 'serve.py'}",
            )
        )
    ui.panel("fabrication complete", rows)
    ui.status("ok", "All requested stages completed")
    if args.serve:
        try:
            serve_release(
                options.output_dir,
                ui=ui,
                port=args.port,
                open_browser=not args.no_open,
            )
        except BuildError as exc:
            ui.status("error", str(exc))
            return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
