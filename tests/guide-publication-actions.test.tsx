/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const unpublishMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/app/(staff)/(clinic-portal)/guides/actions", () => ({
  deleteGuideAction: async () => ({}),
  discardGuideDraftChangesAction: async () => ({}),
  publishGuideAction: async () => ({}),
  saveGuideDraftAction: async () => ({}),
  unpublishGuideAction: (previous: unknown, formData: FormData) =>
    unpublishMock(previous, formData),
}));

import { GuideEditor } from "@/app/(staff)/(clinic-portal)/guides/guide-editor";
import { GuideLifecycleActions } from "@/app/(staff)/(clinic-portal)/guides/guide-lifecycle-actions";
import type { PracticeGuideEditorRecord } from "@/lib/clinic-portal/load-practice-guide-editor";
import { PracticeGuideStatus } from "@prisma/client";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe("guide publication actions", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    HTMLDialogElement.prototype.showModal = function showModal() {
      this.open = true;
    };
    HTMLDialogElement.prototype.close = function close() {
      this.open = false;
    };
    unpublishMock.mockReset();
    unpublishMock.mockResolvedValue({});
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  function button(label: string) {
    return [...container.querySelectorAll("button")].find(
      (candidate) => candidate.textContent === label
    ) as HTMLButtonElement | undefined;
  }

  it("shows Unpublish for a published guide and keeps the existing confirmation", async () => {
    await act(async () => {
      root.render(
        <GuideLifecycleActions
          guideId="guide_1"
          lifecycle="published"
          destructiveAction={null}
          canUnpublish
          unpublishPlacement="toolbar"
        />
      );
    });

    expect(button("Unpublish")).toBeTruthy();
    expect(button("Unpublish")?.className).toContain("staffBtnSecondary");
    expect(button("Publish guide")).toBeUndefined();
    expect(container.querySelector('[role="menuitem"]')).toBeNull();
    expect(container.querySelector('[aria-label="More actions"]')).toBeNull();

    await act(async () => {
      button("Unpublish")?.click();
    });
    expect(container.textContent).toContain("Unpublish this guide?");
    expect(button("Unpublish guide")).toBeTruthy();
    expect(button("Unpublish")?.disabled).toBe(false);
  });

  it("shows Unpublishing while the existing unpublish action is pending", async () => {
    const pending = deferred<{ ok: true }>();
    unpublishMock.mockReturnValue(pending.promise);
    await act(async () => {
      root.render(
        <GuideLifecycleActions
          guideId="guide_1"
          lifecycle="published"
          destructiveAction={null}
          canUnpublish
          unpublishPlacement="toolbar"
        />
      );
    });
    await act(async () => {
      button("Unpublish")?.click();
    });
    const confirm = button("Unpublish guide");
    await act(async () => {
      confirm?.click();
    });
    expect(button("Unpublishing…")?.disabled).toBe(true);
    expect(button("Unpublish")).toBeUndefined();

    await act(async () => {
      pending.resolve({ ok: true });
    });
  });

  it("keeps list-menu unpublish labelled Unpublish guide", async () => {
    await act(async () => {
      root.render(
        <GuideLifecycleActions
          guideId="guide_1"
          lifecycle="published"
          destructiveAction={null}
          canUnpublish
        />
      );
    });
    expect(button("Unpublish")).toBeUndefined();
    expect(container.querySelector('[aria-label="More actions"]')).toBeTruthy();
    expect(container.querySelector('[role="menuitem"]')?.textContent).toBe(
      "Unpublish guide"
    );
  });
});

function editorGuide(
  lifecycle: PracticeGuideEditorRecord["lifecycle"]
): PracticeGuideEditorRecord {
  const published = lifecycle !== "draft" && lifecycle !== "unpublished";
  return {
    id: "guide_1",
    clinicId: "clinic_1",
    title: "Socket care",
    publicSlug: "socket-care",
    introduction: "Keep the area clean.",
    status: published
      ? PracticeGuideStatus.PUBLISHED
      : lifecycle === "unpublished"
        ? PracticeGuideStatus.UNPUBLISHED
        : PracticeGuideStatus.DRAFT,
    isEnabled: lifecycle !== "published_disabled" && published,
    isPublished: published,
    hasDraftChanges: lifecycle === "published_draft_changes",
    lifecycle,
    statusLabel: lifecycle,
    template: null,
    adaptedFromTemplate: false,
    downgradeRetainedAt: null,
    downgradeRetentionUntil: null,
    reviewAttestation: null,
    sections: [],
    updatedAt: new Date("2026-10-01T00:00:00.000Z"),
  };
}

describe("guide editor publication labels", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  function button(label: string) {
    const actions = container.querySelector(".staffEditorActions");
    return [...(actions?.querySelectorAll("button") ?? [])].find(
      (candidate) => candidate.textContent === label
    ) as HTMLButtonElement | undefined;
  }

  async function renderEditor(
    lifecycle: PracticeGuideEditorRecord["lifecycle"]
  ) {
    await act(async () => {
      root.render(
        <GuideEditor
          guide={editorGuide(lifecycle)}
          patientUrlExample="https://harbour.riveraftercare.test/socket-care"
          canEdit
        />
      );
    });
  }

  it("groups the title with its lifecycle pill and keeps metadata quieter", async () => {
    await renderEditor("published");
    const identity = container.querySelector(".staffEditorIdentity");
    const title = identity?.querySelector("h1");
    const pill = identity?.querySelector(".staffStatusPill");
    const meta = container.querySelector(".staffEditorToolbarContext");
    const save = container.querySelector(".staffEditorSaveStatus");

    expect(title?.textContent).toBe("Socket care");
    expect(pill?.textContent).toBe("Published");
    expect(identity?.contains(meta ?? null)).toBe(false);
    expect(meta?.textContent).toBe("Custom guide");
    expect(save?.textContent).not.toContain("Saved");
    expect(meta?.contains(save ?? null)).toBe(false);
    expect(save?.querySelector("[data-save-state='saved']")).toBeNull();
  });

  it("offers Publish guide for an unpublished draft", async () => {
    await renderEditor("draft");
    expect(button("Publish guide")).toBeTruthy();
    expect(button("Publish guide")?.disabled).toBe(false);
    expect(button("Unpublish")).toBeUndefined();
    expect(button("Save draft")).toBeTruthy();
  });

  it("offers Unpublish for a published guide and hides Publish guide", async () => {
    await renderEditor("published");
    expect(button("Unpublish")).toBeTruthy();
    expect(button("Unpublish")?.disabled).toBe(false);
    expect(button("Publish guide")).toBeUndefined();
    expect(button("Publishing…")).toBeUndefined();
    expect(button("Unpublishing…")).toBeUndefined();
  });

  it("keeps Publish guide available when a published guide has draft changes", async () => {
    await renderEditor("published_draft_changes");
    expect(button("Publish guide")).toBeTruthy();
    expect(button("Unpublish")).toBeTruthy();
  });
});
