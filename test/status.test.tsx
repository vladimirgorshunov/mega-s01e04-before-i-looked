import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const config = { adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir: 'runs' };

describe('status board', () => {
  it('shows the lane banner and links nights with latest job status counts', async () => {
    process.env.LANE_MARKER = 'TEST-MARKER';
    const res = await createApp(config).request('/');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('TEST-MARKER');
    const nights = html.match(/<li>[\s\S]*?<\/li>/g) ?? [];
    expect(nights).toHaveLength(2);
    expect(nights[0]).toContain('href="/digest/2026-10-28"');
    expect(nights[0]).toContain('ok 4');
    expect(nights[0]).toContain('retry 0');
    expect(nights[0]).toContain('fail 1');
    expect(nights[1]).toContain('href="/digest/2026-10-27"');
    expect(nights[1]).toContain('ok 4');
    expect(nights[1]).toContain('retry 0');
    expect(nights[1]).toContain('fail 0');
  });

  it('counts final job statuses and keeps empty nights visible', async () => {
    const runsDir = mkdtempSync(join(tmpdir(), 'rig-status-'));
    try {
      writeFileSync(join(runsDir, '2026-11-01.jsonl'), '');
      writeFileSync(join(runsDir, '2026-11-02.jsonl'), [
        { at: '2026-11-02T01:00:00+01:00', job: 'sync', status: 'ok', owner: null },
        { at: '2026-11-02T02:00:00+01:00', job: 'sync', status: 'retry', owner: null },
        { at: '2026-11-02T02:00:00+01:00', job: 'backup', status: 'fail', owner: 'rook' },
      ].map((event) => JSON.stringify(event)).join('\n') + '\nnot json\n');
      const res = await createApp({ ...config, runsDir }).request('/');
      const html = await res.text();
      const nights = html.match(/<li>[\s\S]*?<\/li>/g) ?? [];
      expect(res.status).toBe(200);
      expect(nights).toHaveLength(2);
      expect(nights[0]).toContain('href="/digest/2026-11-02"');
      expect(nights[0]).toContain('ok 0');
      expect(nights[0]).toContain('retry 1');
      expect(nights[0]).toContain('fail 1');
      expect(nights[1]).toContain('href="/digest/2026-11-01"');
      expect(nights[1]).toContain('ok 0');
      expect(nights[1]).toContain('retry 0');
      expect(nights[1]).toContain('fail 0');
    } finally {
      rmSync(runsDir, { recursive: true, force: true });
    }
  });

  it('keeps the board available when the runs directory is absent', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'rig-status-'));
    try {
      const res = await createApp({ ...config, runsDir: join(dir, 'missing') }).request('/');
      const html = await res.text();
      expect(res.status).toBe(200);
      expect(html).not.toContain('href="/digest/');
      expect(html).toContain('nothing in runs/');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('health answers with the lane id', async () => {
    const res = await createApp(config).request('/health');
    expect(await res.json()).toEqual({ ok: true, lane: 'lane-07' });
  });
});
