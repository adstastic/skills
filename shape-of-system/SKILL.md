---
name: shape-of-system
description: Structural-correctness review lens from the Shape of the System manifesto. Use when reviewing or designing changes for structure-over-vigilance, bounded cognition, trust boundaries, blast radius, failure containment, contracts, concurrency, time, resources, observability, or when a review loop invokes a shape review.
---

# Shape of the System

Use this as a **review lens**, not a workflow. Goal: push correctness out of human vigilance and into system structure.

Core objective:

```text
Minimize what a tired engineer must hold in their head to make a correct change,
subject to keeping blast radius bounded for anything an attacker or unlucky caller controls.
```

Tie-breaker:

- Untrusted or caller-controlled input + wide blast radius → pay complexity now.
- Self-controlled input + contained blast radius → defer if useful, but write why.
- No tenet is free. Prefer structure only where it buys cognition or containment.

For source map and deeper reading, see [SOURCES.md](SOURCES.md).

## Review protocol

Inspect the actual diff, nearby code, tests, and contracts. Do not review from vibes.

1. Name the changed boundary.
   - What crosses here: control, data, trust, time, ownership, resource, lifecycle, or contract?
   - Who controls the input or growth?
   - What can break, and how far does it spread?
2. Find the invariant.
   - What must always be true after this change?
   - Is it encoded in type/schema/atomic op/owner/test/monitor/process, or in memory?
3. Apply gates below.
4. Emit only actionable findings.
   - Prefer one structural fix over many local guards.
   - If deferring, name why blast radius is contained.

## Gates

### Locality and ambient dependencies

Flag when correctness requires invisible context:

- action-at-a-distance through globals, mutable module state, hidden env, implicit context, constructor flags
- `now()`, wall clock, RNG, filesystem/network clients, or config pulled deep with no seam
- code whose correctness requires knowing call order elsewhere

Fix shape: explicit inputs, one override seam, local invariant, or named owner. Do not create parameter soup; give each ambient dependency one test-reachable seam.

### Boundaries and hostile input

Flag when external input can slip through as trusted:

- validation repeated at call sites instead of parsing once at boundary
- raw unchecked value still reachable after validation
- client-side validation treated as security
- size not bounded before allocation/deserialization
- authentication confused with authorization
- supply-chain/package/build input trusted without pinning or least privilege

Fix shape: boundary parser, constrained value, schema/DB constraint, size cap, re-derived authority, lockfile/signature/sandbox.

### Contracts and evolution

Flag implicit or brittle contracts:

- public JSON/event/schema leaks internal shape
- breaking change without version/window/consumer proof
- tolerant reader ignores fields that affect money, authority, identity, or safety
- strict reader rejects harmless additive unknowns from independent consumers

Fix shape: named contract, contract test, additive evolution, versioned breaking change, strict on invariants and tolerant of unknown additive fields.

### Concurrency, idempotency, time

Flag races and replay hazards:

- check-then-act over shared state
- retry/redelivery/double-click can mutate twice
- distributed lock without fenced token
- ordering across machines by timestamp
- duration/deadline measured with wall clock

Fix shape: atomic conditional write, serialization/single owner, commutative/idempotent operation, stable idempotency key, logical/fenced sequence, monotonic clock.

### Latency, resources, lifecycle

Flag unbounded or orphaned work:

- responsive path blocks on network/disk/lock/uncontrolled latency
- cross-boundary wait lacks deadline/cancellation
- caller controls queue depth, fanout, recursion, payload size, cache keys, retries, or parallelism without ceiling
- acquired resource lacks owner/release on every exit path
- listener/subscription/timer/process registered without teardown
- shutdown drops accepted work, acks before durable write, or leaves partial files

Fix shape: queue + explicit backpressure, deadline propagation, cancellation, bounded pool, cap, `defer`/`with`/RAII/finally, event + reconciler, temp-write-then-rename, graceful drain with deadline.

### Failure visibility and blast radius

Flag failures that disappear or spread:

- bare catch/empty fallback/swallowed error
- silent fallback with no metric/log/alert
- dependency failure takes whole system instead of one feature
- shared pool lets one tenant/dependency starve others
- retries lack budget/backoff/jitter/breaker
- degraded path never exercised

Fix shape: visible error at decision boundary, actionable signal, fallback tier, per-tenant/dependency bulkhead, retry budget, jitter, breaker, game-day/fault injection for risky paths.

### Source of truth and reversible change

Flag drift and irreversible coupling:

- same fact writable in two places
- cache/read model lacks owner, invalidation, staleness budget, reconciliation
- irreversible action fuses decision with effect
- migration/release is big-bang with no rollback/ramp
- flag/cache/quota/migration lacks owner/expiry
- data retained by default despite deletion obligation

Fix shape: one authoritative owner, derived view, explicit reconciliation, pure plan + thin apply, CAS/version recheck, expand-contract, canary/ramp, hard expiry/owner, TTL/hard-delete path.

### Whole-system composition

Use when change spans components or control loops:

- independence assumed but shared DNS/config/identity/pool/zone/secret exists
- retry storm/cache stampede/load queue can sustain itself after trigger disappears
- invariant spans services and no service owns it
- autoscaler/breaker/rate limiter/cache/controllers act on same signal and can oscillate
- per-component health is green while end-to-end path can fail

Fix shape: derived dependency graph, load-reducing recovery path, explicit coordinator/saga/quorum/reconciler, composed controller model, end-to-end probe/tracing/fault injection.

## Output

Use concise findings:

```text
[shape][blocker|should-fix|consider|defer] path:line — Problem. Structural fix. Why now/defer: <input control + blast radius>.
```

If no findings:

```text
[shape] No structural correctness findings. Biggest checked boundary: <boundary>. Blast radius: <scope>.
```

## Conflict with other lenses

- Ponytail may want deletion. Accept only if deletion does not remove needed trust-boundary validation, limits, failure visibility, or blast-radius containment.
- Thermonuclear may want abstraction. Accept only if it lowers reader state or owns a real invariant; reject speculative indirection.
