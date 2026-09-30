import { describe, expect, it } from 'vitest'
import { INVALID_ACK, readSendAck } from './send-ack'

const message = { id: 7, nickname: 'Alice', text: 'hi', createdAt: '2026-09-26T14:05:00.000Z' }

describe('readSendAck', () => {
  it('accepts an ok ack and returns its message', () => {
    expect(readSendAck({ ok: true, message })).toEqual({ ok: true, message })
  })

  it('keeps only the message fields of an ok ack', () => {
    expect(readSendAck({ ok: true, message: { ...message, extra: 1 }, extra: 2 })).toEqual({ ok: true, message })
  })

  it('turns an error ack into the server message', () => {
    expect(readSendAck({ ok: false, error: { code: 'invalid_text', message: 'Message is required.' } })).toEqual({
      ok: false,
      error: 'Message not sent: Message is required.',
    })
  })

  it.each([
    ['a string', 'not an ack'],
    ['null', null],
    ['undefined', undefined],
    ['a number', 1],
    ['an array', [{ ok: true, message }]],
    ['an empty object', {}],
    ['ok true without a message', { ok: true }],
    ['ok true with a null message', { ok: true, message: null }],
    ['a message with a string id', { ok: true, message: { ...message, id: '7' } }],
    ['a message with a fractional id', { ok: true, message: { ...message, id: 1.5 } }],
    ['a message without text', { ok: true, message: { id: 7, nickname: 'Alice', createdAt: message.createdAt } }],
    ['a message with a numeric nickname', { ok: true, message: { ...message, nickname: 1 } }],
    ['ok false without an error', { ok: false }],
    ['ok false with an error without a message', { ok: false, error: { code: 'server_error' } }],
    ['ok false with a non-string error message', { ok: false, error: { message: 42 } }],
    ['ok as a string', { ok: 'true', message }],
  ])('treats %s as an invalid response', (_, ack) => {
    expect(readSendAck(ack)).toEqual({ ok: false, error: INVALID_ACK })
  })
})
