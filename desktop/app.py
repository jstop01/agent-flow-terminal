#!/usr/bin/env python3
"""
Agent Flow Monitor — desktop overlay
Wraps the Next.js web UI (http://localhost:1117) in an always-on-top
frameless pywebview window and manages the pnpm dev child process.
"""

import os
import sys
import signal
import subprocess
import threading
import time
import urllib.request
import urllib.error
import shutil

import webview

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

PROJECT_DIR   = "/Users/jaeseok/agent-flow-custom"
SERVER_CMD    = ["pnpm", "run", "dev"]
SERVER_ENV    = {**os.environ, "NEXT_PUBLIC_DEMO": "0", "PORT": "1117"}
SERVER_URL    = "http://localhost:1117"
WINDOW_TITLE  = "Agent Flow Monitor"
WINDOW_W      = 1200
WINDOW_H      = 800
POLL_INTERVAL = 1.0   # seconds between readiness checks
POLL_TIMEOUT  = 120   # seconds before giving up

# ---------------------------------------------------------------------------
# Global state
# ---------------------------------------------------------------------------

_server_proc = None  # type: subprocess.Popen | None
_window = None       # type: webview.Window | None


# ---------------------------------------------------------------------------
# Server lifecycle
# ---------------------------------------------------------------------------

def start_server() -> subprocess.Popen:
    """Start pnpm run dev and return the Popen handle."""
    print(f"[agent-flow] Starting server: {' '.join(SERVER_CMD)}")
    proc = subprocess.Popen(
        SERVER_CMD,
        cwd=PROJECT_DIR,
        env=SERVER_ENV,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )
    # Stream server output to our stdout in a background thread so it
    # doesn't block but is still visible when running from a terminal.
    def _pipe_output():
        for line in proc.stdout:  # type: ignore[union-attr]
            print(f"[pnpm] {line}", end="")
    threading.Thread(target=_pipe_output, daemon=True).start()
    return proc


def wait_for_server(url: str, timeout: float = POLL_TIMEOUT) -> bool:
    """Return True once *url* responds with HTTP 2xx/3xx, False on timeout."""
    deadline = time.monotonic() + timeout
    attempt  = 0
    while time.monotonic() < deadline:
        attempt += 1
        try:
            with urllib.request.urlopen(url, timeout=3) as resp:
                if resp.status < 400:
                    print(f"[agent-flow] Server ready after {attempt} poll(s).")
                    return True
        except Exception:
            pass
        print(f"[agent-flow] Waiting for {url} … (attempt {attempt})")
        time.sleep(POLL_INTERVAL)
    return False


def shutdown_server():
    """Kill the child server process group gracefully."""
    global _server_proc
    if _server_proc is None:
        return
    proc = _server_proc
    _server_proc = None
    print("[agent-flow] Shutting down server …")
    try:
        # Try SIGTERM to the whole process group first (kills pnpm + node)
        os.killpg(os.getpgid(proc.pid), signal.SIGTERM)
        proc.wait(timeout=8)
    except Exception:
        try:
            proc.kill()
        except Exception:
            pass
    print("[agent-flow] Server stopped.")


# ---------------------------------------------------------------------------
# Always-on-top toggle (exposed to JS so a button in the UI can call it)
# ---------------------------------------------------------------------------

class Api:
    """JS-accessible API object injected into the webview."""

    def toggle_always_on_top(self):
        if _window is None:
            return
        current = _window.on_top
        _window.on_top = not current
        print(f"[agent-flow] always-on-top → {not current}")
        return not current

    def close_window(self):
        if _window is not None:
            _window.destroy()


# ---------------------------------------------------------------------------
# Signal handling
# ---------------------------------------------------------------------------

def _handle_signal(signum, frame):
    print(f"\n[agent-flow] Received signal {signum}, exiting …")
    shutdown_server()
    if _window is not None:
        try:
            _window.destroy()
        except Exception:
            pass
    sys.exit(0)


signal.signal(signal.SIGINT,  _handle_signal)
signal.signal(signal.SIGTERM, _handle_signal)


# ---------------------------------------------------------------------------
# Drag support via injected JS (frameless window needs manual dragging)
# ---------------------------------------------------------------------------

DRAG_JS = """
(function() {
    // Allow dragging anywhere on the page when no interactive element is held
    let dragging = false, startX, startY;

    document.addEventListener('mousedown', function(e) {
        // Skip if clicking a button, input, select, textarea, anchor, or
        // an element that explicitly opts out of dragging
        const tag = e.target.tagName.toLowerCase();
        if (['button','input','select','textarea','a'].includes(tag)) return;
        if (e.target.closest('[data-no-drag]')) return;
        dragging = true;
        startX = e.screenX;
        startY = e.screenY;
    }, true);

    document.addEventListener('mousemove', function(e) {
        if (!dragging) return;
        // pywebview doesn't expose window.moveTo from JS on macOS; rely on
        // the native window drag handle instead — this block intentionally
        // left empty so the listener doesn't interfere with scrolling.
    }, true);

    document.addEventListener('mouseup', function() {
        dragging = false;
    }, true);
})();
"""


def _on_loaded():
    """Called each time a page finishes loading."""
    if _window is not None:
        _window.evaluate_js(DRAG_JS)


# ---------------------------------------------------------------------------
# Keyboard shortcut: Ctrl+Shift+T → toggle always-on-top
# (handled at the OS level via a background thread)
# ---------------------------------------------------------------------------

