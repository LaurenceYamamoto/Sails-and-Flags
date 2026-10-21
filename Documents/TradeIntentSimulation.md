# Snapshot trade proposals and deterministic settlement

Historical prototype; superseded by [ship/city/company phases](CityTradeParallelism.md).

Local experiment after 4.1.2, 2026-10-21. No release or deployment is implied.

## Rules and boundary

After a company's daily bills and schedule preparation, Rust builds a common
snapshot for vessels expected to reach a departure slot that day. This includes
ships finishing unloading during the day. Ships still travelling/loading for the
whole day are not scheduled for unnecessary purchase calculations.

`load_batch.rs` builds independent `LoadRequest` values. Each contains forward
and reverse loading inputs: allowed goods, source/target stock, base prices,
taxes, available source warehouse lots and basis, destination space, vessel
capacity, price thresholds and the operating cash reserve. No ledger, company,
full-world market snapshot, mutable game memory or random state is sent.

`loading.rs::LoadInput::evaluate` chooses lots against this snapshot. All requests
are evaluated before the company starts moving ships. In parallel mode, two to
four existing Wasm workers evaluate independent slices; in serial mode exactly
the same function is used. Results are returned in request order. Each proposal
is keyed by vessel ID and direction.

The coordinator then advances vessels and settles departures in the existing
vessel order. Proposals include a preferred load and ranked alternative goods
that were already eligible in the snapshot. It caps every lot at its snapshot
quantity limit and rechecks current
stock, cash after the operating reserve, price thresholds, origin restrictions,
hold size and warehouse space including incoming reservations. Contending
requests may be reduced or receive nothing. This is deterministic priority,
not proportional allocation or an auction. Settlement can allocate from these ranked alternatives, but never discovers
a newly eligible good outside the snapshot.

No worker charges money, transfers cargo, sells stock or reserves capacity.
Actual transfer and tax entries occur at loading start, as before. Goods remain
unavailable at the destination until unloading completes. Unloading sales,
handling, disasters and accounting remain sequential. Company ordering is
unchanged: this is one snapshot per company, not a simultaneous worldwide market.

The new rule deliberately differs from the previous implementation:

- A sale by an earlier vessel in the same company/day cannot create a new
  purchase proposal for a later vessel.
- A receipt of cash during the company's movement does not increase the
  quantities authorized by the snapshot.
- A departure not predicted by the snapshot, for example after an unforeseen
  cargo loss shortens unloading, waits for its next scheduled opportunity.
- Empty repositioning is proposed from the snapshot and requires the operating
  cash reserve plus toll at settlement.

Existing saves load without migration. A save contains no pending proposal or
worker state; user save/load commands wait for the current advance. Future
economics need not match the old rules. New serial and parallel execution must
produce the same save, including money, goods, random state and account history.

## Work avoided

Fleet/license/post/road operating costs are summed once per company instead of
once per departure. Warehouse incoming reservations are scanned once per
warehouse when preparing the snapshot. Quote tax rates are evaluated once per
price quote, rather than inside each quantity-search step.

Uncontended direct market trades reuse the proposed quantities when source and
destination stocks are unchanged; the coordinator verifies marginal thresholds
and recomputes the actual price before checking the budget. Contended trades and
warehouse transfers go through full quantity/basis checks.

The `loads` worker batch has no full planning context. Small batches (fewer than
eight departures) remain local. The existing timing calibration may defer larger
batches too if communication is slower than the local kernel. Statistics expose
the number of proposed departures in `loads`; it is not the number of active
ships or completed voyages.

## Validation and comparison

The user's subsequent proposal to partition settlement by city is tracked in
[CityTradeParallelism.md](CityTradeParallelism.md). That next-stage design is
not implemented by the current per-company proposal experiment.

- Rust tests compare compact kernels against existing quotes across market and
  warehouse combinations, and check scarce stock, exhausted funds, shared
  warehouse space, origin restrictions, cost basis and malformed proposals.
- Actual Node workers check deterministic outcomes, response ordering,
  failed/invalid batches and save round trips. Local browser verification uses
  `tests/parallel-browser.html` on a dedicated localhost origin.
- `scripts/benchmark-intents.mjs` compares the pre-change binary with new serial,
  loading-only parallel (two/four workers) and normal adaptive execution.
  Other worker kernels are disabled in loading-only modes so their existing
  communication cost cannot be mistaken for loading cost.
- Each benchmark warms up 30 days, restores identical input, measures the chosen
  period, and checks new-mode saves for exact equality. Three trials rotate
  execution order. Worker initialization is excluded. This measures game ticks,
  not UI frames, rendering, saving or page startup.

The benchmark expects a locally preserved `sites/local-intents-baseline.wasm`.
That binary and the user's save are not committed or published. `BENCH_DAYS`,
`BENCH_TRIALS` and `BENCH_SHIPS_PER_ROUTE` control the experiment; an optional
save filename replaces the synthetic 60-route fixture.

See [the evidence log](../AgentNote/2026-10-21-trade-intents.md) for measurements,
limitations and the distinction between restructuring gains and parallel gains.
