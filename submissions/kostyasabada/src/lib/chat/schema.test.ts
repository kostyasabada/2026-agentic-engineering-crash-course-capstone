import { describe, expect, expectTypeOf, it } from 'vitest'
import {
  MESSAGE_MAX_LENGTH,
  NICKNAME_MAX_LENGTH,
  messageTextSchema,
  nicknameSchema,
  sendMessageSchema,
  type ChatMessage,
  type SendMessageInput,
} from './schema'

// U+20000 (CJK Unified Ideograph Extension B): a Unicode letter outside the BMP,
// two UTF-16 code units long.
const ASTRAL = '\u{20000}'

function issueMessages(result: { success: boolean; error?: { issues: { message: string }[] } }) {
  return (result.error?.issues ?? []).map((issue) => issue.message).join('\n')
}

describe('limits', () => {
  it('exports the accepted limits', () => {
    expect(NICKNAME_MAX_LENGTH).toBe(32)
    expect(MESSAGE_MAX_LENGTH).toBe(1000)
  })

  it('the astral test character is two UTF-16 code units', () => {
    expect(ASTRAL.length).toBe(2)
  })
})

describe('nicknameSchema', () => {
  it('accepts a valid nickname unchanged', () => {
    expect(nicknameSchema.parse('Alice_1')).toBe('Alice_1')
  })

  it('trims leading and trailing whitespace and returns the trimmed value', () => {
    expect(nicknameSchema.parse('  Alice_1  ')).toBe('Alice_1')
    expect(nicknameSchema.parse('\t\n Bob \r\n')).toBe('Bob')
  })

  it.each([
    ['letters with inner space', 'Alice Smith'],
    ['hyphen', 'Jean-Luc'],
    ['period', 'mr.smith'],
    ['underscore', '_under_score_'],
    ['Cyrillic letters', 'Анна'],
    ['CJK letters', '李雷'],
    ['letter with diaeresis and digit', 'Zoë 2'],
    ['non-ASCII decimal digits', 'user٣'],
    ['only allowed punctuation', '.-_'],
    ['Devanagari letters with combining vowel signs', '\u092A\u094D\u0930\u093F\u092F\u093E'],
    ['decomposed José (e + U+0301)', 'Jose\u0301'],
    ['several combining marks after one base letter', 'a\u0301\u0308b'],
    ['three combining marks after one letter', 'a\u0301\u0308\u0323'],
  ])('accepts allowed characters: %s', (_label, value) => {
    expect(nicknameSchema.parse(value)).toBe(value)
  })

  it.each([
    ['empty', ''],
    ['spaces only', '   '],
    ['tab only', '\t'],
    ['mixed whitespace only', ' \t\r\n '],
  ])('rejects an empty or whitespace-only nickname: %s', (_label, value) => {
    expect(nicknameSchema.safeParse(value).success).toBe(false)
  })

  it('reports only the empty-nickname issue for an empty nickname, not a character issue', () => {
    const result = nicknameSchema.safeParse('   ')
    expect(result.success).toBe(false)
    expect(result.error?.issues).toHaveLength(1)
    expect(issueMessages(result).toLowerCase()).not.toMatch(/letters/)
  })

  it('accepts 1 character (lower limit)', () => {
    expect(nicknameSchema.parse('a')).toBe('a')
  })

  it('accepts exactly 32 characters', () => {
    const value = 'a'.repeat(32)
    expect(nicknameSchema.parse(value)).toBe(value)
  })

  it('rejects 33 characters and names the 32-character limit', () => {
    const result = nicknameSchema.safeParse('a'.repeat(33))
    expect(result.success).toBe(false)
    expect(issueMessages(result)).toMatch(/32/)
  })

  it('counts length after trimming: 32 characters surrounded by spaces are accepted', () => {
    const value = 'b'.repeat(32)
    expect(nicknameSchema.parse(`   ${value}   `)).toBe(value)
  })

  it('counts length after trimming: 33 characters surrounded by spaces are rejected', () => {
    expect(nicknameSchema.safeParse(`  ${'b'.repeat(33)}  `).success).toBe(false)
  })

  it('counts UTF-16 code units: 16 copies of U+20000 (32 units) are accepted', () => {
    const value = ASTRAL.repeat(16)
    expect(value.length).toBe(32)
    expect(nicknameSchema.parse(value)).toBe(value)
  })

  it('counts UTF-16 code units: 17 copies of U+20000 (34 units) are rejected as too long', () => {
    const value = ASTRAL.repeat(17)
    expect(value.length).toBe(34)
    const result = nicknameSchema.safeParse(value)
    expect(result.success).toBe(false)
    expect(issueMessages(result)).toMatch(/32/)
  })

  it.each([
    ['markup', '<script>'],
    ['at sign', 'bob@home'],
    ['slash', 'a/b'],
    ['emoji', 'smile\u{1F600}'],
    ['inner tab', 'a\tb'],
    ['inner line break', 'a\nb'],
    ['apostrophe', "O'Brien"],
    ['superscript digit (No, not Nd)', 'a\u00B2'],
    ['Roman numeral (Nl, not Nd)', '\u216B'],
    ['leading combining mark', '\u0301abc'],
    ['only a combining mark', '\u0301'],
    ['combining mark after a space', 'a \u0301b'],
    ['combining mark after a digit', '1\u0301'],
    ['combining mark after a non-ASCII digit', 'a\u0663\u0301'],
    ['combining mark after a hyphen', 'a-\u0301b'],
    ['combining mark after an underscore', 'a_\u0301b'],
    ['combining mark after a period', 'a.\u0301b'],
    ['two combining marks after a digit', '1\u0301\u0308'],
    ['zero-width joiner (U+200D, format character)', 'a\u200Db'],
    ['zero-width non-joiner (U+200C, format character)', 'a\u200Cb'],
    ['right-to-left override (U+202E, format character)', 'a\u202Eb'],
  ])('rejects disallowed characters: %s', (_label, value) => {
    expect(nicknameSchema.safeParse(value).success).toBe(false)
  })

  it('rejects a combining mark that is first after trimming', () => {
    expect(nicknameSchema.safeParse('  \u0301abc  ').success).toBe(false)
  })

  it('counts combining marks in UTF-16 units: 16 x (e + U+0301) = 32 accepted, 33 units rejected', () => {
    const value = 'e\u0301'.repeat(16)
    expect(value.length).toBe(32)
    expect(nicknameSchema.parse(value)).toBe(value)
    expect(nicknameSchema.safeParse(`${value}e`).success).toBe(false)
  })

  it('names the allowed characters when rejecting disallowed ones', () => {
    const result = nicknameSchema.safeParse('bob@home')
    expect(result.success).toBe(false)
    const messages = issueMessages(result).toLowerCase()
    expect(messages).toMatch(/letters/)
    expect(messages).toMatch(/digits/)
  })

  it.each([
    ['number', 123],
    ['null', null],
    ['undefined', undefined],
    ['object', { nickname: 'Alice' }],
  ])('rejects a non-string value: %s', (_label, value) => {
    expect(nicknameSchema.safeParse(value).success).toBe(false)
  })
})

