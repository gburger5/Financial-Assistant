# CLAUDE.md — Project Standards

This file governs all code written for this project. These rules are **non-negotiable** and apply to every task, no matter how small. Read this before writing any code.

---

## Commands

```bash
npm run dev          # Start dev server with hot reload (tsx watch)
npm run test         # Run Vitest test suite (single run)
```

To run a single test file:
```bash
npx vitest run src/tests/login.test.ts
```

## 1. Test-Driven Development (TDD)

### The Iron Law

```
NO PRODUCTION CODE WITHOUT A FAILING TEST FIRST
```

If you wrote code before writing a test, delete it and start over. No exceptions.

### The Cycle

1. **RED** — Write one failing test that describes the desired behavior.
2. **Verify RED** — Run the test. Confirm it fails for the right reason (missing feature, not a syntax error).
3. **GREEN** — Write the minimal code to make the test pass. No more.
4. **Verify GREEN** — Run all tests. Confirm they pass with no warnings.
5. **REFACTOR** — Clean up while keeping tests green.
6. Repeat for the next behavior.

### Red Flags — Stop and Start Over

If any of these are true, delete the code and restart with TDD:

- You wrote code before the test
- The test passed immediately on first run
- You can't explain why the test was failing
- You're keeping code "as reference" while writing tests
- You're thinking "just this once"

---

## 2. Fastify Testing Practices

**Always use `fastify.inject()`** for HTTP-layer testing. Do **not** spin up a real server for unit or integration tests.

### Project Structure

Separate application setup from server startup:

```
src/
  app.js        ← exports a build() function, no listen() call
  server.js     ← imports build(), calls listen()
test/
  routes/
  plugins/
```

**app.js pattern:**
```js
/**
 * @module app
 * @description Builds and configures the Fastify application instance.
 * Call build() to get a configured app without starting the server.
 */
function build(opts = {}) {
  const app = fastify(opts)
  // register plugins, routes, etc.
  return app
}
module.exports = build
```

### Test File Pattern

Use **Vitest**. Each test file:

```js
import { describe, it, expect, afterEach } from 'vitest'
import build from '../src/app'

describe('POST /users', () => {
  let app

  afterEach(() => app.close())

  it('creates a new user', async () => {
    app = build()

    const response = await app.inject({
      method: 'POST',
      url: '/users',
      payload: { name: 'Alice' },
      headers: { 'content-type': 'application/json' }
    })

    expect(response.statusCode).toBe(201)
    expect(response.json().name).toBe('Alice')
  })
})
```

### Input Validation

Use **JSON Schema on route definitions** — do not write manual validation code or validation tests. Fastify handles this at the framework level.

```js
fastify.post('/users', {
  schema: {
    body: {
      type: 'object',
      required: ['name', 'email'],
      properties: {
        name:  { type: 'string', minLength: 1 },
        email: { type: 'string', format: 'email' }
      }
    },
    response: {
      201: {
        type: 'object',
        properties: {
          id:    { type: 'string' },
          name:  { type: 'string' },
          email: { type: 'string' }
        }
      }
    }
  }
}, handler)
```

## 3. Code Comments

Follow these rules on every file, class, function, and method.

### Required: JSDoc Docstrings

Every **module**, **class**, **function**, and **method** must have a JSDoc comment. No exceptions.

**Module** (top of file):
```js
/**
 * @module userRoutes
 * @description Registers all /users REST routes on the Fastify instance.
 * Handles creation, retrieval, update, and deletion of user records.
 */
```

**Function / Route Handler:**
```js
/**
 * Retrieves a single user by ID.
 * Returns 404 (not 403) if the user does not exist or does not belong
 * to the caller's organization, to prevent resource enumeration.
 *
 * @param {import('fastify').FastifyRequest} request
 * @param {import('fastify').FastifyReply} reply
 * @returns {Promise<void>}
 */
async function getUserHandler(request, reply) { ... }
```

**Class:**
```js
/**
 * @class TokenService
 * @description Manages creation, validation, and revocation of JWT access tokens.
 * Tokens are short-lived (15 min) and stored in httpOnly cookies, never localStorage.
 */
class TokenService { ... }
```

### The 9 Comment Rules

These apply to all inline comments, not just docstrings:

