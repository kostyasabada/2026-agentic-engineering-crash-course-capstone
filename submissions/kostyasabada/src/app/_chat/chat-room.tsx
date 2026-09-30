'use client'

import { useState, useSyncExternalStore } from 'react'
import { nicknameSchema } from '../../lib/chat/schema'
import { Composer } from './composer'
import { ConnectionStatus } from './connection-status'
import { MessageList } from './message-list'
import { NicknameForm } from './nickname-form'
import { useChatSocket } from './use-chat-socket'

// The chosen nickname is kept in localStorage under this key (design Q1).
const STORAGE_KEY = 'chat.nickname'

// Fallback for browsers where localStorage throws (disabled storage, privacy modes): the
// nickname then lives only for this page session.
let memoryNickname: string | null = null
const listeners = new Set<() => void>()

/** Reads the stored nickname; an invalid stored value counts as no nickname. */
function readNickname(): string | null {
  let stored: string | null = memoryNickname
  try {
    stored = window.localStorage.getItem(STORAGE_KEY) ?? memoryNickname
  } catch {
    // localStorage unavailable: keep the in-memory value.
  }
  if (stored === null) return null
  const result = nicknameSchema.safeParse(stored)
  return result.success ? result.data : null
}

function writeNickname(nickname: string): void {
  memoryNickname = nickname
  try {
    window.localStorage.setItem(STORAGE_KEY, nickname)
  } catch {
    // localStorage unavailable: the in-memory value is used.
  }
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  // Another tab of the same browser changed the nickname.
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY || event.key === null) listener()
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', onStorage)
  }
}

// During server rendering and hydration the nickname is unknown (`undefined`), so the
// server HTML and the first client render match; React then re-renders with the stored value.
const getServerNickname = (): string | null | undefined => undefined

/** Root of the interactive chat subtree (design D1: the only client boundary of the page). */
export function ChatRoom() {
  const nickname = useSyncExternalStore<string | null | undefined>(subscribe, readNickname, getServerNickname)
  const [editing, setEditing] = useState(false)
  // One socket per ChatRoom, connected in the browser only (see use-chat-socket.ts).
  const chat = useChatSocket()

  if (nickname === undefined) {
    return <p className="chat-room__loading">Loading…</p>
  }

  if (nickname === null) {
    return (
      <section className="chat-room" aria-labelledby="choose-nickname-heading">
        <h2 id="choose-nickname-heading">Choose a nickname</h2>
        <p>No account needed. Your nickname is remembered in this browser.</p>
        <NicknameForm name="Choose a nickname" submitLabel="Join" onSubmit={writeNickname} />
      </section>
    )
  }

  return (
    <section className="chat-room" aria-label="Chat">
      {editing ? (
        <NicknameForm
          name="Change nickname"
          initialValue={nickname}
          submitLabel="Save nickname"
          onSubmit={(next) => {
            writeNickname(next)
            setEditing(false)
          }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <div className="chat-room__identity">
          <p>
            Chatting as <strong>{nickname}</strong>
          </p>
          <button type="button" onClick={() => setEditing(true)}>
            Change nickname
          </button>
        </div>
      )}
      <ConnectionStatus status={chat.status} />
      <MessageList messages={chat.messages} historyLoaded={chat.historyLoaded} />
      <Composer nickname={nickname} connected={chat.connected} onSend={chat.send} />
    </section>
  )
}
