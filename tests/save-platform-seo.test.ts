import { beforeEach, describe, expect, it, vi } from "vitest";

const { settings } = vi.hoisted(() => ({
  settings: {
    upsert: vi.fn(),
  },
}));

const { pages } = vi.hoisted(() => ({
  pages: {
    upsert: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({
  getPrisma: () => ({
    $transaction: async (fn: (tx: unknown) => Promise<void>) =>
      fn({
        platformSeoSettings: settings,
        marketingPageSeo: pages,
      }),
  }),
}));

import { savePlatformSeoSettings } from "@/lib/seo/save-platform-seo";
import {
  DEFAULT_PLATFORM_SEO,
  marketingPageSeoFields,
} from "@/lib/seo/defaults";
import { MARKETING_SEO_PATHS } from "@/lib/seo/types";

describe("savePlatformSeoSettings", () => {
  beforeEach(() => {
    settings.upsert.mockReset();
    pages.upsert.mockReset();
    settings.upsert.mockResolvedValue({});
    pages.upsert.mockResolvedValue({});
  });

  it("does not overwrite defaultOgImagePath on update", async () => {
    await savePlatformSeoSettings({
      identity: {
        siteName: DEFAULT_PLATFORM_SEO.siteName,
        defaultDescription: DEFAULT_PLATFORM_SEO.defaultDescription,
        organizationName: DEFAULT_PLATFORM_SEO.organizationName,
        organizationDescription: DEFAULT_PLATFORM_SEO.organizationDescription,
        publicContactEmail: null,
        defaultOgImagePath:
          "/platform/seo/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png",
        sameAsUrls: [],
      },
      pages: MARKETING_SEO_PATHS.map((path) => ({
        path,
        ...marketingPageSeoFields(path),
        updatedAt: null,
      })),
    });

    const call = settings.upsert.mock.calls[0]?.[0] as {
      create: { defaultOgImagePath: string | null };
      update: Record<string, unknown>;
    };
    expect(call.create.defaultOgImagePath).toBe(
      "/platform/seo/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png"
    );
    expect(call.update).not.toHaveProperty("defaultOgImagePath");
  });
});
