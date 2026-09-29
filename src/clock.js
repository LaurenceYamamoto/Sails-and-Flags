// Presentation clock: deterministic economic updates still occur once per day.
// Long gaps (background tabs, debugger, stalled frames) never cause catch-up bursts.
export function createClock() {
  let previous = null, fraction = 0;
  return {
    get fraction() { return fraction; },
    reset() { previous = null; fraction = 0; },
    advance(now, running, speed, onDay) {
      const elapsed = previous === null ? 0 : now - previous;
      previous = now;
      if (!running || elapsed < 0 || elapsed > 250) return 0;
      fraction += elapsed * speed / 1000;
      let days = 0;
      while (fraction + 1e-10 >= 1) {
        fraction = Math.max(0, fraction - 1);
        days++;
        if (onDay() === false) { fraction = 0; break; }
      }
      return days;
    },
  };
}

export function voyageProgress(voyage, fraction) {
  return voyage ? Math.min(1, Math.max(0, (voyage.total - voyage.remaining + fraction) / voyage.total)) : 0;
}