1. **Don't duplicate the code.** `i++ // increment i` is noise, delete it.
2. **Good comments don't excuse unclear code.** Rename the variable instead.
3. **If you can't write a clear comment, the code is probably wrong.** Simplify it.
4. **Comments should dispel confusion, not cause it.** If it confuses, remove it.
5. **Explain unidiomatic or surprising code.** If a future reader might delete it thinking it's redundant, explain why it's needed.
6. **Link to sources for copied code.** `// via https://stackoverflow.com/a/...`
7. **Link to external specs where helpful.** RFCs, security advisories, API docs.
8. **Comment when fixing bugs.** Explain what was wrong and why the fix works.
9. **Mark incomplete work with TODO.** `// TODO(you): handle pagination here`

### Anti-patterns to Avoid

```js
// BAD — duplicates the code
const user = await db.findUser(id) // find user by id

// BAD — vague
// fix stuff
if (token.exp < Date.now() / 1000) { ... }

// GOOD — explains the why
// JWT exp is in seconds; Date.now() is milliseconds, so divide by 1000
if (token.exp < Date.now() / 1000) { ... }
```

---

## 4. Security Practices

Apply these to every route, plugin, and piece of logic written.

### Access Control

- Every data access must verify **the requesting user owns the resource**.
- Never trust IDs or roles sent from the client — re-verify from the session/token.
- Return **404**, not 403, when a user lacks access to a resource (prevents enumeration).
- Use **UUIDs** (v4) for all resource identifiers, never sequential integers.

```js
// Always verify ownership at the data layer
const post = await db.findPost(request.params.id)
if (!post || post.userId !== request.user.id) {
  return reply.status(404).send({ error: 'Not found' })
}
```

### JWT

- Always specify the expected algorithm on verification — never derive it from the token header.
- Reject `alg: none` unconditionally.
- Set short `exp` (15 minutes for access tokens).
- Store tokens in **httpOnly, Secure, SameSite=Strict cookies** — never localStorage.
- Include `jti` (JWT ID) for revocation support.

```js
// CORRECT — algorithm explicitly whitelisted
jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] })
```

### SQL / Database

- Always use **parameterized queries or ORM methods**. Never concatenate user input into queries.
- Be careful with `ORDER BY`, `LIMIT`, table/column names — these can't be parameterized; whitelist them.
- Database user should have minimum required permissions (least privilege).

### File Uploads

- Validate file type via **magic bytes**, not just extension or MIME header.
- Rename uploaded files to a random UUID — discard the original filename.
- Store uploads outside the webroot or on a separate domain/CDN.
- Set `Content-Disposition: attachment` when serving user-uploaded files.

### SSRF

Any feature where the server fetches a URL from user input (webhooks, imports, previews) must:
- Validate the URL scheme is `http` or `https` only.
- Resolve DNS and confirm the IP is not private/internal (`10.x`, `172.16.x`, `192.168.x`, `127.x`, `169.254.x`).
- Block cloud metadata endpoints (`169.254.169.254`, `metadata.google.internal`).
- Not blindly follow redirects without re-validating each hop.

### XSS

- Encode all output contextually (HTML, JS, URL, CSS contexts differ).
- Set a `Content-Security-Policy` header on all responses.
- Set `X-Content-Type-Options: nosniff`.
- Never trust or render user-supplied HTML without sanitization (use DOMPurify or equivalent).

### Mass Assignment

- **Never** pass `req.body` directly to an ORM update/create method.
- Explicitly whitelist which fields are allowed to be set.

```js
// BAD
await User.update(request.body)

// GOOD
const { name, email, avatar } = request.body
await User.update({ name, email, avatar })
```

### Security Headers (apply to all responses)

```
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
Content-Security-Policy: default-src 'self'; frame-ancestors 'none'
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: strict-origin-when-cross-origin
```

Use `@fastify/helmet` to apply these automatically.

### Open Redirect

Any `?redirect=` or equivalent parameter must:
- Only accept **relative paths** starting with `/` (no `//`, no full URLs).
- Or validate against a strict allowlist of permitted domains.
- Never accept `javascript:`, `data:`, or protocol-relative `//` URLs.

---

## 5. Testing Anti-Patterns (Never Do These)

- **Don't test mock behavior.** Assert on real component output, not on whether a mock was called.
- **Don't add test-only methods to production classes.** Put cleanup helpers in `test/utils/`.
- **Don't mock without understanding the dependency.** Run with the real implementation first; mock only the slow/external part.
- **Don't use partial mocks.** If you mock a response shape, include all fields the real API returns.
- **Don't write tests after.** Tests written after implementation prove nothing — you never watched them fail.

---

# 6. Fastify Best Practices

### Routing

Organize routes as plugin functions, never inline on the root app. Register with a prefix.

