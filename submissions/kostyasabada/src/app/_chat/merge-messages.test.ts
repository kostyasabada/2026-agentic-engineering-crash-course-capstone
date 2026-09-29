import { describe, expect, it } from 'vitest'
import type { ChatMessage } from '../../lib/chat/schema'
import { applyHistory, lastSeenIdOf, mergeMessages } from './merge-messages'

const message = (id: number, text = `m${id}`): ChatMessage => ({
  id,
  nickname: 'Alice',
  text,
  createdAt: `2026-09-26T14:${String(id % 60).padStart(2, '0')}:00.000Z`,
})

const ids = (messages: readonly ChatMessage[]) => messages.map((m) => m.id)

describe('mergeMessages', () => {
  it('appends newer messages after the current ones', () => {
    expect(ids(mergeMessages([message(1), message(2)], [message(3)]))).toEqual([1, 2, 3])
  })

  it('orders by id regardless of arrival order', () => {
    expect(ids(mergeMessages([message(5)], [message(3), message(9), message(1)]))).toEqual([1, 3, 5, 9])
    expect(ids(mergeMessages([], [message(4), message(2), message(3)]))).toEqual([2, 3, 4])
  })

  it('shows a message only once when it arrives twice (broadcast and ack)', () => {
    const merged = mergeMessages([message(1), message(2)], [message(2), message(3), message(3)])
    expect(ids(merged)).toEqual([1, 2, 3])
  })

  it('removes duplicates that exist within the current list', () => {
    expect(ids(mergeMessages([message(2), message(1), message(2)], []))).toEqual([1, 2])
  })

  it('keeps one copy per id with the server content', () => {
    const merged = mergeMessages([message(1, 'old')], [message(1, 'new')])
    expect(merged).toEqual([message(1, 'new')])
  })

  it('does not mutate its inputs', () => {
    const current = [message(2), message(1)]
    const incoming = [message(3)]
    mergeMessages(current, incoming)
    expect(ids(current)).toEqual([2, 1])
    expect(ids(incoming)).toEqual([3])
  })

  it('returns an empty list for empty inputs', () => {
    expect(mergeMessages([], [])).toEqual([])
  })
})

describe('applyHistory', () => {
  it('replace discards the current list and shows only the server messages in order', () => {
    const current = [message(118), message(119), message(120)]
    const next = applyHistory(current, { mode: 'replace', messages: [message(29), message(28), message(30)] })
    expect(ids(next)).toEqual([28, 29, 30])
  })

  it('append merges the missed messages after the current ones without duplicates', () => {
    const current = [message(1), message(2)]
    const next = applyHistory(current, { mode: 'append', messages: [message(2), message(4), message(3)] })
    expect(ids(next)).toEqual([1, 2, 3, 4])
  })

  it('replace with an empty history empties the list', () => {
    expect(applyHistory([message(1)], { mode: 'replace', messages: [] })).toEqual([])
  })
})

describe('lastSeenIdOf', () => {
  it('is undefined for an empty list', () => {
    expect(lastSeenIdOf([])).toBeUndefined()
  })

  it('is the highest id', () => {
    expect(lastSeenIdOf(mergeMessages([], [message(7), message(3), message(12)]))).toBe(12)
  })
})
