'use client'

import { useState, useRef, useEffect } from 'react'
import { Z } from '@/lib/agent-types'
import { COLORS } from '@/lib/colors'
import { PanelHeader, SlidingPanel, stopPropagationHandlers } from './shared-ui'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface McpCommand {
  id: string
  type: 'prompt' | 'pause' | 'resume' | 'cancel' | 'set_context'
  payload: Record<string, unknown>
  timestamp: number
  status: 'pending' | 'acknowledged'
}

export interface McpNotification {
  id: string
  title: string
  message: string
  level: 'info' | 'warn' | 'error'
  timestamp: number
}

// ─── Props ───────────────────────────────────────────────────────────────────

interface CommandPanelProps {
  visible: boolean
  onClose: () => void
  selectedSessionId: string | null
  commands: McpCommand[]
  notifications: McpNotification[]
  mcpConnected: boolean
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatTime(timestamp: number): string {
  const d = new Date(timestamp)
  return d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

const COMMAND_TYPE_LABELS: Record<McpCommand['type'], string> = {
  prompt:      '프롬프트',
  pause:       '일시정지',
  resume:      '재개',
  cancel:      '취소',
  set_context: '컨텍스트',
}

const NOTIFICATION_LEVEL_COLORS: Record<McpNotification['level'], string> = {
  info:  '#66ccff',
  warn:  '#ffbb44',
  error: '#ff5566',
}

// ─── History Item: Command ────────────────────────────────────────────────────

function CommandHistoryItem({ cmd }: { cmd: McpCommand }) {
  const isAck = cmd.status === 'acknowledged'
  const text = typeof cmd.payload.text === 'string' ? cmd.payload.text : null

  return (
    <div
      className="px-2 py-1.5 rounded"
      style={{
        background: COLORS.holoBg05,
        border: `1px solid ${COLORS.holoBorder06}`,
        marginBottom: 4,
      }}
    >
      <div className="flex items-center justify-between mb-0.5">
        <span
          className="text-[9px] font-mono font-semibold tracking-wider uppercase"
          style={{ color: COLORS.holoBase }}
        >
          {COMMAND_TYPE_LABELS[cmd.type]}
        </span>
        <div className="flex items-center gap-1.5">
          {/* Status badge */}
          <span
            className="text-[8px] font-mono px-1 rounded"
            style={{
              background: isAck ? 'rgba(102, 255, 170, 0.15)' : 'rgba(255, 187, 68, 0.15)',
              color: isAck ? COLORS.complete : COLORS.tool_calling,
              border: `1px solid ${isAck ? 'rgba(102,255,170,0.25)' : 'rgba(255,187,68,0.25)'}`,
            }}
          >
            {isAck ? '확인' : '대기'}
          </span>
          <span className="text-[8px] font-mono" style={{ color: COLORS.textMuted }}>
            {formatTime(cmd.timestamp)}
          </span>
        </div>
      </div>
      {text && (
        <p
          className="text-[9px] font-mono leading-tight truncate"
          style={{ color: COLORS.textDim }}
        >
          {text}
        </p>
      )}
    </div>
  )
}

// ─── History Item: Notification ───────────────────────────────────────────────

function NotificationHistoryItem({ notif }: { notif: McpNotification }) {
  const levelColor = NOTIFICATION_LEVEL_COLORS[notif.level]

  return (
    <div
      className="px-2 py-1.5 rounded"
      style={{
        background: `${levelColor}0d`,
        border: `1px solid ${levelColor}22`,
        marginBottom: 4,
      }}
    >
      <div className="flex items-center justify-between mb-0.5">
        <span
          className="text-[9px] font-mono font-semibold truncate"
          style={{ color: levelColor, maxWidth: '70%' }}
        >
          {notif.title}
        </span>
        <span className="text-[8px] font-mono" style={{ color: COLORS.textMuted }}>
          {formatTime(notif.timestamp)}
        </span>
      </div>
      <p
        className="text-[9px] font-mono leading-tight"
        style={{ color: COLORS.textDim }}
      >
        {notif.message}
      </p>
    </div>
  )
}

// ─── Quick Action Button ──────────────────────────────────────────────────────

interface QuickActionButtonProps {
  label: string
  onClick: () => void
  disabled?: boolean
}

function QuickActionButton({ label, onClick, disabled = false }: QuickActionButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex-1 text-[9px] font-mono py-1.5 rounded transition-all duration-150"
      style={{
        background: disabled ? COLORS.holoBg03 : COLORS.holoBg10,
        border: `1px solid ${disabled ? COLORS.holoBorder06 : COLORS.holoBorder12}`,
        color: disabled ? COLORS.textMuted : COLORS.textPrimary,
        cursor: disabled ? 'not-allowed' : 'pointer',
        boxShadow: disabled ? 'none' : `0 0 6px ${COLORS.holoBase}15`,
      }}
    >
      {label}
    </button>
  )
}

// ─── Command Panel ────────────────────────────────────────────────────────────

export function CommandPanel({
  visible,
  onClose,
  selectedSessionId,
  commands,
  notifications,
  mcpConnected,
}: CommandPanelProps) {
  const [inputText, setInputText] = useState('')
  const [newSessionText, setNewSessionText] = useState('')
  const [showNewSessionInput, setShowNewSessionInput] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [localCommands, setLocalCommands] = useState<McpCommand[]>([])
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // 외부 props + 로컬 명령 병합
  const allCommands = [...commands, ...localCommands]

  // Merge commands + notifications into a unified timeline, most recent first
  type HistoryEntry =
    | { kind: 'command'; data: McpCommand; ts: number }
    | { kind: 'notification'; data: McpNotification; ts: number }

  const history: HistoryEntry[] = [
    ...allCommands.map(c => ({ kind: 'command' as const, data: c, ts: c.timestamp })),
    ...notifications.map(n => ({ kind: 'notification' as const, data: n, ts: n.timestamp })),
  ].sort((a, b) => b.ts - a.ts)

  // Auto-scroll to top (most recent) when new items arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0
    }
  }, [history.length])

  // ── HTTP helpers ────────────────────────────────────────────────────────────

  async function sendCommand(type: McpCommand['type'], payload: Record<string, unknown> = {}) {
    if (!selectedSessionId || !mcpConnected) return
    setIsSending(true)
    try {
      const res = await fetch('http://127.0.0.1:3001/mcp/commands', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: selectedSessionId, type, payload }),
      })
      const data = await res.json()
      if (data.id) {
        setLocalCommands(prev => [...prev, {
          id: data.id,
          type,
          payload,
          timestamp: Date.now(),
          status: 'pending',
        }])
      }
    } catch (err) {
      console.error('[CommandPanel] sendCommand error:', err)
    } finally {
      setIsSending(false)
    }
  }

  async function handleNewSession(message: string) {
    setIsSending(true)
    const cmdId = `cli-new-${Date.now()}`
    setLocalCommands(prev => [...prev, {
      id: cmdId,
      type: 'prompt',
      payload: { text: `[새 세션] ${message}` },
      timestamp: Date.now(),
      status: 'pending',
    }])
    try {
      const res = await fetch('http://127.0.0.1:3001/cli/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }), // sessionId 없으면 새 세션
      })
      const data = await res.json()
      setLocalCommands(prev => prev.map(c =>
        c.id === cmdId ? { ...c, status: 'acknowledged' as const, payload: { ...c.payload, response: data.response } } : c
      ))
    } catch (err) {
      setLocalCommands(prev => prev.map(c =>
        c.id === cmdId ? { ...c, status: 'acknowledged' as const, payload: { ...c.payload, error: String(err) } } : c
      ))
    } finally {
      setIsSending(false)
    }
  }

  async function handleSendPrompt() {
    const text = inputText.trim()
    if (!text || isSending) return
    setInputText('')
    setIsSending(true)

    // 로컬 기록에 즉시 추가
    const cmdId = `cli-${Date.now()}`
    setLocalCommands(prev => [...prev, {
      id: cmdId,
      type: 'prompt',
      payload: { text },
      timestamp: Date.now(),
      status: 'pending',
    }])

    try {
      // Claude CLI로 직접 전송
      const res = await fetch('http://127.0.0.1:3001/cli/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: selectedSessionId, message: text }),
      })
      const data = await res.json()

      // 응답 받으면 상태 업데이트
      setLocalCommands(prev => prev.map(c =>
        c.id === cmdId ? { ...c, status: 'acknowledged' as const, payload: { ...c.payload, response: data.response } } : c
      ))
    } catch (err) {
      console.error('[CommandPanel] CLI send error:', err)
      setLocalCommands(prev => prev.map(c =>
        c.id === cmdId ? { ...c, status: 'acknowledged' as const, payload: { ...c.payload, error: String(err) } } : c
      ))
    } finally {
      setIsSending(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      e.stopPropagation()
      void handleSendPrompt()
    }
    e.stopPropagation()
  }

  const canAct = !!selectedSessionId && !isSending

  return (
    <SlidingPanel
      visible={visible}
      position={{ top: 48, right: 8 }}
      axis="X"
      offset={20}
      zIndex={Z.sidePanel}
      width={300}
    >
      <div
        {...stopPropagationHandlers}
        className="glass-card overflow-hidden flex flex-col"
        style={{
          background: COLORS.panelBg,
          border: `1px solid ${COLORS.holoBorder08}`,
          borderRadius: 8,
          boxShadow: `0 4px 24px rgba(0,0,0,0.5), 0 0 12px ${COLORS.holoBase}10`,
          maxHeight: 'calc(100vh - 64px)',
        }}
      >
        {/* ── Header ─────────────────────────────────────────────────────────── */}
        <div
          className="px-3 py-2 flex-shrink-0"
          style={{ borderBottom: `1px solid ${COLORS.holoBorder08}` }}
        >
          <PanelHeader onClose={onClose} className="mb-0">
            <div className="flex items-center gap-2">
              <span
                className="text-[11px] font-mono tracking-wider"
                style={{ color: COLORS.textPrimary }}
              >
                📡 명령 센터
              </span>
              {/* MCP connection status */}
              <div className="flex items-center gap-1">
                <span
                  className="inline-block rounded-full flex-shrink-0"
                  style={{
                    width: 6,
                    height: 6,
                    background: mcpConnected ? '#66ffaa' : COLORS.textMuted,
                    boxShadow: mcpConnected ? '0 0 5px #66ffaa88' : 'none',
                  }}
                />
                <span
                  className="text-[9px] font-mono"
                  style={{ color: mcpConnected ? COLORS.complete : COLORS.textMuted }}
                >
                  {mcpConnected ? 'MCP 연결됨' : 'MCP 오프라인'}
                </span>
              </div>
            </div>
          </PanelHeader>
        </div>

        {/* ── Quick Actions ───────────────────────────────────────────────────── */}
        <div
          className="px-3 py-2 flex-shrink-0"
          style={{ borderBottom: `1px solid ${COLORS.holoBorder06}` }}
        >
          <p className="text-[9px] font-mono mb-1.5" style={{ color: COLORS.panelLabel }}>
            빠른 명령
          </p>
          <div className="flex gap-1 flex-wrap">
            <QuickActionButton
              label={showNewSessionInput ? '✕ 취소' : '➕ 새 세션'}
              onClick={() => setShowNewSessionInput(prev => !prev)}
              disabled={isSending}
            />
            <QuickActionButton
              label="⏸ 일시정지"
              onClick={() => void sendCommand('pause')}
              disabled={!canAct}
            />
            <QuickActionButton
              label="▶ 재개"
              onClick={() => void sendCommand('resume')}
              disabled={!canAct}
            />
            <QuickActionButton
              label="⏹ 취소"
              onClick={() => void sendCommand('cancel')}
              disabled={!canAct}
            />
          </div>

          {/* 새 세션 인라인 입력 */}
          {showNewSessionInput && (
            <div className="flex gap-1.5 mt-1.5">
              <input
                type="text"
                value={newSessionText}
                onChange={e => setNewSessionText(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && newSessionText.trim()) {
                    e.preventDefault()
                    void handleNewSession(newSessionText.trim())
                    setNewSessionText('')
                    setShowNewSessionInput(false)
                  }
                  if (e.key === 'Escape') setShowNewSessionInput(false)
                  e.stopPropagation()
                }}
                placeholder="새 세션 첫 메시지..."
                autoFocus
                className="flex-1 px-2 py-1 rounded text-[10px] font-mono outline-none"
                style={{
                  background: COLORS.holoBg05,
                  border: `1px solid ${COLORS.holoBorder12}`,
                  color: COLORS.textPrimary,
                }}
              />
              <button
                onClick={() => {
                  if (newSessionText.trim()) {
                    void handleNewSession(newSessionText.trim())
                    setNewSessionText('')
                    setShowNewSessionInput(false)
                  }
                }}
                className="px-2 py-1 rounded text-[10px] font-mono"
                style={{
                  background: COLORS.complete + '30',
                  border: `1px solid ${COLORS.complete}50`,
                  color: COLORS.complete,
                }}
              >
                시작
              </button>
            </div>
          )}
        </div>

        {/* ── Command Input ───────────────────────────────────────────────────── */}
        <div
          className="px-3 py-2 flex-shrink-0"
          style={{ borderBottom: `1px solid ${COLORS.holoBorder06}` }}
        >
          <p className="text-[9px] font-mono mb-1.5" style={{ color: COLORS.panelLabel }}>
            명령 입력
          </p>
          <div className="flex gap-1.5">
            <input
              ref={inputRef}
              type="text"
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={selectedSessionId ? "세션에 명령을 입력하세요..." : "새 세션 버튼을 눌러 시작하세요"}
              disabled={!canAct}
              className="flex-1 px-2 py-1.5 rounded text-[10px] font-mono outline-none"
              style={{
                background: canAct ? COLORS.holoBg05 : COLORS.holoBg03,
                border: `1px solid ${COLORS.holoBorder12}`,
                color: canAct ? COLORS.assistantText : COLORS.textMuted,
                cursor: canAct ? 'text' : 'not-allowed',
              }}
            />
            <button
              onClick={() => void handleSendPrompt()}
              disabled={!canAct || !inputText.trim()}
              className="px-2.5 py-1.5 rounded text-[10px] font-mono transition-all duration-150 flex-shrink-0"
              style={{
                background:
                  canAct && inputText.trim()
                    ? `${COLORS.holoBase}22`
                    : COLORS.holoBg03,
                border: `1px solid ${
                  canAct && inputText.trim()
                    ? COLORS.holoBorder12
                    : COLORS.holoBorder06
                }`,
                color:
                  canAct && inputText.trim()
                    ? COLORS.textPrimary
                    : COLORS.textMuted,
                cursor:
                  canAct && inputText.trim() ? 'pointer' : 'not-allowed',
                boxShadow:
                  canAct && inputText.trim()
                    ? `0 0 8px ${COLORS.holoBase}25`
                    : 'none',
              }}
            >
              {isSending ? '...' : '전송'}
            </button>
          </div>
          {!selectedSessionId && (
            <p className="text-[9px] font-mono mt-1" style={{ color: COLORS.textMuted }}>
              ※ 세션을 선택하세요
            </p>
          )}
        </div>

        {/* ── History ────────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-3 pt-2 pb-1 flex-shrink-0">
          <p className="text-[9px] font-mono" style={{ color: COLORS.panelLabel }}>
            기록
          </p>
          <span className="text-[9px] font-mono" style={{ color: COLORS.panelLabelDim }}>
            {history.length}건
          </span>
        </div>

        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto px-3 pb-3"
          style={{
            scrollbarWidth: 'thin',
            scrollbarColor: `${COLORS.scrollbarThumb} transparent`,
            minHeight: 0,
          }}
        >
          {history.length === 0 ? (
            <div
              className="flex items-center justify-center py-8"
              style={{ color: COLORS.textMuted }}
            >
              <p className="text-[10px] font-mono">명령 기록이 없습니다</p>
            </div>
          ) : (
            history.map(entry =>
              entry.kind === 'command' ? (
                <CommandHistoryItem key={`cmd-${entry.data.id}`} cmd={entry.data} />
              ) : (
                <NotificationHistoryItem key={`notif-${entry.data.id}`} notif={entry.data} />
              )
            )
          )}
        </div>
      </div>
    </SlidingPanel>
  )
}
