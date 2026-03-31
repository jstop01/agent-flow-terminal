#!/usr/bin/env bash
# =============================================================================
# Agent Flow Monitor — macOS .app 빌드 스크립트
#
# 실행 순서:
#   1. py2app 설치 확인 및 자동 설치
#   2. Next.js 웹앱 정적 빌드 (pnpm run build:web)
#   3. 릴레이 스크립트 번들 빌드 (node scripts/build-relay.js)
#   4. 빌드 결과물을 desktop/resources/ 하위로 복사
#      - web/   : 빌드된 Next.js 정적 파일
#      - relay/ : 번들된 릴레이 JS 파일
#      - bin/   : Node.js 실행 바이너리
#   5. py2app으로 .app 번들 생성
#   6. 최종 산출물 경로 출력
# =============================================================================

set -euo pipefail  # 오류 발생 시 즉시 중단, 미정의 변수 금지, 파이프 오류 전파

# -----------------------------------------------------------------------------
# 경로 설정
# -----------------------------------------------------------------------------

# 이 스크립트가 위치한 desktop/ 디렉토리
DESKTOP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# 프로젝트 루트 (desktop/ 의 부모 디렉토리)
PROJECT_ROOT="$(dirname "$DESKTOP_DIR")"

# 리소스 디렉토리 (py2app 번들에 포함될 파일들)
RESOURCES_DIR="$DESKTOP_DIR/resources"

# Next.js 정적 빌드 결과물 위치 (output: 'export' → out/)
WEB_BUILD_DIR="$PROJECT_ROOT/web/out"

# 릴레이 번들 파일 위치 (build-relay.js 가 출력하는 경로)
RELAY_BUILD_FILE="$PROJECT_ROOT/scripts/.dev-relay.js"

# Node.js 바이너리 경로 (현재 PATH 에서 찾음)
NODE_BIN="$(which node)"

# -----------------------------------------------------------------------------
# 유틸리티 함수
# -----------------------------------------------------------------------------

# 색상 출력 (터미널 지원 여부 확인)
if [ -t 1 ]; then
    RED='\033[0;31m'
    GREEN='\033[0;32m'
    YELLOW='\033[1;33m'
    BLUE='\033[0;34m'
    BOLD='\033[1m'
    RESET='\033[0m'
else
    RED='' GREEN='' YELLOW='' BLUE='' BOLD='' RESET=''
fi

info()    { echo -e "${BLUE}[info]${RESET}  $*"; }
success() { echo -e "${GREEN}[ok]${RESET}    $*"; }
warn()    { echo -e "${YELLOW}[warn]${RESET}  $*"; }
error()   { echo -e "${RED}[error]${RESET} $*" >&2; }
step()    { echo -e "\n${BOLD}==> $*${RESET}"; }

# -----------------------------------------------------------------------------
# Step 0: py2app 설치 확인 및 자동 설치
# -----------------------------------------------------------------------------
step "py2app 설치 확인"

if python3 -c "import py2app" 2>/dev/null; then
    PY2APP_VER="$(python3 -c "import py2app; print(py2app.__version__)")"
    success "py2app 이미 설치됨 (v${PY2APP_VER})"
else
    warn "py2app 미설치 — pip3 로 설치 중…"
    pip3 install py2app
    success "py2app 설치 완료"
fi

# -----------------------------------------------------------------------------
# Step 1: Next.js 웹앱 정적 빌드
# -----------------------------------------------------------------------------
step "Next.js 웹앱 빌드 (pnpm run build:web)"

info "프로젝트 루트: $PROJECT_ROOT"
(cd "$PROJECT_ROOT" && pnpm run build:web)
success "웹앱 빌드 완료"

# -----------------------------------------------------------------------------
# Step 2: 릴레이 JS 번들 빌드
# -----------------------------------------------------------------------------
step "릴레이 번들 빌드 (node scripts/build-relay.js)"

(cd "$PROJECT_ROOT" && node scripts/build-relay.js)
success "릴레이 빌드 완료 → $RELAY_BUILD_FILE"

# -----------------------------------------------------------------------------
# Step 3: 빌드된 웹 파일을 resources/web/ 에 복사
# -----------------------------------------------------------------------------
step "웹 파일 복사 → resources/web/"

