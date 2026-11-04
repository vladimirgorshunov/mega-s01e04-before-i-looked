import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { RigConfig } from '../src/config.js';

const night = '2026-10-29';
let runsDir: string;
let config: RigConfig;

beforeEach(() => {
  runsDir = mkdtempSync(join(tmpdir(), 'rig-digest-routes-'));
  config = { adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir };
});

afterEach(() => {
  rmSync(runsDir, { recursive: true, force: true });
});

function writeNight(lines: string[]) {
  writeFileSync(join(runsDir, `${night}.jsonl`), lines.join('\n'));
}

function tableJobs(html: string): string[] {
  return [...html.matchAll(/<tr\b[^>]*>\s*<td\b[^>]*>([\s\S]*?)<\/td>/gi)]
    .map((match) => match[1].replace(/<[^>]*>/g, '').trim());
}

async function readDigest() {
  const app = createApp(config);
  const html = await app.request(`/digest/${night}`);
  const json = await app.request(`/api/digest/${night}`);
  expect(html.status).toBe(200);
  expect(html.headers.get('content-type')).toContain('text/html');
  expect(json.status).toBe(200);
  expect(json.headers.get('content-type')).toContain('application/json');
  return { html: await html.text(), json: await json.json() };
}

describe('digest routes', () => {
  it('serves the same sorted jobs as HTML and JSON with their nightly results', async () => {
    writeNight([
      JSON.stringify({ at: '2026-10-29T01:00:00+02:00', job: 'zulu-import', owner: null, status: 'retry', error: 'upstream timeout' }),
      JSON.stringify({ at: '2026-10-29T01:05:00+02:00', job: 'alpha-export', owner: 'Mira', status: 'ok' }),
      JSON.stringify({ at: '2026-10-29T01:10:00+02:00', job: 'zulu-import', owner: null, status: 'fail', error: 'upstream unavailable' }),
    ]);

    const result = await readDigest();
    expect(result.json).toEqual({
      rows: [
        { job: 'alpha-export', owner: 'Mira', runs: 1, retries: 0, lastStatus: 'ok', lastError: null, firstAt: '2026-10-29T01:05:00+02:00', lastAt: '2026-10-29T01:05:00+02:00' },
        { job: 'zulu-import', owner: null, runs: 2, retries: 1, lastStatus: 'fail', lastError: 'upstream unavailable', firstAt: '2026-10-29T01:00:00+02:00', lastAt: '2026-10-29T01:10:00+02:00' },
      ],
      badLines: 0,
    });
    expect(tableJobs(result.html)).toEqual(['alpha-export', 'zulu-import']);
    expect(result.html).toContain('Mira');
    expect(result.html).toContain('upstream unavailable');
    expect(result.html).toContain('2026-10-29T01:10:00+02:00');
    expect(result.html).toContain('—');
  });

  it('returns 404 from both routes when the night has no file', async () => {
    const app = createApp(config);
    for (const path of [`/digest/${night}`, `/api/digest/${night}`]) {
      const response = await app.request(path);
      expect(response.status).toBe(404);
    }
  });

  it('distinguishes an empty night from a missing night in both representations', async () => {
    writeNight([]);

    const result = await readDigest();
    expect(result.json).toEqual({ rows: [], badLines: 0 });
    expect(tableJobs(result.html)).toEqual([]);
    expect(result.html).toContain('nothing ran');
  });

  it('keeps valid jobs on both sides of a malformed line and reports the bad line', async () => {
    writeNight([
      JSON.stringify({ at: '2026-10-29T01:00:00+02:00', job: 'zulu-import', owner: 'Sol', status: 'ok' }),
      '{broken json',
      JSON.stringify({ at: '2026-10-29T01:05:00+02:00', job: 'alpha-export', owner: 'Mira', status: 'ok' }),
    ]);

    const result = await readDigest();
    expect(result.json).toEqual({
      rows: [
        { job: 'alpha-export', owner: 'Mira', runs: 1, retries: 0, lastStatus: 'ok', lastError: null, firstAt: '2026-10-29T01:05:00+02:00', lastAt: '2026-10-29T01:05:00+02:00' },
        { job: 'zulu-import', owner: 'Sol', runs: 1, retries: 0, lastStatus: 'ok', lastError: null, firstAt: '2026-10-29T01:00:00+02:00', lastAt: '2026-10-29T01:00:00+02:00' },
      ],
      badLines: 1,
    });
    expect(tableJobs(result.html)).toEqual(['alpha-export', 'zulu-import']);
  });
});
