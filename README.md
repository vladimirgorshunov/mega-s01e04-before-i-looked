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

The status board at `/` links each regular night file on disk to `/digest/<night>`. Its ok / retry / fail
counts summarize each job's latest status, not the number of log entries. Empty nights show
zero counts; malformed log lines do not count as jobs.

Working on it with an agent: start at [AGENTS.md](AGENTS.md).

The digest reader counts every valid log record as a run and every `retry` record as a retry.
It sorts jobs by name; first/last times and the latest owner/status use chronological instants
while keeping the original timestamp offsets. The most recent error is retained after recovery.
Malformed JSON or invalid record shapes count as bad lines (including blank records, but not a
terminating newline). Missing files return no night; an empty file is a night with no rows.

`GET /api/digest/:night` returns `{ rows, badLines }` for a `YYYY-MM-DD` night.
Rows are sorted by job and retain nullable owner/error values and original timestamp offsets.
An empty file returns `{ "rows": [], "badLines": 0 }`; a missing or invalid night returns
404 with `{ "error": "Night not found" }`.

## Review preview

The manually dispatched `Publish digest preview` workflow captures the actual
`/digest/2026-10-28` response into ignored `var/preview/index.html` and deploys only
that self-contained HTML file to GitHub Pages. It runs only from `main`, uses Node 26
and pnpm 12.16.1, and installs locked dependencies with lifecycle scripts disabled.
The approved review is complete: publication now unsets `LANE_MARKER` and bypasses
`.env` loading, so the replacement banner reads `no marker set`. Neither marker
values nor captured HTML belong in git. Replacing the public page requires the
student's approval.

The completed [morning-digest plan](docs/plans/done/2026-11-04-morning-digest.md)
records its issue list, review correction, and same-URL marker removal evidence.

For a local capture while the server is running:

```sh
mkdir -p var/preview
curl --fail --silent --show-error http://127.0.0.1:8787/digest/2026-10-28 --output var/preview/index.html
```

Pages must be configured for GitHub Actions and the `github-pages` environment must
allow deployment from `main`. No custom domain, tunnel, or paid host is needed.
