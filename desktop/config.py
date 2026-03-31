"""Config - 윈도우 설정 및 상태 영속화

데스크탑 앱의 윈도우 위치, 크기, 항상 위 표시 여부 등
사용자 설정을 JSON 파일로 저장하고 불러오는 모듈.
"""

import json
from pathlib import Path

# ---------------------------------------------------------------------------
# 설정 파일 위치
# ---------------------------------------------------------------------------
# 플랫폼 표준 위치인 ~/.config/agent-flow-desktop/ 에 저장
CONFIG_DIR = Path.home() / '.config' / 'agent-flow-desktop'
CONFIG_FILE = CONFIG_DIR / 'settings.json'

# ---------------------------------------------------------------------------
# 기본값
# ---------------------------------------------------------------------------
# 설정 파일이 없거나 특정 키가 누락된 경우 이 값으로 채움
DEFAULTS: dict = {
    'window': {
        'x': 100,       # 윈도우 좌측 상단 X 좌표 (픽셀)
        'y': 100,       # 윈도우 좌측 상단 Y 좌표 (픽셀)
        'width': 1200,  # 윈도우 너비 (픽셀)
        'height': 800,  # 윈도우 높이 (픽셀)
    },
    'always_on_top': True,              # 항상 위 표시 여부
    'opacity': 1.0,                     # 윈도우 불투명도 (0.0 ~ 1.0)
    'port': 1117,                       # 내부 서버 포트
    'auto_start_server': True,          # 앱 시작 시 서버 자동 실행 여부
    'project_dir': '/Users/jaeseok/agent-flow-custom',  # 기본 프로젝트 디렉토리
}


class Config:
    """앱 설정을 로드·저장·조회하는 클래스.

    설정값은 JSON 파일로 영속화되며, 점 표기법(dot notation)으로
    중첩 키에 접근할 수 있다.

    사용 예시::

        cfg = Config()

        # 단순 조회
        port = cfg.get('port')              # 1117
        width = cfg.get('window.width')     # 1200

        # 값 변경 (즉시 파일에 저장)
        cfg.set('window.width', 1400)
        cfg.set('always_on_top', False)

        # 편의 프로퍼티
        print(cfg.window)       # {'x': 100, 'y': 100, ...}
        print(cfg.port)         # 1117
    """

    def __init__(self) -> None:
        # 내부 설정 딕셔너리 (기본값과 병합된 실제 설정 보관)
        self._data: dict = {}
        self.load()

    # ------------------------------------------------------------------
    # 로드 / 저장
    # ------------------------------------------------------------------

    def load(self) -> None:
        """설정 파일을 읽어 _data에 적재한다.

        파일이 없거나 JSON 파싱에 실패하면 기본값(DEFAULTS)을 사용한다.
        파일이 존재하더라도 누락된 키는 기본값으로 보완(deep-merge)된다.
        """
        CONFIG_DIR.mkdir(parents=True, exist_ok=True)

        saved: dict = {}
        if CONFIG_FILE.exists():
            try:
                with CONFIG_FILE.open(encoding='utf-8') as f:
                    saved = json.load(f)
            except (json.JSONDecodeError, OSError):
                # 파일이 손상됐을 경우 기본값으로 조용히 복구
                saved = {}

        # 저장된 값을 기본값 위에 deep-merge
        self._data = self._merge_defaults(DEFAULTS, saved)

    def save(self) -> None:
        """현재 _data를 JSON 파일로 저장한다."""
        CONFIG_DIR.mkdir(parents=True, exist_ok=True)
        with CONFIG_FILE.open('w', encoding='utf-8') as f:
            json.dump(self._data, f, indent=2, ensure_ascii=False)

    # ------------------------------------------------------------------
    # 조회 / 변경
    # ------------------------------------------------------------------

    def get(self, key: str, default=None):
        """점 표기법으로 설정값을 조회한다.

        Args:
            key: 조회할 키. 중첩 키는 점(.)으로 구분 (예: ``'window.width'``).
            default: 키가 없을 때 반환할 기본값.

        Returns:
            설정값, 또는 키가 없으면 *default*.
        """
        val = self._data
        for k in key.split('.'):
            if not isinstance(val, dict):
                return default
            val = val.get(k)
            if val is None:
                return default
        return val

    def set(self, key: str, value) -> None:
        """점 표기법으로 설정값을 변경하고 즉시 파일에 저장한다.

        중간 경로의 딕셔너리가 없으면 자동으로 생성된다.

        Args:
            key: 변경할 키 (예: ``'window.x'``).
            value: 저장할 값.
        """
        keys = key.split('.')
        node = self._data
        # 마지막 키를 제외한 중간 노드를 순회하며 딕셔너리 확보
        for k in keys[:-1]:
            node = node.setdefault(k, {})
        node[keys[-1]] = value
        self.save()

    # ------------------------------------------------------------------
    # 편의 프로퍼티
    # ------------------------------------------------------------------

    @property
    def window(self) -> dict:
        """윈도우 위치·크기 딕셔너리 (x, y, width, height)."""
        return self._data.get('window', DEFAULTS['window'])

    @property
    def always_on_top(self) -> bool:
        """항상 위 표시 여부."""
        return self._data.get('always_on_top', DEFAULTS['always_on_top'])

    @property
    def port(self) -> int:
        """내부 서버 포트 번호."""
        return self._data.get('port', DEFAULTS['port'])

    # ------------------------------------------------------------------
    # 내부 유틸리티
    # ------------------------------------------------------------------

    @staticmethod
    def _merge_defaults(defaults: dict, current: dict) -> dict:
        """기본값(defaults)과 저장된 설정(current)을 재귀적으로 병합한다.

        *current* 의 값이 우선하며, *defaults* 에만 있는 키는 그대로 유지된다.
        두 쪽 모두 딕셔너리인 경우에만 재귀 병합을 수행한다.

        Args:
            defaults: 기본값 딕셔너리.
            current: 저장된 설정 딕셔너리.

        Returns:
            병합된 새 딕셔너리.
        """
        result = defaults.copy()
        for k, v in current.items():
            if k in result and isinstance(result[k], dict) and isinstance(v, dict):
                # 양쪽 모두 딕셔너리인 경우 재귀 병합
                result[k] = Config._merge_defaults(result[k], v)
            else:
                # 그 외에는 저장된 값으로 덮어씀
                result[k] = v
        return result
