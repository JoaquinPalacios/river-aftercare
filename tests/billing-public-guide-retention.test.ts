import { EntitlementStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { patientGuidesRemainPublic } from "@/lib/billing/public-guide-access";
import { publicGuideRetentionUntil } from "@/lib/billing/projection";

const ENDED = new Date("2026-10-01T00:00:00.000Z");
const RETENTION = publicGuideRetentionUntil(ENDED, ENDED);

describe("public guide retention", () => {
  it("keeps published guides through the retention instant and not after", () => {
    expect(
      patientGuidesRemainPublic({
        entitlementStatus: EntitlementStatus.ENDED,
        publicGuideRetentionUntil: RETENTION,
        now: RETENTION,
      })
    ).toBe(true);
    expect(
      patientGuidesRemainPublic({
        entitlementStatus: EntitlementStatus.ENDED,
        publicGuideRetentionUntil: RETENTION,
        now: new Date(RETENTION.getTime() + 1),
      })
    ).toBe(false);
  });

  it("keeps guides for legacy, active, and restricted clinics", () => {
    expect(
      patientGuidesRemainPublic({
        entitlementStatus: null,
        publicGuideRetentionUntil: null,
        now: RETENTION,
      })
    ).toBe(true);
    expect(
      patientGuidesRemainPublic({
        entitlementStatus: EntitlementStatus.ACTIVE,
        publicGuideRetentionUntil: null,
        now: RETENTION,
      })
    ).toBe(true);
    expect(
      patientGuidesRemainPublic({
        entitlementStatus: EntitlementStatus.RESTRICTED,
        publicGuideRetentionUntil: null,
        now: RETENTION,
      })
    ).toBe(true);
  });
});
