import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, ReadNight } from './types.js';

type Run = {
  at: string;
  time: number;
  job: string;
  owner: string | null;
  status: DigestRow['lastStatus'];
  error: string | null;
};

function parseRun(line: string): Run | null {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  if (!('at' in value) || typeof value.at !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value.at) ||
      !('job' in value) || typeof value.job !== 'string' || value.job.trim() === '' ||
      !('owner' in value) || (value.owner !== null && typeof value.owner !== 'string') ||
      !('status' in value) || (value.status !== 'ok' && value.status !== 'retry' && value.status !== 'fail') ||
      ('error' in value && typeof value.error !== 'string')) return null;
  const time = Date.parse(value.at);
  if (!Number.isFinite(time)) return null;
  return {
    at: value.at, time, job: value.job, owner: value.owner, status: value.status,
    error: 'error' in value && typeof value.error === 'string' ? value.error : null,
  };
}

export const readNight: ReadNight = (runsDir, night) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(night)) return null;
  let content: string;
  try {
    content = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }

  const jobs = new Map<string, { row: DigestRow; first: number; last: number; errorAt: number }>();
  let badLines = 0;
  const lines = content === '' ? [] : content.split(/\r?\n/);
  // A terminating newline ends the final record; it is not an extra blank record.
  if (lines.at(-1) === '') lines.pop();
  for (const line of lines) {
    const run = parseRun(line);
    if (!run) {
      badLines++;
      continue;
    }
    const existing = jobs.get(run.job);
    if (!existing) {
      jobs.set(run.job, {
        row: {
          job: run.job, owner: run.owner, runs: 1, retries: run.status === 'retry' ? 1 : 0,
          lastStatus: run.status, lastError: run.error, firstAt: run.at, lastAt: run.at,
        },
        first: run.time, last: run.time, errorAt: run.error === null ? -Infinity : run.time,
      });
      continue;
    }
    const { row } = existing;
    row.runs++;
    if (run.status === 'retry') row.retries++;
    if (run.time < existing.first) {
      existing.first = run.time;
      row.firstAt = run.at;
    }
    if (run.time >= existing.last) {
      existing.last = run.time;
      row.lastAt = run.at;
      row.lastStatus = run.status;
      row.owner = run.owner;
    }
    if (run.error !== null && run.time >= existing.errorAt) {
      existing.errorAt = run.time;
      row.lastError = run.error;
    }
  }
  return {
    rows: [...jobs.values()].map(({ row }) => row).sort((a, b) => a.job < b.job ? -1 : a.job > b.job ? 1 : 0),
    badLines,
  };
};
