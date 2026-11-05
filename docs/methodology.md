# Methodology

## Sources

All data comes from Volusia County's public ArcGIS REST services. The layers, fields, and keys are in [data-sources.md](data-sources.md). Nothing is entered by hand. Every figure on the site comes from a snapshot file, and every snapshot records the URL it was fetched from.

## Update cadence

A GitHub Action runs once a day at about 7 a.m. Eastern:

1. **Fetch** (`scripts/fetch.ts`) downloads every layer in full to `data/snapshots/YYYY-MM-DD/`, along with a `manifest.json` holding the fetch time, record counts, source URLs, and SHA-256 hashes. Either every layer is written or none is. A partial or short download counts as a failure.
2. **Diff** (`scripts/diff.ts`) compares the two most recent snapshots and writes `data/changes/YYYY-MM-DD.json` if any record was added, removed, or edited. For each field it records the old and new values, and it notes when a boundary changed.
3. **Build** (`scripts/build.ts`) produces the static site from the latest snapshot.
4. The workflow commits the results to the repository and deploys to GitHub Pages. The repository's commit history is the public audit trail.

Snapshots are written one feature per line in a stable order, so a day with no changes produces byte-identical files. Git stores those once, which keeps the repository small even with daily snapshots.

## Failures and stale data

If the fetch fails, `data/status.json` records the failure. The site still deploys, but it shows a visible **"Data may be out of date"** banner and the time of the last successful update. The banner also appears if the last success is more than 36 hours old. A failed fetch also fails the GitHub Action, so the maintainer gets notified.

## What counts as a change

- Records are matched across snapshots by `GlobalID` (Volusia Forever layers) or `PID` (Conservation Lands parcels).
- `OBJECTID` is ignored, because the county may renumber it when reloading a layer.
- Whitespace-only edits in county data do register as changes. We report what the county published.
- **Re-keyed records.** If a record disappears and another appears with the same land and the same attributes under a new `GlobalID` or `PID`, it is listed as re-keyed, not as a removal plus an addition. Edit-tracking fields (`created_*`, `last_edited_*`) and the database's derived area and length fields are ignored for this match. A pair with identical land but different attributes is reported as an edit to the record, noting its old key.
- **Layer reloads.** If at least half a layer's keys change in one day, the entry is flagged as a likely county reload, so a re-import doesn't read as mass removals.
- **Field changes.** A field the county adds to or drops from a whole layer is reported once for the layer and left out of per-record edits.
- **Removed and added land.** Each removed record is checked against the next snapshot by sampling points inside its outline. It's labeled *land no longer in this layer* (under 5% still covered by other records), *partly still in this layer*, or *still in this layer under another record* (95% or more, usually a re-parceled or merged parcel). Added records get the mirror check against the earlier snapshot. The outline of each removed record is kept in the change file, because the site only publishes the latest snapshot. Coverage is approximate: it uses a sampling grid, and very thin slivers may come back as "could not be checked."

## Acreage caveat

GIS acreage is computed from polygon area. It is **not surveyed or deeded acreage**. The Acquisitions layer has two acreage fields, `Acreage` and `Acres`, which total about 63,400 and 67,500 respectively. The site's headline uses `Acreage` and also shows the `Acres` total. Neither should be quoted as surveyed acreage.

The acquisitions layer holds more than Volusia Forever purchases. It also holds the earlier Endangered Land Program and land the county marks in `PriorityArea` as "Non-conservation land purchased for a park". The site reports those groups separately by `FundProgram` and lists the park-flagged records as published. The flags are shown as published, even where they look surprising: Lake George Forest and Wildlife Management Area carries the park flag.

## What this tracker does not do (yet)

- It doesn't know which parcels are on the conservation registry. The County Council hasn't adopted the registry yet (Phase 2).
- It doesn't watch Council or committee agendas, or the delisting-notice page (Phase 3).
- It doesn't interpret changes. Change entries are facts from the county's data, with dates and sources.