```ts
// src/routes/users.ts
async function userRoutes(fastify: FastifyInstance, options: FastifyPluginOptions): Promise {
  fastify.get('/', handler)
  fastify.get('/:id', handler)
  fastify.post('/', handler)
}
export default userRoutes

// src/app.ts
app.register(userRoutes, { prefix: '/api/users' })
```

- Use the correct HTTP method for every operation — never use GET for state-changing actions
- URL params for resource identity (`/users/:id`), query strings for filtering/pagination

### Request Validation

Always define a `schema` on every route. Fastify validates automatically — do not write manual validation code for things JSON Schema can catch.

```ts
fastify.post('/users', {
  schema: {
    body: {
      type: 'object',
      required: ['name', 'email'],
      properties: {
        name:  { type: 'string', minLength: 2, maxLength: 100 },
        email: { type: 'string', format: 'email' },
        role:  { type: 'string', enum: ['admin', 'user'], default: 'user' },
      },
      additionalProperties: false,
    },
  },
}, handler)
```

- Always set `additionalProperties: false` on body schemas to block mass assignment at the schema layer
- Validate `params` and `querystring` the same way — not just `body`

### Response Serialization

Always define a `response` schema. This activates `fast-json-stringify` which is significantly faster than `JSON.stringify`, and strips any fields not in the schema (an extra security layer).

```ts
schema: {
  response: {
    200: {
      type: 'object',
      properties: {
        id:    { type: 'integer' },
        name:  { type: 'string' },
        email: { type: 'string' },
      },
    },
    404: {
      type: 'object',
      properties: {
        statusCode: { type: 'integer' },
        error:      { type: 'string' },
        message:    { type: 'string' },
      },
    },
  },
}
```

- Define response schemas for every status code the route can return
- Response schemas are also documentation — be precise

### TypeScript Integration

Use Fastify generics on every route so body, params, querystring, and reply are fully typed. Never cast with `as` inside a handler — fix the generic instead.

```ts
interface CreateUserBody {
  name: string
  email: string
  role?: 'admin' | 'user'
}

fastify.post('/users', opts, handler)
fastify.get('/users/:id', opts, handler)
```

Extend Fastify module types when decorating the instance or request — never use `any`.

```ts
declare module 'fastify' {
  interface FastifyRequest {
    user?: JWTPayload
  }
  interface FastifyInstance {
    db: DatabaseClient
  }
}
```

### Plugins

Every piece of cross-cutting functionality is a plugin. Use `fastify-plugin` (`fp`) when the plugin needs to expose decorators to the parent scope (e.g. `fastify.db`). Without `fp`, decorators are scoped to the child context only.

```ts
import fp from 'fastify-plugin'

async function myPlugin(fastify: FastifyInstance, options: MyPluginOptions): Promise {
  fastify.decorate('myThing', value)

  fastify.addHook('onClose', async (instance) => {
    await instance.myThing.close()
  })
}

export default fp(myPlugin, { name: 'my-plugin' })
```

- Plugins that only add routes do **not** need `fp` — encapsulation is intentional there
- Plugins that add decorators (`decorate`, `decorateRequest`) **do** need `fp`
- Always add an `onClose` hook for anything that holds connections or resources

### Hooks

Use hooks for cross-cutting concerns — never duplicate logic across handlers.

| Hook | Use for |
|---|---|
| `onRequest` | Request ID injection, timing start |
| `preHandler` | Auth checks, role enforcement |
| `onSend` | Adding response headers |
| `onResponse` | Metrics, timing logs |
| `onClose` | Cleanup for plugins with connections |

Prefer route-level `preHandler` for auth over global `onRequest` — it gives opt-in control per route. Never put business logic in hooks — hooks are infrastructure only.

```ts
fastify.get('/protected', {
  preHandler: [authenticate],
  schema: { ... },
}, handler)
```

---

## 7. Quick Pre-Commit Checklist

Before marking any task complete:

- [ ] Every new function/method has a test that was written first
- [ ] Watched each test fail before implementing
- [ ] Each test failed for the right reason (not a typo)
- [ ] Wrote minimal code to pass, not more
- [ ] All tests pass with no warnings
- [ ] Every module/class/function has a JSDoc docstring
- [ ] Inline comments explain *why*, not *what*
- [ ] Ownership/authorization checked for every data access
- [ ] No user input concatenated into queries or file paths
- [ ] No secrets in client-reachable code
- [ ] JSON Schema defined on all Fastify routes
