# Performance and resource efficiency

Apply to performance-sensitive paths, I/O, data processing, concurrency, frontend rendering, build configuration and optimization work. Correctness and security constraints remain mandatory.

## Design and implementation

- PERF-01 MUST identify expected workload, input bounds and resource budgets. Assess time and space complexity, repeated work, I/O, allocations, retained memory and worst-case behavior. Do not impose arbitrary limits that violate the contract.
- PERF-02 SHOULD use data structures appropriate to access patterns. Index repeated keyed lookups when build and memory costs justify them; preserve duplicate handling, order and missing-value semantics. Avoid repeated full scans, unnecessary copies, intermediate arrays and serialization on hot paths. Do not replace clear code with micro-optimizations without evidence.
- PERF-03 MUST avoid unnecessary network round trips and N+1 queries. Select required fields, use bounded pagination and batch operations where supported. Inspect actual query plans and transaction behavior for database optimizations; add indexes only with evidence and account for write/storage costs.
- PERF-04 MUST bound concurrency, queue sizes, payload sizes and retries when workload or external limits require it. Run independent I/O concurrently only if ordering, rate limits, failure handling and cancellation permit. Do not use unbounded `Promise.all()` over arbitrary input.
- PERF-05 MUST set appropriate external-operation deadlines and propagate cancellation when supported. Retry only safe/idempotent operations or operations with an idempotency mechanism; use bounded attempts and backoff with jitter. Respect the overall deadline.
- PERF-06 SHOULD stream large inputs/outputs with backpressure rather than buffering everything. Release streams, handles, connections, subscriptions, timers and workers on completion, failure and cancellation.
- PERF-07 MUST define cache key scope, invalidation, expiration or eviction, memory bounds and consistency assumptions before adding a cache. Prevent cross-tenant data leakage. Do not cache merely to conceal slow queries or correctness problems.

## Runtime-specific rules

- PERF-08 Node.js servers MUST avoid synchronous blocking I/O and unbounded CPU work in request handlers. Bound costly JSON parsing, regex matching and other expensive operations. Use asynchronous I/O; use a bounded worker pool for CPU-heavy computation only after evaluating transfer, startup and scheduling overhead.
- PERF-09 Browser applications SHOULD measure bundle size and user-visible performance. Avoid unnecessary rendering, hydration, requests and main-thread work. Use code splitting, memoization and virtualization where measured benefit justifies complexity; preserve accessibility and behavior.
- PERF-10 Build tooling SHOULD use targeted project inclusion, project references and incremental builds where appropriate. Prefer supported compiler improvements and simple type relationships; name reusable complex types. Use supported diagnostics or traces to locate actual bottlenecks. Cache build artifacts only with correct invalidation keys.

## Measurement gate

For any optimization claim or material change to a hot path, algorithm, concurrency model, query strategy, cache, serialization, resource usage or bundle size:

1. Define the affected metric and acceptable budget or non-regression criterion. Use existing project budgets; if absent, document a proposed criterion rather than inventing an approved SLA.
2. Capture a comparable baseline and changed result with representative inputs, runtime versions, environment and production-equivalent builds. Include warm-up and repeated measurements when appropriate.
3. Measure relevant latency percentiles (p50/p95/p99 for request workloads), throughput, CPU, memory, event-loop delay, query count, bundle bytes or build time. Use profiles for bottlenecks; distinguish cold and warm behavior.
4. Verify functional equivalence, worst-case inputs and failure behavior. Record tradeoffs and measurement variability. Reject changes that regress required budgets without authorization.
5. Report commands, workload, baseline, changed result and limitations. If measurement is blocked, say so; report theoretical complexity separately and do not claim measured improvement.

Use the project's existing benchmark/profiling tools. For new compatible setups, consider Node.js diagnostics, Chrome DevTools, Vitest benchmarks or a suitable load-test tool. Do not benchmark or load-test production systems without explicit authorization.

## Official references

- [Node.js event loop and worker pool guidance](https://nodejs.org/learn/asynchronous-work/dont-block-the-event-loop)
- [Node.js worker threads](https://nodejs.org/api/worker_threads.html)
- [Node.js performance hooks](https://nodejs.org/api/perf_hooks.html)
- [Node.js streams](https://nodejs.org/api/stream.html)
- [TypeScript compiler performance](https://github.com/microsoft/TypeScript/wiki/Performance)
- [Chrome DevTools performance](https://developer.chrome.com/docs/devtools/performance/)
- [Web Vitals](https://web.dev/articles/vitals)
