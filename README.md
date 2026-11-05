# Volusia Forever Tracker

An independent public tracker for Volusia County conservation lands. Charter Amendment 5 (2026) creates a conservation land registry. This project snapshots the county's published GIS data every day, records every change, and puts it on a mobile-friendly map. The goal is to make additions, removals, and changes in use easy to see.

- **Map**: Volusia Forever acquisitions by holding type, plus toggleable layers for conservation parcels, priority projects, and applicants.
- **Change log**: every record added, removed, or edited between daily snapshots, with ownership changes on tracked parcels flagged when land leaves or enters public hands.
- **Audit trail**: snapshots and change files are committed to this repository, so git history shows what the county published on each day.

See [docs/data-sources.md](docs/data-sources.md) for the layers and join keys and [docs/methodology.md](docs/methodology.md) for how updates work.

## Run locally

Requires Node 22.18+ (runs TypeScript directly). There are no dependencies to install.

```bash
npm run update   # fetch → diff → build into dist/
npm run serve    # http://localhost:4173
```

Or run the steps on their own: `npm run fetch`, `npm run diff`, `npm run build`.

## Layout

```
scripts/        fetch, diff, build, local server; sources.ts lists every tracked layer
data/
  snapshots/    YYYY-MM-DD/<layer>.geojson + manifest.json
  changes/      YYYY-MM-DD.json (only on days something changed)
  status.json   last fetch attempt / success
site/           static frontend (Leaflet, no build step)
docs/           data-sources.md, methodology.md
.github/workflows/daily.yml
```

## Deploy

The daily workflow always fetches, diffs, and commits. Deploying is opt-in. To turn it on, set **Settings → Pages → Source** to **GitHub Actions** (free accounts need a public repo for this). Then add the repository variable `DEPLOY_PAGES` = `true` under **Settings → Secrets and variables → Actions → Variables**. Run the workflow once by hand from the Actions tab.

## Roadmap

- **Phase 2**: registry overlay. Import the Council's registry list, match it to parcel `PID`s (with `data/registry-overrides.csv`), and add a "not on the registry" view.
- **Phase 3**: monitoring. Watch the delisting-notice page and the Council and committee agendas for keywords. Publish an RSS feed.
