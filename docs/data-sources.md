# Data sources (Phase 0 findings)

Discovery run: **2026-11-04**, from a local shell. `maps5.vcgov.org` was reachable without auth.
Every field name and count below comes from the live service responses (`/layers?f=pjson`, `/<id>?f=pjson`, `/query`). None are inferred.

## Server

- ArcGIS MapServer, capabilities `Map,Query,Data`, query formats `JSON, geoJSON, PBF`.
- `maxRecordCount` is 2000 and every layer `supportsPagination`. The fetcher pages in 1,000s, ordered by `OBJECTID`, and checks the total against `returnCountOnly`.
- The native spatial reference is Web Mercator (wkid 102100 / 3857). We request `outSR=4326` and `geometryPrecision=6`, about 0.1 m.
- No editing or change-tracking endpoints are exposed. The Volusia Forever layers carry `last_edited_date`; Conservation Lands does not.

## Layers we snapshot

### 1. Volusia Forever Acquisitions (`VolusiaForever/MapServer/2`)
`https://maps5.vcgov.org/arcgis/rest/services/Resource_Stewardship/VolusiaForever/MapServer/2`

- **92 polygons** (MultiPolygon). These are project or acquisition-level records, **not parcels**.
- Fields: `OBJECTID, PropertyKnownAs, AcquitionYear` (sic), `MapNo, Acres, ProjectName, Acreage, AcquisitionType, VolusiaContribution, PartnerContribution, Ownership, Co_Ownership, LandManager, FundProgram, PriorityArea, Notes, created_user, created_date, last_edited_user, last_edited_date, Total_Investment, Partners, SHAPE, GlobalID, SHAPE.STArea(), SHAPE.STLength()`
- **No parcel ID field.**
- Record key: **`GlobalID`** (92 unique of 92). `PropertyKnownAs` is not unique (61 distinct; e.g., "Doris Leeper Spruce Creek Preserve" appears 9 times).
- Holding type: `AcquisitionType` = `Fee Simple` (78), `Conservation Easement` (12; one value has a trailing space), `Working Forest & Farmland` (2).
- `FundProgram` = `Volusia Forever 2000` (45), `Endangered Land Program` (28, pre-Volusia Forever), `Volusia Forever 2020` (19).
- `PriorityArea` flags 14 records as "Non-conservation land purchased for a park". Those records sit in this layer next to conservation purchases.
- Acreage: there are two fields. `Acreage` totals **63,406** and `Acres` totals **67,495**. `Acres` has polygon-style precision (e.g., 37.41995061); `Acreage` looks rounded (34.58). The service doesn't document which is which.
- `Ownership` includes `Private` (11 records, which are easements), `State`, `SJRWMD`, and several cities. The values have inconsistent whitespace.

### 2. Volusia Forever Applicants (`VolusiaForever/MapServer/3`)

- **466 polygons.** Fields: `OBJECTID, Tracking_No, ProjectName, OwnerName, PropertyLocation, Applicant, Acres, Type, ESL_Forest_Farm, Applicant_Nominee, FloridaForeverProjectArea, Notes, created_user, created_date, last_edited_user, last_edited_date, SHAPE, GlobalID, SHAPE.STArea(), SHAPE.STLength()`
- `PropertyLocation` usually holds the **12-digit parcel ID** (423 distinct). A few rows are null, and at least one holds a person's name.
- `Tracking_No` groups parcels into applications (87 distinct). Record key: `GlobalID`.
- `Type`: `FS`, `CE`, `CE/FS`, `WFF`, `ESL` (plus `FS ` with a trailing space, and nulls).
- `OwnerName` and `Applicant` contain private individuals' names. They stay in the raw snapshots, but the site doesn't display them.

### 3. Volusia Forever Priority Projects (`VolusiaForever/MapServer/4`)

- **35 polygons.** Fields: `OBJECTID, Acreage, Project_Name, List, created_user, created_date, last_edited_user, last_edited_date, AcquisitionType, Shape, GlobalID, GIS_Acres, Shape.STArea(), Shape.STLength()`
- `List` = `A` (31) / `B` (4). `AcquisitionType` = Fee Simple 18, Conservation Easement 13, Working Forest & Farmland 4.

### 4. Conservation Lands, parcel level (`Open_Data/Open_Data_2/MapServer/2`)
`https://maps5.vcgov.org/arcgis/rest/services/Open_Data/Open_Data_2/MapServer/2`

The brief didn't list this layer, and it's the important one. It's the layer described by the [ConservationLands metadata](https://maps.vcgov.org/gis/data/ConservationLands.htm).

