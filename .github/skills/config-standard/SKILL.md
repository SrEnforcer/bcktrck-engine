---
name: config-standard
description: >
  Normative TSF++ configuration management rules. Load when writing or reviewing
  any code that loads environment variables, defines a Config type, calls
  loadConfig, accesses process.env, implements a config loader, or writes
  .env.example: loadConfig from @tsfpp/boundary, Config as typed readonly record,
  Zod validation at the startup boundary, injection pattern, test factories.
---

# TSF++ config standard

Full standard: `node_modules/@tsfpp/standard/spec/CONFIG_CODING_STANDARD.md`

---

## The pattern in one picture

```
process.env (string | undefined)
    ↓
loadConfig(schema, env)   ← @tsfpp/boundary — validates all vars at once
    ↓
Result<Config, ConfigError>
    ↓ exit on Err at startup
Config (typed readonly record)
    ↓ injected into every module that needs it
```

`process.env` is only touched at the entry point. Everything downstream receives a typed `Config`.

---

## Imports

```ts
// In the config loader
import { loadConfig, type ConfigError } from '@tsfpp/boundary'
import { isErr, ok, type Result }       from '@tsfpp/prelude'

// In application modules — inject Config as a dependency, never import process.env
import { type Config } from '../shared/config'
```

---

## Config type — project-defined, not from a package

```ts
// src/shared/config.ts
export type Config = {
  readonly server: {
    readonly port:     number
    readonly host:     string
    readonly logLevel: 'debug' | 'info' | 'warn' | 'error'
  }
  readonly database: {
    readonly url:            string
    readonly poolMin:        number
    readonly poolMax:        number
    readonly queryTimeoutMs: number
  }
  readonly auth: {
    readonly jwtSecret:       string
    readonly tokenTtlSeconds: number
  }
  readonly features: {
    readonly maintenanceMode: boolean
  }
}
```

All fields are required. Optional config uses `Option<T>`, not `T | undefined`.

---

## Config loader

```ts
// src/infrastructure/config-loader.ts
import { z } from 'zod'
import { loadConfig, type ConfigError } from '@tsfpp/boundary'
import { isErr, ok, type Result }       from '@tsfpp/prelude'
import { type Config }                  from '../shared/config'

const schema = z.object({
  PORT:                z.coerce.number().int().min(1).max(65535).default(3000),
  HOST:                z.string().default('0.0.0.0'),
  LOG_LEVEL:           z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  DATABASE_URL:        z.string().url(),
  DATABASE_POOL_MIN:   z.coerce.number().int().min(1).default(2),
  DATABASE_POOL_MAX:   z.coerce.number().int().min(1).default(10),
  DATABASE_TIMEOUT_MS: z.coerce.number().int().min(100).default(5000),
  JWT_SECRET:          z.string().min(32),
  TOKEN_TTL_SECONDS:   z.coerce.number().int().min(60).default(3600),
  MAINTENANCE_MODE:    z.coerce.boolean().default(false),
})

export const parseConfig = (
  env: Record<string, string | undefined>
): Result<Config, ConfigError> => {
  const raw = loadConfig(schema, env)
  if (isErr(raw)) return raw

  const e = raw.value
  return ok({
    server:   { port: e.PORT, host: e.HOST, logLevel: e.LOG_LEVEL },
    database: { url: e.DATABASE_URL, poolMin: e.DATABASE_POOL_MIN,
                poolMax: e.DATABASE_POOL_MAX, queryTimeoutMs: e.DATABASE_TIMEOUT_MS },
    auth:     { jwtSecret: e.JWT_SECRET, tokenTtlSeconds: e.TOKEN_TTL_SECONDS },
    features: { maintenanceMode: e.MAINTENANCE_MODE },
  })
}
```

---

## Entry point — fail at startup

```ts
// src/main.ts
import { parseConfig } from './infrastructure/config-loader'

const configResult = parseConfig(process.env)
if (isErr(configResult)) {
  console.error(configResult.error.summary)
  process.exit(1)
}
const config = configResult.value
// wire up the application with config
```

---

## Injection — never import process.env in modules

```ts
// Good — Config injected as part of Deps
type Deps = {
  readonly db:     Database
  readonly logger: Logger
  readonly config: Pick<Config, 'auth'>
}

// Bad — reads process.env inside a module
const ttl = parseInt(process.env.TOKEN_TTL_SECONDS ?? '3600', 10)

// Bad — imports a config singleton
import { config } from '../config'
```

Use `Pick<Config, 'auth'>` to declare precisely which slice of config a module needs.

---

## Zod schema conventions

```ts
// Required — no default; missing = startup failure
DATABASE_URL: z.string().url()
JWT_SECRET:   z.string().min(32)   // enforce minimum entropy for secrets

// Optional with sensible default
PORT:         z.coerce.number().int().default(3000)
LOG_LEVEL:    z.enum(['debug', 'info', 'warn', 'error']).default('info')

// Boolean — coerce from 'true' / 'false' string
MAINTENANCE_MODE: z.coerce.boolean().default(false)
```

All coercion (`string → number`, `string → boolean`) happens in the schema. Never parse in application code.

---

## Testing

```ts
// Never mutate process.env in tests
// Bad
process.env.DATABASE_URL = 'postgres://localhost/test'

// Good — pass a plain record to the loader
const result = parseConfig({ DATABASE_URL: 'postgres://localhost/test', JWT_SECRET: 'a'.repeat(32), ... })

// Config factory for use-case and integration tests
// tests/helpers/config.factory.ts
export const makeConfig = (overrides: Partial<Config> = {}): Config => ({
  server:   { port: 3000, host: '127.0.0.1', logLevel: 'error', ...overrides.server },
  database: { url: 'postgres://localhost/test', poolMin: 1, poolMax: 2,
              queryTimeoutMs: 1000, ...overrides.database },
  auth:     { jwtSecret: 'a'.repeat(32), tokenTtlSeconds: 3600, ...overrides.auth },
  features: { maintenanceMode: false, ...overrides.features },
  ...overrides,
})
```

---

## Never

- Access `process.env` outside the config loader
- Import a config singleton in application modules
- Coerce types (parseInt, parseFloat) inside application code
- Log config values or `process.env` at any level
- Commit `.env` — only `.env.example` is committed