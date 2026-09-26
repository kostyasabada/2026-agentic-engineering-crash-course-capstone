import { type ChildProcess, execFileSync, spawn } from 'node:child_process'
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

// Self-tests for scripts/agent-loop.sh (spec `agent-loop`, design D7). Every test copies the
// script into a fresh temporary Git repository (so the script's project root is that
// repository), overrides the check commands through AGENT_LOOP_CHECK_CMD and
// AGENT_LOOP_FULL_CHECK_CMD, and puts fake `claude`/`codex` executables first on PATH. The
// real agent CLIs are removed from PATH, so no test can start a paid agent run.

const SCRIPT = fileURLToPath(new URL('./agent-loop.sh', import.meta.url))
const TASK_ID = 'demo-task'
const BRIEF_TEXT = '# Demo brief\n\nMake the demo check pass.\n\n## Owned files\n\n- progress.txt\n'
const FINAL_LINE_RE = /^Loop finished: (\w+)\. Independent checker review is still required\.$/m
const RUN_START_RE = /^=== run start=\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ /
const RUN_END_RE = /^=== run end=\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ /

// PATH without any directory that contains a real `claude` or `codex` executable.
const BASE_PATH = (process.env.PATH ?? '')
  .split(path.delimiter)
  .filter((dir) => dir !== '' && !['claude', 'codex'].some((name) => existsSync(path.join(dir, name))))
  .join(path.delimiter)

interface Repo {
  base: string
  // Top of the Git work tree; equals `root` unless the project is nested in a larger repository.
  gitRoot: string
  root: string
  bin: string
  state: string
}

interface LoopResult {
  code: number | null
  signal: NodeJS.Signals | null
  stdout: string
  stderr: string
}

interface RunOptions {
  env?: Record<string, string>
  cwd?: string
  detached?: boolean
}

const repos: Repo[] = []

function git(cwd: string, ...args: string[]): string {
  return execFileSync(
    'git',
    ['-c', 'user.name=Loop Test', '-c', 'user.email=loop-test@example.invalid', '-c', 'commit.gpgsign=false', ...args],
    { cwd, encoding: 'utf8', env: { NODE_ENV: 'test', PATH: BASE_PATH, HOME: process.env.HOME ?? '/tmp' } },
  )
}

// `nested`: the project lives at `sub/project` inside a larger repository, like the real
// `submissions/kostyasabada/` inside the course repository.
function makeRepo(opts: { nested?: boolean } = {}): Repo {
  const base = mkdtempSync(path.join(tmpdir(), 'agent-loop-test-'))
  const gitRoot = opts.nested ? path.join(base, 'outer') : path.join(base, 'project')
  const repo: Repo = {
    base,
    gitRoot,
    root: opts.nested ? path.join(gitRoot, 'sub/project') : gitRoot,
    bin: path.join(base, 'bin'),
    state: path.join(base, 'state'),
  }
  repos.push(repo)
  for (const dir of [repo.root, repo.bin, repo.state]) mkdirSync(dir, { recursive: true })
  mkdirSync(path.join(repo.root, 'scripts'))
  mkdirSync(path.join(repo.root, 'docs'))
  mkdirSync(path.join(repo.root, 'openspec/changes/demo'), { recursive: true })
  copyFileSync(SCRIPT, path.join(repo.root, 'scripts/agent-loop.sh'))
  chmodSync(path.join(repo.root, 'scripts/agent-loop.sh'), 0o755)
  writeFileSync(path.join(repo.root, '.gitignore'), '.agent-loop/\nignored.txt\n')
  writeFileSync(path.join(repo.root, 'docs/brief.md'), BRIEF_TEXT)
  writeFileSync(path.join(repo.root, 'openspec/changes/demo/tasks.md'), '# Tasks\n\n- [ ] 1.1 Demo task\n')
  git(repo.gitRoot, 'init', '-q')
  git(repo.gitRoot, 'add', '-A')
  git(repo.gitRoot, 'commit', '-q', '-m', 'initial')
  return repo
}

// A fake agent CLI: counts its runs and records argv, stdin, and working directory in the
// state directory (outside the repository, so the bookkeeping is never "progress"), then
// runs `body` with `$n` set to the run number and `$STATE` to the state directory.
function fakeAgent(repo: Repo, name: 'claude' | 'codex', body: string): void {
  const file = path.join(repo.bin, name)
  writeFileSync(
    file,
    [
      '#!/usr/bin/env bash',
      `STATE='${repo.state}'`,
      `n=$(( $(cat "$STATE/${name}.count" 2>/dev/null || echo 0) + 1 ))`,
      `echo "$n" > "$STATE/${name}.count"`,
      `printf '%s\\n' "$@" > "$STATE/${name}.args.$n"`,
      `cat > "$STATE/${name}.stdin.$n"`,
      `pwd -P > "$STATE/${name}.cwd.$n"`,
      body,
      '',
    ].join('\n'),
  )
  chmodSync(file, 0o755)
}

function agentRuns(repo: Repo, name: 'claude' | 'codex' = 'claude'): number {
  const file = path.join(repo.state, `${name}.count`)
  return existsSync(file) ? Number(readFileSync(file, 'utf8').trim()) : 0
}

function stateFile(repo: Repo, name: string): string {
  return readFileSync(path.join(repo.state, name), 'utf8')
}

