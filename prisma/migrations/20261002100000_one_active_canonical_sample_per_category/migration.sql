-- At most one active sample per service category.
-- Inactive samples keep their identity, revisions, and clinic references.
-- This statement does not update or delete GuideTemplate rows.
-- Prisma cannot express the predicate. Lifecycle services also take
-- canonical-sample-category advisory locks.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "GuideTemplate"
    WHERE "isSample" = true AND "isActive" = true
    GROUP BY "serviceCategory"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Refusing to add one-active-sample index: a service category already has more than one active sample.';
  END IF;
END $$;

CREATE UNIQUE INDEX "GuideTemplate_one_active_sample_per_category_key"
ON "GuideTemplate" ("serviceCategory")
WHERE "isSample" = true AND "isActive" = true;
