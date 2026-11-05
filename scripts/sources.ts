// Every layer we snapshot. Field names come from the live service (see docs/data-sources.md).
export const VF_SERVICE = 'https://maps5.vcgov.org/arcgis/rest/services/Resource_Stewardship/VolusiaForever/MapServer';
export const OPEN_DATA_2 = 'https://maps5.vcgov.org/arcgis/rest/services/Open_Data/Open_Data_2/MapServer';
export const OPEN_DATA_3 = 'https://maps5.vcgov.org/arcgis/rest/services/Open_Data/Open_Data_3/MapServer';

export type Source = {
  name: string;
  title: string;
  url: string;
  // Field that identifies a record across snapshots. Several features can share a key
  // (Conservation Lands has multipart parcels); diff groups them.
  key: string;
  label: string;
  // Acreage field shown next to added and removed records in the change log.
  acres: string;
  // Parcel lookups fetch only the tracked parcel IDs (see fetch.ts), with these fields and no geometry,
  // instead of the whole layer.
  lookup?: { outFields: string[] };
  // Owner-name field; a change in owner class (county, public, private) is flagged in the change log.
  owner?: string;
};

export const SOURCES: Source[] = [
  { name: 'vf_acquisitions', title: 'Volusia Forever Acquisitions', url: `${VF_SERVICE}/2`, key: 'GlobalID', label: 'PropertyKnownAs', acres: 'Acreage' },
  { name: 'vf_applicants', title: 'Volusia Forever Applicants', url: `${VF_SERVICE}/3`, key: 'GlobalID', label: 'ProjectName', acres: 'Acres' },
  { name: 'vf_priority_projects', title: 'Volusia Forever Priority Projects', url: `${VF_SERVICE}/4`, key: 'GlobalID', label: 'Project_Name', acres: 'GIS_Acres' },
  { name: 'conservation_lands', title: 'Conservation Lands (parcels)', url: `${OPEN_DATA_2}/2`, key: 'PID', label: 'CONSERVE_NAME', acres: 'ACREAGE' },
  // Property Appraiser ownership for every conservation parcel and every applicant parcel. Deeds reach this
  // layer before the conservation layer is updated, so it's the early signal for land changing hands.
  {
    name: 'parcel_ownership',
    title: 'Parcel ownership (tracked parcels)',
    url: `${OPEN_DATA_3}/34`,
    key: 'PID',
    label: 'OWNER1',
    acres: 'CALCACRES',
    owner: 'OWNER1',
    lookup: { outFields: ['PID', 'ALTKEY', 'OWNER1', 'OWNER2', 'PC', 'PC_DESC', 'LASTSALEDT', 'LASTSALEPRICE', 'CALCACRES'] },
  },
];

// OBJECTID is reassigned if the county reloads a layer, so it never counts as a change.
export const IGNORED_FIELDS = new Set(['OBJECTID']);
// Fields a layer reload can rewrite without the land or its attributes changing. They still count as
// edits, but they're left out when deciding whether a removed and an added record are the same one re-keyed.
export const RELOAD_FIELDS = new Set(['GlobalID', 'created_user', 'created_date', 'last_edited_user', 'last_edited_date']);
