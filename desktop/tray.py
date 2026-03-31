"""System Tray - macOS 메뉴바 트레이 아이콘 및 제어"""

import threading
from typing import Callable, Optional

import pystray
from PIL import Image, ImageDraw


class TrayManager:
    """macOS 메뉴바 트레이 아이콘 관리 클래스"""

    def __init__(
        self,
        on_show: Optional[Callable] = None,
        on_hide: Optional[Callable] = None,
        on_toggle_top: Optional[Callable] = None,
        on_restart: Optional[Callable] = None,
        on_quit: Optional[Callable] = None,
    ):
        """
        트레이 아이콘 매니저 초기화

        콜백 함수들:
        - on_show: 윈도우 보이기
        - on_hide: 윈도우 숨기기
        - on_toggle_top: 항상 위 토글
        - on_restart: 서버 재시작
        - on_quit: 앱 종료
        """
        # 콜백 함수 딕셔너리로 저장
        self.callbacks: dict[str, Optional[Callable]] = {
            "on_show": on_show,
            "on_hide": on_hide,
            "on_toggle_top": on_toggle_top,
            "on_restart": on_restart,
            "on_quit": on_quit,
        }

        # pystray 아이콘 인스턴스 (start() 호출 전까지 None)
        self.icon: Optional[pystray.Icon] = None

        # 항상 위에 표시 상태 (기본값: 활성화)
        self.always_on_top: bool = True

    # ------------------------------------------------------------------
    # 아이콘 이미지 생성
    # ------------------------------------------------------------------

    def _create_icon_image(self, color: str = "#66ccff") -> Image.Image:
        """
        트레이 아이콘 이미지 생성 (16x16 육각형 모양)

        Args:
            color: 아이콘 채우기 색상 (hex 문자열)

        Returns:
            PIL Image 객체 (RGBA 모드)
        """
        size = 16
        img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        draw = ImageDraw.Draw(img)

        # 육각형 꼭짓점 좌표 계산 (중심: 8, 8 / 반지름: 7)
        cx, cy, r = 8, 8, 7
        import math

        # 육각형은 꼭짓점이 위쪽을 향하도록 30도 오프셋 적용
        hex_points = [
            (
                cx + r * math.cos(math.radians(60 * i - 90)),
                cy + r * math.sin(math.radians(60 * i - 90)),
            )
            for i in range(6)
        ]

        # 육각형 채우기
        draw.polygon(hex_points, fill=color)

        # 테두리를 약간 어둡게 (알파 200으로 반투명 테두리)
        border_color = self._darken_color(color, factor=0.7)
        draw.polygon(hex_points, outline=border_color)

        return img

    @staticmethod
    def _darken_color(hex_color: str, factor: float = 0.7) -> str:
        """
        hex 색상을 factor 비율만큼 어둡게 변환

        Args:
            hex_color: '#RRGGBB' 형식의 색상 문자열
            factor: 0.0(검정) ~ 1.0(원색) 비율

        Returns:
            어두워진 '#RRGGBB' 색상 문자열
        """
        hex_color = hex_color.lstrip("#")
        r, g, b = (int(hex_color[i : i + 2], 16) for i in (0, 2, 4))
        r = int(r * factor)
        g = int(g * factor)
        b = int(b * factor)
        return f"#{r:02x}{g:02x}{b:02x}"

    # ------------------------------------------------------------------
    # 메뉴 구성
    # ------------------------------------------------------------------

    def _build_menu(self) -> pystray.Menu:
        """
        트레이 컨텍스트 메뉴 구성

        Returns:
            pystray.Menu 인스턴스
        """
        return pystray.Menu(
            # 앱 이름 표시 (비활성 항목)
            pystray.MenuItem("Agent Flow 모니터", None, enabled=False),
            pystray.Menu.SEPARATOR,
            # 윈도우 가시성 제어
            pystray.MenuItem("윈도우 보이기", self._on_show),
            pystray.MenuItem("윈도우 숨기기", self._on_hide),
            pystray.Menu.SEPARATOR,
            # 항상 위 토글 (체크 상태 반영)
            pystray.MenuItem(
                "항상 위에 표시",
                self._on_toggle_top,
                checked=lambda _: self.always_on_top,
            ),
            # 서버 재시작
            pystray.MenuItem("서버 재시작", self._on_restart),
            pystray.Menu.SEPARATOR,
            # 앱 종료
            pystray.MenuItem("종료", self._on_quit),
        )

    # ------------------------------------------------------------------
    # 메뉴 항목 콜백 핸들러
    # ------------------------------------------------------------------

    def _on_show(self, icon: pystray.Icon, item: pystray.MenuItem) -> None:
        """'윈도우 보이기' 메뉴 항목 클릭 처리"""
        if self.callbacks["on_show"]:
            self.callbacks["on_show"]()

    def _on_hide(self, icon: pystray.Icon, item: pystray.MenuItem) -> None:
        """'윈도우 숨기기' 메뉴 항목 클릭 처리"""
        if self.callbacks["on_hide"]:
            self.callbacks["on_hide"]()

    def _on_toggle_top(self, icon: pystray.Icon, item: pystray.MenuItem) -> None:
        """'항상 위에 표시' 토글 처리 및 상태 반전"""
        self.always_on_top = not self.always_on_top
        if self.callbacks["on_toggle_top"]:
            self.callbacks["on_toggle_top"](self.always_on_top)

    def _on_restart(self, icon: pystray.Icon, item: pystray.MenuItem) -> None:
        """'서버 재시작' 메뉴 항목 클릭 처리"""
        if self.callbacks["on_restart"]:
            self.callbacks["on_restart"]()

    def _on_quit(self, icon: pystray.Icon, item: pystray.MenuItem) -> None:
        """'종료' 메뉴 항목 클릭 처리 — 아이콘 정지 후 콜백 호출"""
        self.stop()
        if self.callbacks["on_quit"]:
            self.callbacks["on_quit"]()

    # ------------------------------------------------------------------
    # 공개 API
    # ------------------------------------------------------------------

    def start(self) -> None:
        """
        트레이 아이콘 시작 (데몬 스레드에서 실행)

        macOS에서 pystray는 메인 스레드 이외 스레드에서도 동작하지만,
        완전한 Cocoa 통합을 위해 rumps 등과 함께 사용하는 경우
        메인 스레드에서 run_detached() 를 호출하는 방식도 고려할 수 있음.
        """
        # 아이콘 인스턴스 생성
        self.icon = pystray.Icon(
            "agent-flow",              # 내부 식별자
            self._create_icon_image(), # 기본 아이콘 (연결 전 파란색)
            "Agent Flow",              # 툴팁 텍스트
            self._build_menu(),        # 컨텍스트 메뉴
        )

        # 데몬 스레드로 실행 — 메인 프로세스 종료 시 자동 정리
        thread = threading.Thread(target=self.icon.run, daemon=True, name="tray-icon")
        thread.start()

    def stop(self) -> None:
        """트레이 아이콘 종료 및 리소스 해제"""
        if self.icon:
            self.icon.stop()
            self.icon = None

    def update_status(self, connected: bool) -> None:
        """
        연결 상태에 따라 아이콘 색상 변경

        Args:
            connected: True이면 초록색(연결됨), False이면 빨간색(연결 안됨)
        """
        if self.icon is None:
            return

        # 연결 상태에 따른 색상 선택
        color = "#66ffaa" if connected else "#ff5566"
        self.icon.icon = self._create_icon_image(color)
