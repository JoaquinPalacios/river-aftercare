import {
  BillingStatus,
  ClinicMembershipRole,
  EntitlementStatus,
} from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  BILLING_SETUP_PATH,
  type ClinicBillingAccessDb,
} from "@/lib/billing/activation-gate";

const requireClinicAdminMock = vi.hoisted(() => vi.fn());
const updatePracticeSettingsMock = vi.hoisted(() => vi.fn());
const redirectMock = vi.hoisted(() =>
  vi.fn((href: string) => {
    throw new Error(`NEXT_REDIRECT:${href}`);
  })
);
const loaded = vi.hoisted(() => ({
  jsdom: false,
  sanitizer: false,
  storage: false,
}));
const loadedAtImport = vi.hoisted(() => ({
  jsdom: false,
  sanitizer: false,
  storage: false,
}));

vi.mock("next/navigation", () => ({
  redirect: (href: string) => redirectMock(href),
}));

vi.mock("jsdom", () => {
  loaded.jsdom = true;
  loadedAtImport.jsdom = true;
  return {
    JSDOM: class JSDOM {
      constructor() {
        throw new Error("jsdom must not construct during Practice save");
      }
    },
  };
});

vi.mock("@/lib/clinic-assets/sanitize-clinic-logo-svg", () => {
  loaded.sanitizer = true;
  loadedAtImport.sanitizer = true;
  return {
    sanitizeClinicLogoSvg: () => {
      throw new Error("SVG sanitizer must not run during Practice save");
    },
  };
});

vi.mock("@/lib/clinic-assets/get-clinic-asset-storage", () => {
  loaded.storage = true;
  loadedAtImport.storage = true;
  return {
    getClinicAssetStorage: () => {
      throw new Error(
        "Clinic asset storage must not load during Practice save"
      );
    },
  };
});

vi.mock("@/lib/auth/require-clinic-admin", () => ({
  requireClinicAdmin: requireClinicAdminMock,
}));

vi.mock("@/lib/clinic-portal/update-practice-settings", () => ({
  updatePracticeSettings: updatePracticeSettingsMock,
}));

import { savePracticeSettingsAction } from "@/app/(staff)/(clinic-portal)/practice/actions";

const session = {
  user: {
    id: "user_1",
    email: "admin@care-guide.test",
    name: "Demo Admin",
    platformRole: "NONE",
  },
  clinicMembership: {
    membershipId: "membership_1",
    role: ClinicMembershipRole.ADMIN,
    clinic: { id: "clinic_1", name: "Riverside" },
  },
};

function legacyBillingDb(): ClinicBillingAccessDb {
  return {
    clinicEntitlement: {
      findUnique: vi.fn(async () => null),
    },
  };
}

function settingsData(
  overrides: Record<string, string> = {},
  options: { themeToggle?: boolean } = {}
): FormData {
  const data = new FormData();
  const fields = {
    displayName: "Harbor Family Dental",
    logoUrl: "/demo/riverside-mark.svg",
    primaryColor: "#155e75",
    accentColor: "#b45309",
    neutralColor: "#f7f7f5",
    radiusPreset: "MEDIUM",
    instructionTerminology: "AFTERCARE",
    themeMode: "SYSTEM",
    phone: "02 5550 0100",
    contactUrl: "https://www.example.com/contact",
    addressLine1: "1 Harbor Street",
    addressLine2: "",
    city: "Sydney",
    region: "NSW",
    postalCode: "2000",
    emergencyInstructions: "Call the clinic or emergency services.",
    ...overrides,
  };
  for (const [name, value] of Object.entries(fields)) {
    data.set(name, value);
  }
  if (options.themeToggle) {
    data.set("allowPatientThemeToggle", "on");
  }
  return data;
}

