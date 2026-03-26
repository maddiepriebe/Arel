/**
 * Fuzzy column header detection for rent roll Excel files.
 *
 * Property management software exports wildly different column names.
 * This module normalises headers and scores them against known aliases.
 */

export type MappedField =
  | 'unitId'
  | 'buildingCode'
  | 'tenantName'
  | 'leaseStart'
  | 'leaseEnd'
  | 'currentRent'
  | 'rentEffectiveDate'
  | 'unitType'
  | 'bedrooms'
  | 'bathrooms'
  | 'sqft';

/** Map from canonical field name to known header aliases (lowercased, alphanumeric only) */
const ALIASES: Record<MappedField, string[]> = {
  unitId: [
    'unit', 'unitno', 'unitnum', 'unitnumber', 'unit#', 'unitid',
    'apt', 'aptno', 'aptnum', 'apt#', 'apartment', 'suite', 'suiteno',
    'space', 'spaceno',
  ],
  buildingCode: [
    'building', 'bldg', 'bldgcode', 'buildingcode', 'buildingid',
    'property', 'propertynumber',
  ],
  tenantName: [
    'tenant', 'tenantname', 'resident', 'residentname', 'lessee',
    'occupant', 'name', 'customername',
  ],
  leaseStart: [
    'leasestart', 'startdate', 'leasestartdate', 'commencement',
    'movein', 'moveindate', 'moveindatetime', 'leasebegin', 'leasebegindate',
    'occupancydate', 'startofterm',
  ],
  leaseEnd: [
    'leaseend', 'enddate', 'leaseenddate', 'expiration', 'expirationdate',
    'expiry', 'expirydate', 'moveout', 'moveoutdate', 'termination',
    'terminationdate', 'endofterm', 'leaseexpiry',
  ],
  currentRent: [
    'rent', 'currentrent', 'monthlyrent', 'rentamount', 'baserent',
    'monthlycharge', 'scheduledrent', 'marketrent', 'contractrent',
    'chargedrent', 'grossrent', 'rentrate', 'rateamount',
  ],
  rentEffectiveDate: [
    'renteffectivedate', 'effectivedate', 'rateeffective', 'rateeffectivedate',
    'ratechangedate', 'renteffective', 'increasedate', 'rentincreasedate',
    'lastincreasedate', 'currentrateeffective',
  ],
  unitType: [
    'unittype', 'bedtype', 'type', 'floorplan', 'floorplantype',
    'floorplannumber', 'plan', 'plancategory', 'layout', 'bedtype',
    'apartmenttype',
  ],
  bedrooms: [
    'bedrooms', 'beds', 'br', 'numbedrooms', 'numberofbedrooms',
    'bedroomcount', '#bedrooms', 'bed',
  ],
  bathrooms: [
    'bathrooms', 'baths', 'bath', 'numbathrooms', 'numberofbathrooms',
    'bathroomcount', '#bathrooms',
  ],
  sqft: [
    'sqft', 'sqfeet', 'squarefeet', 'size', 'sf', 'area', 'unitsf',
    'unitsqft', 'squarefootage', 'footage',
  ],
};

/** Normalise a header string for comparison: lowercase, strip non-alphanumeric */
export function normaliseHeader(raw: string): string {
  return String(raw).toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Map from normalised alias → canonical field */
const LOOKUP = new Map<string, MappedField>();
for (const [field, aliases] of Object.entries(ALIASES) as [MappedField, string[]][]) {
  for (const alias of aliases) {
    // Normalise the alias too (some aliases already have #, spaces stripped)
    LOOKUP.set(alias.replace(/[^a-z0-9]/g, ''), field);
  }
}

/**
 * Given a raw header row (array of cell values), return a mapping from
 * column index → canonical field name, for every column we recognised.
 *
 * Unrecognised columns are omitted.
 */
export function detectColumns(
  headerRow: unknown[]
): Map<number, MappedField> {
  const result = new Map<number, MappedField>();
  for (let i = 0; i < headerRow.length; i++) {
    const cell = headerRow[i];
    if (cell == null || cell === '') continue;
    const key = normaliseHeader(String(cell));
    const field = LOOKUP.get(key);
    if (field && !Array.from(result.values()).includes(field)) {
      // First match wins — avoids duplicate field mappings
      result.set(i, field);
    }
  }
  return result;
}

/** Extract a value from a data row given the column map and desired field */
export function getCell(
  row: unknown[],
  colMap: Map<number, MappedField>,
  field: MappedField
): unknown {
  for (const [idx, f] of Array.from(colMap.entries())) {
    if (f === field) return row[idx] ?? null;
  }
  return null;
}
