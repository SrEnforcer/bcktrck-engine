/**
 * @module tests/factories/cli
 *
 * Test fixture builders shared across unit and slice tests.
 *
 * @packageDocumentation
 */

import { vi } from 'vitest'

/** Fixture type contract for CliIoCapture. */
export type CliIoCapture = {
  readonly io: {
    readonly readTextFile: (path: string) => Promise<string>
    readonly stdout: (text: string) => void
    readonly stderr: (text: string) => void
  }
  readonly stdoutSpy: ReturnType<typeof vi.fn<(text: string) => void>>
  readonly stderrSpy: ReturnType<typeof vi.fn<(text: string) => void>>
}

/** Build an immutable CLI IO capture harness for tests. */
export const mkCliIoCapture = (
  readTextFile: (path: string) => Promise<string>
): CliIoCapture => {
  const stdoutSpy = vi.fn<(text: string) => void>()
  const stderrSpy = vi.fn<(text: string) => void>()

  return {
    io: {
      readTextFile,
      stdout: stdoutSpy,
      stderr: stderrSpy
    },
    stdoutSpy,
    stderrSpy
  }
}