describe("savePracticeSettingsAction", () => {
  beforeEach(() => {
    requireClinicAdminMock.mockReset();
    updatePracticeSettingsMock.mockReset();
    requireClinicAdminMock.mockResolvedValue(session);
    updatePracticeSettingsMock.mockResolvedValue(undefined);
    loaded.jsdom = false;
    loaded.sanitizer = false;
    loaded.storage = false;
    redirectMock.mockClear();
  });

  it("imports and saves without loading jsdom, the SVG sanitizer, or clinic object storage", async () => {
    expect(loadedAtImport.jsdom).toBe(false);
    expect(loadedAtImport.sanitizer).toBe(false);
    expect(loadedAtImport.storage).toBe(false);
    const billingDb = legacyBillingDb();
    const result = await savePracticeSettingsAction(
      {},
      settingsData(),
      billingDb
    );
    expect(result).toEqual({ saved: true });
    expect(loaded.jsdom).toBe(false);
    expect(loaded.sanitizer).toBe(false);
    expect(loaded.storage).toBe(false);
    expect(updatePracticeSettingsMock).toHaveBeenCalledWith({
      clinicId: "clinic_1",
      values: expect.objectContaining({
        displayName: "Harbor Family Dental",
      }),
    });
    expect(billingDb.clinicEntitlement.findUnique).toHaveBeenCalledWith({
      where: { clinicId: "clinic_1" },
      select: { entitlementStatus: true, billingStatus: true },
    });
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("saves brand colours without loading jsdom", async () => {
    const result = await savePracticeSettingsAction(
      {},
      settingsData({
        primaryColor: "#0f766e",
        accentColor: "#c2410c",
        neutralColor: "#fafaf9",
        radiusPreset: "SOFT",
      }),
      legacyBillingDb()
    );
    expect(result).toEqual({ saved: true });
    expect(loaded.jsdom).toBe(false);
    expect(loaded.sanitizer).toBe(false);
    expect(loaded.storage).toBe(false);
    expect(updatePracticeSettingsMock).toHaveBeenCalledWith({
      clinicId: "clinic_1",
      values: expect.objectContaining({
        primaryColor: "#0f766e",
        accentColor: "#c2410c",
        neutralColor: "#fafaf9",
        radiusPreset: "SOFT",
      }),
    });
  });

  it("saves contact details without loading jsdom", async () => {
    const result = await savePracticeSettingsAction(
      {},
      settingsData({
        phone: "02 5550 0199",
        contactUrl: "https://www.example.com/help",
        addressLine1: "2 Harbor Street",
        city: "Newcastle",
        region: "NSW",
        postalCode: "2300",
      }),
      legacyBillingDb()
    );
    expect(result).toEqual({ saved: true });
    expect(loaded.jsdom).toBe(false);
    expect(loaded.storage).toBe(false);
    expect(updatePracticeSettingsMock).toHaveBeenCalledWith({
      clinicId: "clinic_1",
      values: expect.objectContaining({
        phone: "02 5550 0199",
        contactUrl: "https://www.example.com/help",
        addressLine1: "2 Harbor Street",
        city: "Newcastle",
      }),
    });
  });

  it("saves presentation settings without loading jsdom", async () => {
    const result = await savePracticeSettingsAction(
      {},
      settingsData(
        {
          instructionTerminology: "POST_TREATMENT",
          themeMode: "DARK",
        },
        { themeToggle: true }
      ),
      legacyBillingDb()
    );
    expect(result).toEqual({ saved: true });
    expect(loaded.jsdom).toBe(false);
    expect(loaded.storage).toBe(false);
    expect(updatePracticeSettingsMock).toHaveBeenCalledWith({
      clinicId: "clinic_1",
      values: expect.objectContaining({
        instructionTerminology: "POST_TREATMENT",
        themeMode: "DARK",
        allowPatientThemeToggle: true,
      }),
    });
  });

  it("saves custom Dark branding when both colours are present", async () => {
    const result = await savePracticeSettingsAction(
      {},
      settingsData({
        useCustomDarkBranding: "on",
        darkPrimaryColor: "#0f172a",
        darkAccentColor: "#fbbf24",
      }),
      legacyBillingDb()
    );
    expect(result).toEqual({ saved: true });
    expect(updatePracticeSettingsMock).toHaveBeenCalledWith({
      clinicId: "clinic_1",
      values: expect.objectContaining({
        useCustomDarkBranding: true,
        darkPrimaryColor: "#0f172a",
        darkAccentColor: "#fbbf24",
      }),
    });
  });

  it("rejects custom Dark branding when a colour is missing", async () => {
    const data = settingsData({
      darkPrimaryColor: "#0f172a",
    });
    data.set("useCustomDarkBranding", "on");
    const result = await savePracticeSettingsAction(
      {},
      data,
      legacyBillingDb()
    );
    expect(result.saved).toBeUndefined();
    expect(result.fieldErrors?.darkAccentColor).toMatch(/Dark accent/i);
    expect(updatePracticeSettingsMock).not.toHaveBeenCalled();
  });

  it("still applies the activation gate before saving", async () => {
    const billingDb: ClinicBillingAccessDb = {
      clinicEntitlement: {
        findUnique: vi.fn(async () => ({
          entitlementStatus: EntitlementStatus.PENDING,
          billingStatus: BillingStatus.OFFER_PREPARED,
        })),
      },
    };
    await expect(
      savePracticeSettingsAction({}, settingsData(), billingDb)
    ).rejects.toThrow(`NEXT_REDIRECT:${BILLING_SETUP_PATH}`);
    expect(updatePracticeSettingsMock).not.toHaveBeenCalled();
    expect(loaded.jsdom).toBe(false);
  });
});
