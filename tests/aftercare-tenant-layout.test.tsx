import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const { requireTenantClinic } = vi.hoisted(() => ({
  requireTenantClinic: vi.fn(),
}));

vi.mock("@/lib/tenancy/require-tenant-clinic", () => ({
  requireTenantClinic,
}));

import TenantLayout, {
  generateMetadata,
  generateViewport,
} from "@/app/(aftercare)/%5Fsites/[tenant]/layout";

describe("tenant layout branding", () => {
  beforeEach(() => {
    requireTenantClinic.mockReset();
  });

  it("applies server-rendered semantic tokens for the clinic", async () => {
    requireTenantClinic.mockResolvedValue({
      id: "clinic_demo_rivers",
      slug: "demodental",
      name: "Rivers Care Demo Clinic",
      profile: {
        displayName: "Riverside Dental Demo",
        primaryColor: "#0f766e",
        accentColor: "#f59e0b",
        themeMode: "SYSTEM",
        allowPatientThemeToggle: false,
      },
    });

    const html = renderToStaticMarkup(
      await TenantLayout({
        params: Promise.resolve({ tenant: "demodental" }),
        children: <p>child</p>,
      })
    );

    expect(html).toContain("--cg-brand:#0f766e");
    expect(html).toContain("--cg-accent:#f59e0b");
    expect(html).toContain("--cg-on-brand:#ffffff");
    expect(html).toContain("aftercareTheme");
    expect(html).toContain("html{color-scheme:light dark}");
    expect(html).toContain("light-dark(");
    expect(html).toContain("child");
    expect(html).not.toContain("--cg-font-sans");
    expect(html).not.toContain("ThemeProvider");
    expect(html).not.toContain("Change colour theme");
  });

  it.each([
    ["LIGHT", "light"],
    ["DARK", "dark"],
    ["SYSTEM", "light dark"],
  ] as const)("honours clinic theme mode %s", async (themeMode, scheme) => {
    requireTenantClinic.mockResolvedValue({
      id: "clinic_b",
      slug: "otherclinic",
      name: "Other Clinic",
      profile: {
        displayName: "Other Clinic Patient Brand",
        primaryColor: "#7c3aed",
        accentColor: "#db2777",
        themeMode,
        allowPatientThemeToggle: false,
      },
    });

    const html = renderToStaticMarkup(
      await TenantLayout({
        params: Promise.resolve({ tenant: "otherclinic" }),
        children: <p>child</p>,
      })
    );

    expect(html).toContain(`html{color-scheme:${scheme}}`);
    expect(html).not.toContain("Change colour theme");
  });

  it("emits clinic theme-color from generateViewport, not page markup", async () => {
    requireTenantClinic.mockResolvedValue({
      id: "clinic_b",
      slug: "otherclinic",
      name: "Other Clinic",
      profile: {
        displayName: "Other Clinic Patient Brand",
        primaryColor: "#0f766e",
        accentColor: "#f59e0b",
        darkPrimaryColor: "#22d3ee",
        darkAccentColor: "#fde68a",
        useCustomDarkBranding: true,
        themeMode: "SYSTEM",
        allowPatientThemeToggle: false,
      },
    });

    await expect(
      generateViewport({
        params: Promise.resolve({ tenant: "otherclinic" }),
        children: <p>child</p>,
      })
    ).resolves.toEqual({
      themeColor: [
        { media: "(prefers-color-scheme: light)", color: "#0f766e" },
        { media: "(prefers-color-scheme: dark)", color: "#22d3ee" },
      ],
    });
  });

  it("emits clinic icons without the River pack when a favicon is configured", async () => {
    requireTenantClinic.mockResolvedValue({
      id: "clinic_a",
      slug: "demodental",
      name: "Harbor",
      profile: {
        faviconUrl:
          "clinics/clinic_a/branding/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png",
      },
    });

    const metadata = await generateMetadata({
      params: Promise.resolve({ tenant: "demodental" }),
      children: <p>child</p>,
    });
    const json = JSON.stringify(metadata);
    expect(json).toContain(
      "/clinic-branding/clinic_a/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png"
    );
    expect(json).not.toContain("/favicons/");
    expect(json).not.toContain("/favicon.ico");
  });

  it("emits the River icon pack when the clinic has no favicon", async () => {
    requireTenantClinic.mockResolvedValue({
      id: "clinic_a",
      slug: "demodental",
      name: "Harbor",
      profile: { faviconUrl: null },
    });

    const metadata = await generateMetadata({
      params: Promise.resolve({ tenant: "demodental" }),
      children: <p>child</p>,
    });
    expect(JSON.stringify(metadata)).toContain("/favicons/favicon-32x32.png");
    expect(JSON.stringify(metadata)).not.toContain("/clinic-branding/");
  });

  it("applies custom Dark brand tokens while leaving Light tokens unchanged", async () => {
    requireTenantClinic.mockResolvedValue({
      id: "clinic_b",
      slug: "otherclinic",
      name: "Other Clinic",
      profile: {
        displayName: "Other Clinic Patient Brand",
        primaryColor: "#0f766e",
        accentColor: "#f59e0b",
        darkPrimaryColor: "#22d3ee",
        darkAccentColor: "#fde68a",
        useCustomDarkBranding: true,
        themeMode: "SYSTEM",
        allowPatientThemeToggle: false,
      },
    });

    const html = renderToStaticMarkup(
      await TenantLayout({
        params: Promise.resolve({ tenant: "otherclinic" }),
        children: <p>child</p>,
      })
    );

    expect(html).toContain("--cg-brand:light-dark(#0f766e,#22d3ee)");
    expect(html).toContain("--cg-accent:light-dark(#f59e0b,#fde68a)");
    expect(html).not.toContain("customCss");
  });

  it("renders the patient theme control only when the clinic allows it", async () => {
    requireTenantClinic.mockResolvedValue({
      id: "clinic_demo_rivers",
      slug: "demodental",
      name: "Rivers Care Demo Clinic",
      profile: {
        displayName: "Riverside Dental Demo",
        primaryColor: "#0f766e",
        accentColor: "#f59e0b",
        themeMode: "SYSTEM",
        allowPatientThemeToggle: true,
      },
    });

    const html = renderToStaticMarkup(
      await TenantLayout({
        params: Promise.resolve({ tenant: "demodental" }),
        children: <p>child</p>,
      })
    );

    expect(html).toContain("Change colour theme");
    expect(html).toContain("ptc");
    expect(html).toContain("localStorage.getItem");
    expect(html).not.toContain("ThemeProvider");
  });

  it("does not apply tenant A colours when rendering tenant B", async () => {
    requireTenantClinic.mockResolvedValue({
      id: "clinic_b",
      slug: "otherclinic",
      name: "Other Clinic",
      profile: {
        displayName: "Other Clinic Patient Brand",
        primaryColor: "#7c3aed",
        accentColor: "#db2777",
      },
    });

    const html = renderToStaticMarkup(
      await TenantLayout({
        params: Promise.resolve({ tenant: "otherclinic" }),
        children: <p>child</p>,
      })
    );

    expect(html).toContain("--cg-brand:#7c3aed");
    expect(html).not.toContain("#0f766e");
    expect(requireTenantClinic).toHaveBeenCalledWith("otherclinic");
  });

  it("applies the selected clinic typeface token on the patient surface", async () => {
    requireTenantClinic.mockResolvedValue({
      id: "clinic_demo_rivers",
      slug: "demodental",
      name: "Rivers Care Demo Clinic",
      profile: {
        displayName: "Riverside Dental Demo",
        primaryColor: "#0f766e",
        accentColor: "#f59e0b",
        themeMode: "SYSTEM",
        allowPatientThemeToggle: false,
        typeface: "INTER",
      },
    });

    const html = renderToStaticMarkup(
      await TenantLayout({
        params: Promise.resolve({ tenant: "demodental" }),
        children: <p>child</p>,
      })
    );

    expect(html).toContain("--cg-font-sans");
    expect(html).toContain("--font-clinic-inter");
    expect(html).toContain("aftercareTheme");
  });

  it("ignores an invalid stored typeface and keeps the product default", async () => {
    requireTenantClinic.mockResolvedValue({
      id: "clinic_demo_rivers",
      slug: "demodental",
      name: "Rivers Care Demo Clinic",
      profile: {
        displayName: "Riverside Dental Demo",
        primaryColor: "#0f766e",
        accentColor: "#f59e0b",
        typeface: "Comic Sans",
      },
    });

    const html = renderToStaticMarkup(
      await TenantLayout({
        params: Promise.resolve({ tenant: "demodental" }),
        children: <p>child</p>,
      })
    );

    expect(html).not.toContain("--cg-font-sans");
    expect(html).not.toContain("Comic Sans");
  });
});
