// Baseline snapshots are history, not newly delivered notifications.
export function createArrivalTracker() {
  let ready = false;
  const seen = new Map();
  return {
    reset() { ready = false; seen.clear(); },
    update(items) {
      const arrivals = [];
      for (const item of items) {
        const count = Number(item.count) || 0;
        if (ready && count > (seen.get(item.id) || 0)) arrivals.push(item);
        seen.set(item.id, count);
      }
      ready = true;
      return arrivals;
    }
  };
}
