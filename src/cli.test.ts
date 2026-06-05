import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./compile.js', () => ({
  compile: vi.fn()
}))

import { compile } from './compile.js'
import { runCli } from './cli'
import { mkCliIoCapture } from './tests/factories/cli'

const mockedCompile = vi.mocked(compile)

beforeEach(() => {
  vi.clearAllMocks()
  mockedCompile.mockReturnValue({
    ok: true,
    svg: '<svg />',
    viewBox: { x: 0, y: 0, width: 10, height: 10 }
  })
})

describe('runCli argument handling', () => {
  it('prints usage to stdout and exits zero for help flag', async () => {
    const capture = mkCliIoCapture(async () => 'ignored')

    const exitCode = await runCli(['--help'], capture.io)

    expect(exitCode).toBe(0)
    expect(capture.stdoutSpy.mock.calls.flat().join('')).toContain('Usage: bcktrck')
  })

  it('prints usage to stderr and exits one when file argument is missing', async () => {
    const capture = mkCliIoCapture(async () => 'ignored')

    const exitCode = await runCli([], capture.io)

    expect(exitCode).toBe(1)
    expect(capture.stderrSpy.mock.calls.flat().join('')).toContain('Usage: bcktrck')
  })
})

describe('runCli file and compile outcomes', () => {
  it('prints cannot-read message and exits one for fs-style read errors', async () => {
    const capture = mkCliIoCapture(async () => Promise.reject({ message: 'ENOENT', code: 'ENOENT' }))

    const exitCode = await runCli(['input.btl'], capture.io)

    expect(exitCode).toBe(1)
    expect(capture.stderrSpy.mock.calls.flat().join('')).toContain('Cannot read input file: input.btl')
  })

  it('prints resolve diagnostics when compile fails and exits one', async () => {
    mockedCompile.mockReturnValue({
      ok: false,
      resolveErrors: [{ kind: 'unknown_handle', line: 2, col: 3, message: 'Unknown', handle: 'missing' }]
    })
    const capture = mkCliIoCapture(async () => 'org "X"')

    const exitCode = await runCli(['input.btl'], capture.io)

    expect(exitCode).toBe(1)
    expect(capture.stderrSpy.mock.calls.flat().join('')).toContain('Resolve errors:')
  })

  it('writes rendered svg and exits zero when compile succeeds', async () => {
    const capture = mkCliIoCapture(async () => 'org "X"')

    const exitCode = await runCli(['input.btl'], capture.io)

    expect(exitCode).toBe(0)
    expect(capture.stdoutSpy.mock.calls.flat().join('')).toContain('<svg />')
  })

  it('prints build marker comment when --build-info is enabled', async () => {
    const capture = mkCliIoCapture(async () => 'org "X"')

    const exitCode = await runCli(['--build-info', 'input.btl'], capture.io)

    expect(exitCode).toBe(0)
    const output = capture.stdoutSpy.mock.calls.flat().join('')
    expect(output).toContain('bcktrck-build: routing-obstacle-fix-2026-05-25')
    expect(output).toContain('<svg />')
  })
})
