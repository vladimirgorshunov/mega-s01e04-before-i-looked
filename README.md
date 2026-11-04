# rig

Keeps a lane's lights on while nobody is in it: a heartbeat every minute, a status board, and
a morning digest of what ran overnight.

```sh
cp .env.example .env   # set LANE_MARKER
pnpm install
pnpm dev               # http://localhost:8787
```

`GET /digest/:night` shows the night's jobs in job order, including runs, retries, owner,
last status and error, and first/last log timestamps. Retry counts of 3 or more and failed jobs
are marked. Bad lines are counted; an empty night shows "nothing ran", and a missing night
returns 404.

Working on it with an agent: start at [AGENTS.md](AGENTS.md).

The digest reader counts every valid log record as a run and every `retry` record as a retry.
It sorts jobs by name; first/last times and the latest owner/status use chronological instants
while keeping the original timestamp offsets. The most recent error is retained after recovery.
Malformed JSON or invalid record shapes count as bad lines (including blank records, but not a
terminating newline). Missing files return no night; an empty file is a night with no rows.
