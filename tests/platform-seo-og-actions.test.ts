import { beforeEach, describe, expect, it, vi } from "vitest";

const notFoundMock = vi.hoisted(() => vi.fn());
const redirectMock = vi.hoisted(() => vi.fn());
const getAuthContextMock = vi.hoisted(() => vi.fn());
const uploadMock = vi.hoisted(() => vi.fn());
const removeMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  notFound: notFoundMock,
  redirect: redirectMock,
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  getAuthContext: getAuthContextMock,
  isPlatformOperator: (user: { platformRole?: string } | null | undefined) =>
    user?.platformRole === "OPERATOR",
}));

vi.mock("@/lib/platform-assets/mutate-platform-seo-og", () => ({
  uploadPlatformSeoOgImage: uploadMock,
  removePlatformSeoOgImage: removeMock,
}));

import {
  removePlatformSeoOgImageAction,
  uploadPlatformSeoOgImageAction,
} from "@/app/(staff)/(operator)/operator/seo/actions";
import { pngBytes } from "./helpers/og-image-bytes";

function fileData(): FormData {
  const data = new FormData();
  data.set(
    "ogImage",
    new File([Buffer.from(pngBytes())], "share.png", { type: "image/png" })
  );
  return data;
}

describe("platform SEO OG image actions", () => {
  beforeEach(() => {
    notFoundMock.mockReset();
    redirectMock.mockReset();
    getAuthContextMock.mockReset();
    uploadMock.mockReset();
    removeMock.mockReset();
    notFoundMock.mockImplementation(() => {
      throw new Error("NEXT_HTTP_ERROR_FALLBACK;404");
    });
    redirectMock.mockImplementation(() => {
      throw new Error("NEXT_REDIRECT");
    });
  });

  it("lets an OPERATOR upload", async () => {
    getAuthContextMock.mockResolvedValue({
      user: {
        id: "user_operator",
        email: "operator@care-guide.test",
        name: "Demo Operator",
        platformRole: "OPERATOR",
      },
      clinicMembership: null,
    });
    uploadMock.mockResolvedValue({
      defaultOgImagePath:
        "/platform/seo/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png",
      imageSrc:
        "https://assets.example.test/platform/seo/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png",
    });

    const result = await uploadPlatformSeoOgImageAction({}, fileData());
    expect(result.ok).toBe(true);
    expect(uploadMock).toHaveBeenCalledWith(
      expect.objectContaining({ actorIsPlatformOperator: true })
    );
  });

  it("rejects unauthenticated upload", async () => {
    getAuthContextMock.mockResolvedValue({
      user: null,
      clinicMembership: null,
    });

    await expect(
      uploadPlatformSeoOgImageAction({}, fileData())
    ).rejects.toThrow("NEXT_REDIRECT");
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("rejects clinic ADMIN upload", async () => {
    getAuthContextMock.mockResolvedValue({
      user: {
        id: "user_admin",
        email: "admin@care-guide.test",
        name: "Demo Admin",
        platformRole: "NONE",
      },
      clinicMembership: {
        membershipId: "membership_1",
        role: "ADMIN",
        clinic: { id: "clinic_1", name: "Riverside" },
      },
    });

    await expect(
      uploadPlatformSeoOgImageAction({}, fileData())
    ).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK;404");
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("rejects clinic STAFF upload and remove", async () => {
    getAuthContextMock.mockResolvedValue({
      user: {
        id: "user_staff",
        email: "staff@care-guide.test",
        name: "Demo Staff",
        platformRole: "NONE",
      },
      clinicMembership: {
        membershipId: "membership_2",
        role: "STAFF",
        clinic: { id: "clinic_1", name: "Riverside" },
      },
    });

    await expect(
      uploadPlatformSeoOgImageAction({}, fileData())
    ).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK;404");
    await expect(
      removePlatformSeoOgImageAction({}, new FormData())
    ).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK;404");
    expect(uploadMock).not.toHaveBeenCalled();
    expect(removeMock).not.toHaveBeenCalled();
  });
});
