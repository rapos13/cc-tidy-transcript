import { expect, test } from 'claude-code/testing'

import type { Call } from '../hooks/line'
import { CLIPPED, linesOf, terminalOf, wrap } from '../hooks/terminal-lines'

const bash = (input: unknown, output?: unknown, flags: Partial<Call> = {}): Call => ({
  tool: 'Bash',
  input,
  output,
  isErrored: false,
  isInterrupted: false,
  ...flags,
})

const result = (fields: object) => ({ stdout: '', stderr: '', interrupted: false, ...fields })

test('a running call has its description and prompt, and no body yet', () => {
  expect(terminalOf(bash({ command: 'ls', description: 'List files' }))).toEqual({
    description: 'List files',
    status: 'running',
    command: ['$ ls'],
    body: [],
    footer: [],
  })
})

test('a missing or blank description is none; PowerShell has its own prompt', () => {
  expect(terminalOf(bash({ command: 'ls', description: ' \n' })).description).toBeUndefined()
  const t = terminalOf({ ...bash({ command: 'Get-Date\nGet-Location' }), tool: 'PowerShell' })
  expect(t.description).toBeUndefined()
  expect(t.command).toEqual(['PS> Get-Date', '    Get-Location'])
})

test('stderr follows stdout, red', () => {
  const t = terminalOf(bash({ command: 'x' }, result({ stdout: 'a\nb\n', stderr: 'oops\n' })))
  expect(t.status).toBe('done')
  expect(t.body).toEqual([
    ['out', 'a'],
    ['out', 'b'],
    ['err', 'oops'],
  ])
})

test('a failed call shows the text the model read, its exit code in the footer', () => {
  const t = terminalOf(bash({ command: 'false' }, 'Exit code 1\nnope', { isErrored: true }))
  expect(t.status).toBe('failed')
  expect(t.body).toEqual([['err', 'nope']])
  expect(t.footer).toEqual(['exit 1'])
})

test('the record extras land in the footer', () => {
  const t = terminalOf(
    bash(
      { command: 'git commit -m x' },
      result({
        stdout: 'ok',
        returnCodeInterpretation: 'No matches found',
        backgroundTaskId: 'b1',
        gitOperation: { commit: { sha: 'a81b350ffff', kind: 'committed', branch: 'main' }, push: { branch: 'main' } },
        persistedOutputPath: '/tmp/out.txt',
      }),
    ),
  )
  expect(t.footer).toEqual([
    'No matches found',
    'running in background · task b1',
    'committed a81b350 on main',
    'pushed main',
    'full output: /tmp/out.txt',
  ])
})

test('escapes, carriage returns, tabs and controls come out as a terminal shows them', () => {
  expect(linesOf('\x1b[31mred\x1b[0m\r\n10%\r50%\r100%\na\tb\x07\n\n\n')).toEqual(['red', '100%', 'a       b'])
  expect(linesOf('\x1b]0;title\x07x')).toEqual(['x'])
})

test('a line wraps at spaces, inside a word only when the word is wider than a row', () => {
  expect(wrap('', 10)).toEqual([''])
  expect(wrap('$ ls -la', 10)).toEqual(['$ ls -la'])
  expect(wrap('one two three four', 9)).toEqual(['one two', 'three', 'four'])
  expect(wrap('ab abcdefghijkl', 5)).toEqual(['ab', 'abcde', 'fghij', 'kl'])
  expect(wrap('    Get-Location', 20)).toEqual(['    Get-Location'])
})

test('a wide character takes two cells', () => {
  expect(wrap('日本語テキスト', 6)).toEqual(['日本語', 'テキス', 'ト'])
  expect(wrap('日本', 1)).toEqual(['日', '本'])
})

test('output past the budget keeps its tail under a clipped line', () => {
  const stdout = Array.from({ length: 5000 }, (_, i) => `${i}`.padEnd(40, '.')).join('\n')
  const { body } = terminalOf(bash({ command: 'x' }, result({ stdout })))
  expect(body[0]).toEqual(['dim', CLIPPED])
  expect(body[body.length - 1]?.[1].startsWith('4999')).toBe(true)
  expect(JSON.stringify(body).length).toBeLessThan(61_000)
})
