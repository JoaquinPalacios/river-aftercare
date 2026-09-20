import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { toSafeLogoSrc } from "@/lib/aftercare/safe-href";
import { resolveClinicLogoSrc } from "@/lib/clinic-assets/public-url";

describe("logo upload infrastructure", () => {
  it("keeps demo paths and rejects remote logo URLs", () => {
    expect(toSafeLogoSrc("/demo/riverside-mark.svg")).toBe(
      "/demo/riverside-mark.svg"
    );
    expect(toSafeLogoSrc("/branding/logo.png")).toBe("/branding/logo.png");
    expect(toSafeLogoSrc("/branding/logo.webp")).toBe("/branding/logo.webp");
    expect(toSafeLogoSrc("/clinic-branding/clinic_demo_rivers/logo.webp")).toBe(
      "/clinic-branding/clinic_demo_rivers/logo.webp"
    );
    expect(toSafeLogoSrc("/clinic-branding/clinic_demo_rivers/logo.svg")).toBe(
      "/clinic-branding/clinic_demo_rivers/logo.svg"
    );
    expect(
      resolveClinicLogoSrc("clinics/clinic_demo_rivers/branding/logo.webp")
    ).toBe("/clinic-branding/clinic_demo_rivers/logo.webp");
  });

  it("does not ship a filesystem upload, inline SVG injection, or client AWS SDK", () => {
    const field = readFileSync(
      "app/(staff)/(clinic-portal)/practice/practice-logo-field.tsx",
      "utf8"
    );
    const shared = readFileSync(
      "app/(staff)/(clinic-portal)/practice/practice-branding-asset-field.tsx",
      "utf8"
    );
    const header = readFileSync(
      "app/(aftercare)/components/practice-header.tsx",
      "utf8"
    );
    const mark = readFileSync(
      "app/(aftercare)/components/practice-mark.tsx",
      "utf8"
    );
    const adapter = readFileSync(
      "lib/clinic-assets/r2-clinic-asset-storage.ts",
      "utf8"
    );
    const sanitizer = readFileSync(
      "lib/clinic-assets/sanitize-clinic-logo-svg.ts",
      "utf8"
    );
    const trigger = readFileSync(
      "app/(staff)/components/staff-file-trigger.tsx",
      "utf8"
    );

    const fieldText = `${field} ${shared}`.replace(/\s+/g, " ");

    expect(shared).toContain("StaffFileTrigger");
    expect(trigger).toContain('type="file"');
    expect(fieldText).toContain("clinic object storage is not configured");
    expect(shared).toContain("Uploading…");
    expect(field).toContain("Practice logo updated.");
    expect(field).not.toContain("public/uploads");
    expect(shared).not.toContain("public/uploads");
    expect(field).not.toContain("coming before launch");
    expect(field).not.toContain("@aws-sdk/client-s3");
    expect(shared).not.toContain("@aws-sdk/client-s3");
    expect(mark).toContain("<img");
    expect(header).toContain("PracticeMark");
    expect(header).not.toContain("dangerouslySetInnerHTML");
    expect(mark).not.toContain("dangerouslySetInnerHTML");
    expect(header).not.toContain("@aws-sdk/client-s3");
    expect(mark).not.toContain("@aws-sdk/client-s3");
    expect(adapter).toContain("server-only");
    expect(adapter).toContain("@aws-sdk/client-s3");
    expect(adapter).not.toContain("fs.writeFile");
    expect(adapter).not.toContain("ListObjects");
    expect(adapter).not.toContain("r2.dev");
    expect(sanitizer).toContain("server-only");
    expect(sanitizer).toContain("dompurify");
    expect(sanitizer).toContain('from "jsdom"');
    expect(sanitizer).not.toContain("dangerouslySetInnerHTML");
  });
});