describe('messageTextSchema', () => {
  it('accepts a valid message unchanged', () => {
    expect(messageTextSchema.parse('Hello Bob')).toBe('Hello Bob')
  })

  it('trims surrounding whitespace', () => {
    expect(messageTextSchema.parse('   hi there   ')).toBe('hi there')
  })

  it.each([
    ['empty', ''],
    ['spaces only', '     '],
    ['tabs only', '\t\t'],
    ['line breaks only', '\n\r\n\n'],
    ['mixed whitespace only', ' \t\n \r\n\t '],
  ])('rejects an empty or whitespace-only message: %s', (_label, value) => {
    expect(messageTextSchema.safeParse(value).success).toBe(false)
  })

  it('accepts 1 character (lower limit)', () => {
    expect(messageTextSchema.parse('x')).toBe('x')
  })

  it('accepts exactly 1000 characters', () => {
    const value = 'm'.repeat(1000)
    expect(messageTextSchema.parse(value)).toBe(value)
  })

  it('rejects 1001 characters and names the 1000-character limit', () => {
    const result = messageTextSchema.safeParse('m'.repeat(1001))
    expect(result.success).toBe(false)
    expect(issueMessages(result)).toMatch(/1000/)
  })

  it('does not count surrounding whitespace: 1000 characters plus 10 spaces on each side are accepted as the trimmed text', () => {
    const inner = 'w'.repeat(1000)
    const raw = `${' '.repeat(10)}${inner}${' '.repeat(10)}`
    expect(raw.length).toBe(1020)
    const parsed = messageTextSchema.parse(raw)
    expect(parsed).toBe(inner)
    expect(parsed.length).toBe(1000)
  })

  it('rejects a text whose trimmed length is 1001 even with surrounding whitespace', () => {
    expect(messageTextSchema.safeParse(`  ${'w'.repeat(1001)}  `).success).toBe(false)
  })

  it('preserves inner line breaks', () => {
    expect(messageTextSchema.parse('one\ntwo\nthree')).toBe('one\ntwo\nthree')
    expect(messageTextSchema.parse('one\r\ntwo')).toBe('one\r\ntwo')
  })

  it('trims surrounding line breaks but keeps inner line breaks and inner spaces', () => {
    expect(messageTextSchema.parse('\n\n  hi \n\n there  \n\n')).toBe('hi \n\n there')
  })

  it('keeps markup as plain text', () => {
    const value = '<img src=x onerror=alert(1)><b>bold</b>'
    expect(messageTextSchema.parse(value)).toBe(value)
  })

  it('counts UTF-16 code units: a 1000-unit message containing astral characters is accepted', () => {
    const value = `${'a'.repeat(998)}${ASTRAL}`
    expect(value.length).toBe(1000)
    expect(messageTextSchema.parse(value)).toBe(value)
  })

  it('counts UTF-16 code units: 500 copies of U+20000 (1000 units) are accepted', () => {
    const value = ASTRAL.repeat(500)
    expect(value.length).toBe(1000)
    expect(messageTextSchema.parse(value)).toBe(value)
  })

  it('counts UTF-16 code units: a 1001-unit message containing astral characters is rejected', () => {
    const value = `${'a'.repeat(999)}${ASTRAL}`
    expect(value.length).toBe(1001)
    expect(messageTextSchema.safeParse(value).success).toBe(false)
  })

  it('counts UTF-16 code units: 501 copies of U+20000 (1002 units, 501 code points) are rejected', () => {
    const value = ASTRAL.repeat(501)
    expect(value.length).toBe(1002)
    expect([...value].length).toBe(501)
    expect(messageTextSchema.safeParse(value).success).toBe(false)
  })

  it.each([
    ['number', 42],
    ['null', null],
    ['undefined', undefined],
    ['array', ['hi']],
  ])('rejects a non-string value: %s', (_label, value) => {
    expect(messageTextSchema.safeParse(value).success).toBe(false)
  })
})

