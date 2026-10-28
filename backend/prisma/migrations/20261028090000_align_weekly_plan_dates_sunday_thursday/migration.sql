WITH corrected AS (
  SELECT
    "id",
    (date_trunc('week', "startDate" + 1)::date - 1) AS sunday
  FROM "weekly_plans"
)
UPDATE "weekly_plans" AS plan
SET
  "startDate" = corrected.sunday,
  "endDate" = corrected.sunday + 4,
  "year" = EXTRACT(ISOYEAR FROM corrected.sunday + 1)::int,
  "weekNumber" = EXTRACT(WEEK FROM corrected.sunday + 1)::int
FROM corrected
WHERE plan."id" = corrected."id";