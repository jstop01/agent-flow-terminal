'use client'

import { useEffect, useRef, useCallback, useState } from 'react'
import { COLORS } from '@/lib/colors'
import type { SessionInfo } from '@/lib/vscode-bridge'

interface SessionTabsProps {
  sessions: SessionInfo[]
  selectedSessionId: string | null
  sessionsWithActivity: Set<string>
  onSelectSession: (id: string) => void
  onCloseSession: (id: string) => void
  onRenameSession?: (id: string, name: string) => void
}

/** Extract the last directory name from a path, or return the full path if short */
function cwdShortName(cwd?: string): string | null {
  if (!cwd) return null
  const parts = cwd.replace(/\/+$/, '').split('/')
  return parts[parts.length - 1] || null
}

/** Build the display name for a tab */
function getDisplayName(session: SessionInfo): string {
  if (session.customName) return session.customName
  const dirName = cwdShortName(session.cwd)
  if (dirName) return dirName
  // Truncate label to 30 chars
  const label = session.label || `Session ${session.id.slice(0, 8)}`
  return label.length > 30 ? label.slice(0, 30) + '…' : label
}

export function SessionTabs({
  sessions,
  selectedSessionId,
  sessionsWithActivity,
  onSelectSession,
  onCloseSession,
  onRenameSession,
}: SessionTabsProps) {
  const buttonRefs = useRef<Map<string, HTMLButtonElement>>(new Map())
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const setButtonRef = useCallback((id: string, el: HTMLButtonElement | null) => {
    if (el) buttonRefs.current.set(id, el)
    else buttonRefs.current.delete(id)
  }, [])

  // Scroll selected tab into view whenever it changes
  useEffect(() => {
    if (!selectedSessionId) return
    const el = buttonRefs.current.get(selectedSessionId)
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
  }, [selectedSessionId])

  // Focus input when editing starts
  useEffect(() => {
    if (editingId && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editingId])

  const handleDoubleClick = useCallback((session: SessionInfo) => {
    setEditingId(session.id)
    setEditValue(session.customName || getDisplayName(session))
  }, [])

  const handleRenameSubmit = useCallback((id: string) => {
    const trimmed = editValue.trim()
    if (trimmed && onRenameSession) {
      onRenameSession(id, trimmed)
    }
    setEditingId(null)
  }, [editValue, onRenameSession])

  const handleRenameCancel = useCallback(() => {
    setEditingId(null)
  }, [])

  return (
    <div className="flex gap-1.5">
      {sessions.map(session => {
        const isSelected = session.id === selectedSessionId
        const isActive = session.status === 'active'
        const hasActivity = sessionsWithActivity.has(session.id)
        const showGreen = isActive || hasActivity
        const isEditing = editingId === session.id
        const displayName = getDisplayName(session)
        const dirName = cwdShortName(session.cwd)

        return (
          <button
            key={session.id}
            ref={(el) => setButtonRef(session.id, el)}
            onClick={() => onSelectSession(session.id)}
            onDoubleClick={() => handleDoubleClick(session)}
            className="group rounded transition-all flex items-center gap-2"
            style={{
              flexShrink: 0,
              whiteSpace: 'nowrap',
              padding: '6px 14px',
              background: isSelected ? COLORS.tabSelectedBg : COLORS.tabInactiveBg,
              border: `1px solid ${isSelected ? COLORS.tabSelectedBorder : COLORS.tabInactiveBorder}`,
              color: isSelected ? COLORS.holoBright : COLORS.textMuted,
              fontSize: '13px',
              fontWeight: isSelected ? 600 : 400,
              minWidth: '120px',
              maxWidth: '300px',
            }}
            title={`${session.label}${session.cwd ? '\n📁 ' + session.cwd : ''}\n💡 더블클릭으로 이름 변경`}
          >
            {/* Status dot */}
            <span
              className="inline-block rounded-full flex-shrink-0"
              style={{
                width: 7,
                height: 7,
                background: showGreen ? COLORS.complete : COLORS.idle + '40',
                boxShadow: showGreen ? `0 0 6px ${COLORS.complete}` : 'none',
                animation: hasActivity && !isSelected ? 'pulse 1.5s infinite' : 'none',
              }}
            />

            {/* Tab name - editable on double click */}
            {isEditing ? (
              <input
                ref={inputRef}
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={() => handleRenameSubmit(session.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleRenameSubmit(session.id)
                  if (e.key === 'Escape') handleRenameCancel()
                }}
                onClick={(e) => e.stopPropagation()}
                className="bg-transparent outline-none border-b"
                style={{
                  color: COLORS.holoBright,
                  borderColor: COLORS.holoBase,
                  fontSize: '13px',
                  fontFamily: 'inherit',
                  width: `${Math.max(editValue.length, 8)}ch`,
                  maxWidth: '250px',
                }}
              />
            ) : (
              <span className="flex flex-col items-start" style={{ lineHeight: 1.3 }}>
                <span style={{ fontSize: '13px' }}>{displayName}</span>
                {/* Show cwd hint if custom name is set and cwd exists */}
                {session.customName && dirName && (
                  <span style={{ fontSize: '9px', opacity: 0.5 }}>📁 {dirName}</span>
                )}
              </span>
            )}

            {/* Close button */}
            <span
              className="ml-1 opacity-0 group-hover:opacity-60 transition-opacity cursor-pointer"
              style={{ color: COLORS.tabClose, fontSize: 10, lineHeight: '12px' }}
              onClick={(e) => {
                e.stopPropagation()
                onCloseSession(session.id)
              }}
            >
              ✕
            </span>
          </button>
        )
      })}
    </div>
  )
}
