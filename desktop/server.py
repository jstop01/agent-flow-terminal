"""Server Manager - pnpm dev 프로세스 수명주기 관리"""
import subprocess
import time
import signal
import os
import urllib.request
import urllib.error
import atexit
import shutil


def _find_pnpm() -> str:
    """pnpm 실행 파일 경로를 탐색. 일반적인 설치 위치를 우선 확인."""
    # macOS Homebrew 기본 설치 경로 우선 확인
    candidates = [
        "/opt/homebrew/bin/pnpm",
        "/usr/local/bin/pnpm",
    ]
    for path in candidates:
        if os.path.isfile(path) and os.access(path, os.X_OK):
            return path

    # PATH 환경변수에서 which 방식으로 탐색
    found = shutil.which("pnpm")
    if found:
        return found

    raise FileNotFoundError(
        "pnpm을 찾을 수 없습니다. /opt/homebrew/bin/pnpm 또는 PATH에 pnpm이 설치되어 있는지 확인하세요."
    )


class ServerManager:
    def __init__(self, project_dir="/Users/jaeseok/agent-flow-custom", port=1117):
        # 프로젝트 루트 디렉토리 및 서버 포트 설정
        self.project_dir = project_dir
        self.port = port
        self.process = None  # 관리 중인 서버 프로세스 (Popen 객체)

    # ------------------------------------------------------------------
    # 포트 상태 확인
    # ------------------------------------------------------------------

    def is_port_in_use(self) -> bool:
        """포트가 이미 사용 중인지 확인. localhost:{port}에 HTTP 요청을 보내 응답 여부로 판단."""
        url = f"http://localhost:{self.port}"
        try:
            with urllib.request.urlopen(url, timeout=2) as _:
                return True
        except urllib.error.HTTPError:
            # HTTP 오류(4xx, 5xx)도 서버가 응답하고 있음을 의미
            return True
        except Exception:
            # 연결 거부, 타임아웃 등 → 포트 미사용
            return False

    # ------------------------------------------------------------------
    # 서버 시작
    # ------------------------------------------------------------------

    def start(self) -> bool:
        """relay + web 서버 시작. 이미 실행 중이면 스킵.

        Returns:
            True  - 서버가 정상적으로 기동되었거나 이미 실행 중인 경우
            False - 기동 실패
        """
        # 이미 포트가 열려있으면 외부에서 실행 중인 것으로 간주
        if self.is_port_in_use():
            print(f"[ServerManager] 포트 {self.port}가 이미 사용 중입니다. 기존 서버를 재사용합니다.")
            return True

        # 이미 내부적으로 프로세스를 관리하고 있으면 중복 기동 방지
        if self.process is not None and self.process.poll() is None:
            print("[ServerManager] 이미 관리 중인 서버 프로세스가 존재합니다.")
            return True

        try:
            pnpm = _find_pnpm()
        except FileNotFoundError as exc:
            print(f"[ServerManager] 오류: {exc}")
            return False

        # 환경 변수 구성: 현재 환경을 상속하되 NEXT_PUBLIC_DEMO 와 PORT 덮어쓰기
        env = os.environ.copy()
        env["NEXT_PUBLIC_DEMO"] = "0"
        env["PORT"] = str(self.port)

        print(f"[ServerManager] 서버 기동 중... (pnpm: {pnpm}, port: {self.port})")

        try:
            self.process = subprocess.Popen(
                [pnpm, "run", "dev"],
                cwd=self.project_dir,
                env=env,
                # 새 프로세스 그룹 생성 → 자식 프로세스까지 한 번에 종료 가능
                preexec_fn=os.setsid,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
            )
        except Exception as exc:
            print(f"[ServerManager] 프로세스 기동 실패: {exc}")
            return False

        # 프로그램 종료 시 자동으로 서버도 정리
        atexit.register(self.stop)

        print(f"[ServerManager] 프로세스 시작됨 (PID: {self.process.pid})")
        return True

    # ------------------------------------------------------------------
    # 준비 대기
    # ------------------------------------------------------------------

    def wait_for_ready(self, timeout: int = 30) -> bool:
        """서버가 HTTP 응답을 반환할 때까지 대기 (최대 timeout초).

        Args:
            timeout: 최대 대기 시간(초). 기본값 30초.

        Returns:
            True  - 서버가 응답을 시작한 경우
            False - 타임아웃 초과
        """
        url = f"http://localhost:{self.port}"
        deadline = time.time() + timeout
        attempt = 0

        print(f"[ServerManager] 서버 응답 대기 중 (최대 {timeout}초)...")

        while time.time() < deadline:
            attempt += 1
            try:
                with urllib.request.urlopen(url, timeout=2) as _:
                    print(f"[ServerManager] 서버 준비 완료 ({attempt}번째 시도)")
                    return True
            except urllib.error.HTTPError:
                # HTTP 오류도 서버가 살아있음을 의미 (예: 302 리다이렉트)
                print(f"[ServerManager] 서버 준비 완료 - HTTP 오류 응답 수신 ({attempt}번째 시도)")
                return True
            except Exception:
                # 아직 준비 안 됨 → 0.5초 후 재시도
                pass

            # 관리 중인 프로세스가 예기치 않게 종료된 경우 조기 탈출
            if self.process is not None and self.process.poll() is not None:
                print(f"[ServerManager] 서버 프로세스가 비정상 종료되었습니다 (return code: {self.process.returncode})")
                return False

            time.sleep(0.5)

        print(f"[ServerManager] 타임아웃: {timeout}초 내에 서버가 응답하지 않았습니다.")
        return False

    # ------------------------------------------------------------------
    # 서버 종료
    # ------------------------------------------------------------------

    def stop(self):
        """서버 프로세스 및 하위 프로세스 전체 종료.

        1. SIGTERM으로 정상 종료 시도 (최대 5초 대기)
        2. 여전히 살아있으면 SIGKILL로 강제 종료
        """
        if self.process is None:
            return

        if self.process.poll() is not None:
            # 이미 종료된 프로세스
            self.process = None
            return

        pid = self.process.pid
        pgid = None

        try:
            pgid = os.getpgid(pid)
        except ProcessLookupError:
            # 프로세스가 이미 사라진 경우
            self.process = None
            return

        print(f"[ServerManager] 서버 종료 요청 (PID: {pid}, PGID: {pgid})")

        # 1단계: 프로세스 그룹 전체에 SIGTERM 전송
        try:
            os.killpg(pgid, signal.SIGTERM)
        except ProcessLookupError:
            pass

        # SIGTERM 처리 대기 (최대 5초)
        try:
            self.process.wait(timeout=5)
            print("[ServerManager] 서버가 정상 종료되었습니다.")
        except subprocess.TimeoutExpired:
            # 2단계: 강제 종료 (SIGKILL)
            print("[ServerManager] 정상 종료 실패 → SIGKILL로 강제 종료합니다.")
            try:
                os.killpg(pgid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            try:
                self.process.wait(timeout=3)
            except subprocess.TimeoutExpired:
                pass
            print("[ServerManager] 서버 프로세스가 강제 종료되었습니다.")

        self.process = None

    # ------------------------------------------------------------------
    # 서버 재시작
    # ------------------------------------------------------------------

    def restart(self):
        """서버를 완전히 중단한 뒤 재기동하고 응답을 기다린다."""
        print("[ServerManager] 서버 재시작 중...")
        self.stop()
        time.sleep(1)  # 포트 해제 대기
        self.start()
        self.wait_for_ready()
        print("[ServerManager] 서버 재시작 완료.")
