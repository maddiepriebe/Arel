-- Portfolio summary view — run this after drizzle-kit push
-- Used by GET /api/units to avoid N+1 fetches for 400 units.
-- Rerun this if schema changes.

CREATE OR REPLACE VIEW portfolio_summary AS
SELECT
  u.id,
  u.unit_number,
  u.building_code,
  u.unit_type,
  u.bedrooms,
  u.sqft,
  u.is_exempt,
  l.id            AS lease_id,
  l.tenant_name,
  l.current_rent,
  l.rent_effective_date,
  l.lease_start,
  l.lease_end,
  bl.cumulative_banked,
  cr.cap_pct      AS current_cap_pct,
  cr.period_label AS current_period_label,
  (
    COALESCE(cr.cap_pct::numeric, 0) +
    COALESCE(bl.cumulative_banked::numeric, 0)
  )               AS max_allowable_pct,
  l.current_rent::numeric * (
    1 +
    COALESCE(cr.cap_pct::numeric, 0) +
    COALESCE(bl.cumulative_banked::numeric, 0)
  )               AS max_rent_after
FROM units u
LEFT JOIN leases l
  ON l.unit_id = u.id AND l.is_current = true
LEFT JOIN LATERAL (
  SELECT cumulative_banked
  FROM banking_ledger
  WHERE unit_id = u.id
  ORDER BY period_end DESC
  LIMIT 1
) bl ON true
LEFT JOIN LATERAL (
  SELECT cap_pct, period_label
  FROM cpi_rates
  WHERE period_start <= CURRENT_DATE AND period_end >= CURRENT_DATE
  LIMIT 1
) cr ON true;
