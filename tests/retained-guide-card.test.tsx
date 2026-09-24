import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock(
  "@/app/(staff)/(clinic-portal)/guides/retained-guide-restore-form",
  () => ({
    RetainedGuideRestoreForm: () => (
      <button type="submit">Restore guide</button>
    ),
  })
);

import { RetainedGuideCard } from "@/app/(staff)/(clinic-portal)/guides/retained-guide-card";

const shared = {
  guideId: "guide_1",
  title: "Socket care",
  sourceLabel: "Custom guide",
  retentionUntilLabel: "23 December 2026",
  retentionUntilIso: "2026-12-22T13:00:00.000Z",
  canRestore: true,
};

describe("retained guide card", () => {
  it("shows the temporary live patient page for a retained published guide", () => {
    const html = renderToStaticMarkup(
      <RetainedGuideCard
        {...shared}
        lifecycle="published"
        patientUrl="https://harbour.riveraftercare.test/socket-care"
      />
    );

    expect(html).toContain("Retained");
    expect(html).toContain("Published");
    expect(html).toContain("Read-only");
    expect(html).toContain("Retained until");
    expect(html).toContain("23 December 2026");
    expect(html).toContain("Live patient page");
    expect(html).toContain("https://harbour.riveraftercare.test/socket-care");
    expect(html).toContain("Copy live patient page link");
    expect(html).toContain(
      "This published page remains available until 23 December 2026 unless you restore the guide. After that date it will no longer be accessible."
    );
    expect(html).toContain("This guide is read-only while it is retained.");
    expect(html).toContain("Restore guide");
    expect(html).not.toContain("This guide is unpublished");
  });

  it("does not describe a retained draft as a live patient page", () => {
    const html = renderToStaticMarkup(
      <RetainedGuideCard
        {...shared}
        lifecycle="draft"
        patientUrl="https://harbour.riveraftercare.test/socket-care"
      />
    );

    expect(html).toContain("Draft");
    expect(html).toContain("Read-only");
    expect(html).toContain("Retained until");
    expect(html).toContain("23 December 2026");
    expect(html).toContain(
      "This guide is unpublished. It has no live patient page."
    );
    expect(html).not.toContain("Live patient page");
    expect(html).not.toContain(
      "https://harbour.riveraftercare.test/socket-care"
    );
    expect(html).not.toContain("Copy live patient page link");
  });

  it("keeps a retained unpublished guide private", () => {
    const html = renderToStaticMarkup(
      <RetainedGuideCard
        {...shared}
        lifecycle="unpublished"
        patientUrl={null}
      />
    );

    expect(html).toContain("Unpublished");
    expect(html).toContain(
      "This guide is unpublished. It has no live patient page."
    );
    expect(html).not.toContain("Live patient page");
  });
});