function logPath(repo: Repo, taskId = TASK_ID): string {
  return path.join(repo.root, 'docs/evidence', taskId, 'loop-run.log')
}

function readLog(repo: Repo): string {
  return readFileSync(logPath(repo), 'utf8')
}

// Log lines without the indented failure excerpt (`  | <text>`, or `  |` for a blank line).
function recordLines(log: string): string[] {
  return log.split('\n').filter((line) => line !== '' && !/^ {2}\|( |$)/.test(line))
}

function baseArgs(extra: string[] = []): string[] {
  return ['--task-id', TASK_ID, '--brief', 'docs/brief.md', ...extra]
}

function startLoop(repo: Repo, args: string[], opts: RunOptions = {}): { child: ChildProcess; done: Promise<LoopResult> } {
  const child = spawn(path.join(repo.root, 'scripts/agent-loop.sh'), args, {
    cwd: opts.cwd ?? repo.root,
    detached: opts.detached ?? false,
    env: {
      NODE_ENV: 'test',
      PATH: `${repo.bin}${path.delimiter}${BASE_PATH}`,
      HOME: process.env.HOME ?? '/tmp',
      LANG: 'C.UTF-8',
      STATE: repo.state,
      ...opts.env,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let stdout = ''
  let stderr = ''
  child.stdout?.on('data', (chunk: Buffer) => (stdout += chunk.toString()))
  child.stderr?.on('data', (chunk: Buffer) => (stderr += chunk.toString()))
  const done = new Promise<LoopResult>((resolve, reject) => {
    child.on('error', reject)
    child.on('close', (code, signal) => resolve({ code, signal, stdout, stderr }))
  })
  return { child, done }
}

function runLoop(repo: Repo, args: string[], opts: RunOptions = {}): Promise<LoopResult> {
  return startLoop(repo, args, opts).done
}

function checks(fast: string, full = 'exit 0'): Record<string, string> {
  return { AGENT_LOOP_CHECK_CMD: fast, AGENT_LOOP_FULL_CHECK_CMD: full }
}

function processGone(pid: number): boolean {
  try {
    process.kill(pid, 0)
  } catch {
    return true
  }
  // A zombie still answers kill(0) until it is reaped; it is no longer running.
  try {
    return /^\d+ \(.*\) Z/.test(readFileSync(`/proc/${pid}/stat`, 'utf8'))
  } catch {
    return true
  }
}

async function waitFor(condition: () => boolean, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (condition()) return true
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  return condition()
}

function readPid(repo: Repo, name: string): number {
  return Number(stateFile(repo, name).trim())
}

function pidFileReady(repo: Repo, name: string): boolean {
  const file = path.join(repo.state, name)
  return existsSync(file) && /^\d+\s*$/.test(readFileSync(file, 'utf8'))
}

afterEach(() => {
  for (const repo of repos.splice(0)) {
    // Best effort: never leave a process from a failed test behind.
    if (existsSync(repo.state)) {
      for (const name of readdirSync(repo.state).filter((file) => file.endsWith('.pid'))) {
        const pid = Number(readFileSync(path.join(repo.state, name), 'utf8').trim())
        if (pid > 0 && !processGone(pid)) {
          try {
            process.kill(pid, 'SIGKILL')
          } catch {
            // already gone
          }
        }
      }
    }
    rmSync(repo.base, { recursive: true, force: true })
  }
})

describe('agent-loop.sh', { timeout: 30_000 }, () => {
  describe('usage errors', () => {
    it.each([
      ['no arguments', []],
      ['missing task id', ['--brief', 'docs/brief.md']],
      ['missing brief', ['--task-id', TASK_ID]],
      ['task id with uppercase and underscore', ['--task-id', 'Bad_ID', '--brief', 'docs/brief.md']],
      ['task id starting with a hyphen', ['--task-id', '-demo', '--brief', 'docs/brief.md']],
      ['brief file that does not exist', ['--task-id', TASK_ID, '--brief', 'docs/missing.md']],
      ['iteration limit 0', baseArgs(['--max-iterations', '0'])],
      ['negative iteration limit', baseArgs(['--max-iterations', '-1'])],
      ['non-numeric iteration limit', baseArgs(['--max-iterations', 'abc'])],
      ['fractional iteration limit', baseArgs(['--max-iterations', '1.5'])],
      ['iteration limit above 10', baseArgs(['--max-iterations', '11'])],
      ['empty iteration limit', baseArgs(['--max-iterations', ''])],
      ['unknown agent', baseArgs(['--agent', 'gpt'])],
      ['empty agent', baseArgs(['--agent', ''])],
      ['agent timeout 0', baseArgs(['--agent-timeout', '0'])],
      ['non-numeric agent timeout', baseArgs(['--agent-timeout', 'soon'])],
      ['option without its value', ['--brief', 'docs/brief.md', '--task-id']],
      ['unknown option', baseArgs(['--bogus'])],
      ['unexpected positional argument', baseArgs(['extra'])],
    ])('%s: prints usage to stderr, exits 64, runs no check, starts no agent', async (_name, args) => {
      const repo = makeRepo()
      fakeAgent(repo, 'claude', 'exit 0')
      fakeAgent(repo, 'codex', 'exit 0')
      const result = await runLoop(repo, args, {
        env: checks('echo fast >> "$STATE/checks"; exit 1', 'echo full >> "$STATE/checks"; exit 1'),
      })
      expect(result.code).toBe(64)
      expect(result.stderr).toMatch(/^Usage: .*agent-loop\.sh --task-id <id> --brief <file>/m)
      expect(result.stdout).toBe('')
      expect(existsSync(path.join(repo.state, 'checks'))).toBe(false)
      expect(agentRuns(repo, 'claude') + agentRuns(repo, 'codex')).toBe(0)
      expect(existsSync(path.join(repo.root, 'docs/evidence'))).toBe(false)
    })
  })

  describe('invocation', () => {
    it('runs the checks in the project root and logs there when invoked from a subdirectory', async () => {
      const repo = makeRepo()
      const result = await runLoop(repo, ['--task-id', TASK_ID, '--brief', 'brief.md'], {
        cwd: path.join(repo.root, 'docs'),
        env: checks('pwd -P > "$STATE/check-cwd"', 'pwd -P > "$STATE/full-cwd"'),
      })
      expect(result.code).toBe(0)
      expect(stateFile(repo, 'check-cwd').trim()).toBe(realpathSync(repo.root))
      expect(stateFile(repo, 'full-cwd').trim()).toBe(realpathSync(repo.root))
      expect(existsSync(logPath(repo))).toBe(true)
      expect(existsSync(path.join(repo.root, 'docs/docs'))).toBe(false)
    })

    it('runs the checks in the project root and logs there when invoked from outside the project', async () => {
      const repo = makeRepo()
      const result = await runLoop(repo, ['--task-id', TASK_ID, '--brief', path.join(repo.root, 'docs/brief.md')], {
        cwd: repo.base,
        env: checks('pwd -P > "$STATE/check-cwd"'),
      })
      expect(result.code).toBe(0)
      expect(stateFile(repo, 'check-cwd').trim()).toBe(realpathSync(repo.root))
      expect(existsSync(logPath(repo))).toBe(true)
      expect(existsSync(path.join(repo.base, 'docs'))).toBe(false)
    })

    it('uses agent claude, limit 5, timeout 900 s, and the real check commands by default', async () => {
      const repo = makeRepo()
      // No check override: the default `npm run check:loop` fails here (no package.json).
      fakeAgent(repo, 'claude', 'exit 1')
      const result = await runLoop(repo, ['--task-id', TASK_ID, '--brief', 'docs/brief.md'])
      const head = git(repo.root, 'rev-parse', 'HEAD').trim()
      const header = readLog(repo).split('\n')[0]
      expect(header).toMatch(RUN_START_RE)
      expect(header).toContain(
        ` task_id=${TASK_ID} agent=claude max_iterations=5 agent_timeout_s=900 check_cmd="npm run check:loop" full_check_cmd="npm run check" git_head=${head} node=v`,
      )
      expect(agentRuns(repo)).toBe(1)
      expect(result.code).toBe(2)
    })

    it('passes the fixed Claude Code flags, no git permission, and the prompt on stdin', async () => {
      const repo = makeRepo()
      fakeAgent(repo, 'claude', 'touch fixed.txt')
      const result = await runLoop(repo, baseArgs(), {
        env: checks('[ -f fixed.txt ] || { echo "demo failure"; exit 1; }'),
      })
      expect(result.code).toBe(0)
      expect(stateFile(repo, 'claude.args.1').split('\n').slice(0, -1)).toEqual([
        '-p',
        '--permission-mode',
        'acceptEdits',
        '--allowedTools',
        'Read',
        'Edit',
        'Write',
        'Glob',
        'Grep',
        'Bash(npm run lint)',
        'Bash(npm run typecheck)',
        'Bash(npm run test:unit)',
        '--no-session-persistence',
        '--output-format',
        'text',
        '--max-budget-usd',
        '2',
      ])
      const args = stateFile(repo, 'claude.args.1')
      expect(args).not.toMatch(/git|resume|continue|dangerously|bypassPermissions/)
      expect(stateFile(repo, 'claude.cwd.1').trim()).toBe(realpathSync(repo.root))
      const prompt = stateFile(repo, 'claude.stdin.1')
      expect(prompt).toMatch(/one fix iteration/i)
      expect(prompt).toMatch(/edit only the files listed under "Owned files"/i)
      expect(prompt).toMatch(/do not weaken, skip, or delete tests or specifications/i)
      expect(prompt).toMatch(/do not commit, push/i)
      expect(prompt).toMatch(/tasks\.md/)
      expect(prompt).toMatch(/review/i)
      expect(prompt).toContain(BRIEF_TEXT)
      expect(prompt).toContain('demo failure')
    })

    it('runs `codex exec` in the project root with the prompt on stdin when codex is selected', async () => {
      const repo = makeRepo()
      fakeAgent(repo, 'codex', 'touch fixed.txt')
      const result = await runLoop(repo, baseArgs(['--agent', 'codex']), {
        env: checks('[ -f fixed.txt ] || { echo "demo failure"; exit 1; }'),
      })
      expect(result.code).toBe(0)
      expect(stateFile(repo, 'codex.args.1').split('\n').slice(0, -1)).toEqual([
        'exec',
        '--sandbox',
        'workspace-write',
        '--cd',
        realpathSync(repo.root),
        '-',
      ])
      expect(stateFile(repo, 'codex.stdin.1')).toContain('demo failure')
      expect(readLog(repo).split('\n')[0]).toContain(' agent=codex ')
    })
  })

  describe('check-and-fix iteration', () => {
    it('already green: starts no agent, stops with checks_passed, exits 0', async () => {
      const repo = makeRepo()
      fakeAgent(repo, 'claude', 'exit 0')
      const result = await runLoop(repo, baseArgs(), { env: checks('exit 0', 'exit 0') })
      expect(result.code).toBe(0)
      expect(agentRuns(repo)).toBe(0)
      const lines = recordLines(readLog(repo))
      expect(lines).toHaveLength(4)
      expect(lines[0]).toMatch(RUN_START_RE)
      expect(lines[1]).toMatch(/^iteration=0 phase=check exit=0 result=pass duration_s=\d+$/)
      expect(lines[2]).toMatch(/^iteration=0 phase=full_check exit=0 result=pass duration_s=\d+$/)
      expect(lines[3]).toMatch(RUN_END_RE)
      expect(lines[3]).toMatch(/ stop_reason=checks_passed fixer_runs=0 exit=0$/)
      expect(result.stdout).toMatch(FINAL_LINE_RE)
      expect(result.stdout.trim().split('\n').at(-1)).toBe(
        'Loop finished: checks_passed. Independent checker review is still required.',
      )
    })

    it('fixed within the limit: records iterations 0, 1, 2 and the full check, exits 0', async () => {
      const repo = makeRepo()
      fakeAgent(repo, 'claude', 'echo "run $n" >> progress.txt')
      const result = await runLoop(repo, baseArgs(), {
        env: checks(
          'echo fast >> "$STATE/checks"; [ "$(grep -c . progress.txt 2>/dev/null)" -ge 2 ] || { echo "not fixed yet"; exit 1; }',
          'echo full >> "$STATE/checks"',
        ),
      })
      expect(result.code).toBe(0)
      expect(agentRuns(repo)).toBe(2)
      expect(stateFile(repo, 'checks')).toBe('fast\nfast\nfast\nfull\n')
      expect(recordLines(readLog(repo)).slice(1).map((line) => line.replace(/duration_s=\d+/, 'duration_s=N'))).toEqual([
        'iteration=0 phase=check exit=1 result=fail duration_s=N',
        'iteration=1 phase=agent exit=0 duration_s=N changed_files=progress.txt',
        'iteration=1 phase=check exit=1 result=fail duration_s=N',
        'iteration=2 phase=agent exit=0 duration_s=N changed_files=progress.txt',
        'iteration=2 phase=check exit=0 result=pass duration_s=N',
        'iteration=2 phase=full_check exit=0 result=pass duration_s=N',
        expect.stringMatching(/ stop_reason=checks_passed fixer_runs=2 exit=0$/),
      ])
      expect(result.stdout).toMatch(FINAL_LINE_RE)
    })

    it('full check failing after the fast check passes feeds the fixer and continues', async () => {
      const repo = makeRepo()
      fakeAgent(repo, 'claude', 'touch full-fixed.txt')
      const result = await runLoop(repo, baseArgs(), {
        env: checks('exit 0', '[ -f full-fixed.txt ] || { echo "FULL CHECK BROKEN"; exit 1; }'),
      })
      expect(result.code).toBe(0)
      expect(agentRuns(repo)).toBe(1)
      expect(stateFile(repo, 'claude.stdin.1')).toContain('FULL CHECK BROKEN')
      expect(recordLines(readLog(repo)).slice(1).map((line) => line.replace(/duration_s=\d+/, 'duration_s=N'))).toEqual([
        'iteration=0 phase=check exit=0 result=pass duration_s=N',
        'iteration=0 phase=full_check exit=1 result=fail duration_s=N',
        'iteration=1 phase=agent exit=0 duration_s=N changed_files=full-fixed.txt',
        'iteration=1 phase=check exit=0 result=pass duration_s=N',
        'iteration=1 phase=full_check exit=0 result=pass duration_s=N',
        expect.stringMatching(/ stop_reason=checks_passed fixer_runs=1 exit=0$/),
      ])
    })

    it.each([1, 3])('limit %i reached: stops with max_iterations_reached, exits 1, starts no further agent', async (limit) => {
      const repo = makeRepo()
      fakeAgent(repo, 'claude', 'echo "run $n" >> progress.txt')
      const result = await runLoop(repo, baseArgs(['--max-iterations', String(limit)]), {
        env: checks('echo fast >> "$STATE/checks"; echo "still failing"; exit 1'),
      })
      expect(result.code).toBe(1)
      expect(agentRuns(repo)).toBe(limit)
      expect(stateFile(repo, 'checks')).toBe('fast\n'.repeat(limit + 1))
      const log = readLog(repo)
      expect(log.split('\n')[0]).toContain(` max_iterations=${limit} `)
      expect(recordLines(log).at(-1)).toMatch(
        new RegExp(` stop_reason=max_iterations_reached fixer_runs=${limit} exit=1$`),
      )
      expect(result.stdout).toContain('Loop finished: max_iterations_reached. Independent checker review is still required.')
    })
  })

  describe('early stops', () => {
    it.each(['claude', 'codex'] as const)('agent_error when the %s executable is missing', async (agent) => {
      const repo = makeRepo()
      const result = await runLoop(repo, baseArgs(['--agent', agent]), { env: checks('exit 1') })
      expect(result.code).toBe(2)
      const lines = recordLines(readLog(repo))
      expect(lines.at(-2)).toMatch(
        new RegExp(`^iteration=1 phase=agent exit=127 duration_s=0 cause="${agent} not found on PATH"$`),
      )
      expect(lines.at(-1)).toMatch(/ stop_reason=agent_error fixer_runs=0 exit=2$/)
    })

    it('agent_error when the fixer exits non-zero, recording its exit code', async () => {
      const repo = makeRepo()
      fakeAgent(repo, 'claude', 'echo partial > progress.txt; exit 7')
      const result = await runLoop(repo, baseArgs(), { env: checks('echo fast >> "$STATE/checks"; exit 1') })
      expect(result.code).toBe(2)
      expect(stateFile(repo, 'checks')).toBe('fast\n')
      const lines = recordLines(readLog(repo))
      expect(lines.at(-2)).toMatch(/^iteration=1 phase=agent exit=7 duration_s=\d+ cause=exit_code changed_files=progress.txt$/)
      expect(lines.at(-1)).toMatch(/ stop_reason=agent_error fixer_runs=1 exit=2$/)
    })

    it('agent_error when the fixer exceeds the time limit; the fixer and its children are terminated', async () => {
      const repo = makeRepo()
      fakeAgent(repo, 'claude', 'echo $$ > "$STATE/agent.pid"; sleep 300 & echo $! > "$STATE/grandchild.pid"; wait')
      const started = Date.now()
      const result = await runLoop(repo, baseArgs(['--agent-timeout', '1']), { env: checks('exit 1') })
      expect(result.code).toBe(2)
      expect(Date.now() - started).toBeLessThan(15_000)
      const lines = recordLines(readLog(repo))
      expect(lines[0]).toContain(' agent_timeout_s=1 ')
      expect(lines.at(-2)).toMatch(/^iteration=1 phase=agent exit=124 duration_s=\d+ cause=timeout$/)
      expect(lines.at(-1)).toMatch(/ stop_reason=agent_error fixer_runs=1 exit=2$/)
      expect(await waitFor(() => processGone(readPid(repo, 'agent.pid')), 5_000)).toBe(true)
      expect(await waitFor(() => processGone(readPid(repo, 'grandchild.pid')), 5_000)).toBe(true)
    })

    it('no_progress when the fixer exits 0 without changing the working tree', async () => {
      const repo = makeRepo()
      fakeAgent(repo, 'claude', 'exit 0')
      const result = await runLoop(repo, baseArgs(), { env: checks('echo fast >> "$STATE/checks"; exit 1') })
      expect(result.code).toBe(3)
      expect(agentRuns(repo)).toBe(1)
      expect(stateFile(repo, 'checks')).toBe('fast\n')
      expect(recordLines(readLog(repo)).at(-1)).toMatch(/ stop_reason=no_progress fixer_runs=1 exit=3$/)
      expect(result.stdout).toContain('Loop finished: no_progress. Independent checker review is still required.')
    })

    it('no_progress when the fixer only changes an ignored file', async () => {
      const repo = makeRepo()
      fakeAgent(repo, 'claude', 'echo "run $n" >> ignored.txt')
      const result = await runLoop(repo, baseArgs(), { env: checks('exit 1') })
      expect(result.code).toBe(3)
      expect(recordLines(readLog(repo)).at(-1)).toMatch(/ stop_reason=no_progress fixer_runs=1 exit=3$/)
    })

    it('editing only the content of an untracked, non-ignored file counts as progress', async () => {
      const repo = makeRepo()
      writeFileSync(path.join(repo.root, 'notes.txt'), 'v0\n')
      const statusBefore = git(repo.root, 'status', '--porcelain=v1', '--untracked-files=all')
      expect(statusBefore).toBe('?? notes.txt\n')
      fakeAgent(repo, 'claude', 'echo "run $n" >> notes.txt')
      const result = await runLoop(repo, baseArgs(['--max-iterations', '2']), { env: checks('exit 1') })
      expect(result.code).toBe(1)
      expect(agentRuns(repo)).toBe(2)
      expect(readFileSync(path.join(repo.root, 'notes.txt'), 'utf8')).toBe('v0\nrun 1\nrun 2\n')
      // Only the untracked file's content changed; its status line stayed the same.
      expect(git(repo.root, 'status', '--porcelain=v1', '--untracked-files=all', '--', 'notes.txt')).toBe('?? notes.txt\n')
      expect(recordLines(readLog(repo)).at(-1)).toMatch(/ stop_reason=max_iterations_reached fixer_runs=2 exit=1$/)
    })

    it.skipIf(process.getuid?.() === 0)(
      'a broken untracked symlink and an unreadable untracked file do not abort the loop; retargeting the symlink is progress',
      async () => {
        const repo = makeRepo()
        symlinkSync('missing-a', path.join(repo.root, 'dangling'))
        writeFileSync(path.join(repo.root, 'secret.txt'), 'unreadable\n')
        chmodSync(path.join(repo.root, 'secret.txt'), 0o000)
        // Run 1 retargets the broken symlink (still broken); run 2 changes nothing.
        fakeAgent(repo, 'claude', 'if [ "$n" = 1 ]; then ln -sfn missing-b dangling; fi')
        const result = await runLoop(repo, baseArgs(['--max-iterations', '3']), {
          env: checks('echo fast >> "$STATE/checks"; exit 1'),
        })
        chmodSync(path.join(repo.root, 'secret.txt'), 0o644)
        expect(result.code).toBe(3)
        expect(agentRuns(repo)).toBe(2)
        expect(stateFile(repo, 'checks')).toBe('fast\nfast\n')
        const lines = recordLines(readLog(repo)).map((line) => line.replace(/duration_s=\d+/, 'duration_s=N'))
        expect(lines.slice(1)).toEqual([
          'iteration=0 phase=check exit=1 result=fail duration_s=N',
          'iteration=1 phase=agent exit=0 duration_s=N changed_files=dangling,secret.txt',
          'iteration=1 phase=check exit=1 result=fail duration_s=N',
          'iteration=2 phase=agent exit=0 duration_s=N changed_files=dangling,secret.txt',
          expect.stringMatching(/ stop_reason=no_progress fixer_runs=2 exit=3$/),
        ])
      },
    )

    it('an already committed loop-run.log that gets appended is not progress', async () => {
      const repo = makeRepo()
      mkdirSync(path.join(repo.root, 'docs/evidence', TASK_ID), { recursive: true })
      writeFileSync(logPath(repo), 'previous run record\n')
      git(repo.root, 'add', '-A')
      git(repo.root, 'commit', '-q', '-m', 'commit the loop log')
      fakeAgent(repo, 'claude', 'exit 0')
      const result = await runLoop(repo, baseArgs(), { env: checks('exit 1') })
      expect(result.code).toBe(3)
      const log = readLog(repo)
      expect(log.startsWith('previous run record\n=== run start=')).toBe(true)
      expect(recordLines(log).at(-1)).toMatch(/ stop_reason=no_progress fixer_runs=1 exit=3$/)
      expect(git(repo.root, 'status', '--porcelain=v1', '--untracked-files=all')).toBe(
        ` M docs/evidence/${TASK_ID}/loop-run.log\n`,
      )
    })
  })

  describe('project nested in a larger Git repository', () => {
    it('logs changed files relative to the project, counts project edits as progress, and ignores edits outside the project', async () => {
      const repo = makeRepo({ nested: true })
      writeFileSync(path.join(repo.root, 'tracked.txt'), 'v0\n')
      writeFileSync(path.join(repo.gitRoot, 'outside.txt'), 'v0\n')
      mkdirSync(path.join(repo.root, 'docs/evidence', TASK_ID), { recursive: true })
      writeFileSync(logPath(repo), 'previous run record\n')
      git(repo.gitRoot, 'add', '-A')
      git(repo.gitRoot, 'commit', '-q', '-m', 'nested fixtures')
      // Run 1 edits a tracked project file (progress); run 2 edits only a file outside the project.
      fakeAgent(
        repo,
        'claude',
        'if [ "$n" = 1 ]; then echo v1 >> tracked.txt; else echo v1 >> ../../outside.txt; fi',
      )
      const result = await runLoop(repo, ['--task-id', TASK_ID, '--brief', 'project/docs/brief.md'], {
        cwd: path.join(repo.gitRoot, 'sub'),
        env: checks('pwd -P >> "$STATE/check-cwd"; exit 1'),
      })
      expect(result.code).toBe(3)
      expect(agentRuns(repo)).toBe(2)
      expect(stateFile(repo, 'check-cwd')).toBe(`${realpathSync(repo.root)}\n`.repeat(2))
      const log = readLog(repo)
      expect(log.startsWith('previous run record\n=== run start=')).toBe(true)
      expect(recordLines(log).slice(2).map((line) => line.replace(/duration_s=\d+/, 'duration_s=N'))).toEqual([
        'iteration=0 phase=check exit=1 result=fail duration_s=N',
        'iteration=1 phase=agent exit=0 duration_s=N changed_files=tracked.txt',
        'iteration=1 phase=check exit=1 result=fail duration_s=N',
        'iteration=2 phase=agent exit=0 duration_s=N changed_files=tracked.txt',
        expect.stringMatching(/ stop_reason=no_progress fixer_runs=2 exit=3$/),
      ])
      expect(existsSync(path.join(repo.gitRoot, 'docs'))).toBe(false)
    })
  })

  describe('interrupt', () => {
    it('SIGINT during a long-running fixer terminates it and its children and exits 130', async () => {
      const repo = makeRepo()
      fakeAgent(repo, 'claude', 'echo $$ > "$STATE/agent.pid"; sleep 300 & echo $! > "$STATE/grandchild.pid"; wait')
      const { child, done } = startLoop(repo, baseArgs(), {
        env: checks('echo fast >> "$STATE/checks"; exit 1', 'echo full >> "$STATE/checks"'),
      })
      expect(
        await waitFor(() => pidFileReady(repo, 'agent.pid') && pidFileReady(repo, 'grandchild.pid'), 10_000),
      ).toBe(true)
      child.kill('SIGINT')
      const result = await done
      expect(result.code).toBe(130)
      expect(await waitFor(() => processGone(readPid(repo, 'agent.pid')), 5_000)).toBe(true)
      expect(await waitFor(() => processGone(readPid(repo, 'grandchild.pid')), 5_000)).toBe(true)
      expect(stateFile(repo, 'checks')).toBe('fast\n')
      expect(readLog(repo)).not.toMatch(/stop_reason=/)
    })

    it('Ctrl+C (SIGINT to the process group) during a check that exits 0 on SIGINT is not treated as green', async () => {
      const repo = makeRepo()
      fakeAgent(repo, 'claude', 'exit 0')
      // Like Playwright, this check exits 0 when it is interrupted.
      const { child, done } = startLoop(repo, baseArgs(), {
        detached: true,
        env: checks(
          'echo $$ > "$STATE/check.pid"; trap "exit 0" INT TERM; sleep 300 & echo $! > "$STATE/check-child.pid"; wait; exit 0',
          'echo full >> "$STATE/full"',
        ),
      })
      expect(
        await waitFor(() => pidFileReady(repo, 'check.pid') && pidFileReady(repo, 'check-child.pid'), 10_000),
      ).toBe(true)
      process.kill(-(child.pid ?? 0), 'SIGINT')
      const result = await done
      expect(result.code).toBe(130)
      expect(await waitFor(() => processGone(readPid(repo, 'check.pid')), 5_000)).toBe(true)
      expect(await waitFor(() => processGone(readPid(repo, 'check-child.pid')), 5_000)).toBe(true)
      expect(existsSync(path.join(repo.state, 'full'))).toBe(false)
      expect(agentRuns(repo)).toBe(0)
      expect(readLog(repo)).not.toMatch(/result=pass|stop_reason=checks_passed/)
      expect(result.stdout).not.toContain('Loop finished: checks_passed')
    })
  })

  describe('run log', () => {
    it('writes no trailing whitespace and no blank line at the end, whatever the check prints', async () => {
      const repo = makeRepo()
      fakeAgent(repo, 'claude', 'touch "fix me.txt"')
      const result = await runLoop(repo, baseArgs(), {
        env: checks(
          `[ -f "fix me.txt" ] || { printf 'first\\n\\n   \\ntrailing spaces   \\ntab at end\\t\\n\\r\\nlast \\n\\n'; exit 1; }`,
          'exit 0',
        ),
      })
      expect(result.code).toBe(0)
      const log = readLog(repo)
      const lines = log.split('\n')
      expect(lines.at(-1)).toBe('')
      expect(lines.slice(0, -1).filter((line) => /\s$/.test(line))).toEqual([])
      expect(lines.slice(0, -1).filter((line) => line === '')).toEqual([])
      expect(lines.slice(2, 10)).toEqual(['  | first', '  |', '  |', '  | trailing spaces', '  | tab at end', '  |', '  | last', '  |'])
      expect(recordLines(log).at(-2)).toMatch(/^iteration=1 phase=full_check exit=0 result=pass duration_s=\d+$/)
      expect(log).toContain(' changed_files="fix me.txt"\n')
      // The same check the evidence files get: exit 1 with no output means clean.
      let checkExit = 0
      let checkOutput = ''
      try {
        execFileSync('git', ['diff', '--no-index', '--check', '/dev/null', logPath(repo)], { encoding: 'utf8' })
      } catch (error) {
        const failed = error as { status: number; stdout: string }
        checkExit = failed.status
        checkOutput = failed.stdout
      }
      expect(checkOutput).toBe('')
      expect(checkExit).toBe(1)
    })

    it('truncates long excerpt lines to at most 500 bytes without splitting a UTF-8 character', async () => {
      const repo = makeRepo()
      fakeAgent(repo, 'claude', 'touch progress.txt')
      // Line 1: 499 ASCII bytes, then "é" (bytes 500-501). Line 2: 300 x "é" (600 bytes).
      // Line 3: exactly 500 bytes (250 x "é") stays whole.
      const result = await runLoop(repo, baseArgs(), {
        env: checks(
          `[ -f progress.txt ] || { printf 'a%.0s' $(seq 1 499); printf '\\303\\251 tail\\n'; printf '\\303\\251%.0s' $(seq 1 300); printf '\\n'; printf '\\303\\251%.0s' $(seq 1 250); printf '\\n'; exit 1; }`,
        ),
      })
      expect(result.code).toBe(0)
      const bytes = readFileSync(logPath(repo))
      const log = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
      const excerpt = log.split('\n').filter((line) => line.startsWith('  | '))
      expect(excerpt).toEqual([`  | ${'a'.repeat(499)}`, `  | ${'é'.repeat(250)}`, `  | ${'é'.repeat(250)}`])
    })

    it('records header, failing check with a bounded ANSI-free excerpt, agent, passing checks, and footer', async () => {
      const repo = makeRepo()
      fakeAgent(repo, 'claude', 'touch progress.txt')
      const result = await runLoop(repo, baseArgs(), {
        env: {
          ...checks(`[ -f progress.txt ] || { printf '\\033[31mFAIL\\033[0m line %s\\n' $(seq 1 100); exit 1; }`),
          SECRET_TOKEN: 's3cr3t-value-do-not-log',
        },
      })
      expect(result.code).toBe(0)
      const log = readLog(repo)
      const lines = log.split('\n').slice(0, -1)
      const head = git(repo.root, 'rev-parse', 'HEAD').trim()
      expect(lines[0]).toMatch(RUN_START_RE)
      expect(lines[0]).toMatch(
        new RegExp(
          ` task_id=${TASK_ID} agent=claude max_iterations=5 agent_timeout_s=900 check_cmd=".+" full_check_cmd="exit 0" git_head=${head} node=v\\d+\\S*$`,
        ),
      )
      expect(lines[1]).toMatch(/^iteration=0 phase=check exit=1 result=fail duration_s=\d+$/)
      const excerpt = lines.slice(2, 42)
      expect(excerpt).toHaveLength(40)
      expect(excerpt[0]).toBe('  | FAIL line 61')
      expect(excerpt[39]).toBe('  | FAIL line 100')
      expect(lines.slice(42).map((line) => line.replace(/duration_s=\d+/, 'duration_s=N'))).toEqual([
        'iteration=1 phase=agent exit=0 duration_s=N changed_files=progress.txt',
        'iteration=1 phase=check exit=0 result=pass duration_s=N',
        'iteration=1 phase=full_check exit=0 result=pass duration_s=N',
        expect.stringMatching(/^=== run end=\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ stop_reason=checks_passed fixer_runs=1 exit=0$/),
      ])
      expect(log).not.toContain('\u001b')
      expect(log).not.toContain('s3cr3t-value-do-not-log')
      expect(log.endsWith('\n')).toBe(true)
      // The fixer got the full failing output (100 lines < 200), ANSI stripped.
      const prompt = stateFile(repo, 'claude.stdin.1')
      expect(prompt).toContain('FAIL line 1\n')
      expect(prompt).toContain('FAIL line 100\n')
      expect(prompt).not.toContain('\u001b')
      // Full outputs are kept under .agent-loop/<task-id>/<run-start>/ (git-ignored).
      const runs = readdirSync(path.join(repo.root, '.agent-loop', TASK_ID))
      expect(runs).toHaveLength(1)
      const runDir = path.join(repo.root, '.agent-loop', TASK_ID, runs[0] ?? '')
      expect(readdirSync(runDir).sort()).toEqual([
        'iter-0-check.txt',
        'iter-1-agent.txt',
        'iter-1-check.txt',
        'iter-1-full_check.txt',
      ])
      expect(readFileSync(path.join(runDir, 'iter-0-check.txt'), 'utf8')).toContain('\u001b[31mFAIL\u001b[0m line 1\n')
    })

    it('limits the fixer input to the last 200 lines of the failing output', async () => {
      const repo = makeRepo()
      fakeAgent(repo, 'claude', 'touch progress.txt')
      const result = await runLoop(repo, baseArgs(), {
        env: checks(`[ -f progress.txt ] || { printf 'out %s\\n' $(seq 1 300); exit 1; }`),
      })
      expect(result.code).toBe(0)
      const prompt = stateFile(repo, 'claude.stdin.1')
      expect(prompt).toContain('\nout 101\n')
      expect(prompt).toContain('\nout 300\n')
      expect(prompt).not.toContain('\nout 100\n')
    })

    it('appends: a second run keeps the first record unchanged and adds its own after it', async () => {
      const repo = makeRepo()
      fakeAgent(repo, 'claude', 'exit 0')
      expect((await runLoop(repo, baseArgs(), { env: checks('exit 1') })).code).toBe(3)
      const first = readLog(repo)
      expect((await runLoop(repo, baseArgs(['--max-iterations', '2']), { env: checks('exit 0') })).code).toBe(0)
      const both = readLog(repo)
      expect(both.startsWith(first)).toBe(true)
      const second = both.slice(first.length)
      expect(second).toMatch(/^=== run start=.* max_iterations=2 /)
      expect(recordLines(both).filter((line) => line.startsWith('=== run start='))).toHaveLength(2)
      expect(recordLines(both).filter((line) => line.startsWith('=== run end='))).toHaveLength(2)
      expect(recordLines(second).at(-1)).toMatch(/ stop_reason=checks_passed fixer_runs=0 exit=0$/)
    })
  })

  describe('green loop is not acceptance', () => {
    it('changes no checkbox, commit, or review file, and says checker review is still required', async () => {
      const repo = makeRepo()
      const headBefore = git(repo.root, 'rev-parse', 'HEAD')
      const tasksBefore = readFileSync(path.join(repo.root, 'openspec/changes/demo/tasks.md'), 'utf8')
      fakeAgent(repo, 'claude', 'touch fix.txt')
      const result = await runLoop(repo, baseArgs(), { env: checks('[ -f fix.txt ] || exit 1') })
      expect(result.code).toBe(0)
      expect(git(repo.root, 'rev-parse', 'HEAD')).toBe(headBefore)
      expect(git(repo.root, 'rev-list', '--count', '--all').trim()).toBe('1')
      expect(git(repo.root, 'diff', '--cached', '--name-only')).toBe('')
      expect(readFileSync(path.join(repo.root, 'openspec/changes/demo/tasks.md'), 'utf8')).toBe(tasksBefore)
      expect(git(repo.root, 'status', '--porcelain=v1', '--untracked-files=all')).toBe(
        `?? docs/evidence/${TASK_ID}/loop-run.log\n?? fix.txt\n`,
      )
      expect(readdirSync(path.join(repo.root, 'docs/evidence', TASK_ID))).toEqual(['loop-run.log'])
      expect(result.stdout.trim().split('\n').at(-1)).toBe(
        'Loop finished: checks_passed. Independent checker review is still required.',
      )
    })
  })
})
