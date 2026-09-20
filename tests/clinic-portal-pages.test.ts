import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("clinic portal pages", () => {
  it("scopes overview and guides to the authenticated clinic membership", () => {
    const overview = readFileSync(
      "app/(staff)/(clinic-portal)/dashboard/page.tsx",
      "utf8"
    );
    const guides = readFileSync(
      "app/(staff)/(clinic-portal)/guides/page.tsx",
      "utf8"
    );
    const layout = readFileSync(
      "app/(staff)/(clinic-portal)/layout.tsx",
      "utf8"
    );

    expect(overview).toContain("requireStaffSession");
    expect(overview).toContain("clinicMembership.clinic.id");
    expect(overview).toContain("staffStatusPill");
    expect(overview).not.toContain("bg-emerald-50");
    expect(overview).not.toContain("dark:text-emerald-200");
    expect(readFileSync("app/(staff)/staff.css", "utf8")).toContain(
      "--staff-status-success-surface"
    );
    expect(readFileSync("app/(staff)/staff.css", "utf8")).toContain(
      "--staff-status-warning-text"
    );
    expect(overview).not.toContain("searchParams");
    expect(overview).not.toContain("listInProgressSessions");
    expect(overview).not.toContain("ProcedureSession");
    expect(overview).not.toContain("Start a new session");
    expect(overview).not.toContain("Wisdom Teeth");
    expect(guides).toContain("requireStaffSession");
    expect(guides).toContain("clinicMembership.clinic.id");
    expect(guides).not.toContain("searchParams");
    expect(guides).toContain("Create guide");
    expect(guides).not.toContain("Add guide");
    expect(guides).not.toContain("Duplicate");
    expect(layout).toContain("requireStaffSession");
    expect(layout).toContain("clinicMembership.clinic.id");
  });

  it("keeps parked chairside procedure routes without linking them from the portal", () => {
    const chrome = readFileSync(
      "app/(staff)/components/portal-chrome.tsx",
      "utf8"
    );
    const procedures = readFileSync(
      "app/(staff)/dashboard/procedures/page.tsx",
      "utf8"
    );

    expect(chrome).toContain("Overview");
    expect(chrome).toContain("Guides");
    expect(chrome).toContain("Practice");
    expect(chrome).toContain("View patient site");
    expect(chrome).toContain("PortalAppearanceControl");
    expect(chrome).not.toContain("/sessions");
    expect(chrome).not.toContain("Analytics");
    expect(chrome).not.toContain("Check-ins");
    expect(chrome).not.toContain("/dashboard/procedures");
    expect(procedures).toContain("requireStaffSession");
    expect(procedures).toContain("Procedure templates");
  });

  it("refreshes staff login copy to River Aftercare", () => {
    const login = readFileSync("app/(staff)/login/page.tsx", "utf8");
    const authShell = readFileSync(
      "app/(staff)/components/staff-auth-shell.tsx",
      "utf8"
    );
    const chrome = readFileSync(
      "app/(staff)/components/portal-chrome.tsx",
      "utf8"
    );
    const operator = readFileSync(
      "app/(staff)/components/operator-account-chrome.tsx",
      "utf8"
    );
    expect(login).toContain("PRODUCT_NAME");
    expect(chrome).toContain("PRODUCT_NAME");
    expect(operator).toContain("PRODUCT_NAME");
    expect(login).toContain('title="Sign in"');
    expect(authShell).toMatch(/<h1[^>]*>\s*\{title\}\s*<\/h1>/);
    expect(login).not.toContain("Staff sign in");
    expect(login).not.toContain("Care Guide");
  });

  it("keeps Practice and operator mutations behind server-side role guards", () => {
    const practice = readFileSync(
      "app/(staff)/(clinic-portal)/practice/page.tsx",
      "utf8"
    );
    const practiceActions = readFileSync(
      "app/(staff)/(clinic-portal)/practice/actions.ts",
      "utf8"
    );
    const logoActions = readFileSync(
      "app/(staff)/(clinic-portal)/practice/logo-actions.ts",
      "utf8"
    );
    const guideActions = readFileSync(
      "app/(staff)/(clinic-portal)/guides/actions.ts",
      "utf8"
    );
    const operatorPage = readFileSync(
      "app/(staff)/(operator)/operator/clinics/page.tsx",
      "utf8"
    );
    const operatorActions = readFileSync(
      "app/(staff)/(operator)/operator/actions.ts",
      "utf8"
    );
    const preview = readFileSync(
      "app/(staff)/(guide-preview)/guides/[guideId]/preview/page.tsx",
      "utf8"
    );

    expect(practice).toContain("requireClinicAdmin");
    expect(practice).not.toContain("searchParams");
    expect(practiceActions).toContain("requireClinicAdmin");
    expect(practiceActions).toContain("clinicMembership.clinic.id");
    expect(practiceActions).not.toContain('formData.get("clinicId")');
    expect(logoActions).toContain("requireClinicAdmin");
    expect(logoActions).toContain("clinicMembership.clinic.id");
    expect(logoActions).not.toContain('formData.get("clinicId")');
    expect(guideActions).toContain("requireClinicAdmin");
    expect(guideActions).toContain("unpublishGuideAction");
    expect(guideActions).toContain("reviewAttested");
    expect(guideActions).not.toContain('formData.get("clinicId")');
    expect(operatorPage).toContain("requirePlatformOperator");
    expect(operatorActions).toContain("requirePlatformOperator");
    expect(preview).toContain("requireStaffSession");
    expect(preview).toContain("PatientPage");
    expect(preview).toContain("GuideDocument");
    expect(preview).toContain("StaffPreviewShell");
    expect(preview).not.toContain("Wisdom Teeth");
  });

  it("resolves published-guide share links from the public slug, not the clinic home", () => {
    const edit = readFileSync(
      "app/(staff)/(clinic-portal)/guides/[guideId]/edit/page.tsx",
      "utf8"
    );

    expect(edit).toContain("clinicPatientSiteUrl");
    expect(edit).toContain("`/${guide.publicSlug}`");
    expect(edit).not.toContain("overview.patientSiteHref");
  });

  it("uses honest sample-template wording for the demo tenant and reviewed wording for other clinics", () => {
    const createPage = readFileSync(
      "app/(staff)/(clinic-portal)/guides/new/page.tsx",
      "utf8"
    );
    const form = readFileSync(
      "app/(staff)/(clinic-portal)/guides/create-guide-form.tsx",
      "utf8"
    );
    const list = readFileSync(
      "lib/clinic-portal/list-canonical-templates.ts",
      "utf8"
    );
    const create = readFileSync(
      "lib/clinic-portal/create-practice-guide.ts",
      "utf8"
    );

    expect(createPage).toContain("isDemoTenant");
    expect(createPage).toContain(
      "Start from a template, or create a custom guide for this demo."
    );
    expect(createPage).toContain(
      "Start from a reviewed template, or create a custom guide for this practice."
    );
    expect(form).toContain('? "Start from a template"');
    expect(form).toContain(': "Start from a reviewed template"}');
    expect(form).toContain("Sample template");
    expect(form).toContain("Reviewed template");
    expect(form).toContain("sample template, then adapt it for this demo.");
    expect(form).toContain("No reviewed templates are available yet.");
    expect(form).toContain("No sample templates are available yet.");
    expect(form).not.toContain("clinically approved");
    expect(form).not.toContain("clinically reviewed");
    expect(form).not.toContain("Canonical template");
    expect(list).toContain("clinicCanUseCanonicalTemplate");
    expect(create).toContain("clinicCanUseCanonicalTemplate");
    expect(create).toContain("isDemoTenant");
    expect(create).toContain("classifyCanonicalTemplate");
    expect(create).toContain("eligibleRevisionId");
    expect(list).toContain("isSample");

    const pkg = JSON.parse(readFileSync("package.json", "utf8"));
    expect(pkg.scripts["bootstrap:demo-template"]).toBe(
      "node scripts/bootstrap-demo-template.mjs"
    );
    expect(pkg.scripts.build).not.toContain("bootstrap");
    expect(pkg.scripts["db:seed"]).not.toContain("bootstrap");
    expect(readFileSync("prisma.config.ts", "utf8")).not.toContain(
      "bootstrap-demo-template"
    );
    const bootstrapCli = readFileSync(
      "scripts/bootstrap-demo-template.mjs",
      "utf8"
    );
    expect(bootstrapCli).toContain("Does not run prisma/seed.mjs.");
    expect(bootstrapCli).not.toMatch(/from ["'].*prisma\/seed/);
    expect(bootstrapCli).not.toMatch(/import\(["'].*prisma\/seed/);
  });
});