def _keyboard_listener(api: Api):
    """
    Minimal cross-platform keyboard shortcut poller.
    On macOS we use Quartz event taps; fall back to a no-op if unavailable.
    """
    try:
        from Quartz import (
            CGEventTapCreate, kCGSessionEventTap,
            kCGHeadInsertEventTap, kCGEventKeyDown,
            CGEventGetFlags, CGEventGetIntegerValueField,
            kCGKeyboardEventKeycode, kCGEventFlagMaskControl,
            kCGEventFlagMaskShift,
        )
        # Key code 17 = 't' on macOS QWERTY
        T_KEYCODE = 17

        def callback(proxy, event_type, event, refcon):
            flags = CGEventGetFlags(event)
            ctrl  = bool(flags & kCGEventFlagMaskControl)
            shift = bool(flags & kCGEventFlagMaskShift)
            code  = CGEventGetIntegerValueField(event, kCGKeyboardEventKeycode)
            if ctrl and shift and code == T_KEYCODE:
                api.toggle_always_on_top()
            return event

        tap = CGEventTapCreate(
            kCGSessionEventTap,
            kCGHeadInsertEventTap,
            0,
            1 << kCGEventKeyDown,
            callback,
            None,
        )
        if tap:
            import CoreFoundation as CF
            loop_source = CF.CFMachPortCreateRunLoopSource(None, tap, 0)
            CF.CFRunLoopAddSource(CF.CFRunLoopGetCurrent(), loop_source,
                                  CF.kCFRunLoopDefaultMode)
            from Quartz import CGEventTapEnable
            CGEventTapEnable(tap, True)
            CF.CFRunLoopRun()
    except Exception as exc:
        print(f"[agent-flow] Keyboard shortcut listener unavailable: {exc}")


# ---------------------------------------------------------------------------
# Standalone mode helpers
# ---------------------------------------------------------------------------

def _find_node() -> str:
    """Find node binary."""
    # Check bundled location first (for .app bundle)
    bundled = os.path.join(os.path.dirname(__file__), 'resources', 'bin', 'node')
    if os.path.isfile(bundled) and os.access(bundled, os.X_OK):
        return bundled
    for path in ['/opt/homebrew/bin/node', '/usr/local/bin/node']:
        if os.path.isfile(path):
            return path
    found = shutil.which('node')
    if found:
        return found
    raise FileNotFoundError("node를 찾을 수 없습니다")


def _find_project_dir() -> str:
    """Find the project directory (works both in dev and .app bundle)."""
    # Check if running from .app bundle (resources dir)
    res_dir = os.path.join(os.path.dirname(__file__), 'resources')
    if os.path.isdir(res_dir):
        return res_dir
    # Development: go up from desktop/ to project root
    return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def start_static_server(web_dir: str, port: int) -> threading.Thread:
    """Start a simple HTTP server for static files on a background thread."""
    import http.server
    import functools

    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=web_dir)
    httpd = http.server.HTTPServer(('127.0.0.1', port), handler)

    t = threading.Thread(target=httpd.serve_forever, daemon=True)
    t.start()
    print(f"[agent-flow] 정적 파일 서버 시작: http://127.0.0.1:{port} (dir: {web_dir})")
    return t


def start_relay(project_dir: str) -> subprocess.Popen:
    """Start the relay server using Node.js."""
    node = _find_node()
    # Check for bundled relay first, then dev location
    relay_js = os.path.join(project_dir, 'relay', 'relay.js')
    if not os.path.isfile(relay_js):
        relay_js = os.path.join(project_dir, 'scripts', '.dev-relay.js')
    if not os.path.isfile(relay_js):
        print("[agent-flow] 릴레이 파일을 찾을 수 없습니다")
        return None

    print(f"[agent-flow] 릴레이 시작: {node} {relay_js}")
    proc = subprocess.Popen(
        [node, relay_js],
        cwd=project_dir,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )
    def _pipe():
        for line in proc.stdout:
            print(f"[relay] {line}", end="")
    threading.Thread(target=_pipe, daemon=True).start()
    return proc


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def _is_server_running(url: str) -> bool:
    """Check if server is already responding."""
    try:
        with urllib.request.urlopen(url, timeout=2) as resp:
            return resp.status < 400
    except Exception:
        return False


def main():
    global _server_proc, _window

    project_dir = _find_project_dir()
    web_out_dir = os.path.join(project_dir, 'web', 'out')

    # Try standalone mode: static files + relay
    if os.path.isdir(web_out_dir) and os.path.isfile(os.path.join(web_out_dir, 'index.html')):
        print("[agent-flow] 스탠드얼론 모드: 정적 파일 + 릴레이")

        # Start relay server (port 3001)
        relay_proc = start_relay(project_dir)
        if relay_proc:
            import atexit
            atexit.register(lambda: relay_proc.terminate())

        # Start static file server on the web port
        start_static_server(web_out_dir, 1117)

    elif _is_server_running(SERVER_URL):
        print(f"[agent-flow] 기존 서버 사용: {SERVER_URL}")
    else:
        # Fallback: start pnpm dev
        _server_proc = start_server()
        ready = wait_for_server(SERVER_URL, timeout=POLL_TIMEOUT)
        if not ready:
            print(f"[agent-flow] ERROR: 서버 시작 실패")
            shutdown_server()
            sys.exit(1)

    # 3. Create the API object (JS bridge)
    api = Api()

    # 4. Start keyboard shortcut listener in background
    t = threading.Thread(target=_keyboard_listener, args=(api,), daemon=True)
    t.start()

    # 5. Create pywebview window
    _window = webview.create_window(
        title=WINDOW_TITLE,
        url=SERVER_URL,
        width=WINDOW_W,
        height=WINDOW_H,
        resizable=True,
        frameless=False,   # Keep the OS chrome — needed for reliable dragging
        on_top=True,
        js_api=api,
    )

    _window.events.loaded += _on_loaded

    # 6. Start the GUI event loop (blocks until window is closed)
    try:
        webview.start(debug=False)
    finally:
        shutdown_server()


if __name__ == "__main__":
    main()
