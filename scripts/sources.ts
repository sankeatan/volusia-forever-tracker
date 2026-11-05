// Every layer we snapshot. Field names come from the live service (see docs/data-sources.md).
export const VF_SERVICE = 'https://maps5.vcgov.org/arcgis/rest/services/Resource_Stewardship/VolusiaForever/MapServer';
export const OPEN_DATA_2 = 'https://maps5.vcgov.org/arcgis/rest/services/Open_Data/Open_Data_2/MapServer';

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
};

export const SOURCES: Source[] = [
  { name: 'vf_acquisitions', title: 'Volusia Forever Acquisitions', url: `${VF_SERVICE}/2`, key: 'GlobalID', label: 'PropertyKnownAs', acres: 'Acreage' },
  { name: 'vf_applicants', title: 'Volusia Forever Applicants', url: `${VF_SERVICE}/3`, key: 'GlobalID', label: 'ProjectName', acres: 'Acres' },
  { name: 'vf_priority_projects', title: 'Volusia Forever Priority Projects', url: `${VF_SERVICE}/4`, key: 'GlobalID', label: 'Project_Name', acres: 'GIS_Acres' },
  { name: 'conservation_lands', title: 'Conservation Lands (parcels)', url: `${OPEN_DATA_2}/2`, key: 'PID', label: 'CONSERVE_NAME', acres: 'ACREAGE' },
];

// OBJECTID is reassigned if the county reloads a layer, so it never counts as a change.
export const IGNORED_FIELDS = new Set(['OBJECTID']);
// Fields a layer reload can rewrite without the land or its attributes changing. They still count as
// edits, but they're left out when deciding whether a removed and an added record are the same one re-keyed.
export const RELOAD_FIELDS = new Set(['GlobalID', 'created_user', 'created_date', 'last_edited_user', 'last_edited_date']);
