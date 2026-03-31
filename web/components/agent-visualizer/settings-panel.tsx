'use client'

import { Z } from '@/lib/agent-types'
import { COLORS } from '@/lib/colors'
import { PanelHeader, SlidingPanel, stopPropagationHandlers } from './shared-ui'

// ─── Props ───────────────────────────────────────────────────────────────────

interface SettingsPanelProps {
  visible: boolean
  onClose: () => void
  // Display toggles
  showHexGrid: boolean
  onToggleHexGrid: () => void
  showStats: boolean
  onToggleStats: () => void
  showTimeline: boolean
  onToggleTimeline: () => void
  showFileAttention: boolean
  onToggleFileAttention: () => void
  showTranscript: boolean
  onToggleTranscript: () => void
  showCostOverlay: boolean
  onToggleCostOverlay: () => void
  // Audio
  isMuted: boolean
  onToggleMute: () => void
}

// ─── Toggle Switch ───────────────────────────────────────────────────────────

interface ToggleSwitchProps {
  active: boolean
  onToggle: () => void
}

function ToggleSwitch({ active, onToggle }: ToggleSwitchProps) {
  return (
    <button
      onClick={onToggle}
      className="relative flex-shrink-0 transition-all duration-200"
      style={{
        width: 32,
        height: 18,
        borderRadius: 9,
        background: active ? COLORS.holoBase + 'cc' : COLORS.holoBg10,
        border: `1px solid ${active ? COLORS.holoBorder12 : COLORS.holoBorder06}`,
        boxShadow: active ? `0 0 8px ${COLORS.holoBase}55` : 'none',
        cursor: 'pointer',
        padding: 0,
      }}
      aria-checked={active}
      role="switch"
    >
      <span
        className="absolute top-0.5 transition-all duration-200"
        style={{
          width: 12,
          height: 12,
          borderRadius: '50%',
          background: active ? COLORS.holoHot : COLORS.textMuted,
          left: active ? 17 : 2,
          boxShadow: active ? `0 0 5px ${COLORS.holoBase}99` : 'none',
        }}
      />
    </button>
  )
}

// ─── Setting Row ─────────────────────────────────────────────────────────────

interface SettingRowProps {
  emoji: string
  label: string
  active: boolean
  onToggle: () => void
  isLast?: boolean
}

function SettingRow({ emoji, label, active, onToggle, isLast = false }: SettingRowProps) {
  const handleToggle = () => { console.log('[settings] toggle:', label, '→', !active); onToggle() }
  return (
    <div
      className="flex items-center justify-between px-3 py-2"
      style={{
        borderBottom: isLast ? 'none' : `1px solid ${COLORS.panelSeparator}`,
        background: active ? COLORS.holoBg03 : 'transparent',
        transition: 'background 0.2s',
      }}
    >
      <span
        className="text-[11px] font-mono select-none"
        style={{ color: active ? COLORS.textPrimary : COLORS.textDim }}
      >
        {emoji} {label}
      </span>
      <ToggleSwitch active={active} onToggle={handleToggle} />
    </div>
  )
}

// ─── Settings Panel ──────────────────────────────────────────────────────────

const SETTINGS_ITEMS = [
  { key: 'showHexGrid',      emoji: '🔲', label: '헥스 그리드 배경' },
  { key: 'showStats',        emoji: '📊', label: '에이전트 통계' },
  { key: 'showTimeline',     emoji: '⏱',  label: '실행 타임라인' },
  { key: 'showFileAttention',emoji: '📁', label: '파일 주목도' },
  { key: 'showTranscript',   emoji: '💬', label: '대화 기록' },
  { key: 'showCostOverlay',  emoji: '💰', label: '비용 오버레이' },
  { key: 'isMuted',          emoji: '🔇', label: '소리 끄기' },
] as const

type SettingKey = typeof SETTINGS_ITEMS[number]['key']

type ActiveValues = Pick<SettingsPanelProps,
  'showHexGrid' | 'showStats' | 'showTimeline' |
  'showFileAttention' | 'showTranscript' | 'showCostOverlay' | 'isMuted'
>

type ToggleHandlers = {
  showHexGrid: () => void
  showStats: () => void
  showTimeline: () => void
  showFileAttention: () => void
  showTranscript: () => void
  showCostOverlay: () => void
  isMuted: () => void
}

export function SettingsPanel({
  visible,
  onClose,
  showHexGrid,
  onToggleHexGrid,
  showStats,
  onToggleStats,
  showTimeline,
  onToggleTimeline,
  showFileAttention,
  onToggleFileAttention,
  showTranscript,
  onToggleTranscript,
  showCostOverlay,
  onToggleCostOverlay,
  isMuted,
  onToggleMute,
}: SettingsPanelProps) {
  const activeValues: ActiveValues = {
    showHexGrid,
    showStats,
    showTimeline,
    showFileAttention,
    showTranscript,
    showCostOverlay,
    isMuted,
  }

  const toggleHandlers: ToggleHandlers = {
    showHexGrid: onToggleHexGrid,
    showStats: onToggleStats,
    showTimeline: onToggleTimeline,
    showFileAttention: onToggleFileAttention,
    showTranscript: onToggleTranscript,
    showCostOverlay: onToggleCostOverlay,
    isMuted: onToggleMute,
  }

  return (
    <SlidingPanel
      visible={visible}
      position={{ top: 48, right: 8 }}
      axis="X"
      offset={20}
      zIndex={Z.sidePanel}
      width={240}
    >
      <div
        {...stopPropagationHandlers}
        className="glass-card overflow-hidden"
        style={{
          background: COLORS.panelBg,
          border: `1px solid ${COLORS.holoBorder08}`,
          borderRadius: 8,
          boxShadow: `0 4px 24px rgba(0,0,0,0.5), 0 0 12px ${COLORS.holoBase}10`,
        }}
      >
        {/* Header */}
        <div
          className="px-3 py-2"
          style={{ borderBottom: `1px solid ${COLORS.holoBorder08}` }}
        >
          <PanelHeader onClose={onClose} className="mb-0">
            <span
              className="text-[11px] font-mono tracking-wider"
              style={{ color: COLORS.textPrimary }}
            >
              ⚙ 설정
            </span>
          </PanelHeader>
        </div>

        {/* Settings rows */}
        <div>
          {SETTINGS_ITEMS.map((item, idx) => (
            <SettingRow
              key={item.key}
              emoji={item.emoji}
              label={item.label}
              active={activeValues[item.key as SettingKey]}
              onToggle={toggleHandlers[item.key as SettingKey]}
              isLast={idx === SETTINGS_ITEMS.length - 1}
            />
          ))}
        </div>
      </div>
    </SlidingPanel>
  )
}
