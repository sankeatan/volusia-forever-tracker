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
};

export const SOURCES: Source[] = [
  { name: 'vf_acquisitions', title: 'Volusia Forever Acquisitions', url: `${VF_SERVICE}/2`, key: 'GlobalID', label: 'PropertyKnownAs' },
  { name: 'vf_applicants', title: 'Volusia Forever Applicants', url: `${VF_SERVICE}/3`, key: 'GlobalID', label: 'ProjectName' },
  { name: 'vf_priority_projects', title: 'Volusia Forever Priority Projects', url: `${VF_SERVICE}/4`, key: 'GlobalID', label: 'Project_Name' },
  { name: 'conservation_lands', title: 'Conservation Lands (parcels)', url: `${OPEN_DATA_2}/2`, key: 'PID', label: 'CONSERVE_NAME' },
];

// OBJECTID is reassigned if the county reloads a layer, so it never counts as a change.
export const IGNORED_FIELDS = new Set(['OBJECTID']);
