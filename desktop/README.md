# Agent Flow Monitor - Desktop App

Claude Code 세션을 실시간으로 시각화하는 데스크톱 앱.

## 요구사항

- **macOS 12+**
- **Node.js 18+** (`brew install node`)
- **pnpm** (`npm install -g pnpm`)
- **Python 3.9+** (macOS 기본 포함)
- **Claude Code** (`claude` CLI 설치 필요)

## 설치

```bash
# 1. 프로젝트 클론
git clone https://github.com/jstop01/agent-flow-terminal.git
cd agent-flow-terminal

# 2. Node.js 의존성 설치
pnpm install

# 3. Python 의존성 설치
pip3 install -r desktop/requirements.txt

# 4. Claude Code 훅 설치 (최초 1회)
node scripts/setup.js
```

## 실행

### 방법 1: 한 줄 실행 (추천)
```bash
cd desktop && ./run.sh
```
Python 의존성 자동 확인 + 앱 실행. 서버가 이미 떠있으면 재사용합니다.

### 방법 2: 서버 + 앱 분리 실행
```bash
# 터미널 1: 릴레이 + 웹 서버
cd agent-flow-terminal
NEXT_PUBLIC_DEMO=0 PORT=1117 pnpm run dev

# 터미널 2: 데스크톱 앱
cd agent-flow-terminal/desktop
python3 app.py
```

### 방법 3: .app 번들 (빌드 후)
```bash
cd desktop && ./build.sh
open dist/AgentFlowMonitor.app
```

## 주요 기능

- **실시간 모니터링**: Claude Code 세션의 에이전트, 도구 호출, 토큰 사용량 시각화
- **한글 UI**: 전체 인터페이스 한글화
- **설정 패널** (⚙): 그리드, 통계, 타임라인 등 7개 토글
- **명령 센터** (📡): Claude CLI 래핑으로 세션에 직접 명령 전송
- **새 세션 생성**: UI에서 새 Claude 세션 시작
- **세션 탭**: 다중 세션 전환, 더블클릭으로 이름 변경
- **Always-on-top**: 항상 화면 위에 표시 (Ctrl+Shift+T로 토글)
- **토큰 사용량**: 상단바 클릭 시 상세 비용 팝업

## 파일 구조

```
desktop/
  app.py          # 메인 앱 (pywebview 래퍼)
  server.py       # pnpm dev 프로세스 관리
  tray.py         # macOS 메뉴바 트레이 아이콘
  config.py       # 윈도우 설정 영속화 (~/.config/agent-flow-desktop/)
  run.sh          # 원클릭 실행 스크립트
  build.sh        # .app 번들 빌드 스크립트
  setup.py        # py2app 설정
  requirements.txt
```

## 트러블슈팅

### 서버가 안 뜨는 경우
```bash
# 포트 확인
lsof -i :1117
lsof -i :3001

# 강제 종료 후 재시작
kill -9 $(lsof -ti :1117) $(lsof -ti :3001)
```

### "에이전트 세션 대기 중"만 나오는 경우
Claude Code 세션이 실행 중이어야 합니다. 다른 터미널에서 `claude`를 시작하세요.

### Python 앱이 빈 화면인 경우
서버(포트 1117)가 먼저 실행 중이어야 합니다. `run.sh`를 사용하면 자동으로 처리됩니다.
