'use client'

import { useId, useState, type FormEvent } from 'react'
import { NICKNAME_MAX_LENGTH, nicknameSchema } from '../../lib/chat/schema'

type NicknameFormProps = {
  /** Accessible name of the form, e.g. "Choose a nickname" or "Change nickname". */
  name: string
  /** Text shown in the input when the form opens (the current nickname when changing it). */
  initialValue?: string
  /** Label of the confirm button, e.g. "Join" or "Save nickname". */
  submitLabel: string
  /** Receives the validated, trimmed nickname. */
  onSubmit: (nickname: string) => void
  /** Shows a Cancel button when given. */
  onCancel?: () => void
}

/**
 * Nickname input validated with the shared `nicknameSchema` (the server stays
 * authoritative). There is no `maxlength` (design P20): the full text is kept, the trimmed
 * length is shown, and an over-limit value shows the limit message and blocks confirming.
 */
export function NicknameForm({ name, initialValue = '', submitLabel, onSubmit, onCancel }: NicknameFormProps) {
  const id = useId()
  const inputId = `${id}-input`
  const countId = `${id}-count`
  const errorId = `${id}-error`
  const [value, setValue] = useState(initialValue)
  const [attempted, setAttempted] = useState(false)

  const result = nicknameSchema.safeParse(value)
  const trimmedLength = value.trim().length
  const overLimit = trimmedLength > NICKNAME_MAX_LENGTH
  const errors = result.success ? [] : result.error.issues.map((issue) => issue.message)
  const showErrors = errors.length > 0 && (attempted || overLimit)

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setAttempted(true)
    if (result.success) onSubmit(result.data)
  }

  return (
    <form className="nickname-form" aria-label={name} onSubmit={handleSubmit} noValidate>
      <label htmlFor={inputId}>Nickname</label>
      <div className="nickname-form__row">
        <input
          id={inputId}
          type="text"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          autoComplete="nickname"
          spellCheck={false}
          aria-invalid={showErrors}
          aria-describedby={showErrors ? `${errorId} ${countId}` : countId}
        />
        <button type="submit" disabled={overLimit}>
          {submitLabel}
        </button>
        {onCancel ? (
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
        ) : null}
      </div>
      <p id={countId} className="nickname-form__count">
        {trimmedLength}/{NICKNAME_MAX_LENGTH}
      </p>
      {showErrors ? (
        <div id={errorId} role="alert" className="nickname-form__error">
          {errors.map((message) => (
            <p key={message}>{message}</p>
          ))}
        </div>
      ) : null}
    </form>
  )
}
