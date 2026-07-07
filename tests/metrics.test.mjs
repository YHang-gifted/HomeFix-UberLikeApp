import assert from 'node:assert/strict';
import process from 'node:process';
import { after, before, describe, it } from 'node:test';

import { createApp } from '../server/src/app.ts';

function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, () => {
      resolve({ server, baseUrl: `http://127.0.0.1:${server.address().port}` });
    });
  });
}

function close(server) {
  return new Promise((resolve) => {
    server.close(() => {
      resolve();
    });
  });
}

describe('GET /metrics (collection + format)', () => {
  let server;
  let baseUrl;

  before(async () => {
    ({ server, baseUrl } = await listen(createApp()));
  });

  after(async () => {
    await close(server);
  });

  async function requestCount(method, status) {
    const body = await (await fetch(`${baseUrl}/metrics`)).text();
    const match = body.match(
      new RegExp(
        `homefix_http_requests_total\\{method="${method}",status="${String(status)}"\\} (\\d+)`,
      ),
    );
    return match ? Number(match[1]) : 0;
  }

  it('exposes Prometheus metrics with request counters and process gauges', async () => {
    await fetch(`${baseUrl}/health`); // GET 200
    await fetch(`${baseUrl}/service-requests`); // GET 401 (unauthenticated)

    const res = await fetch(`${baseUrl}/metrics`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type') ?? '', /text\/plain/);

    const body = await res.text();
    assert.match(body, /# TYPE homefix_http_requests_total counter/);
    assert.match(body, /homefix_http_requests_total\{method="GET",status="200"\} \d+/);
    assert.match(body, /homefix_http_requests_total\{method="GET",status="401"\} \d+/);
    assert.match(body, /# TYPE homefix_http_request_duration_seconds summary/);
    assert.match(body, /homefix_http_request_duration_seconds_count \d+/);
    assert.match(body, /# TYPE homefix_http_requests_in_flight gauge/);
    assert.match(body, /# TYPE process_uptime_seconds gauge/);
    assert.match(body, /process_resident_memory_bytes \d+/);
  });

  it('increments the request counter as traffic flows', async () => {
    const before2 = await requestCount('GET', 200);
    await fetch(`${baseUrl}/health`);
    await fetch(`${baseUrl}/health`);
    const after2 = await requestCount('GET', 200);
    assert.ok(after2 > before2, `expected ${String(after2)} > ${String(before2)}`);
  });
});

describe('GET /metrics (token gate)', () => {
  let server;
  let baseUrl;
  let previousToken;

  before(async () => {
    previousToken = process.env.METRICS_TOKEN;
    process.env.METRICS_TOKEN = 'scrape-secret';
    ({ server, baseUrl } = await listen(createApp()));
  });

  after(async () => {
    if (previousToken === undefined) {
      delete process.env.METRICS_TOKEN;
    } else {
      process.env.METRICS_TOKEN = previousToken;
    }
    await close(server);
  });

  it('requires the bearer token when METRICS_TOKEN is set', async () => {
    assert.equal((await fetch(`${baseUrl}/metrics`)).status, 401);
    assert.equal(
      (
        await fetch(`${baseUrl}/metrics`, {
          headers: { Authorization: 'Bearer scrape-secret' },
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await fetch(`${baseUrl}/metrics`, {
          headers: { Authorization: 'Bearer wrong' },
        })
      ).status,
      401,
    );
  });
});
