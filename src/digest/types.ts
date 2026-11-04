export type DigestRow = {
  job: string;
  owner: string | null;
  runs: number;
  retries: number;
  lastStatus: 'ok' | 'retry' | 'fail';
  lastError: string | null;
  firstAt: string;
  lastAt: string;
};

export type DigestNight = {
  rows: DigestRow[];
  badLines: number;
};

// readNight returns null for a missing file; an empty file has rows: [].
// Rows are sorted by job; timestamps retain the offsets from the log.
export type ReadNight = (runsDir: string, night: string) => DigestNight | null;
