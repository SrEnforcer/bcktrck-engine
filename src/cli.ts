#!/usr/bin/env node
import { readFile } from 'fs/promises'
import { resolve } from 'path'
import { pathToFileURL } from 'url'
import { getStringField, isRecord, isSome } from '@tsfpp/prelude'
import { compile } from './compile.js'
import type { ResolveError } from './types/results.js'

type CliIo = {
  readonly readTextFile: (path: string) => Promise<string>
  readonly stdout: (text: string) => void
  readonly stderr: (text: string) => void
}

const usage = 'Usage: bcktrck <file.btl>'

const defaultIo: CliIo = {
  readTextFile: async (path: string): Promise<string> => readFile(path, 'utf8'),
  stdout: (text: string): void => {
    process.stdout.write(text)
  },
  stderr: (text: string): void => {
    process.stderr.write(text)
  }
}

const formatResolveErrors = (errors: readonly ResolveError[]): string =>
  errors
    .map((error) => {
      const location = `${error.line}:${error.col}`
      const suggestion = error.suggestion !== undefined ? ` (did you mean @${error.suggestion}?)` : ''
      return `- [${location}] ${error.message}${suggestion}`
    })
    .join('\n')

const isFsCodeError = (error: unknown): error is NodeJS.ErrnoException =>
  isRecord(error) && isSome(getStringField(error, 'message')) && isSome(getStringField(error, 'code'))

const errorMessage = (error: unknown): string => {
  if (!isRecord(error)) {
    return String(error)
  }
  const message = getStringField(error, 'message')
  return isSome(message) ? message.value : String(error)
}

/**
 * Entry point for the BTL command-line tool.
 *
 * Reads a `.btl` file from disk, compiles it to SVG, and writes the result to stdout.
 * Errors (parse failures, resolve failures, unknown handles) are written to stderr
 * in a human-readable format and result in a non-zero exit code.
 *
 * @param args Process argument list (pass `process.argv.slice(2)` in production).
 * @param io Injectible I/O handles; defaults to `process.stdout`/`process.stderr`/`fs`.
 * @returns Promise resolving to the POSIX exit code: `0` on success, `1` on failure.
 */
// eslint-disable-next-line complexity -- imperative CLI flow branches by user/help/parse/resolve/fs-error outcomes.
export const runCli = async (args: readonly string[], io: CliIo = defaultIo): Promise<number> => {
  const normalizedArgs = args[0] === '--' ? args.slice(1) : args
  const filePath = normalizedArgs[0]

  if (filePath === '--help' || filePath === '-h') {
    io.stdout(`${usage}\n`)
    return 0
  }

  if (filePath === undefined || filePath.length === 0) {
    io.stderr(`${usage}\n`)
    return 1
  }

  try {
    const source = await io.readTextFile(filePath)
    const result = compile(source)

    if (!result.ok) {
      if (result.parseError !== undefined) {
        io.stderr(
          `Parse error at ${result.parseError.line}:${result.parseError.col}: ${result.parseError.error}\n`
        )
      }
      if (result.resolveErrors !== undefined && result.resolveErrors.length > 0) {
        io.stderr(`Resolve errors:\n${formatResolveErrors(result.resolveErrors)}\n`)
      }
      return 1
    }

    io.stdout(`${result.svg}\n`)
    return 0
  } catch (error: unknown) {
    if (isFsCodeError(error)) {
      io.stderr(`Cannot read input file: ${filePath}\n`)
      return 1
    }
    // eslint-disable-next-line functional/no-throw-statements -- DEVIATION(6.2): CLI adapter boundary rethrows unknown runtime failures to top-level process handler.
    throw error
  }
}

const main = async (): Promise<void> => {
  const exitCode = await runCli(process.argv.slice(2))
  // eslint-disable-next-line functional/immutable-data -- process exit code is Node.js process boundary state.
  process.exitCode = exitCode
}

const isDirectExecution = (): boolean => {
  const argvPath = process.argv[1]
  if (argvPath === undefined || argvPath.length === 0) {
    return false
  }
  return import.meta.url === pathToFileURL(resolve(argvPath)).href
}

if (isDirectExecution()) {
  main().catch((error: unknown) => {
    const message = errorMessage(error)
    process.stderr.write(`Unexpected error: ${message}\n`)
    // eslint-disable-next-line functional/immutable-data -- process exit code is Node.js process boundary state.
    process.exitCode = 1
  })
}
