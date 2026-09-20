import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import MarketingError from "@/app/(marketing)/error";
import MarketingNotFound from "@/app/(marketing)/not-found";
import StaffError from "@/app/(staff)/error";
import StaffNotFound from "@/app/(staff)/not-found";
import AftercareError from "@/app/(aftercare)/error";
import AftercareNotFound from "@/app/(aftercare)/not-found";
import TenantError from "@/app/(aftercare)/%5Fsites/[tenant]/error";
import TenantNotFound from "@/app/(aftercare)/%5Fsites/[tenant]/not-found";
import { GlobalErrorDocument } from "@/app/components/global-error-document";
import {
  BACK_DASHBOARD_LABEL,
  BACK_HOME_LABEL,
  CLINIC_GUIDES_HOME_LABEL,
  CONTACT_US_LABEL,
  GLOBAL_ERROR_BODY,
  GLOBAL_ERROR_TITLE,
  GO_HOME_LABEL,
  MARKETING_ERROR_BODY,
  MARKETING_ERROR_TITLE,
  MARKETING_NOT_FOUND_BODY,
  MARKETING_NOT_FOUND_TITLE,
  PATIENT_ERROR_BODY,
  PATIENT_ERROR_TITLE,
  PATIENT_NOT_FOUND_BODY,
  PATIENT_NOT_FOUND_TITLE,
  STAFF_ERROR_BODY,
  STAFF_ERROR_TITLE,
  STAFF_NOT_FOUND_BODY,
  STAFF_NOT_FOUND_TITLE,
  TRY_AGAIN_LABEL,
} from "@/lib/errors/copy";
import { findForbiddenFailureUiTerms } from "@/lib/errors/forbidden-ui-terms";

function visibleText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function retry() {
  return undefined;
}

describe("failure UI copy and isolation", () => {
  it("renders branded marketing error and 404 without technical detail", () => {
    const errorHtml = renderToStaticMarkup(
      <MarketingError error={new Error("P2022")} retry={retry} />
    );
    const notFoundHtml = renderToStaticMarkup(<MarketingNotFound />);

    expect(visibleText(errorHtml)).toContain(MARKETING_ERROR_TITLE);
    expect(visibleText(errorHtml)).toContain(MARKETING_ERROR_BODY);
    expect(visibleText(errorHtml)).toContain(TRY_AGAIN_LABEL);
    expect(visibleText(errorHtml)).toContain(BACK_HOME_LABEL);
    expect(visibleText(notFoundHtml)).toContain(MARKETING_NOT_FOUND_TITLE);
    expect(visibleText(notFoundHtml)).toContain(MARKETING_NOT_FOUND_BODY);
    expect(visibleText(notFoundHtml)).toContain(GO_HOME_LABEL);
    expect(visibleText(notFoundHtml)).toContain(CONTACT_US_LABEL);
    expect(
      findForbiddenFailureUiTerms(
        `${visibleText(errorHtml)}\n${visibleText(notFoundHtml)}`
      )
    ).toEqual([]);
  });

  it("renders a retry-capable staff error and a styled staff 404", () => {
    const errorHtml = renderToStaticMarkup(
      <StaffError
        error={new Error("PrismaClientKnownRequestError")}
        retry={retry}
      />
    );
    const notFoundHtml = renderToStaticMarkup(<StaffNotFound />);

    expect(visibleText(errorHtml)).toContain(STAFF_ERROR_TITLE);
    expect(visibleText(errorHtml)).toContain(STAFF_ERROR_BODY);
    expect(visibleText(errorHtml)).toContain(TRY_AGAIN_LABEL);
    expect(visibleText(errorHtml)).toContain(BACK_DASHBOARD_LABEL);
    expect(errorHtml).toContain('href="/dashboard"');
    expect(visibleText(notFoundHtml)).toContain(STAFF_NOT_FOUND_TITLE);
    expect(visibleText(notFoundHtml)).toContain(STAFF_NOT_FOUND_BODY);
    expect(
      findForbiddenFailureUiTerms(
        `${visibleText(errorHtml)}\n${visibleText(notFoundHtml)}`
      )
    ).toEqual([]);
  });

  it("keeps patient failure copy clinic-safe and free of staff links", () => {
    const rootError = renderToStaticMarkup(
      <AftercareError error={new Error("P2022")} retry={retry} />
    );
    const tenantError = renderToStaticMarkup(
      <TenantError error={new Error("P2022")} retry={retry} />
    );
    const rootNotFound = renderToStaticMarkup(<AftercareNotFound />);
    const tenantNotFound = renderToStaticMarkup(<TenantNotFound />);

    for (const html of [rootError, tenantError, rootNotFound, tenantNotFound]) {
      expect(html).not.toContain("/login");
      expect(html).not.toContain("/dashboard");
      expect(html).not.toContain("/operator");
      expect(visibleText(html).toLowerCase()).not.toContain("server error");
      expect(findForbiddenFailureUiTerms(visibleText(html))).toEqual([]);
    }

    expect(visibleText(rootError)).toContain(PATIENT_ERROR_TITLE);
    expect(visibleText(rootError)).toContain(PATIENT_ERROR_BODY);
    expect(visibleText(rootError)).toContain(TRY_AGAIN_LABEL);
    expect(visibleText(rootError)).not.toContain(CLINIC_GUIDES_HOME_LABEL);
    expect(visibleText(tenantError)).toContain(CLINIC_GUIDES_HOME_LABEL);
    expect(tenantError).toContain('href="/"');
    expect(visibleText(rootNotFound)).toContain(PATIENT_NOT_FOUND_TITLE);
    expect(visibleText(rootNotFound)).toContain(PATIENT_NOT_FOUND_BODY);
    expect(visibleText(rootNotFound)).not.toContain(CLINIC_GUIDES_HOME_LABEL);
    expect(visibleText(tenantNotFound)).toContain(CLINIC_GUIDES_HOME_LABEL);
  });

  it("renders the global fallback without application providers or technical data", () => {
    const html = renderToStaticMarkup(
      <GlobalErrorDocument
        error={{
          message: "Can't reach database server at ep-xxx.neon.tech",
          digest: "abc123",
        }}
        retry={retry}
      />
    );

    expect(html).toContain("<html");
    expect(html).toContain("<body");
    expect(visibleText(html)).toContain(GLOBAL_ERROR_TITLE);
    expect(visibleText(html)).toContain(GLOBAL_ERROR_BODY);
    expect(visibleText(html)).toContain(TRY_AGAIN_LABEL);
    expect(html).toContain('content="noindex, nofollow"');
    expect(html).not.toContain("abc123");
    expect(html).not.toContain("ep-xxx");
    expect(findForbiddenFailureUiTerms(visibleText(html))).toEqual([]);
    expect(findForbiddenFailureUiTerms(html)).toEqual([]);
  });
});

