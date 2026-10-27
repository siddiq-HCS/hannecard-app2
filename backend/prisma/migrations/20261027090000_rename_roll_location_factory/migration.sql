ALTER TYPE "RollLocation" RENAME VALUE 'AT_FACTORY' TO 'IN_FACTORY';

UPDATE "rfqs"
SET "items" = (
	SELECT jsonb_agg(
		CASE
			WHEN entry.item->>'rollLocation' = 'AT_FACTORY'
				THEN jsonb_set(entry.item, '{rollLocation}', '"IN_FACTORY"'::jsonb)
			ELSE entry.item
		END ORDER BY entry.ordinal
	)
	FROM jsonb_array_elements("items") WITH ORDINALITY AS entry(item, ordinal)
)
WHERE jsonb_typeof("items") = 'array'
	AND EXISTS (
		SELECT 1
		FROM jsonb_array_elements("items") AS entry(item)
		WHERE entry.item->>'rollLocation' = 'AT_FACTORY'
	);