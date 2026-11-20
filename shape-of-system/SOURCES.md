# Shape of the System — source map

Primary source:

- https://shapeofthesystem.com/ — manifesto: structure over vigilance, 25 tenets.
- https://shapeofthesystem.com/the-shape-of-the-whole.html — companion: composition-level failures no component owns.
- https://shapeofthesystem.com/decisions.html — decision index by recurring engineering fork.
- https://shapeofthesystem.com/guides/ — lifecycle guides: triage, planning, implementing, integrating, investigating, reviewing, verifying, operating, retrospective, retiring.
- https://shapeofthesystem.com/glossary.html — vocabulary.

Compressed model used by this skill:

- Correctness should live in structure, not in a person remembering rules.
- Structure includes types, schemas, parsers, contracts, ownership, atomic operations, deadlines, limits, tests, observability, runbooks, and process gates.
- Main optimization: reduce safe-change cognitive load while bounding blast radius for caller/attacker-controlled inputs.
- Conflict rule: pay complexity for untrusted/caller-controlled + wide blast radius; defer contained/self-controlled complexity and write why.

Tenet clusters:

- Locality: local reasoning, explicit data flow, one seam per ambient dependency, names that reveal load-bearing facts.
- Boundaries: parse once at door, hostile input, named/versioned contracts, least privilege.
- Concurrency/time/resources: atomic or serialized check-then-act, idempotency, monotonic durations, logical ordering, ceilings, owned release/teardown/drain.
- Failure containment: deadlines, non-blocking responsive paths, visible errors, degradation tiers, bulkheads, retry budgets/backoff/jitter/breakers.
- Change: source of truth, reversible rollout/migration, delete state before guarding it, process where code structure runs out.
- Verification: reproducible runs, invariant tests, production observability.
- Whole-system: dependency graph, metastable loops, distributed invariants, composed controllers, end-to-end probes.
