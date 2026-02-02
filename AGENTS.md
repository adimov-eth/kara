# Repository Guidelines

## Project Structure

This is a pnpm workspace monorepo with TypeScript packages and a Cloudflare Worker deployment.

```
packages/
  domain/     # Core business logic (queue, identity, validation, performances)
  types/      # Shared TypeScript types (branded types, API result types, WebSocket protocol)
  ui/         # SvelteKit frontend (Svelte 5 with runes)
  extension/  # Browser extension for YouTube playback control
worker/
  src/        # Cloudflare Worker (Durable Objects for room state)
  src/views/generated/  # Auto-generated HTML bundles - DO NOT EDIT
```

## Build, Test, and Development Commands

All commands run from repo root with pnpm (Node >= 18).

```bash
# Development
pnpm dev                              # Run Worker locally via Wrangler
pnpm --filter @karaoke/ui dev         # Run UI in dev mode

# Building
pnpm build                            # Build all workspaces
pnpm --filter @karaoke/ui build:inline  # Rebuild UI and inline into worker

# Type Checking
pnpm typecheck                        # TypeScript checks across all workspaces

# Testing
pnpm test                             # Run Vitest in watch mode
pnpm test:run                         # Run tests once
pnpm test:coverage                    # Run with coverage report

# Run a single test file
pnpm test packages/domain/src/queue.test.ts
pnpm test -- --testNamePattern="sortQueue"  # Run specific test by name

# Deployment
pnpm deploy:prod                      # Build + deploy Worker to Cloudflare
```

## Code Style Guidelines

### TypeScript Configuration

Strict TypeScript with these key settings (see `tsconfig.base.json`):
- `strict: true` - All strict checks enabled
- `noUncheckedIndexedAccess: true` - Array/object access may be undefined
- `noImplicitReturns: true` - All code paths must return
- `noUnusedLocals: true` and `noUnusedParameters: true`
- Target: ES2022, Module: ESNext with bundler resolution

### Formatting & Syntax

- **Indentation**: 2 spaces
- **Quotes**: Single quotes for strings
- **Semicolons**: None (no semicolons)
- **Trailing commas**: Yes, in multiline
- **Line length**: Keep reasonable (~100 chars)

### Naming Conventions

- `camelCase`: Variables, functions, methods
- `PascalCase`: Types, interfaces, classes, Svelte components
- `SCREAMING_SNAKE_CASE`: Constants (e.g., `SEARCH_CACHE_TTL_MS`)
- Svelte components: `PascalCase.svelte` (e.g., `QueueEntry.svelte`)

### Import Style

```typescript
// External dependencies first
import { describe, it, expect } from 'vitest'

// Type-only imports use 'import type'
import type { Entry, QueueState, VoteRecord } from '@karaoke/types'

// Then relative imports with .js extension (required for ESM)
import { sortQueue, createEntry } from './queue.js'
```

### Type Patterns

**Branded types** for type-safe IDs (see `packages/types/src/index.ts`):
```typescript
type Brand<K, T> = K & { readonly __brand: T }
export type EntryId = Brand<string, 'EntryId'>
export const EntryId = (s: string): EntryId => s as EntryId
```

**Discriminated unions** for API results:
```typescript
export type JoinResult =
  | { kind: 'joined'; entry: Entry; position: number }
  | { kind: 'requiresPin' }
  | { kind: 'alreadyInQueue'; name: string }
  | { kind: 'error'; message: string }
```

**Exhaustiveness checking**:
```typescript
import { assertNever } from '@karaoke/types'

switch (result.kind) {
  case 'joined': /* ... */ break
  case 'error': /* ... */ break
  default: assertNever(result)  // Compile error if cases missed
}
```

### Function Design

**Pure functions** preferred - document side effects:
```typescript
/**
 * Sort queue by epoch ASC, votes DESC, joinedAt ASC
 * Pure function - returns a new sorted array
 */
export function sortQueue<T extends { epoch: number; votes: number; joinedAt: number }>(
  queue: readonly T[]
): T[] {
  return [...queue].sort((a, b) => { /* ... */ })
}
```

**Validation functions** return null if valid, error object if invalid:
```typescript
export function validateName(name: string | undefined | null): ValidationError | null {
  if (!name || name.trim() === '') {
    return { field: 'name', message: 'Name is required' }
  }
  return null
}
```

### Error Handling

- Return discriminated union results, not exceptions
- Use `| null` for optional single values
- Validate at boundaries (API handlers), trust internal code
- Rate limiting returns 429 with error message in result type

### Svelte 5 (Runes)

The UI uses Svelte 5 with runes syntax:
```typescript
let room = $state<QueueState>({ queue: [], nowPlaying: null, currentEpoch: 0 })
let extensionConnected = $state(false)

// Derived values as functions (not $derived at module level)
function getMyEntry(): Entry | undefined {
  return room.queue.find(e => e.name.toLowerCase() === myName.toLowerCase())
}
```

## Testing Guidelines

- **Framework**: Vitest with globals enabled
- **Location**: Tests alongside source files as `*.test.ts`
- **Coverage thresholds** (packages/domain/src): lines 95%, functions 90%, branches 85%

### Test Structure

```typescript
import { describe, it, expect } from 'vitest'

// Helper factories at top
function makeEntry(overrides: Partial<Entry> = {}): Entry {
  return { id: 'test-id', name: 'Test User', /* defaults */, ...overrides }
}

describe('sortQueue', () => {
  it('returns empty array for empty queue', () => {
    expect(sortQueue([])).toEqual([])
  })

  it('does not mutate original array', () => {
    const original = [makeEntry()]
    sortQueue(original)
    expect(original).toHaveLength(1)  // Unchanged
  })
})
```

## Commit Message Style

Short, sentence-case, imperative mood:
- `Add staging env`
- `Fix OAuth redirect`
- `Refactor queue sorting`
- `Update wrangler to v4`

## Generated Files - Do Not Edit

- `packages/ui/dist/` - Built UI assets
- `worker/src/views/generated/` - Inlined HTML from UI build
- `coverage/` - Test coverage reports

## Security Notes

- Secrets in `worker/src/env.ts` - set via Wrangler secrets, never commit
- Worker bindings in `worker/wrangler.toml`
- Admin sessions are in-memory (clear on DO restart)
- Rate limiting is in-memory per Durable Object

## WebSocket Protocol

Client types: `'user' | 'player' | 'admin' | 'extension'`

Messages use discriminated unions with `kind` field:
```typescript
// Server -> Client
type ServerMessage =
  | { kind: 'state'; state: QueueState; playback?: PlaybackState }
  | { kind: 'error'; message: string }
  | { kind: 'joined'; entry: Entry; position: number }
  // ...

// Client -> Server
type ClientMessage =
  | { kind: 'subscribe'; clientType: ClientType }
  | { kind: 'join'; name: string; videoId: string; title: string }
  // ...
```

## Room Modes

- **Jukebox mode** (default): Users build personal song stacks, one song at a time promoted to queue
- **Karaoke mode** (legacy): Traditional one-song-per-person queue with epochs
