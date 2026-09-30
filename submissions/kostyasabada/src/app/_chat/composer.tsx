'use client'

import { useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { MESSAGE_MAX_LENGTH, messageTextSchema } from '../../lib/chat/schema'
import type { SendResult } from './use-chat-socket'

/** Shown if `onSend` throws (it should not; the composer must never stay pending). */
const UNEXPECTED_SEND_ERROR = 'Message not sent: an unexpected error occurred.'

type ComposerProps = {
  /** The current nickname; read when a message is sent, so a change applies to later messages. */
  nickname: string
  /** Sending is disabled while the socket is not connected; typed text is kept. */
  connected: boolean
  onSend: (nickname: string, text: string) => Promise<SendResult>
}

/**
 * Message input validated with the shared `messageTextSchema` (the server stays
 * authoritative). Enter sends, Shift+Enter inserts a line break (design Q2). There is no
 * `maxlength` (design P20): the full text is kept, the trimmed length is shown as
 * `n/1000`, and an over-limit text shows the limit message and blocks sending. The text
 * is cleared only after the server accepted it; on a failure it is kept with the error.
 */
export function Composer({ nickname, connected, onSend }: ComposerProps) {
  const id = useId()
  const inputId = `${id}-input`
  const countId = `${id}-count`
  const errorId = `${id}-error`
  const sendErrorId = `${id}-send-error`
  const [value, setValue] = useState('')
  const [attempted, setAttempted] = useState(false)
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  // Guards against a second send before the `sending` state has re-rendered.
  const sendingRef = useRef(false)

  const result = messageTextSchema.safeParse(value)
  const trimmedLength = value.trim().length
  const overLimit = trimmedLength > MESSAGE_MAX_LENGTH
  const errors = result.success ? [] : result.error.issues.map((issue) => issue.message)
  const showErrors = errors.length > 0 && (attempted || overLimit)
  const canSend = connected && !sending && !overLimit

  async function submit() {
    setAttempted(true)
    setSendError(null)
    if (!result.success || !canSend || sendingRef.current) return
    sendingRef.current = true
    setSending(true)
    const sentValue = value
    let outcome: SendResult
    try {
      outcome = await onSend(nickname, result.data)
    } catch {
      outcome = { ok: false, error: UNEXPECTED_SEND_ERROR }
    } finally {
      // Always leave the pending state, so Send is enabled again (review finding F2 of 5.2).
      sendingRef.current = false
      setSending(false)
    }
    if (outcome.ok) {
      // Keep anything typed while the send was in flight.
      setValue((current) => (current === sentValue ? '' : current))
      setAttempted(false)
    } else {
      setSendError(outcome.error)
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void submit()
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return
    event.preventDefault()
    event.currentTarget.form?.requestSubmit()
  }

  const describedBy = [showErrors ? errorId : null, sendError ? sendErrorId : null, countId].filter(Boolean).join(' ')

  return (
    <form className="composer" aria-label="Send a message" onSubmit={handleSubmit} noValidate>
      <label htmlFor={inputId}>Message</label>
      <div className="composer__row">
        <textarea
          id={inputId}
          rows={3}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={handleKeyDown}
          aria-invalid={showErrors}
          aria-describedby={describedBy}
        />
        <button type="submit" disabled={!canSend}>
          Send
        </button>
      </div>
      <p id={countId} className="composer__count">
        {trimmedLength}/{MESSAGE_MAX_LENGTH}
      </p>
      {showErrors ? (
        <div id={errorId} role="alert" className="composer__error">
          {errors.map((message) => (
            <p key={message}>{message}</p>
          ))}
        </div>
      ) : null}
      {sendError ? (
        <p id={sendErrorId} role="alert" className="composer__error">
          {sendError}
        </p>
      ) : null}
    </form>
  )
}
