import process from 'node:process';

/**
 * A tiny, dependency-free metrics registry that renders Prometheus text-format
 * exposition. Deliberately low-cardinality: HTTP requests are labeled only by
 * method and status (never the path), so an unbounded stream of ids can't blow up
 * the series count — the same whitelist philosophy as the access log.
 */
export class MetricsRegistry {
  private readonly requests = new Map<string, { method: string; status: number; count: number }>();
  private durationSumSeconds = 0;
  private durationCount = 0;
  private inFlight = 0;

  startRequest(): void {
    this.inFlight += 1;
  }

  endRequest(method: string, status: number, durationMs: number): void {
    this.inFlight = Math.max(0, this.inFlight - 1);
    const key = `${method} ${String(status)}`;
    const entry = this.requests.get(key);
    if (entry !== undefined) {
      entry.count += 1;
    } else {
      this.requests.set(key, { method, status, count: 1 });
    }
    this.durationSumSeconds += durationMs / 1000;
    this.durationCount += 1;
  }

  /** Render the current metrics in Prometheus text exposition format. */
  render(): string {
    const lines: string[] = [
      '# HELP homefix_http_requests_total Total HTTP requests handled, by method and status.',
      '# TYPE homefix_http_requests_total counter',
    ];
    for (const { method, status, count } of this.requests.values()) {
      lines.push(
        `homefix_http_requests_total{method="${method}",status="${String(status)}"} ${String(count)}`,
      );
    }
    lines.push(
      '# HELP homefix_http_request_duration_seconds Cumulative request handling time.',
      '# TYPE homefix_http_request_duration_seconds summary',
      `homefix_http_request_duration_seconds_sum ${String(this.durationSumSeconds)}`,
      `homefix_http_request_duration_seconds_count ${String(this.durationCount)}`,
      '# HELP homefix_http_requests_in_flight HTTP requests currently being handled.',
      '# TYPE homefix_http_requests_in_flight gauge',
      `homefix_http_requests_in_flight ${String(this.inFlight)}`,
      '# HELP process_uptime_seconds Process uptime in seconds.',
      '# TYPE process_uptime_seconds gauge',
      `process_uptime_seconds ${String(process.uptime())}`,
      '# HELP process_resident_memory_bytes Resident memory size in bytes.',
      '# TYPE process_resident_memory_bytes gauge',
      `process_resident_memory_bytes ${String(process.memoryUsage().rss)}`,
    );
    return `${lines.join('\n')}\n`;
  }

  /** Clear all counters (tests only). */
  reset(): void {
    this.requests.clear();
    this.durationSumSeconds = 0;
    this.durationCount = 0;
    this.inFlight = 0;
  }
}

// A single registry shared across the process. Anchored on `globalThis` (not a
// module-local const) so that if this module is loaded as two instances under tsx,
// the request middleware and the /metrics route still read/write the SAME registry.
const REGISTRY_KEY = '__homefixMetricsRegistry__';

function resolveRegistry(): MetricsRegistry {
  const store = globalThis as unknown as Record<string, MetricsRegistry | undefined>;
  const existing = store[REGISTRY_KEY];
  if (existing !== undefined) {
    return existing;
  }
  const created = new MetricsRegistry();
  store[REGISTRY_KEY] = created;
  return created;
}

export const metrics = resolveRegistry();
