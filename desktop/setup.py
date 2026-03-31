"""
py2app setup script for Agent Flow Monitor
macOS .app 번들 생성용
"""
from setuptools import setup

APP = ['app.py']
APP_NAME = 'Agent Flow Monitor'

OPTIONS = {
    'argv_emulation': False,
    'plist': {
        'CFBundleName': APP_NAME,
        'CFBundleDisplayName': APP_NAME,
        'CFBundleIdentifier': 'com.agentflow.monitor',
        'CFBundleVersion': '1.0.0',
        'CFBundleShortVersionString': '1.0.0',
        'LSMinimumSystemVersion': '12.0',
        'NSHighResolutionCapable': True,
        'LSUIElement': False,  # Show in Dock
    },
    'packages': ['webview'],
    'includes': [
        'webview',
        'objc',
        'Foundation',
        'AppKit',
        'WebKit',
    ],
    'frameworks': [],
    'resources': ['resources'],  # web/, relay/, bin/ bundled here
    'iconfile': '',  # No custom icon yet
}

setup(
    name=APP_NAME,
    app=APP,
    options={'py2app': OPTIONS},
    setup_requires=['py2app'],
)
