import { expect, test } from 'claude-code/testing'
import type { ToolGroupCall } from 'claude-code'

import { StretchMarks, stretchMarks } from '../hooks/stretch'

const call = (tool_use_id: string, tool: string): ToolGroupCall => ({
  tool_use_id,
  tool,
  input: {},
  isRunning: false,
  isErrored: false,
  isInterrupted: false,
})

const isCompact = (c: ToolGroupCall) => c.tool === 'Read' || c.tool === 'Grep'

test('a compact call continues a stretch only after another compact call', () => {
  const calls = [call('a', 'Read'), call('b', 'Grep'), call('x', 'Bash'), call('c', 'Read'), call('d', 'Read')]

  expect(stretchMarks(calls, isCompact)).toEqual([
    ['a', false],
    ['b', true],
    ['c', false],
    ['d', true],
  ])
})

test('a call without an id is not marked, and does not end a stretch', () => {
  const calls = [call('a', 'Read'), { ...call('', 'Read'), tool_use_id: undefined }, call('b', 'Read')]

  expect(stretchMarks(calls, isCompact)).toEqual([
    ['a', false],
    ['b', true],
  ])
})

test('only changed marks are queued, and taking them empties the queue', () => {
  const marks = new StretchMarks(isCompact)

  expect(marks.note([call('a', 'Read'), call('b', 'Read')])).toBe(true)
  expect(marks.note([call('a', 'Read'), call('b', 'Read')])).toBe(false)
  expect(marks.take()).toEqual([
    ['a', false],
    ['b', true],
  ])
  expect(marks.take()).toEqual([])

  expect(marks.note([call('a', 'Read'), call('x', 'Bash'), call('b', 'Read')])).toBe(true)
  expect(marks.take()).toEqual([['b', false]])
})

test('a call the group drops keeps its mark', () => {
  const marks = new StretchMarks(isCompact)
  marks.note([call('a', 'Read'), call('b', 'Read')])
  marks.take()

  expect(marks.note([call('a', 'Read')])).toBe(false)
})

test('a forgotten mark is queued again by the next draw, unless a newer one replaced it', () => {
  const marks = new StretchMarks(isCompact)
  marks.note([call('a', 'Read'), call('b', 'Read')])
  const [, b] = marks.take()
  if (!b) throw new Error('b was not marked')

  marks.forget(b)
  expect(marks.note([call('a', 'Read'), call('b', 'Read')])).toBe(true)
  expect(marks.take()).toEqual([['b', true]])

  marks.note([call('x', 'Bash'), call('b', 'Read')])
  marks.forget(b)
  expect(marks.note([call('x', 'Bash'), call('b', 'Read')])).toBe(false)
})
