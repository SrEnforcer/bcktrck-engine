#!/usr/bin/env node
/**
 * @module cli
 *
 * Provide the command-line adapter for compiling BTL input into SVG output.
 *
 * @packageDocumentation
 */

import { readFile } from 'fs/promises'
import { resolve } from 'path'
import { pathToFileURL } from 'url'
import { fromNullable, getStringField, isErr, isNone, isRecord, isSome, matchOption, tryCatchAsync } from '@tsfpp/prelude'
import { compile } from './compile.js'
import type { ResolveError } from './types/results.js'

type CliIo = {
  readonly readTextFile: (path: string) => Promise<string>
  readonly stdout: (text: string) => void
  readonly stderr: (text: string) => void
}

const usage = 'Usage: bcktrck [--build-info] <file.btl>'

const buildInfoMarker = 'bcktrck-build: routing-obstacle-fix-2026-05-25'

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
      const suggestionOption = fromNullable(error.suggestion)
      const suggestion = matchOption(() => '', (value: string) => ` (did you mean @${value}?)`)(suggestionOption)
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
  return matchOption(() => String(error), (value: string) => value)(message)
}

const writeCompileFailure = (result: Extract<ReturnType<typeof compile>, { readonly ok: false }>, io: CliIo): number => {
  const parseErrorOption = fromNullable(result.parseError)
  if (!isNone(parseErrorOption)) {
    const parseError = parseErrorOption.value
    io.stderr(`Parse error at ${parseError.line}:${parseError.col}: ${parseError.error}\n`)
  }

  const resolveErrorsOption = fromNullable(result.resolveErrors)
  if (!isNone(resolveErrorsOption) && resolveErrorsOption.value.length > 0) {
    io.stderr(`Resolve errors:\n${formatResolveErrors(resolveErrorsOption.value)}\n`)
  }

  return 1
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
// DEVIATION(4.4): CLI entrypoint keeps control-flow branches colocated for deterministic user-facing diagnostics.
/**
 * Run the CLI command with injected arguments and I/O adapters.
 *
 * @param args Parsed CLI argument list without node/script prefix.
 * @param io Boundary I/O adapter used for file reads and stream writes.
 * @returns Promise of process-compatible exit code (`0` success, `1` failure).
 */
// eslint-disable-next-line complexity -- imperative CLI flow branches by user/help/parse/resolve/fs-error outcomes.
export const runCli = async (args: readonly string[], io: CliIo = defaultIo): Promise<number> => {
  const normalizedArgs = args[0] === '--' ? args.slice(1) : args
  const includeBuildInfo = normalizedArgs.includes('--build-info')
  const positionalArgs = normalizedArgs.filter((arg) => arg !== '--build-info')
  const filePathOption = fromNullable(positionalArgs[0])
  const filePath = matchOption(() => '', (value: string) => value)(filePathOption)

  if (!isNone(filePathOption) && (filePathOption.value === '--help' || filePathOption.value === '-h')) {
    io.stdout(`${usage}\n`)
    return 0
  }

  if (isNone(filePathOption) || filePathOption.value.length === 0) {
    io.stderr(`${usage}\n`)
    return 1
  }

  const sourceResult = await tryCatchAsync(
    () => io.readTextFile(filePath),
    (error) => error
  )

  if (isErr(sourceResult)) {
    if (isFsCodeError(sourceResult.error)) {
      io.stderr(`Cannot read input file: ${filePath}\n`)
      return 1
    }
    // DEVIATION(6.2): CLI adapter boundary rethrows unknown runtime failures to top-level process handler.
    // eslint-disable-next-line functional/no-throw-statements -- CLI boundary rethrow.
    throw sourceResult.error
  }

  const result = compile(sourceResult.value)

  if (!result.ok) {
    return writeCompileFailure(result, io)
  }

  if (includeBuildInfo) {
    io.stdout(`<!-- ${buildInfoMarker} -->\n`)
  }
  io.stdout(`${result.svg}\n`)
  return 0
}

const main = async (): Promise<void> => {
  const exitCode = await runCli(process.argv.slice(2))
  // DEVIATION(6.2): Process mutation is restricted to the CLI boundary when setting the exit code.
  // eslint-disable-next-line functional/immutable-data -- process exit code is Node.js process boundary state.
  process.exitCode = exitCode
}

const isDirectExecution = (): boolean => {
  const argvPathOption = fromNullable(process.argv[1])
  if (isNone(argvPathOption) || argvPathOption.value.length === 0) {
    return false
  }
  return import.meta.url === pathToFileURL(resolve(argvPathOption.value)).href
}

if (isDirectExecution()) {
  main().catch((error: unknown) => {
    const message = errorMessage(error)
    process.stderr.write(`Unexpected error: ${message}\n`)
    // DEVIATION(6.2): Process mutation is restricted to the CLI boundary when setting fatal exit state.
    // eslint-disable-next-line functional/immutable-data -- process exit code is Node.js process boundary state.
    process.exitCode = 1
  })
}
