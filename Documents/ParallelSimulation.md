# Parallel game computation

Historical prototype; superseded by [ship/city/company phases](CityTradeParallelism.md).

Implemented locally after 4.1.2. Publication is a separate action.

This document describes the first scheduling/AI prototype. The subsequent
[trade-intent extension](TradeIntentSimulation.md) adds actual vessel loading
proposals and changes their snapshot semantics. Statements below about preserving
the old trading rules apply to the first prototype only.

## Computation and ownership

`game-worker.js` remains the coordinator. Its Rust/Wasm instance is the only
authoritative game. A bounded pool of two to four `simulation-compute-worker.js`
workers runs the same Wasm binary, through the separate `compute_execute` export.
JavaScript manages messages, timing and worker lifecycle; it does not evaluate
trade, geography, costs, eligibility, or AI decisions.

Two read-only workloads can run concurrently:

- Fleet scheduling: each route's travel/handling cycle and stop offsets.
- Rival expansion: feasible ship/vehicle types, loading estimates, operating
  profit and national/regional preference scores for different city pairs.

This is actual game computation, separate from the earlier rendering and save
workers. It does not run complete ship transactions or entire companies in
parallel. Loading, inventory reservations, market sales, cash, tolls, disasters,
random draws, investment, insolvency and accounting are still committed in
their original order.

`simulation.rs` expresses the day as resumable phases. `parallel.rs` freezes at a
read-only planning boundary, emits numbered work, and resumes after all chunks
return. Company processing cannot proceed while its batch is outstanding.
The coordinator's message queue also holds saves, commands, load and new-game
requests until the current advance completes. Rust rejects direct conflicting
commands during a batch. Stale tokens cannot resume another batch.

Results are merged in original city-pair/route order, independent of completion
order. Strict score comparison preserves the previous tie-breaking rule.
The serial path uses the same phases and kernels. No phase state, worker
configuration or performance sample is written into game saves.

## Costs and fallback

More cores do not make every calculation faster. The initial always-parallel
prototype was slower in both the 600-vessel fixture and the supplied late-game
save because serialization, dispatch and parsing exceeded kernel time.

The production pool therefore calibrates eligible work against a read-only
local evaluation. The local result is retained only until that batch completes.
The first sample warms worker code; subsequent samples measure the round trip.
Parallel execution must beat the local kernel by at least 30% to leave room for
packet preparation. Otherwise the Rust coordinator skips creating further
packets of that kind until estimated work grows fourfold. A workload doubling
or 32 successful batches triggers another sample. This is an engineering
heuristic, not a guarantee that total frame time will improve.

Small batches remain local from the outset (fewer than 256 vessels or eight
routes for scheduling; fewer than 64 city pairs for rival evaluation).
Maximum worker count is four, leaving two logical CPUs unallocated by the
compute pool. Fewer than four reported logical CPUs use the serial path.
Simulation continues serially during worker startup.

Workers share the compiled `WebAssembly.Module` and receive immutable topology
once. Their Rust instance skips the graphics JSON tree and avoids rebuilding
the land/water connection graphs. Only current planning inputs are sent for
each batch; account history and ledger entries are omitted.

Startup, message errors, malformed result counts and a stalled worker disable
the pool. Rust recomputes the outstanding uncommitted batch locally (or reuses
the calibration result); it never reruns already applied charges or trades.
Invalid result structures also fall back to local calculation. Initialization
has a 120-second deadline and work a 30-second deadline, without blocking the UI
thread. A killed coordinator/browser process still relies on the existing last
completed save, as before.

No SharedArrayBuffer, cross-origin isolation headers, service worker, new
toolchain or external library is required. Existing static hosting remains
usable. This is message-passing parallelism between separate Wasm instances,
not shared-memory Rust threads.

## Local verification

- `node --test tests/simulation-parallel.test.js`: actual Node worker threads
  run the browser compute-worker module; serial/parallel exact-state comparison,
  clocks, loads, failed batches, missing workers and stale requests.
- `npm run benchmark:parallel`: compare serial, two-worker and four-worker modes
  on the same seed and fixture. Startup is excluded, and final saves must match.
  An optional save path uses an existing save without altering it.
- `PARALLEL_FORCE=1` disables adaptation for diagnostics and equivalence tests.
  `BENCH_DAYS` controls the benchmark period (default 180).
- On a dedicated localhost origin, open `tests/parallel-browser.html`. It checks
  the actual coordinator/nested-worker chain, 30 days of exact-state equality
  and an IndexedDB round trip. It writes only that origin's test saves.
- `parallelStatus` on the game worker reports active workers, completed job
  counts, failures and calibration data. It is diagnostic, not saved gameplay.

Evidence and measurements are in
[the implementation log](../AgentNote/2026-10-21-parallel-simulation.md).
No public site is used for verification.

Reference documentation:
[Web Workers](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers),
[sharing compiled Wasm modules](https://developer.mozilla.org/en-US/docs/WebAssembly/Reference/JavaScript_interface/Module),
[structured cloning](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Structured_clone_algorithm).
