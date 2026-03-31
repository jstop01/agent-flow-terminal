#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# run.sh — Launch the Agent Flow Monitor desktop overlay
# ---------------------------------------------------------------------------
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ---------- colour helpers --------------------------------------------------
green()  { printf '\033[0;32m%s\033[0m\n' "$*"; }
yellow() { printf '\033[0;33m%s\033[0m\n' "$*"; }
red()    { printf '\033[0;31m%s\033[0m\n' "$*"; }

# ---------- Python interpreter ----------------------------------------------
# Prefer python3; fall back to python.
if command -v python3 &>/dev/null; then
    PYTHON=python3
elif command -v python &>/dev/null; then
    PYTHON=python
else
    red "ERROR: python3 not found. Please install Python 3.9+."
    exit 1
fi

PY_VERSION=$("$PYTHON" -c 'import sys; print(sys.version_info[:2])')
yellow "Using $PYTHON ($PY_VERSION)"

# ---------- pip dependency check / install ----------------------------------
REQUIREMENTS="$SCRIPT_DIR/requirements.txt"
PIP="$PYTHON -m pip"

install_deps() {
    yellow "Installing Python dependencies …"
    $PIP install --quiet --upgrade pip
    $PIP install --quiet -r "$REQUIREMENTS"
    green "Dependencies installed."
}

# Check whether pywebview is importable; install if not.
if ! "$PYTHON" -c "import webview" &>/dev/null; then
    yellow "pywebview not found."
    install_deps
else
    # Still run a quiet install so any missing transitive deps are satisfied.
    $PIP install --quiet -r "$REQUIREMENTS" 2>/dev/null || true
fi

# ---------- pnpm sanity check -----------------------------------------------
if ! command -v pnpm &>/dev/null; then
    red "ERROR: pnpm not found on PATH."
    red "Install it with:  npm install -g pnpm"
    exit 1
fi

# ---------- Launch ----------------------------------------------------------
green "Starting Agent Flow Monitor …"
exec "$PYTHON" "$SCRIPT_DIR/app.py" "$@"