WEB_DEST="$RESOURCES_DIR/web"
rm -rf "$WEB_DEST"
mkdir -p "$WEB_DEST"

if [ -d "$WEB_BUILD_DIR" ]; then
    # Next.js 빌드 결과 디렉토리 전체 복사
    cp -R "$WEB_BUILD_DIR/." "$WEB_DEST/"
    success "웹 파일 복사 완료 ($WEB_BUILD_DIR → $WEB_DEST)"
else
    error "Next.js 빌드 결과물을 찾을 수 없습니다: $WEB_BUILD_DIR"
    error "pnpm run build:web 가 실패했거나 출력 경로가 다를 수 있습니다."
    exit 1
fi

# -----------------------------------------------------------------------------
# Step 4: 릴레이 JS를 resources/relay/ 에 복사
# -----------------------------------------------------------------------------
step "릴레이 파일 복사 → resources/relay/"

RELAY_DEST="$RESOURCES_DIR/relay"
rm -rf "$RELAY_DEST"
mkdir -p "$RELAY_DEST"

if [ -f "$RELAY_BUILD_FILE" ]; then
    cp "$RELAY_BUILD_FILE" "$RELAY_DEST/relay.js"
    # 소스맵이 있으면 같이 복사
    if [ -f "${RELAY_BUILD_FILE}.map" ]; then
        cp "${RELAY_BUILD_FILE}.map" "$RELAY_DEST/relay.js.map"
    fi
    success "릴레이 파일 복사 완료 → $RELAY_DEST/relay.js"
else
    error "릴레이 번들 파일을 찾을 수 없습니다: $RELAY_BUILD_FILE"
    exit 1
fi

# -----------------------------------------------------------------------------
# Step 5: Node.js 바이너리를 resources/bin/ 에 복사
# (릴레이를 .app 번들 내부에서 실행하기 위해 node 바이너리 포함)
# -----------------------------------------------------------------------------
step "Node.js 바이너리 복사 → resources/bin/"

BIN_DEST="$RESOURCES_DIR/bin"
rm -rf "$BIN_DEST"
mkdir -p "$BIN_DEST"

if [ -z "$NODE_BIN" ]; then
    error "Node.js 바이너리를 찾을 수 없습니다. Node.js 가 설치되어 있는지 확인하세요."
    exit 1
fi

cp "$NODE_BIN" "$BIN_DEST/node"
NODE_VERSION="$("$NODE_BIN" --version)"
success "Node.js 복사 완료 ($NODE_VERSION) → $BIN_DEST/node"

# 복사된 바이너리가 실행 가능한지 확인
chmod +x "$BIN_DEST/node"

# -----------------------------------------------------------------------------
# Step 6: py2app으로 .app 번들 생성
# -----------------------------------------------------------------------------
step "py2app 빌드 시작"

info "작업 디렉토리: $DESKTOP_DIR"
cd "$DESKTOP_DIR"

# 이전 빌드 캐시 정리 (선택사항 — 클린 빌드 보장)
if [ -d "build" ] || [ -d "dist" ]; then
    warn "이전 빌드 결과물 정리 중 (build/, dist/)…"
    rm -rf build dist
fi

# py2app 실행
python3 setup.py py2app

# -----------------------------------------------------------------------------
# Step 7: 결과 확인 및 경로 출력
# -----------------------------------------------------------------------------
APP_BUNDLE="$DESKTOP_DIR/dist/Agent Flow Monitor.app"

echo ""
if [ -d "$APP_BUNDLE" ]; then
    APP_SIZE="$(du -sh "$APP_BUNDLE" 2>/dev/null | cut -f1)"
    echo -e "${GREEN}${BOLD}빌드 성공!${RESET}"
    echo -e "  앱 번들 위치: ${BOLD}$APP_BUNDLE${RESET}"
    echo -e "  앱 번들 크기: ${APP_SIZE}"
    echo ""
    echo "실행 방법:"
    echo "  open \"$APP_BUNDLE\""
    echo "  또는 Finder 에서 더블클릭"
else
    error "빌드는 완료됐지만 .app 번들을 찾을 수 없습니다."
    error "예상 경로: $APP_BUNDLE"
    error "dist/ 디렉토리 내용을 확인하세요:"
    ls -la "$DESKTOP_DIR/dist/" 2>/dev/null || true
    exit 1
fi