- **3,841 polygons, 3,705 distinct `PID`s.** It covers all conservation land in the county: county, state, SJRWMD, federal, cities, private easements, and mitigation banks.
- Fields: `OBJECTID, PID, OWNER, MANAGER, CONSERVE_NAME, USECODE, ALIASNAME, DATE_ACQUIRED` (string, `MM/DD/YYYY`, blank on 241 rows), `ConservationArea, ACREAGE, Acquisition_Area, ECHO_Map, URL, Shape, Shape.STArea(), Shape.STLength()`
- `PID` is the Property Appraiser parcel number. It was verified against the county Parcels layer (`Open_Data_3/MapServer/36`): PID `372100000010` maps to `ALTKEY 2000015`. 21 PIDs are alphanumeric (e.g., `4230000000L0`).
- 75 PIDs have more than one feature, and in 67 of them the attributes differ (e.g., a parcel split between Buck Lake and Seminole Ranch conservation areas). **The diff groups features by PID.**
- `USECODE` separates holding types: `Public Conservation Land` 3,507; `Private Property Encumbered by a Public Conservation Easement` 191; `Private Mitigation Bank` 104; `...Public Agricultural Easement` 12; `Public Mitigation Bank` 11; `Private Conservation Land` 8; `Privately Held Conservation Easement-Non Regulatory` 5; `...Public Regulatory Conservation Easement` 3.
- `ACREAGE` is polygon acreage, not surveyed acreage (per the metadata page). It totals 279,690 across all owners, and 43,377 where `OWNER` contains "County of Volusia".
- There is **no field marking a parcel as Volusia Forever.** `CONSERVE_NAME` and `ALIASNAME` sometimes match `PropertyKnownAs` in Acquisitions, but not reliably.

### 5. Parcel ownership, tracked parcels only (`Open_Data_3/MapServer/34`)
`https://maps5.vcgov.org/arcgis/rest/services/Open_Data/Open_Data_3/MapServer/34`

Added 2026-11-05. This is the Property Appraiser's ownership roll. It's too big to snapshot whole, so the fetcher looks up only the parcels we track: every `PID` in Conservation Lands, plus every applicant `PropertyLocation` that is a 12-character parcel ID. That's about 4,060 parcels, sent as `PID IN (...)` POST queries in batches of 500, which takes about 2 seconds. Only these fields are kept, and no geometry: `PID, ALTKEY, OWNER1, OWNER2, PC, PC_DESC, LASTSALEDT, LASTSALEPRICE, CALCACRES`. The fetcher adds a `TRACKED_AS` field (`conservation`, `applicant`, or both) to each record.

- Why: a deed reaches this roll before the conservation layer is redrawn, so a change in `OWNER1` is the earliest published sign that tracked land changed hands.
- On the first run, every conservation `PID` was found on the roll. 3 applicant parcel IDs were not.
- `OWNER1` is classed in `site/owners.js` as Volusia County, another public agency, a private organization, or a private individual. The patterns come from the owner names on file. A move from a public class to a private one is flagged in the change log as *left public ownership*. The reverse is flagged as *became public land*.
- Private individuals' names stay in the raw snapshot in this repository but are masked on the site, like `OwnerName` in the Applicants layer. The raw ownership file isn't copied into the published site. Organization names (LLCs, corporations, nonprofits) are shown. A name counts as an organization only when it carries a legal-entity suffix or ends in a word like SOCIETY or CHURCH, so doubtful names are masked.

## Layers not snapshotted

- `VolusiaForever/MapServer/0` "Conservation Acres" and `/1` "Conservation In Corridor": each is a single dissolved polygon (`GIS_Acres` 260,963 and 241,121). They're cheap to add later as a sanity metric.
- `Open_Data_3/MapServer/36` "Parcels" (`PID, ALTKEY, PREFIX_, SUB, PCL, SUBNUM`). It's useful for spatial joins, but it's too big to snapshot whole. (`/34` "Parcel Ownership" is snapshotted for tracked parcels only; see above.)

## Join key decision

| Purpose | Key |
|---|---|
| Parcel identity (registry matching, alerts) | **`PID`** from Conservation Lands (= Property Appraiser parcel number) |
| Volusia Forever acquisition records | `GlobalID` (stable across edits in an enterprise geodatabase; `OBJECTID` is not trusted) |
| Applicants → parcels | `PropertyLocation` = PID, where populated |
| Acquisition → parcels | **Not available as an attribute.** Needs a spatial overlay of Acquisitions polygons on Conservation Lands parcels (turf). This is the first job of Phase 2. |

The registry list will most likely cite parcel numbers or preserve names. Matching it to `PID` in Conservation Lands is the main path, with `data/registry-overrides.csv` for parcels that don't match cleanly.

## Open questions for the county

- What do `Acres` and `Acreage` in the Acquisitions layer each mean?
- Is `GlobalID` preserved when they reload layers?
- Where will the 30-day delisting notices be posted?
