import type { BuiltinToolResults } from 'claude-code'

import type { Call } from './line'

/** How an output line is coloured: plain stdout, red stderr or error, dim note. */
export type Tone = 'out' | 'err' | 'dim'

/** One output line, plain data so it can travel to the body's Client as props. */
export type OutputLine = [tone: Tone, text: string]

/** Everything a terminal row draws of a call. */
export type Terminal = {
  /** The description drawn under the command as a `#` comment, when the model gave one. */
  description: string | undefined
  /** Running until `output` arrives; failed on an error, an interrupt or an abort. */
  status: 'running' | 'done' | 'failed'
  /** The command's lines: the first after the prompt, the rest indented under it. */
  command: string[]
  /** The output, clipped from the head; empty when the call printed nothing. */
  body: OutputLine[]
  /** Dim lines under the output: exit code, interpretation, git, background, file. */
  footer: string[]
}

/** The prompt each tool's command is drawn after. */
const PROMPTS: Partial<Record<string, string>> = { Bash: '$ ', PowerShell: 'PS> ' }

/**
 * The output handed to the body is bounded as a tree's text (100,000
 * characters serialized, `ClientElements` doc); keep well inside it.
 */
const BODY_BUDGET = 60_000

/** No surface is this wide: a longer line is cut before it is sent. */
const LINE_WIDTH = 512

/** A command longer than this is cut, so the row's own tree stays in bounds. */
const COMMAND_BUDGET = 20_000

export const CLIPPED = '… earlier output clipped'

/**
 * What a Bash or PowerShell row draws: the command, the output with stderr
 * after stdout, the extras the result record carries.
 */
export function terminalOf(call: Call): Terminal {
  const input = (call.input ?? {}) as { command?: unknown; description?: unknown }
  const description = typeof input.description === 'string' ? linesOf(input.description).join(' ') || undefined : undefined
  const command = commandLines(PROMPTS[call.tool] ?? '$ ', typeof input.command === 'string' ? input.command : '')
  const isFailed = call.isErrored || call.isInterrupted

  if (call.output === undefined) return { description, status: isFailed ? 'failed' : 'running', command, body: [], footer: [] }
  if (typeof call.output === 'string') return { description, status: isFailed ? 'failed' : 'done', command, ...errorOf(call.output) }

  const output = call.output as BuiltinToolResults['Bash'] | BuiltinToolResults['PowerShell']
  const body: OutputLine[] = output.isImage
    ? [['dim', '[image]']]
    : [...linesOf(output.stdout ?? '').map((l): OutputLine => ['out', l]), ...linesOf(output.stderr ?? '').map((l): OutputLine => ['err', l])]
  return {
    description,
    status: isFailed || output.interrupted ? 'failed' : 'done',
    command,
    body: clip(body),
    footer: footerOf(output),
  }
}

/**
 * The text the model read for a failed call. Bash's starts `Exit code N`,
 * which moves to the footer.
 */
function errorOf(text: string): Pick<Terminal, 'body' | 'footer'> {
  const lines = linesOf(text)
  const exit = /^Exit code (\d+)$/.exec(lines[0] ?? '')
  if (exit) lines.shift()
  return { body: clip(lines.map((l): OutputLine => ['err', l])), footer: exit ? [`exit ${exit[1]}`] : [] }
}

/** The dim lines the result record adds under the output. */
function footerOf(output: BuiltinToolResults['Bash'] | BuiltinToolResults['PowerShell']): string[] {
  const footer: string[] = []
  if (output.interrupted) footer.push('interrupted')
  if (output.returnCodeInterpretation) footer.push(output.returnCodeInterpretation)
  if (output.timedOutAfterMs !== undefined) footer.push(`timed out after ${Math.round(output.timedOutAfterMs / 1000)}s`)
  if (output.backgroundTaskId) footer.push(`running in background · task ${output.backgroundTaskId}`)
  footer.push(...gitLines(output.gitOperation))
  if (output.persistedOutputPath) footer.push(`full output: ${output.persistedOutputPath}`)
  return footer.map(line => clean(line).slice(0, LINE_WIDTH))
}

/** `committed a81b350 on main`, `pushed main`, `rebased main`, `PR #12 created`. */
function gitLines(git: BuiltinToolResults['Bash']['gitOperation']): string[] {
  if (!git) return []
  const lines: string[] = []
  if (git.commit) lines.push(`${git.commit.kind} ${git.commit.sha.slice(0, 7)}${git.commit.branch ? ` on ${git.commit.branch}` : ''}`)
  if (git.push) lines.push(`pushed ${git.push.branch}`)
  if (git.branch) lines.push(`${git.branch.action} ${git.branch.ref}`)
  if (git.pr) lines.push(`PR #${git.pr.number} ${git.pr.action}`)
  return lines
}

/** The command's lines, the first after the prompt, the rest indented to match. */
function commandLines(prompt: string, command: string): string[] {
  const text = command.length > COMMAND_BUDGET ? `${command.slice(0, COMMAND_BUDGET)}…` : command
  const lines = linesOf(text)
  const indent = ' '.repeat(prompt.length)
  return (lines.length ? lines : ['']).map((l, i) => (i === 0 ? prompt : indent) + l)
}

/**
 * A text's lines as a terminal would show them: a line keeps what follows
 * its last carriage return (progress bars), tabs expand to 8-column stops,
 * escape sequences and other controls go (a Text may hold none), trailing
 * blank lines are dropped and each line is cut at `LINE_WIDTH`.
 */
export function linesOf(text: string): string[] {
  const lines = stripEscapes(text)
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map(line => {
      const cr = line.lastIndexOf('\r')
      return clean(expandTabs(cr < 0 ? line : line.slice(cr + 1))).slice(0, LINE_WIDTH)
    })
  while (lines.length && lines[lines.length - 1]!.trim() === '') lines.pop()
  return lines
}

/** CSI (colours, cursor moves), OSC (titles, links) and two-character escapes. */
function stripEscapes(text: string): string {
  return text.replace(/\x1b\[[0-?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[@-_]/g, '')
}

/** Drops C0 and C1 control characters, which a Text may not hold. */
function clean(line: string): string {
  return line.replace(/[\x00-\x1f\x7f-\x9f]/g, '')
}

function expandTabs(line: string): string {
  if (!line.includes('\t')) return line
  let out = ''
  for (const ch of line) out += ch === '\t' ? ' '.repeat(8 - (out.length % 8)) : ch
  return out
}

/** Keeps the tail of the output within `BODY_BUDGET` serialized characters. */
function clip(lines: OutputLine[]): OutputLine[] {
  let size = 0
  let start = lines.length
  while (start > 0) {
    const cost = JSON.stringify(lines[start - 1]).length + 1
    if (size + cost > BODY_BUDGET) break
    size += cost
    start--
  }
  return start === 0 ? lines : [['dim', CLIPPED], ...lines.slice(start)]
}