describe('sendMessageSchema', () => {
  it('accepts a valid payload and returns trimmed values', () => {
    expect(sendMessageSchema.parse({ nickname: '  Alice_1  ', text: '   hi there   ' })).toEqual({
      nickname: 'Alice_1',
      text: 'hi there',
    })
  })

  it('strips extra fields such as client ids and timestamps', () => {
    const parsed = sendMessageSchema.parse({
      nickname: 'Sam',
      text: 'hello',
      id: 999,
      createdAt: '1999-01-01T00:00:00.000Z',
      clientId: 'abc',
    })
    expect(parsed).toEqual({ nickname: 'Sam', text: 'hello' })
    expect(Object.keys(parsed).sort()).toEqual(['nickname', 'text'])
  })

  it('reports an invalid nickname under the nickname path', () => {
    const result = sendMessageSchema.safeParse({ nickname: 'bob@home', text: 'hello' })
    expect(result.success).toBe(false)
    expect(result.error?.issues.map((issue) => issue.path[0])).toEqual(['nickname'])
  })

  it('reports an invalid text under the text path', () => {
    const result = sendMessageSchema.safeParse({ nickname: 'Sam', text: '   ' })
    expect(result.success).toBe(false)
    expect(result.error?.issues.map((issue) => issue.path[0])).toEqual(['text'])
  })

  it('rejects a payload with missing fields', () => {
    expect(sendMessageSchema.safeParse({ nickname: 'Sam' }).success).toBe(false)
    expect(sendMessageSchema.safeParse({ text: 'hello' }).success).toBe(false)
  })

  it.each([
    ['null', null],
    ['string', 'hello'],
    ['array', ['Sam', 'hello']],
  ])('rejects a non-object payload: %s', (_label, value) => {
    expect(sendMessageSchema.safeParse(value).success).toBe(false)
  })
})

describe('types', () => {
  it('SendMessageInput is the parsed payload shape', () => {
    expectTypeOf<SendMessageInput>().toEqualTypeOf<{ nickname: string; text: string }>()
  })

  it('ChatMessage matches the Socket.IO contract (design D2)', () => {
    expectTypeOf<ChatMessage>().toEqualTypeOf<{
      id: number
      nickname: string
      text: string
      createdAt: string
    }>()
  })
})