describe("failure UI source contract", () => {
  const fallbackFiles = [
    "app/(marketing)/error.tsx",
    "app/(marketing)/not-found.tsx",
    "app/(staff)/error.tsx",
    "app/(staff)/not-found.tsx",
    "app/(aftercare)/error.tsx",
    "app/(aftercare)/not-found.tsx",
    "app/(aftercare)/%5Fsites/[tenant]/error.tsx",
    "app/(aftercare)/%5Fsites/[tenant]/not-found.tsx",
    "app/components/global-error-document.tsx",
    "app/(marketing)/components/marketing-status-page.tsx",
    "app/(staff)/components/staff-status-page.tsx",
    "app/(aftercare)/components/patient-status-page.tsx",
  ] as const;

  it("does not query Neon, R2, clinic profiles, or auth from fallback UI", () => {
    for (const file of fallbackFiles) {
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toContain("getPrisma");
      expect(source, file).not.toContain("requireTenantClinic");
      expect(source, file).not.toContain("getClinicBySlug");
      expect(source, file).not.toContain("getAuthContext");
      expect(source, file).not.toContain("DIRECT_URL");
      expect(source, file).not.toMatch(/from ["']@\/lib\/prisma["']/);
    }
  });

  it("uses catch-all pages to invoke host not-found boundaries without data access", () => {
    const catchAlls = [
      "app/(marketing)/%5Fmarketing/[...slug]/page.tsx",
      "app/(staff)/[...slug]/page.tsx",
      "app/(aftercare)/%5Fsites/[tenant]/[guideSlug]/[...rest]/page.tsx",
    ] as const;

    for (const file of catchAlls) {
      const source = readFileSync(file, "utf8");
      expect(source, file).toContain("notFound()");
      expect(source, file).not.toContain("getPrisma");
      expect(source, file).not.toContain("getAuthContext");
      expect(source, file).not.toMatch(/from ["']@\/lib\/prisma["']/);
    }
  });

  it("keeps the health probe to SELECT 1 on the pooled Prisma client", () => {
    const ping = readFileSync(
      "lib/health/ping-application-database.ts",
      "utf8"
    );
    const route = readFileSync("app/api/health/route.ts", "utf8");
    expect(ping).toContain("$queryRaw`SELECT 1`");
    expect(ping).toContain("getPrisma");
    expect(ping).not.toMatch(/\bDIRECT_URL\b/);
    expect(ping).not.toContain("prisma.user");
    expect(ping).not.toContain("prisma.clinic");
    expect(route).toContain("isStaffAppHost");
    expect(route).not.toMatch(/\bDIRECT_URL\b/);
    expect(route).not.toContain("cookies(");
  });
});
