import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/read.js';

const directories: string[] = [];
function runsDir(content: string) {
  const dir = mkdtempSync(join(tmpdir(), 'rig-reader-'));
  directories.push(dir);
  writeFileSync(join(dir, '2026-10-28.jsonl'), content);
  return dir;
}

afterEach(() => {
  for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('night reader', () => {
  it('aggregates the real night, retaining retry errors after recovery and unknown owners', () => {
    const night = readNight(fileURLToPath(new URL('../runs/', import.meta.url)), '2026-10-28');
    expect(night).toEqual({
      badLines: 1,
      rows: [
        { job: 'digest/render', owner: null, runs: 1, retries: 0, lastStatus: 'ok', lastError: null,
          firstAt: '2026-10-29T05:41:09+01:00', lastAt: '2026-10-29T05:41:09+01:00' },
        { job: 'fixtures/refresh', owner: 'rook', runs: 4, retries: 3, lastStatus: 'ok', lastError: 'upstream 503',
          firstAt: '2026-10-29T01:30:00+01:00', lastAt: '2026-10-29T01:37:00+01:00' },
        { job: 'lane/sync', owner: 'rook', runs: 8, retries: 1, lastStatus: 'ok', lastError: 'lock held',
          firstAt: '2026-10-28T23:00:06+01:00', lastAt: '2026-10-29T05:00:04+01:00' },
        { job: 'notes/backup', owner: 'lane-07', runs: 1, retries: 0, lastStatus: 'fail', lastError: 'quota exceeded',
          firstAt: '2026-10-29T04:00:01+01:00', lastAt: '2026-10-29T04:00:01+01:00' },
        { job: 'rig/rotate-logs', owner: 'lane-07', runs: 1, retries: 0, lastStatus: 'ok', lastError: null,
          firstAt: '2026-10-28T23:00:02+01:00', lastAt: '2026-10-28T23:00:02+01:00' },
      ],
    });
  });

  it('orders instants, not strings or file positions, and uses the last record to break ties', () => {
    const content = [
      { at: '2026-10-29T01:30:00+01:00', job: 'job', owner: null, status: 'ok' },
      { at: '2026-10-29T00:10:00Z', job: 'job', owner: 'old', status: 'fail', error: 'newer error' },
      { at: '2026-10-29T02:00:00+02:00', job: 'job', owner: 'oldest', status: 'retry', error: 'older error' },
      { at: '2026-10-29T00:30:00Z', job: 'job', owner: 'latest', status: 'fail' },
    ].map((run) => JSON.stringify(run)).join('\n');
    expect(readNight(runsDir(content), '2026-10-28')).toEqual({
      badLines: 0,
      rows: [{
        job: 'job', owner: 'latest', runs: 4, retries: 1, lastStatus: 'fail', lastError: 'newer error',
        firstAt: '2026-10-29T02:00:00+02:00', lastAt: '2026-10-29T00:30:00Z',
      }],
    });
  });

  it('counts malformed JSON and invalid record shapes without losing valid rows', () => {
    const valid = { at: '2026-10-28T23:00:00+01:00', job: '__proto__', owner: null, status: 'ok' };
    const invalid = [
      null, [], 'text', {}, { ...valid, at: 'not a time' }, { ...valid, job: 1 },
      { ...valid, owner: false }, { ...valid, status: 'unknown' }, { ...valid, error: null },
      { at: valid.at, job: 'missing owner', status: 'ok' },
    ];
    const content = [...invalid.map((run) => JSON.stringify(run)), '{broken', '', JSON.stringify(valid)].join('\r\n') + '\r\n';
    expect(readNight(runsDir(content), '2026-10-28')).toEqual({
      badLines: 12,
      rows: [{
        job: '__proto__', owner: null, runs: 1, retries: 0, lastStatus: 'ok', lastError: null,
        firstAt: valid.at, lastAt: valid.at,
      }],
    });
  });

  it('distinguishes empty files from absent files and rejects unsafe night identifiers', () => {
    const dir = runsDir('');
    expect(readNight(dir, '2026-10-28')).toEqual({ rows: [], badLines: 0 });
    expect(readNight(dir, '2026-10-29')).toBeNull();
    expect(readNight(dir, '../2026-10-28')).toBeNull();
    expect(readNight(dir, '2026-10-28/../2026-10-28')).toBeNull();
    expect(() => readNight(join(dir, '2026-10-28.jsonl'), '2026-10-28')).toThrow();
  });
});
