# Runtime performance — 2026-10-20

This document records the 4.1.2 release. Subsequent game-computation parallelism,
including its adaptive fallback and limits, is described in
[ParallelSimulation.md](ParallelSimulation.md) and the later
[trade-intent experiment](TradeIntentSimulation.md). The single-simulation-thread
statements below describe the earlier release.

## Implemented

- The Wasm simulation still owns all authoritative state and game decisions. Per-company fleet indexes and departure phases are built once per update instead of repeatedly scanning every vessel for each route or departure. Daily market updates reuse the seasonal factor and city consumption multiplier.
- `runtimeView` is a presentation protocol. Only the selected route includes eligible replacement types and available vessels. Route geometry is sent on first use, when endpoints/modes change, or when explicitly requested. The original full `view` remains available for tests and diagnostics.
- A fractional update within the same simulation day returns only the clock. The browser interpolates the already sampled vessel positions. Commands, city/route selection and day changes still request fresh authoritative views.
- The browser retains the latest geometry, including through language changes. Polyline lengths are compiled once and vessel positions use binary search rather than rebuilding segment lengths every frame. Paused/unchanged frames and hidden pages skip map work. Number formatters are reused per language.
- A separate, single IO worker encodes snapshots and writes IndexedDB while the Wasm worker can continue simulation. There is at most one automatic save in flight; the IO worker serializes storage operations. New games and loads wait for the pending automatic save. Manual save completion remains acknowledged only after storage completes. Worker failure retries reads locally and reports uncertain writes rather than silently replaying them.
- At 200 or more assigned vessels, an optional WebGL overlay submits all vessel markers in one draw call. Cities, labels, routes and hit testing remain in SVG. Small fleets, unavailable WebGL and lost contexts use SVG. The renderer has no external dependencies.

## Scope and limits

This uses three execution contexts: UI, Wasm simulation worker, and IO worker. It does **not** create a worker per logical CPU, run company decisions concurrently, or move game logic to a GPU. Companies share market inventories and ordered random draws; naively splitting their updates would change prices, cargo and outcomes.

Wasm snapshot serialization still happens on the simulation worker. Large view serialization, full daily panel updates, some vessel/inventory scans and AI route searches remain potential bottlenecks. UI work and GPU submission timings are not end-to-end FPS measurements. WebGL can be backed by software; hardware acceleration and speed depend on the browser and graphics driver.

Shared-memory Wasm threading would additionally require cross-origin isolation and a deliberate redesign of independent work and deterministic commits. GPU compute would need a suitable bulk numeric workload and CPU fallback. They are not enabled merely because a machine has many cores.

Technical references:

- [MDN: Web Workers](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers)
- [MDN: SharedArrayBuffer security requirements](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer)
- [MDN: crossOriginIsolated](https://developer.mozilla.org/en-US/docs/Web/API/Window/crossOriginIsolated)
- [MDN: WebGPU availability](https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API)

## Reproducible local checks

`npm run benchmark:runtime` constructs a seed-1700 fixture with 60 player routes and 600 vessels, measures full snapshots, 180 daily updates, late snapshots and saves, and measures the new runtime protocol when supported. It uses the actual Wasm engine. The fixture has abundant funds/licenses/technology to stress execution, not to represent a balanced campaign.

An optional binary argument permits a release comparison:

```powershell
node scripts/benchmark-runtime.mjs path/to/older-engine.wasm
```

For browser checks, generate a disposable fixture and use a separate local origin so normal play saves are untouched:

```powershell
$env:PERF_FIXTURE='runtime-fixture.json'
node scripts/benchmark-runtime.mjs
Remove-Item Env:PERF_FIXTURE
$env:PORT='4197'
npm start
```

Open `http://127.0.0.1:4197/tests/runtime-browser.html?fixture=../runtime-fixture.json`. The page verifies a save/read round trip, displays the chosen renderer, supports zoom/pan, forces SVG fallback and advances 60 days. It writes manual slot 5 and automatic saves in that test origin. Never point this test at the published site.

`tests/runtime-performance.test.js` covers lightweight snapshots and invalidation, selected-route details, geometry boundaries, unavailable WebGL, worker failure fallback, fractional clock updates, and nonblocking/one-in-flight automatic saves. Existing save tests cover retention and storage quota handling.

Measured results and regressions are recorded in [the work log](../AgentNote/2026-10-20-runtime-performance.md). The target old Threadripper has not been measured.


## Ship/city/company phases (2026-10-21, local only)

The current simulation groups vessel motion, city market/warehouse settlement, and company investment into independent Rust jobs. See [the phase architecture](CityTradeParallelism.md) and [all measured results](../AgentNote/2026-10-21-city-phases.md). In the 2,400-vessel fixture the default adaptive mode fell from 11.171 to 3.539 ms/day, while the supplied real save rose from 4.018 to 4.177 ms/day. Forced parallel execution was slower in all three measured workloads. Structural improvements and actual parallel speedup must not be conflated; old/new economic states differ, but new serial/parallel states match exactly.
