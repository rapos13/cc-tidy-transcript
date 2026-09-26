import { expect, test } from 'claude-code/testing'

import type { Call } from '../hooks/line'
import { readLine } from '../hooks/read'
import { searchLine } from '../hooks/search'

const call = (tool: string, input: unknown, output?: unknown, flags: Partial<Call> = {}): Call => ({
  tool,
  input,
  output,
  isErrored: false,
  isInterrupted: false,
  ...flags,
})

const text = (startLine: number, numLines: number, totalLines: number) => ({
  type: 'text',
  file: { filePath: '/a.ts', content: '', startLine, numLines, totalLines },
})

const grep = (fields: object) => ({ numFiles: 0, filenames: [], ...fields })
const glob = (fields: object) => ({ durationMs: 1, numFiles: 0, filenames: [], truncated: false, ...fields })

test('a Read streaming its input has no path yet, and reads until its output lands', () => {
  expect(readLine(call('Read', {}))).toEqual(['Read', '…', 'reading…'])
  expect(readLine(call('Read', undefined))).toEqual(['Read', '…', 'reading…'])
  expect(readLine(call('Read', { file_path: '/a.ts' }))).toEqual(['Read', '/a.ts', 'reading…'])
})

test('an interrupted or failed call says so instead of a result', () => {
  expect(readLine(call('Read', { file_path: '/a.ts' }, 'x', { isErrored: true }))[2]).toBe('error')
  expect(searchLine(call('Glob', { pattern: '*' }, undefined, { isInterrupted: true }))[2]).toBe('interrupted')
})

test('a whole file is its range; part of a file names the total', () => {
  const read = (output: unknown) => readLine(call('Read', { file_path: '/a.ts' }, output))[2]
  expect(read(text(1, 64, 64))).toBe('lines 1-64')
  expect(read(text(1, 10, 14424))).toBe('lines 1-10 of 14424')
  expect(read(text(100, 20, 300))).toBe('lines 100-119 of 300')
  expect(read(text(1, 0, 0))).toBe('no lines of 0')
})

test('a file that is not text draws its kind, with the pages asked for', () => {
  expect(readLine(call('Read', { file_path: '/a.png' }, { type: 'image', file: {} }))[2]).toBe('image')
  expect(readLine(call('Read', { file_path: '/a.pdf', pages: '1-5' }, { type: 'pdf', file: {} }))[2]).toBe('pdf, pages 1-5')
})

test("a Grep quotes its pattern and lists its filters; a Glob's pattern is bare", () => {
  expect(searchLine(call('Grep', {}))).toEqual(['Search', '…', 'searching…'])
  expect(searchLine(call('Grep', { pattern: 'TODO', path: 'src', glob: '*.ts', type: 'ts', '-i': true, multiline: true }))[1]).toBe(
    '"TODO" in src · glob *.ts · type ts · -i · multiline',
  )
  expect(searchLine(call('Glob', { pattern: '**/*.md', path: 'wiki' }))[1]).toBe('**/*.md in wiki')
  expect(searchLine(call('Glob', {}))[1]).toBe('…')
})

test('a Grep counts in the unit of its mode, with a + when a limit cut it', () => {
  const count = (output: unknown) => searchLine(call('Grep', { pattern: 'x' }, output))[2]
  expect(count(grep({ numFiles: 1 }))).toBe('1 file')
  expect(count(grep({ mode: 'files_with_matches', numFiles: 12, appliedLimit: 12 }))).toBe('12 files+')
  expect(count(grep({ mode: 'content', numLines: 40 }))).toBe('40 lines')
  expect(count(grep({ mode: 'content', numLines: 1, appliedLimit: 1 }))).toBe('1 line+')
  expect(count(grep({ mode: 'count', numMatches: 7, numFiles: 3 }))).toBe('7 matches in 3 files')
  expect(count(grep({ mode: 'count', numMatches: 1, numFiles: 1 }))).toBe('1 match in 1 file')
})

test('a truncated Glob names its total, with a + when that total is a floor', () => {
  const count = (output: unknown) => searchLine(call('Glob', { pattern: '*' }, output))[2]
  expect(count(glob({ numFiles: 3 }))).toBe('3 files')
  expect(count(glob({ numFiles: 100, truncated: true, totalMatches: 250, countIsComplete: true }))).toBe('100 of 250 files')
  expect(count(glob({ numFiles: 100, truncated: true, totalMatches: 250, countIsComplete: false }))).toBe('100 of 250+ files')
  expect(count(glob({ numFiles: 100, truncated: true }))).toBe('100 of 100 files')
})
