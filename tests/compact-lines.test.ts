import { expect, test } from 'claude-code/testing'

import type { Call } from '../hooks/line'
import { shownPath } from '../hooks/paths'
import { readLine } from '../hooks/read'
import { searchLine } from '../hooks/search'

const ROOT = 'C:\\_dev\\proj'

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

test('a path under the root is shown relative to it, whatever its case and slashes', () => {
  expect(shownPath('C:\\_dev\\proj\\hooks\\a.ts', ROOT)).toEqual({ text: 'hooks\\a.ts', isOutside: false })
  expect(shownPath('c:/_DEV/proj/hooks/a.ts', ROOT)).toEqual({ text: 'hooks/a.ts', isOutside: false })
  expect(shownPath('C:\\_dev\\proj', ROOT)).toEqual({ text: '.', isOutside: false })
  expect(shownPath('C:\\_dev\\proj\\', ROOT)).toEqual({ text: '.', isOutside: false })
  expect(shownPath('/home/u/proj/a.ts', '/home/u/proj/')).toEqual({ text: 'a.ts', isOutside: false })
})

test('a path elsewhere stays whole and is flagged; a relative one counts as inside', () => {
  expect(shownPath('C:\\_dev\\project2\\a.ts', ROOT)).toEqual({ text: 'C:\\_dev\\project2\\a.ts', isOutside: true })
  expect(shownPath('C:\\Users\\a.md', ROOT)).toEqual({ text: 'C:\\Users\\a.md', isOutside: true })
  expect(shownPath('src/a.ts', ROOT)).toEqual({ text: 'src/a.ts', isOutside: false })
  expect(shownPath('C:\\x\\a.ts', undefined)).toEqual({ text: 'C:\\x\\a.ts', isOutside: false })
})

test('a Read shows its path alone, and no result until its output lands', () => {
  expect(readLine(call('Read', {}), ROOT)).toEqual({ name: 'Read', args: [{ label: undefined, text: '…' }], result: undefined })
  expect(readLine(call('Read', undefined), ROOT).args[0]?.text).toBe('…')
  expect(readLine(call('Read', { file_path: 'C:\\_dev\\proj\\a.ts', offset: 5, limit: 10 }), ROOT)).toEqual({
    name: 'Read',
    args: [{ label: undefined, text: 'a.ts', isOutside: false }],
    result: undefined,
  })
})

test('an interrupted or failed call says so as its result', () => {
  expect(readLine(call('Read', { file_path: '/a.ts' }, 'x', { isErrored: true }), ROOT).result).toBe('Error')
  expect(searchLine(call('Glob', { pattern: '*' }, undefined, { isInterrupted: true }), ROOT).result).toBe('Interrupted')
})

test('a whole file is its line count; part of a file names its range and total', () => {
  const read = (output: unknown) => readLine(call('Read', { file_path: '/a.ts' }, output), ROOT).result
  expect(read(text(1, 64, 64))).toBe('Read 64 lines')
  expect(read(text(1, 1, 1))).toBe('Read 1 line')
  expect(read(text(1, 10, 14424))).toBe('Read lines 1-10 of 14424')
  expect(read(text(100, 20, 300))).toBe('Read lines 100-119 of 300')
  expect(read(text(1, 0, 0))).toBe('Read no lines of 0')
})

test('a file that is not text reads as its kind, with the pages asked for', () => {
  expect(readLine(call('Read', { file_path: '/a.png' }, { type: 'image', file: {} }), ROOT).result).toBe('Read image')
  expect(readLine(call('Read', { file_path: '/a.pdf', pages: '1-5' }, { type: 'pdf', file: {} }), ROOT).result).toBe(
    'Read pdf, pages 1-5',
  )
})

test('a search names every input with a value, path first; only a Grep pattern is quoted', () => {
  const args = (tool: string, input: unknown) =>
    searchLine(call(tool, input), ROOT).args.map(part => `${part.label === undefined ? '' : `${part.label}: `}${part.text}`)

  expect(
    args('Grep', { pattern: 'TODO', glob: '*.ts', path: 'C:\\_dev\\proj\\src', output_mode: 'content', '-i': true, multiline: false, head_limit: 5 }),
  ).toEqual(['path: src', 'pattern: "TODO"', 'glob: *.ts', 'output_mode: content', '-i', 'head_limit: 5'])
  expect(args('Glob', { pattern: '**/*.md', path: 'wiki' })).toEqual(['path: wiki', 'pattern: **/*.md'])
  expect(args('Glob', { pattern: 'C:\\_dev\\proj\\**\\*.md' })).toEqual(['pattern: **\\*.md'])
  expect(args('Grep', { pattern: 'x', type: '', path: undefined })).toEqual(['pattern: "x"'])
  expect(args('Glob', {})).toEqual([])
})

test('a path outside the root is flagged on its part alone', () => {
  const parts = searchLine(call('Grep', { pattern: 'x', path: 'C:\\Users\\u' }), ROOT).args
  expect(parts[0]).toEqual({ label: 'path', text: 'C:\\Users\\u', isOutside: true })
  expect(parts[1]?.isOutside).toBe(undefined)
  expect(searchLine(call('Glob', { pattern: 'D:\\x\\*.md' }), ROOT).args[0]?.isOutside).toBe(true)
})

test('a Grep counts in the unit of its mode, with a + when a limit cut it', () => {
  const count = (output: unknown) => searchLine(call('Grep', { pattern: 'x' }, output), ROOT).result
  expect(count(grep({ numFiles: 1 }))).toBe('Found 1 file')
  expect(count(grep({ mode: 'files_with_matches', numFiles: 12, appliedLimit: 12 }))).toBe('Found 12 files+')
  expect(count(grep({ mode: 'content', numLines: 40 }))).toBe('Found 40 lines')
  expect(count(grep({ mode: 'content', numLines: 1, appliedLimit: 1 }))).toBe('Found 1 line+')
  expect(count(grep({ mode: 'count', numMatches: 7, numFiles: 3 }))).toBe('Found 7 matches in 3 files')
  expect(count(grep({ mode: 'count', numMatches: 1, numFiles: 1 }))).toBe('Found 1 match in 1 file')
})

test('a truncated Glob names its total, with a + when that total is a floor', () => {
  const count = (output: unknown) => searchLine(call('Glob', { pattern: '*' }, output), ROOT).result
  expect(count(glob({ numFiles: 3 }))).toBe('Found 3 files')
  expect(count(glob({ numFiles: 100, truncated: true, totalMatches: 250, countIsComplete: true }))).toBe('Found 100 of 250 files')
  expect(count(glob({ numFiles: 100, truncated: true, totalMatches: 250, countIsComplete: false }))).toBe('Found 100 of 250+ files')
  expect(count(glob({ numFiles: 100, truncated: true }))).toBe('Found 100 of 100 files')
})
