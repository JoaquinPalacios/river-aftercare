import { expect, test, type Locator, type Page } from "@playwright/test";

import { expectNoSeriousAxeViolations } from "./helpers/axe";
import {
  expectNoHorizontalOverflow,
  relativeLuminance,
} from "./helpers/layout";
import { marketingUrl } from "./helpers/origins";

async function waitForPhoneFrame(page: Page): Promise<void> {
  const frame = page.locator('[class*="phoneFrame"]');
  await expect(frame).toHaveCount(1);
  await expect
    .poll(async () =>
      frame.evaluate((element) => {
        return (
          element instanceof HTMLImageElement &&
          element.complete &&
          element.naturalWidth > 0
        );
      })
    )
    .toBe(true);
}

async function waitForHeroReveal(page: Page): Promise<void> {
  await expect
    .poll(async () =>
      page.evaluate(() => {
        if (
          document.documentElement.getAttribute("data-mk-motion") !== "enhance"
        ) {
          return true;
        }

        const reveals = [
          ...document.querySelectorAll<HTMLElement>(
            '[data-mk-chapter="hero"] .mkReveal'
          ),
        ];
        return (
          reveals.length > 0 &&
          reveals.every((element) => getComputedStyle(element).opacity === "1")
        );
      })
    )
    .toBe(true);
  await waitForPhoneFrame(page);
}

async function showMarketingScheme(
  page: Page,
  scheme: "light" | "dark"
): Promise<void> {
  await page.emulateMedia({ colorScheme: scheme });
  await page.evaluate((mode) => {
    try {
      window.localStorage.setItem("aftercare-guide-marketing-theme", mode);
    } catch {
      // Ignore storage failures in restricted contexts.
    }
    document.documentElement.setAttribute("data-theme-mode", mode);
  }, scheme);
}

async function showStaticScheme(
  page: Page,
  scheme: "light" | "dark"
): Promise<void> {
  await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
  await page.evaluate((mode) => {
    try {
      window.localStorage.setItem("aftercare-guide-marketing-theme", mode);
    } catch {
      // Ignore storage failures in restricted contexts.
    }
    document.documentElement.setAttribute("data-theme-mode", mode);
    document.documentElement.setAttribute("data-mk-motion", "reduce");
  }, scheme);
}

async function scrollSectionIntoView(
  page: Page,
  selector: string
): Promise<void> {
  await page.evaluate((target) => {
    const element = document.querySelector(target);
    if (!(element instanceof HTMLElement)) {
      return;
    }
    const header = document.querySelector("header");
    const headerHeight =
      header instanceof HTMLElement
        ? header.getBoundingClientRect().height
        : 64;
    const top = element.getBoundingClientRect().top + window.scrollY;
    window.scrollTo({
      top: Math.max(0, top - headerHeight - 12),
      behavior: "instant",
    });
  }, selector);
  await expect
    .poll(async () => {
      const box = await page
        .locator(selector)
        .locator("h2, h3")
        .first()
        .boundingBox();
      return box?.y ?? -1;
    })
    .toBeGreaterThan(48);
}

async function placeTopFromViewportBottom(
  page: Page,
  selector: string,
  fromBottom: number
): Promise<void> {
  await page.evaluate(
    ({ target, fromBottom: offset }) => {
      const element = document.querySelector(target);
      if (!(element instanceof HTMLElement)) {
        return;
      }
      const top = element.getBoundingClientRect().top + window.scrollY;
      window.scrollTo({
        top: Math.max(0, top - (window.innerHeight - offset)),
        behavior: "instant",
      });
    },
    { target: selector, fromBottom }
  );
}

async function waitForRevealedMotion(root: Locator): Promise<void> {
  await expect
    .poll(async () =>
      root.evaluate((element) => {
        if (
          document.documentElement.getAttribute("data-mk-motion") !== "enhance"
        ) {
          return true;
        }
        const nodes = [
          ...element.querySelectorAll<HTMLElement>(".mkReveal"),
        ].filter((node) => {
          const rect = node.getBoundingClientRect();
          return rect.bottom > 80 && rect.top < window.innerHeight - 200;
        });
        return (
          nodes.length > 0 &&
          nodes.every(
            (node) =>
              getComputedStyle(node).opacity === "1" &&
              !node.hasAttribute("data-mk-pending")
          )
        );
      })
    )
    .toBe(true);
}

async function waitForSectionReveal(root: Locator): Promise<void> {
  await expect
    .poll(async () =>
      root.evaluate((element) => {
        if (
          document.documentElement.getAttribute("data-mk-motion") !== "enhance"
        ) {
          return true;
        }
        const section = element.querySelector("[data-mk-section]");
        if (!section?.hasAttribute("data-mk-entered")) {
          return false;
        }
        const reveals = [
          ...section.querySelectorAll<HTMLElement>(".mkReveal"),
        ].filter((node) => {
          if (node.hasAttribute("data-mk-entered")) {
            return true;
          }
          const rect = node.getBoundingClientRect();
          const inset = window.innerWidth >= 1024 ? 200 : 80;
          return rect.bottom > 0 && rect.top < window.innerHeight - inset + 8;
        });
        return (
          reveals.length > 0 &&
          reveals.every((node) => {
            const styles = getComputedStyle(node);
            const transform = styles.transform;
            const translateY =
              transform === "none"
                ? 0
                : Number(transform.split(", ").at(5)?.replace(")", "") ?? 0);
            return (
              styles.opacity === "1" &&
              Math.abs(translateY) < 0.75 &&
              !node.hasAttribute("data-mk-pending")
            );
          })
        );
      })
    )
    .toBe(true);
}

async function openThemeMenu(page: Page) {
  const trigger = page.getByRole("button", { name: /Change colour theme/ });
  await trigger.click();
  const menu = page.getByRole("menu", { name: "Colour theme" });
  await expect(menu).toBeVisible();
  return { trigger, menu };
}

test.describe("Phase 1F.11 story clarity", () => {
  test("theme popover is compact, anchored, and labelled in light and dark", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(marketingUrl("/"), { waitUntil: "load" });
    await waitForHeroReveal(page);

    const { trigger, menu } = await openThemeMenu(page);
    await expect(
      page.getByRole("menuitemradio", { name: "System" })
    ).toHaveAttribute("aria-checked", "true");

    const lightMetrics = await page.evaluate(() => {
      const button = document.querySelector<HTMLElement>(".mtcBtn");
      const popover = document.querySelector<HTMLElement>(".mtcMenu");
      const selected = popover?.querySelector<HTMLElement>(
        '[aria-checked="true"]'
      );
      if (!button || !popover || !selected) {
        return null;
      }
      const triggerBox = button.getBoundingClientRect();
      const menuBox = popover.getBoundingClientRect();
      const selectedBg = getComputedStyle(selected).backgroundColor;
      return {
        width: Math.round(menuBox.width),
        height: Math.round(menuBox.height),
        rowHeight: Math.round(selected.getBoundingClientRect().height),
        gap: Math.round(menuBox.top - triggerBox.bottom),
        rightDelta: Math.round(Math.abs(menuBox.right - triggerBox.right)),
        radius: getComputedStyle(popover).borderRadius,
        selectedBg,
        insideViewport:
          menuBox.left >= 0 && menuBox.right <= window.innerWidth + 1,
      };
    });

    expect(lightMetrics).not.toBeNull();
    expect(lightMetrics!.width).toBeGreaterThanOrEqual(152);
    expect(lightMetrics!.width).toBeLessThanOrEqual(176);
    expect(lightMetrics!.rowHeight).toBeGreaterThanOrEqual(36);
    expect(lightMetrics!.rowHeight).toBeLessThanOrEqual(42);
    expect(lightMetrics!.gap).toBeGreaterThanOrEqual(4);
    expect(lightMetrics!.gap).toBeLessThanOrEqual(18);
    expect(lightMetrics!.rightDelta).toBeLessThanOrEqual(12);
    expect(lightMetrics!.insideViewport).toBe(true);
    expect(lightMetrics!.selectedBg).not.toMatch(/rgb\(\s*0,\s*0,\s*0/);
    await page.screenshot({
      path: "test-results/artifacts/phase-1f10-theme-popover-1440-light.png",
    });

    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);

    await showMarketingScheme(page, "dark");
    await trigger.click();
    await expect(
      page.getByRole("menu", { name: "Colour theme" })
    ).toBeVisible();
    await page.screenshot({
      path: "test-results/artifacts/phase-1f10-theme-popover-1440-dark.png",
    });

    await page.locator("body").click({ position: { x: 24, y: 240 } });
    await expect(page.getByRole("menu", { name: "Colour theme" })).toHaveCount(
      0
    );

    await page.setViewportSize({ width: 390, height: 844 });
    await showMarketingScheme(page, "light");
    await page.getByRole("button", { name: "Site menu" }).click();
    await expect(page.getByRole("radio", { name: "Light" })).toBeVisible();
    const mobilePanel = page.locator("[class*='navMenuPanel']");
    await expect(mobilePanel).toBeVisible();
    const mobileBox = await mobilePanel.boundingBox();
    expect(mobileBox).not.toBeNull();
    expect(mobileBox!.x).toBeGreaterThanOrEqual(0);
    expect(mobileBox!.x + mobileBox!.width).toBeLessThanOrEqual(391);
    await page.screenshot({
      path: "test-results/artifacts/phase-1f10-theme-popover-390-light.png",
    });
  });

  test("how-it-works is a connected semantic journey on desktop and mobile", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "light" });
    await page.goto(marketingUrl("/"), { waitUntil: "load" });
    await showStaticScheme(page, "light");
    await waitForHeroReveal(page);

    const section = page.locator("#how-it-works");
    await scrollSectionIntoView(page, "#how-it-works");
    await waitForSectionReveal(section);
    await waitForRevealedMotion(section);
    await expect
      .poll(async () => {
        const railBox = await section
          .locator("[data-mk-process-rail]")
          .boundingBox();
        return railBox?.width ?? 0;
      })
      .toBeGreaterThan(100);
    const steps = section.getByRole("listitem");
    await expect(steps).toHaveCount(4);
    await expect(section.locator("ol")).toHaveCount(1);
    await expect(
      section.getByRole("heading", { name: "Prepare the right guidance" })
    ).toBeVisible();
    await expect(
      section.getByRole("heading", { name: "Apply your clinic brand" })
    ).toBeVisible();
    await expect(
      section.getByRole("heading", { name: "Share by link or QR code" })
    ).toBeVisible();
    await expect(
      section.getByRole("heading", {
        name: "Patients return when they need it",
      })
    ).toBeVisible();
    await expect(section.getByText("Step 1")).toBeVisible();
    await expect(section.locator("[data-mk-process-rail]")).toHaveAttribute(
      "aria-hidden",
      "true"
    );
    await expect(section.getByRole("progressbar")).toHaveCount(0);
    await expect(section.getByRole("tab")).toHaveCount(0);

    const desktopLayout = await section.evaluate((root) => {
      const list = root.querySelector("ol");
      const items = [...root.querySelectorAll("li")];
      const rail = root.querySelector("[data-mk-process-rail]");
      const nodes = [
        ...root.querySelectorAll('[class*="processNode"]'),
      ] as HTMLElement[];
      const cards = [
        ...root.querySelectorAll('[class*="processCard"]'),
      ] as HTMLElement[];
      const labels = [
        ...root.querySelectorAll('[class*="processIndex"]'),
      ] as HTMLElement[];
      const titles = [...root.querySelectorAll("h3")] as HTMLElement[];
      if (!list || !rail || items.length !== 4 || nodes.length !== 4) {
        return null;
      }
      const listStyles = getComputedStyle(list);
      const railBox = rail.getBoundingClientRect();
      const first = items[0].getBoundingClientRect();
      const second = items[1].getBoundingClientRect();
      const firstNode = nodes[0].getBoundingClientRect();
      const lastNode = nodes[3].getBoundingClientRect();
      const cardHeights = cards.map((card) =>
        Math.round(card.getBoundingClientRect().height)
      );
      const labelTops = labels.map((label) =>
        Math.round(label.getBoundingClientRect().top)
      );
      const titleTops = titles.map((title) =>
        Math.round(title.getBoundingClientRect().top)
      );
      const cardCursor = cards[0]
        ? getComputedStyle(cards[0]).cursor
        : "unknown";
      const firstCenter = firstNode.left + firstNode.width / 2;
      const lastCenter = lastNode.left + lastNode.width / 2;
      return {
        columns: listStyles.gridTemplateColumns.split(" ").length,
        horizontal: second.left > first.right - 8,
        railWidth: Math.round(railBox.width),
        railHeight: Math.round(railBox.height),
        firstDelta: Math.round(firstCenter - railBox.left),
        lastDelta: Math.round(lastCenter - railBox.right),
        firstNodeOnRail: Math.abs(firstCenter - railBox.left) <= 10,
        lastNodeOnRail: Math.abs(lastCenter - railBox.right) <= 10,
        nodesOnRailY: nodes.every((node) => {
          const box = node.getBoundingClientRect();
          return (
            Math.abs(
              box.top + box.height / 2 - (railBox.top + railBox.height / 2)
            ) <= 8
          );
        }),
        cardHeightSpread: Math.max(...cardHeights) - Math.min(...cardHeights),
        labelSpread: Math.max(...labelTops) - Math.min(...labelTops),
        titleSpread: Math.max(...titleTops) - Math.min(...titleTops),
        cardCursor,
      };
    });

    expect(desktopLayout).not.toBeNull();
    expect(desktopLayout!.columns).toBe(4);
    expect(desktopLayout!.horizontal).toBe(true);
    expect(desktopLayout!.railWidth).toBeGreaterThan(desktopLayout!.railHeight);
    expect(
      desktopLayout!.firstNodeOnRail,
      `first node delta ${desktopLayout!.firstDelta}px`
    ).toBe(true);
    expect(
      desktopLayout!.lastNodeOnRail,
      `last node delta ${desktopLayout!.lastDelta}px`
    ).toBe(true);
    expect(desktopLayout!.nodesOnRailY).toBe(true);
    expect(desktopLayout!.cardHeightSpread).toBeLessThanOrEqual(2);
    expect(desktopLayout!.labelSpread).toBeLessThanOrEqual(2);
    expect(desktopLayout!.titleSpread).toBeLessThanOrEqual(2);
    expect(desktopLayout!.cardCursor).not.toBe("pointer");
    await expect(section.locator("[data-mk-process-connector]")).toHaveCount(3);
    await expect
      .poll(async () =>
        section
          .locator("[data-mk-process-connector]")
          .evaluateAll((nodes) =>
            nodes.every((node) => getComputedStyle(node).display === "none")
          )
      )
      .toBe(true);

    const firstCard = section.locator("[data-mk-process-card]").first();
    const restTransform = await firstCard.evaluate(
      (element) => getComputedStyle(element).transform
    );
    await firstCard.hover();
    const hoverTransform = await firstCard.evaluate(
      (element) => getComputedStyle(element).transform
    );
    expect(hoverTransform).toBe(restTransform);

    await section.screenshot({
      path: "test-results/artifacts/phase-1f11-process-1440-light.png",
    });
    await section.screenshot({
      path: "test-results/artifacts/phase-1f12-process-1440-light.png",
    });
    await section.screenshot({
      path: "test-results/artifacts/phase-1f15-process-1440-light.png",
    });

    await showStaticScheme(page, "dark");
    await waitForSectionReveal(section);
    await section.screenshot({
      path: "test-results/artifacts/phase-1f11-process-1440-dark.png",
    });

    await page.setViewportSize({ width: 1280, height: 800 });
    await showStaticScheme(page, "light");
    await scrollSectionIntoView(page, "#how-it-works");
    await waitForSectionReveal(section);
    await section.screenshot({
      path: "test-results/artifacts/phase-1f11-process-1280-light.png",
    });
    const layout1280 = await section.evaluate((root) => {
      const cards = [
        ...root.querySelectorAll('[class*="processCard"]'),
      ] as HTMLElement[];
      const labels = [
        ...root.querySelectorAll('[class*="processIndex"]'),
      ] as HTMLElement[];
      const titles = [...root.querySelectorAll("h3")] as HTMLElement[];
      const heights = cards.map((card) =>
        Math.round(card.getBoundingClientRect().height)
      );
      const labelTops = labels.map((label) =>
        Math.round(label.getBoundingClientRect().top)
      );
      const titleTops = titles.map((title) =>
        Math.round(title.getBoundingClientRect().top)
      );
      return {
        cardHeightSpread: Math.max(...heights) - Math.min(...heights),
        labelSpread: Math.max(...labelTops) - Math.min(...labelTops),
        titleSpread: Math.max(...titleTops) - Math.min(...titleTops),
      };
    });
    expect(layout1280.cardHeightSpread).toBeLessThanOrEqual(2);
    expect(layout1280.labelSpread).toBeLessThanOrEqual(2);
    expect(layout1280.titleSpread).toBeLessThanOrEqual(2);

    await page.setViewportSize({ width: 390, height: 844 });
    await showStaticScheme(page, "light");
    await scrollSectionIntoView(page, "#how-it-works");
    await waitForSectionReveal(section);
    await expect(section.getByText("Step 1")).toBeVisible();
    await expect(
      section.locator('[class*="processNode"]').first()
    ).toBeHidden();
    await expect(section.locator("[data-mk-process-connector]")).toHaveCount(3);
    const mobileLayout = await section.evaluate((root) => {
      const items = [...root.querySelectorAll("li")];
      const rail = root.querySelector("[data-mk-process-rail]");
      const cards = [
        ...root.querySelectorAll('[class*="processCard"]'),
      ] as HTMLElement[];
      const connectors = [
        ...root.querySelectorAll("[data-mk-process-connector]"),
      ] as HTMLElement[];
      const nodes = [
        ...root.querySelectorAll('[class*="processNode"]'),
      ] as HTMLElement[];
      if (items.length !== 4 || !rail || cards.length !== 4) {
        return null;
      }
      const first = items[0].getBoundingClientRect();
      const second = items[1].getBoundingClientRect();
      const inner = (root.querySelector('[class*="inner"]') ??
        root) as HTMLElement;
      const innerBox = inner.getBoundingClientRect();
      const cardBoxes = cards.map((card) => card.getBoundingClientRect());
      const gaps = cardBoxes
        .slice(0, -1)
        .map((box, index) => Math.round(cardBoxes[index + 1].top - box.bottom));
      return {
        stacked: second.top > first.bottom - 8,
        railDisplay: getComputedStyle(rail).display,
        connectorDisplay: connectors.map(
          (node) => getComputedStyle(node).display
        ),
        nodeBoxes: nodes.map((node) => node.getClientRects().length),
        minCardWidthShare: Math.min(
          ...cardBoxes.map((box) => box.width / innerBox.width)
        ),
        maxGap: Math.max(...gaps),
        minGap: Math.min(...gaps),
        overlaps: cardBoxes.some((box, index) => {
          const next = cardBoxes[index + 1];
          return Boolean(next && box.bottom > next.top + 1);
        }),
        flexGrow: cards.map((card) => getComputedStyle(card).flexGrow),
      };
    });
    expect(mobileLayout).not.toBeNull();
    expect(mobileLayout!.stacked).toBe(true);
    expect(mobileLayout!.railDisplay).toBe("none");
    expect(mobileLayout!.connectorDisplay).toEqual(["flex", "flex", "flex"]);
    expect(mobileLayout!.nodeBoxes.every((count) => count === 0)).toBe(true);
    expect(mobileLayout!.minCardWidthShare).toBeGreaterThan(0.92);
    expect(mobileLayout!.overlaps).toBe(false);
    expect(mobileLayout!.maxGap).toBeLessThan(40);
    expect(mobileLayout!.minGap).toBeGreaterThan(8);
    expect(mobileLayout!.flexGrow.every((value) => value === "0")).toBe(true);
    await expectNoHorizontalOverflow(page);
    await section.screenshot({
      path: "test-results/artifacts/phase-1f11-process-390-light.png",
    });
    await section.screenshot({
      path: "test-results/artifacts/phase-1f15-process-390-light.png",
    });

    await showStaticScheme(page, "dark");
    await waitForSectionReveal(section);
    await section.screenshot({
      path: "test-results/artifacts/phase-1f11-process-390-dark.png",
    });
    await section.screenshot({
      path: "test-results/artifacts/phase-1f15-process-390-dark.png",
    });
  });

  test("why-clinics uses three benefit pillars and a customisation strip", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(marketingUrl("/"), { waitUntil: "load" });
    await showStaticScheme(page, "light");
    await waitForHeroReveal(page);

    const section = page.locator('[aria-labelledby="why-heading"]');
    await scrollSectionIntoView(page, '[aria-labelledby="why-heading"]');
    await waitForSectionReveal(section);
    const cards = section.locator("[data-mk-pillar]");
    await expect(cards).toHaveCount(3);
    await expect(section.locator("[data-mk-bento-card]")).toHaveCount(0);
    await expect(
      section.getByRole("heading", { name: "Looks like your clinic" })
    ).toBeVisible();
    await expect(
      section.getByRole("heading", { name: "Easy for patients to revisit" })
    ).toBeVisible();
    await expect(
      section.getByRole("heading", { name: "Simple for your team" })
    ).toBeVisible();
    await expect(
      section.getByText("Your clinic name, colours and terminology stay front")
    ).toBeVisible();
    await expect(section.getByText("Controlled brand choices")).toBeVisible();
    await expect(section.getByText("Clinic-first presentation")).toBeVisible();
    await expect(
      section.getByText("Give patients one clear place to return to")
    ).toBeVisible();
    await expect(section.getByText("Durable link")).toBeVisible();
    await expect(section.getByText("Clinic contact nearby")).toBeVisible();
    await expect(
      section.getByText(
        "Publish approved guidance without rebuilding a page every time."
      )
    ).toBeVisible();
    await expect(section.getByText("Reusable guides")).toBeVisible();
    await expect(section.getByText("Consistent presentation")).toBeVisible();
    await expect(section.getByText("not a generic platform shell")).toHaveCount(
      0
    );
    await expect(
      section.getByText(
        "Keep approved content consistent across every published guide."
      )
    ).toHaveCount(0);
    const pointCounts = await section.evaluate((root) =>
      [...root.querySelectorAll("[data-mk-pillar]")].map(
        (card) => card.querySelectorAll("li").length
      )
    );
    expect(pointCounts).toEqual([2, 3, 3]);
    await expect(
      section.getByRole("heading", { name: "Controlled publishing" })
    ).toBeVisible();
    await expect(
      section.getByText("Riverside Dental", { exact: true })
    ).toBeVisible();
    await expect(
      section.getByText("riverside.[your-domain]/extraction")
    ).toBeVisible();
    await expect(section.getByText("Call the practice →")).toBeVisible();
    await expect(
      section.getByText("More templates at onboarding")
    ).toBeVisible();
    await expect(section.getByText("Custom clinic guides")).toBeVisible();
    await expect(section.getByText("Dental Implant")).toHaveCount(0);
    await expect(section.getByText("Root Canal")).toHaveCount(0);
    await expect(
      section.getByRole("link", { name: "Tooth Extraction" })
    ).toHaveCount(0);
    await expect(
      section.getByRole("heading", { name: "Tooth Extraction" })
    ).toHaveCount(0);

    const desktopLayout = await section.evaluate((root) => {
      const nodes = [...root.querySelectorAll<HTMLElement>("[data-mk-pillar]")];
      const grid = root.querySelector(
        "[data-mk-pillars] [class*='pillarGrid']"
      );
      if (!grid || nodes.length !== 3) {
        return null;
      }
      const widths = nodes.map((node) =>
        Math.round(node.getBoundingClientRect().width)
      );
      const heights = nodes.map((node) =>
        Math.round(node.getBoundingClientRect().height)
      );
      const cursors = nodes.map((node) => getComputedStyle(node).cursor);
      return {
        columns: getComputedStyle(grid).gridTemplateColumns.split(" ").length,
        widthSpread: Math.max(...widths) - Math.min(...widths),
        heightSpread: Math.max(...heights) - Math.min(...heights),
        pointerCards: cursors.filter((cursor) => cursor === "pointer").length,
      };
    });
    expect(desktopLayout).not.toBeNull();
    expect(desktopLayout!.columns).toBe(3);
    expect(desktopLayout!.widthSpread).toBeLessThanOrEqual(4);
    expect(desktopLayout!.pointerCards).toBe(0);

    const stripLayout = await section.evaluate((root) => {
      const strip = root.querySelector("[data-mk-custom-strip]");
      if (!(strip instanceof HTMLElement)) {
        return null;
      }
      const columns = getComputedStyle(strip).gridTemplateColumns.split(" ");
      const groups = [...strip.children] as HTMLElement[];
      if (groups.length !== 4) {
        return null;
      }
      const widths = groups.map((node) =>
        Math.round(node.getBoundingClientRect().width)
      );
      const centers = groups.map((node) => {
        const box = node.getBoundingClientRect();
        const stripBox = strip.getBoundingClientRect();
        return Math.abs(
          box.top + box.height / 2 - (stripBox.top + stripBox.height / 2)
        );
      });
      return {
        columns: columns.length,
        introWidest: widths[0] > widths[1] && widths[0] > widths[2],
        usesStrip: strip.getBoundingClientRect().width > 900,
        verticalBalance: Math.max(...centers) <= 12,
      };
    });
    expect(stripLayout).not.toBeNull();
    expect(stripLayout!.columns).toBe(4);
    expect(stripLayout!.introWidest).toBe(true);
    expect(stripLayout!.usesStrip).toBe(true);
    expect(stripLayout!.verticalBalance).toBe(true);
    await expect(section.getByText("Brand", { exact: true })).toBeVisible();
    await expect(section.getByText("Corners", { exact: true })).toBeVisible();
    await expect(
      section.getByText("Appearance", { exact: true })
    ).toBeVisible();

    await section.screenshot({
      path: "test-results/artifacts/phase-1f12-pillars-1440-light.png",
    });
    await section.screenshot({
      path: "test-results/artifacts/phase-1f15-pillars-1440-light.png",
    });

    await showStaticScheme(page, "dark");
    await waitForSectionReveal(section);
    await section.screenshot({
      path: "test-results/artifacts/phase-1f12-pillars-1440-dark.png",
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await showStaticScheme(page, "light");
    await scrollSectionIntoView(page, '[aria-labelledby="why-heading"]');
    await waitForSectionReveal(section);
    const mobileLayout = await section.evaluate((root) => {
      const grid = root.querySelector("[class*='pillarGrid']");
      const nodes = [...root.querySelectorAll<HTMLElement>("[data-mk-pillar]")];
      if (!grid || nodes.length !== 3) {
        return null;
      }
      const first = nodes[0].getBoundingClientRect();
      const second = nodes[1].getBoundingClientRect();
      return {
        columns: getComputedStyle(grid).gridTemplateColumns.split(" ").length,
        stacked: second.top > first.bottom - 8,
      };
    });
    expect(mobileLayout).not.toBeNull();
    expect(mobileLayout!.columns).toBe(1);
    expect(mobileLayout!.stacked).toBe(true);
    await expectNoHorizontalOverflow(page);
    await section.screenshot({
      path: "test-results/artifacts/phase-1f12-pillars-390-light.png",
    });
    await section.screenshot({
      path: "test-results/artifacts/phase-1f15-pillars-390-light.png",
    });

    await showStaticScheme(page, "dark");
    await waitForSectionReveal(section);
    await section.screenshot({
      path: "test-results/artifacts/phase-1f12-pillars-390-dark.png",
    });
    await section.screenshot({
      path: "test-results/artifacts/phase-1f15-pillars-390-dark.png",
    });
  });

  test("problem and product stay editorial with a product equation", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(marketingUrl("/"), { waitUntil: "load" });
    await showStaticScheme(page, "light");
    await waitForHeroReveal(page);

    const problem = page.locator('[aria-labelledby="problem-heading"]');
    await scrollSectionIntoView(page, '[aria-labelledby="problem-heading"]');
    await waitForSectionReveal(problem);
    await expect(
      problem.getByRole("heading", {
        name: "Patients leave with instructions. They don't always leave with clarity.",
      })
    ).toBeVisible();
    await expect(problem.getByText("01")).toBeVisible();
    await expect(problem.getByText("02")).toBeVisible();
    await expect(problem.getByText("03")).toBeVisible();
    await expect(problem.locator("ol li")).toHaveCount(3);
    await expect(
      problem.getByText("Verbal advice is easy to forget")
    ).toBeVisible();
    await expect(
      problem.getByText("PDFs can be awkward to reopen")
    ).toBeVisible();
    await expect(
      problem.getByText("Generic handouts can feel disconnected")
    ).toBeVisible();

    const product = page.locator('[aria-labelledby="product-heading"]');
    await expect(
      product.getByRole("heading", {
        name: "A branded patient aftercare home that stays available.",
      })
    ).toBeVisible();
    await expect(product.getByText("Approved guide")).toBeVisible();
    await expect(product.getByText("Clinic brand")).toBeVisible();
    await expect(product.locator("[data-mk-product-canvas]")).toHaveAttribute(
      "aria-hidden",
      "true"
    );
    await expect(
      product.locator("[data-mk-product-canvas]").getByText("Riverside Dental")
    ).toHaveCount(2);
    await expect(
      product.locator("[data-mk-product-canvas]").getByText("Tooth Extraction")
    ).toBeVisible();
    await expect(
      product.getByRole("link", { name: "Tooth Extraction" })
    ).toHaveCount(0);

    const productOrder = await product.evaluate((root) => {
      const copy = root.querySelector("[data-mk-product-copy]");
      const visual = root.querySelector("[data-mk-product-visual]");
      const canvas = root.querySelector("[data-mk-product-canvas]");
      if (
        !(copy instanceof HTMLElement) ||
        !(visual instanceof HTMLElement) ||
        !(canvas instanceof HTMLElement)
      ) {
        return null;
      }
      const copyBox = copy.getBoundingClientRect();
      const visualBox = visual.getBoundingClientRect();
      return {
        copyBeforeCanvas:
          copy.compareDocumentPosition(canvas) &
          Node.DOCUMENT_POSITION_FOLLOWING,
        visualLeftOfCopy: visualBox.right < copyBox.left + 24,
        copyRightOfVisual: copyBox.left > visualBox.right - 24,
        visualWidth: Math.round(visualBox.width),
        visualHeight: Math.round(visualBox.height),
        canvasWidth: Math.round(canvas.getBoundingClientRect().width),
        canvasHeight: Math.round(canvas.getBoundingClientRect().height),
      };
    });
    expect(productOrder).not.toBeNull();
    expect(productOrder!.copyBeforeCanvas).toBeTruthy();
    expect(productOrder!.visualLeftOfCopy).toBe(true);
    expect(productOrder!.copyRightOfVisual).toBe(true);
    expect(productOrder!.visualWidth).toBeGreaterThan(280);
    expect(productOrder!.visualHeight).toBeGreaterThan(280);
    expect(productOrder!.canvasWidth).toBeGreaterThan(280);
    expect(productOrder!.canvasHeight).toBeGreaterThan(280);

    const problemLayout = await problem.evaluate((root) => {
      const eyebrow = root.querySelector('[class*="eyebrow"]');
      const heading = root.querySelector("h2");
      const firstItem = root.querySelector("ol li");
      if (!eyebrow || !heading || !firstItem) {
        return null;
      }
      const eyebrowBox = eyebrow.getBoundingClientRect();
      const headingBox = heading.getBoundingClientRect();
      const itemBox = firstItem.getBoundingClientRect();
      return {
        headingBelowEyebrow: headingBox.top > eyebrowBox.bottom - 2,
        itemAlignsWithHeading: Math.abs(itemBox.top - headingBox.top) <= 12,
        itemNotWithEyebrow: itemBox.top > eyebrowBox.bottom + 8,
      };
    });
    expect(problemLayout).not.toBeNull();
    expect(problemLayout!.headingBelowEyebrow).toBe(true);
    expect(problemLayout!.itemAlignsWithHeading).toBe(true);
    expect(problemLayout!.itemNotWithEyebrow).toBe(true);

    await page.screenshot({
      path: "test-results/artifacts/phase-1f12-problem-product-1440-light.png",
    });
    await scrollSectionIntoView(page, '[aria-labelledby="product-heading"]');
    await waitForSectionReveal(product);
    await product.locator('[class*="productGrid"]').screenshot({
      path: "test-results/artifacts/phase-1f15-product-1440-light.png",
    });
    await showStaticScheme(page, "dark");
    await page.screenshot({
      path: "test-results/artifacts/phase-1f12-problem-product-1440-dark.png",
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await showStaticScheme(page, "light");
    await scrollSectionIntoView(page, '[aria-labelledby="problem-heading"]');
    await waitForSectionReveal(problem);
    const mobileProblem = await problem.evaluate((root) => {
      const heading = root.querySelector("h2");
      const firstItem = root.querySelector("ol li");
      if (!heading || !firstItem) {
        return null;
      }
      return (
        firstItem.getBoundingClientRect().top >
        heading.getBoundingClientRect().bottom - 4
      );
    });
    expect(mobileProblem).toBe(true);
    await scrollSectionIntoView(page, '[aria-labelledby="product-heading"]');
    await waitForSectionReveal(product);
    const mobileProduct = await product.evaluate((root) => {
      const copy = root.querySelector("[data-mk-product-copy]");
      const visual = root.querySelector("[data-mk-product-visual]");
      if (!(copy instanceof HTMLElement) || !(visual instanceof HTMLElement)) {
        return null;
      }
      const copyBox = copy.getBoundingClientRect();
      const visualBox = visual.getBoundingClientRect();
      return {
        copyAboveVisual: visualBox.top > copyBox.bottom - 4,
        gap: Math.round(visualBox.top - copyBox.bottom),
      };
    });
    expect(mobileProduct).not.toBeNull();
    expect(mobileProduct!.copyAboveVisual).toBe(true);
    expect(mobileProduct!.gap).toBeGreaterThanOrEqual(16);
    expect(mobileProduct!.gap).toBeLessThanOrEqual(48);
    await expectNoHorizontalOverflow(page);
    await problem.screenshot({
      path: "test-results/artifacts/phase-1f12-problem-390-light.png",
    });
    await product.screenshot({
      path: "test-results/artifacts/phase-1f12-product-390-light.png",
    });
    await product.screenshot({
      path: "test-results/artifacts/phase-1f15-product-390-light.png",
    });
    await showStaticScheme(page, "dark");
    await problem.screenshot({
      path: "test-results/artifacts/phase-1f12-problem-390-dark.png",
    });
    await product.screenshot({
      path: "test-results/artifacts/phase-1f12-product-390-dark.png",
    });
    await product.screenshot({
      path: "test-results/artifacts/phase-1f15-product-390-dark.png",
    });
  });

  test("closing CTA is compact and leads to contact", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(marketingUrl("/"), { waitUntil: "load" });
    await showStaticScheme(page, "light");
    await waitForHeroReveal(page);
    await scrollSectionIntoView(page, "#see-it");

    const section = page.locator("#see-it");
    await expect(
      section.getByRole("heading", {
        name: "Bring your aftercare online.",
      })
    ).toBeVisible();
    await expect(section.getByText("Get started")).toBeVisible();
    await expect(
      section.getByText(
        "Tell us how your clinic currently shares treatment, recovery or home-care guidance."
      )
    ).toBeVisible();
    await expect(
      section.getByRole("link", { name: "Request a demo" })
    ).toHaveAttribute("href", "/contact");
    await waitForSectionReveal(section);
    await expect(page.getByText("Early access")).toHaveCount(0);
    await expect(page.getByText("Design partner")).toHaveCount(0);
    await expect(page.getByText("early development")).toHaveCount(0);
    await expect(page.locator("#early-access")).toHaveCount(0);
    await expect(
      section.getByRole("link", { name: "Open staff sign in" })
    ).toHaveCount(0);
    await expect(
      section.getByRole("link", { name: "Staff sign in" })
    ).toHaveCount(0);
    await expect(
      section.getByRole("link", { name: "Request access" })
    ).toHaveCount(0);

    const headerStaff = page
      .getByRole("navigation", { name: "Marketing" })
      .getByRole("link", { name: "Sign in", exact: true });
    const footerStaff = page
      .getByRole("navigation", { name: "Footer" })
      .getByRole("link", { name: "Sign in", exact: true });
    await expect(headerStaff).toBeVisible();
    await expect(footerStaff).toBeVisible();
    await expect(
      page
        .getByRole("navigation", { name: "Marketing" })
        .getByRole("link", { name: "Pricing" })
    ).toBeVisible();
    await expect(
      page
        .getByRole("navigation", { name: "Footer" })
        .getByRole("link", { name: "Contact" })
    ).toBeVisible();
    await expect(
      page
        .getByRole("navigation", { name: "Footer" })
        .getByRole("link", { name: "Early access" })
    ).toHaveCount(0);

    const desktopLayout = await section.evaluate((root) => {
      const layout = root.querySelector('[class*="closingCta"]');
      const copy = root.querySelector('[class*="closingCtaCopy"]');
      const action = root.querySelector('[class*="closingCtaAction"]');
      if (
        !(layout instanceof HTMLElement) ||
        !(copy instanceof HTMLElement) ||
        !(action instanceof HTMLElement)
      ) {
        return null;
      }
      const layoutBox = layout.getBoundingClientRect();
      const copyBox = copy.getBoundingClientRect();
      const actionBox = action.getBoundingClientRect();
      return {
        sideBySide: actionBox.left > copyBox.right - 48,
        copyShare: copyBox.width / layoutBox.width,
        stacked: actionBox.top > copyBox.bottom - 8,
        height: Math.round(layoutBox.height),
      };
    });
    expect(desktopLayout).not.toBeNull();
    expect(desktopLayout!.sideBySide).toBe(true);
    expect(desktopLayout!.stacked).toBe(false);
    expect(desktopLayout!.copyShare).toBeGreaterThan(0.45);
    expect(desktopLayout!.height).toBeLessThan(360);

    await section.screenshot({
      path: "test-results/artifacts/phase-1f16-closing-cta-1440-light.png",
    });
    await showStaticScheme(page, "dark");
    await waitForSectionReveal(section);
    await section.screenshot({
      path: "test-results/artifacts/phase-1f16-closing-cta-1440-dark.png",
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await showStaticScheme(page, "light");
    await scrollSectionIntoView(page, "#see-it");
    await waitForSectionReveal(section);
    const mobileLayout = await section.evaluate((root) => {
      const copy = root.querySelector('[class*="closingCtaCopy"]');
      const action = root.querySelector('[class*="closingCtaAction"]');
      if (!(copy instanceof HTMLElement) || !(action instanceof HTMLElement)) {
        return null;
      }
      const copyBox = copy.getBoundingClientRect();
      const actionBox = action.getBoundingClientRect();
      return {
        stacked: actionBox.top >= copyBox.bottom - 8,
        sideBySide: actionBox.left > copyBox.right - 8,
      };
    });
    expect(mobileLayout).not.toBeNull();
    expect(mobileLayout!.stacked).toBe(true);
    expect(mobileLayout!.sideBySide).toBe(false);
    const mobilePadding = await section.evaluate((root) => {
      const styles = getComputedStyle(root);
      return {
        paddingTop: Math.round(Number.parseFloat(styles.paddingTop)),
        paddingBottom: Math.round(Number.parseFloat(styles.paddingBottom)),
      };
    });
    expect(mobilePadding.paddingTop).toBe(64);
    expect(mobilePadding.paddingBottom).toBeGreaterThanOrEqual(28);
    expect(mobilePadding.paddingBottom).toBeLessThanOrEqual(48);
    await expectNoHorizontalOverflow(page);
    await section.screenshot({
      path: "test-results/artifacts/phase-1f16-closing-cta-390-light.png",
    });
    await showStaticScheme(page, "dark");
    await waitForSectionReveal(section);
    await section.screenshot({
      path: "test-results/artifacts/phase-1f16-closing-cta-390-dark.png",
    });
  });

  test("closing atmosphere uses a right-biased footer separator light", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(marketingUrl("/"), { waitUntil: "load" });
    await showStaticScheme(page, "light");
    await waitForHeroReveal(page);
    await scrollSectionIntoView(page, "#see-it");

    const lightClosing = await page.evaluate(() => {
      const closing = document.querySelector('[data-mk-chapter="closing"]');
      const footer = document.querySelector("footer");
      const separator = footer?.querySelector('[class*="footerSeparator"]');
      if (
        !(closing instanceof HTMLElement) ||
        !(footer instanceof HTMLElement) ||
        !(separator instanceof HTMLElement)
      ) {
        return null;
      }
      const closingBg = getComputedStyle(closing).backgroundColor;
      const footerBg = getComputedStyle(footer).backgroundColor;
      const heading = closing.querySelector("h2");
      const hairline = getComputedStyle(closing, "::before");
      const closingGlow = getComputedStyle(closing, "::after");
      const footerGlow = getComputedStyle(footer, "::before");
      const footerAfter = getComputedStyle(footer, "::after");
      return {
        closingBg,
        footerBg,
        headingColor: heading ? getComputedStyle(heading).color : "",
        hasBlend: Boolean(document.querySelector('[class*="blendTo"]')),
        chapterWash: document.querySelector("[data-chapter]") !== null,
        hasFooterWave: Boolean(footer.querySelector(".mkWave")),
        hairlineHeight: hairline.height,
        hairlineImage: hairline.backgroundImage,
        closingGlowImage: closingGlow.backgroundImage,
        footerGlowImage: footerGlow.backgroundImage,
        footerAfterImage: footerAfter.backgroundImage,
        closingGlowBottom: closingGlow.bottom,
        footerGlowTop: footerGlow.top,
        separatorHeight: getComputedStyle(separator).height,
        separatorImage: getComputedStyle(separator).backgroundImage,
        usesBlur:
          `${closingGlow.filter} ${footerGlow.filter}`.includes("blur(") ||
          `${closingGlow.backdropFilter} ${footerGlow.backdropFilter}`.includes(
            "blur"
          ),
      };
    });
    expect(lightClosing).not.toBeNull();
    expect(relativeLuminance(lightClosing!.closingBg)).toBeGreaterThan(0.7);
    expect(relativeLuminance(lightClosing!.footerBg)).toBeGreaterThan(0.7);
    expect(relativeLuminance(lightClosing!.headingColor)).toBeLessThan(0.35);
    expect(lightClosing!.hasBlend).toBe(false);
    expect(lightClosing!.chapterWash).toBe(false);
    expect(lightClosing!.hasFooterWave).toBe(false);
    expect(lightClosing!.hairlineHeight).toBe("1px");
    expect(lightClosing!.hairlineImage).toMatch(/linear-gradient/i);
    expect(lightClosing!.closingGlowImage).toMatch(/radial-gradient/i);
    expect(lightClosing!.closingGlowImage).toMatch(/82%/);
    expect(lightClosing!.footerGlowImage === "none").toBe(true);
    expect(lightClosing!.footerAfterImage === "none").toBe(true);
    expect(lightClosing!.closingGlowBottom).toBe("0px");
    expect(lightClosing!.separatorHeight).toBe("1px");
    expect(lightClosing!.separatorImage).toMatch(/linear-gradient/i);
    expect(lightClosing!.usesBlur).toBe(false);
    await page.evaluate(() => {
      document.querySelector("footer")?.scrollIntoView({
        block: "end",
        behavior: "instant",
      });
    });
    await expect
      .poll(async () => {
        const box = await page.locator("footer").boundingBox();
        return box ? box.y + box.height : -1;
      })
      .toBeGreaterThan(48);
    await page.screenshot({
      path: "test-results/artifacts/phase-1f13-closing-1440-light.png",
    });

    await showStaticScheme(page, "dark");
    const darkClosing = await page.evaluate(() => {
      const closing = document.querySelector('[data-mk-chapter="closing"]');
      const footer = document.querySelector("footer");
      if (
        !(closing instanceof HTMLElement) ||
        !(footer instanceof HTMLElement)
      ) {
        return null;
      }
      const heading = closing.querySelector("h2");
      return {
        closingBg: getComputedStyle(closing).backgroundColor,
        footerBg: getComputedStyle(footer).backgroundColor,
        headingColor: heading ? getComputedStyle(heading).color : "",
      };
    });
    expect(darkClosing).not.toBeNull();
    expect(relativeLuminance(darkClosing!.closingBg)).toBeLessThan(0.18);
    expect(relativeLuminance(darkClosing!.footerBg)).toBeLessThan(0.18);
    expect(relativeLuminance(darkClosing!.headingColor)).toBeGreaterThan(0.7);
    await page.evaluate(() => {
      document.querySelector("footer")?.scrollIntoView({
        block: "end",
        behavior: "instant",
      });
    });
    await page.screenshot({
      path: "test-results/artifacts/phase-1f13-closing-1440-dark.png",
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await showStaticScheme(page, "light");
    await scrollSectionIntoView(page, "#see-it");
    await expectNoHorizontalOverflow(page);
    await page.locator("footer").screenshot({
      path: "test-results/artifacts/phase-1f13-closing-390-light.png",
    });
    await showStaticScheme(page, "dark");
    await page.locator("footer").screenshot({
      path: "test-results/artifacts/phase-1f13-closing-390-dark.png",
    });
  });

  test("nav links use a centre-out underline and primary buttons stay still", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(marketingUrl("/"), { waitUntil: "load" });
    await showMarketingScheme(page, "light");
    await waitForHeroReveal(page);

    const pricing = page
      .getByRole("navigation", { name: "Marketing" })
      .getByRole("link", { name: "Pricing" });
    const underline = await pricing.evaluate((element) => {
      const after = getComputedStyle(element, "::after");
      const origin = after.transformOrigin.split(" ");
      const box = element.getBoundingClientRect();
      return {
        content: after.content,
        transform: after.transform,
        originX: Number.parseFloat(origin[0] ?? ""),
        originCentered:
          Math.abs(Number.parseFloat(origin[0] ?? "") - box.width / 2) <= 2,
        decoration: getComputedStyle(element).textDecorationLine,
      };
    });
    expect(underline.content).not.toBe("none");
    expect(underline.decoration === "none" || underline.decoration === "").toBe(
      true
    );
    expect(underline.originCentered).toBe(true);

    await pricing.hover();
    await expect
      .poll(async () =>
        pricing.evaluate(
          (element) => getComputedStyle(element, "::after").transform
        )
      )
      .toMatch(/matrix\(1,\s*0,\s*0,\s*1|none/);

    const hoverColors = await pricing.evaluate((element) => {
      const styles = getComputedStyle(element);
      const after = getComputedStyle(element, "::after");
      const probe = document.createElement("span");
      probe.style.color = "var(--mk-sky)";
      document.body.append(probe);
      const sky = getComputedStyle(probe).color;
      probe.remove();
      return {
        color: styles.color,
        underline: after.backgroundColor,
        sky,
      };
    });
    expect(hoverColors.color).not.toBe(hoverColors.sky);
    expect(hoverColors.underline).toBe(hoverColors.sky);

    const footerLink = page
      .getByRole("navigation", { name: "Footer" })
      .getByRole("link", { name: "About" });
    await footerLink.scrollIntoViewIfNeeded();
    const footerAfter = await footerLink.evaluate((element) => {
      const after = getComputedStyle(element, "::after");
      const originX = Number.parseFloat(after.transformOrigin);
      const width = element.getBoundingClientRect().width;
      return {
        centered: Math.abs(originX - width / 2) <= 2,
        underline: after.backgroundColor,
        color: getComputedStyle(element).color,
      };
    });
    expect(footerAfter.centered).toBe(true);
    expect(footerAfter.underline).toBe(footerAfter.color);

    const primary = page
      .getByRole("link", { name: "View the dental demo" })
      .first();
    const restPrimary = await primary.evaluate((element) => {
      const styles = getComputedStyle(element);
      return {
        transform: styles.transform,
        background: styles.backgroundColor,
      };
    });
    await primary.hover();
    await expect
      .poll(async () =>
        primary.evaluate((element) => getComputedStyle(element).backgroundColor)
      )
      .not.toBe(restPrimary.background);
    const hoverPrimary = await primary.evaluate((element) => {
      const styles = getComputedStyle(element);
      return {
        transform: styles.transform,
        background: styles.backgroundColor,
      };
    });
    expect(
      hoverPrimary.transform === "none" ||
        hoverPrimary.transform === "matrix(1, 0, 0, 1, 0, 0)"
    ).toBe(true);
    expect(hoverPrimary.background).not.toBe(restPrimary.background);

    const secondary = page.getByRole("link", { name: "See how it works" });
    const restSecondary = await secondary.evaluate(
      (element) => getComputedStyle(element).backgroundColor
    );
    await secondary.screenshot({
      path: "test-results/artifacts/phase-1f13-secondary-default.png",
    });
    await secondary.hover();
    await expect
      .poll(async () =>
        secondary.evaluate(
          (element) => getComputedStyle(element).backgroundColor
        )
      )
      .not.toBe(restSecondary);
    const hoverSecondary = await secondary.evaluate((element) => {
      const styles = getComputedStyle(element);
      return {
        transform: styles.transform,
        background: styles.backgroundColor,
      };
    });
    expect(
      hoverSecondary.transform === "none" ||
        hoverSecondary.transform === "matrix(1, 0, 0, 1, 0, 0)"
    ).toBe(true);
    await secondary.screenshot({
      path: "test-results/artifacts/phase-1f13-secondary-hover.png",
    });

    await page.mouse.move(0, 0);
    await expect
      .poll(async () =>
        secondary.evaluate(
          (element) => getComputedStyle(element).backgroundColor
        )
      )
      .toBe(restSecondary);

    await secondary.focus();
    const secondaryFocus = await secondary.evaluate((element) =>
      Number.parseFloat(getComputedStyle(element).outlineWidth)
    );
    expect(secondaryFocus).toBeGreaterThanOrEqual(2);
    await secondary.screenshot({
      path: "test-results/artifacts/phase-1f13-secondary-focus.png",
    });

    await secondary.hover();
    await page.mouse.down();
    const activeTransform = await secondary.evaluate(
      (element) => getComputedStyle(element).transform
    );
    expect(
      activeTransform === "none" ||
        activeTransform === "matrix(1, 0, 0, 1, 0, 0)"
    ).toBe(true);
    await secondary.screenshot({
      path: "test-results/artifacts/phase-1f13-secondary-active.png",
    });
    await page.mouse.up();
  });

  test("reduced-motion secondary CTA fills immediately without moving", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "light" });
    await page.goto(marketingUrl("/"), { waitUntil: "load" });
    await showStaticScheme(page, "light");
    await waitForHeroReveal(page);

    const secondary = page.getByRole("link", { name: "See how it works" });
    const reduced = await secondary.evaluate((element) => {
      const styles = getComputedStyle(element);
      return {
        duration: styles.transitionDuration,
        transform: styles.transform,
      };
    });
    expect(
      reduced.duration
        .split(",")
        .every((part) => part.trim() === "0s" || part.trim() === "0ms")
    ).toBe(true);
    expect(
      reduced.transform === "none" ||
        reduced.transform === "matrix(1, 0, 0, 1, 0, 0)"
    ).toBe(true);

    const restBackground = await secondary.evaluate(
      (element) => getComputedStyle(element).backgroundColor
    );
    await secondary.hover();
    const hoverReduced = await secondary.evaluate((element) => {
      const styles = getComputedStyle(element);
      return {
        transform: styles.transform,
        background: styles.backgroundColor,
      };
    });
    expect(
      hoverReduced.transform === "none" ||
        hoverReduced.transform === "matrix(1, 0, 0, 1, 0, 0)"
    ).toBe(true);
    expect(hoverReduced.background).not.toBe(restBackground);
  });

  test("clinic preview uses a patient-home panel instead of loose copy", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(marketingUrl("/"), { waitUntil: "load" });
    await showStaticScheme(page, "light");
    await waitForHeroReveal(page);

    const section = page.locator("#preview");
    await scrollSectionIntoView(page, "#preview");
    await waitForSectionReveal(section);
    await expect(
      section.getByRole("heading", {
        name: "See what patients actually receive",
      })
    ).toBeVisible();
    await expect(
      section.getByRole("link", { name: "Open Riverside Dental Demo" })
    ).toBeVisible();
    await expect(section.getByText("Patient view")).toBeVisible();
    await expect(section.locator("[data-mk-patient-preview]")).toHaveAttribute(
      "aria-hidden",
      "true"
    );
    await expect(
      section.getByText("no login, no feed", { exact: false })
    ).toBeVisible();
    await expect(section.getByText("Not a login. Not a feed.")).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "Brand directions" })
    ).toHaveCount(0);
    await expect(page.getByText("Brand flexibility")).toBeVisible();
    await expect(
      section.getByText("The Riverside Dental Demo is one live example", {
        exact: false,
      })
    ).toBeVisible();
    await expect(section.locator("[data-mk-patient-preview]")).toContainText(
      "Riverside Dental Demo"
    );
    await expect(
      section.getByRole("link", { name: "Tooth Extraction" })
    ).toHaveCount(0);
    await expect(
      section.getByRole("link", { name: "Call the practice" })
    ).toHaveCount(0);

    const desktopLayout = await section.evaluate((root) => {
      const preview = root.querySelector("[data-mk-patient-preview]");
      const caption = root.querySelector('[class*="previewCaption"]');
      const copy = root.querySelector('[class*="previewCopy"]');
      if (
        !(preview instanceof HTMLElement) ||
        !(caption instanceof HTMLElement) ||
        !(copy instanceof HTMLElement)
      ) {
        return null;
      }
      const previewBox = preview.getBoundingClientRect();
      const captionBox = caption.getBoundingClientRect();
      const copyBox = copy.getBoundingClientRect();
      return {
        previewRightOfCopy: previewBox.left > copyBox.right - 24,
        captionBelowPreview: captionBox.top > previewBox.bottom - 8,
        phoneCount: root.querySelectorAll('[class*="phoneShell"]').length,
      };
    });
    expect(desktopLayout).not.toBeNull();
    expect(desktopLayout!.previewRightOfCopy).toBe(true);
    expect(desktopLayout!.captionBelowPreview).toBe(true);
    expect(desktopLayout!.phoneCount).toBe(0);

    await section.screenshot({
      path: "test-results/artifacts/phase-1f12-preview-1440-light.png",
    });
    await showStaticScheme(page, "dark");
    await waitForSectionReveal(section);
    await section.screenshot({
      path: "test-results/artifacts/phase-1f12-preview-1440-dark.png",
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await showStaticScheme(page, "light");
    await scrollSectionIntoView(page, "#preview");
    await waitForSectionReveal(section);
    await expectNoHorizontalOverflow(page);
    await section.screenshot({
      path: "test-results/artifacts/phase-1f12-preview-390-light.png",
    });
    await showStaticScheme(page, "dark");
    await waitForSectionReveal(section);
    await section.screenshot({
      path: "test-results/artifacts/phase-1f12-preview-390-dark.png",
    });
  });

  test("keeps the approved hero composition unchanged", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(marketingUrl("/"), { waitUntil: "load" });
    await showMarketingScheme(page, "light");
    await waitForHeroReveal(page);

    const rhythm = await page.evaluate(() => {
      const heading = document.getElementById("marketing-hero");
      const section = heading?.closest("section");
      const header = document.querySelector("header");
      const eyebrow = section?.querySelector('[class*="heroEyebrow"]');
      const lower = section?.querySelector('[class*="heroLower"]');
      const phone = section?.querySelector('[class*="phoneShell"]');
      const wave = document.querySelector(".mkWave");
      if (!heading || !section || !header || !eyebrow || !lower || !phone) {
        return null;
      }
      const headerBox = header.getBoundingClientRect();
      const eyebrowBox = eyebrow.getBoundingClientRect();
      const headingBox = heading.getBoundingClientRect();
      const lowerBox = lower.getBoundingClientRect();
      const phoneBox = phone.getBoundingClientRect();
      const waveBox = wave?.getBoundingClientRect();
      return {
        navbarToEyebrow: Math.round(eyebrowBox.top - headerBox.bottom),
        eyebrowToHeading: Math.round(headingBox.top - eyebrowBox.bottom),
        headingToLower: Math.round(lowerBox.top - headingBox.bottom),
        phoneWidth: Math.round(phoneBox.width),
        separatorFlush: Boolean(
          waveBox &&
          Math.abs(waveBox.bottom - section.getBoundingClientRect().bottom) <= 2
        ),
      };
    });

    expect(rhythm).not.toBeNull();
    expect(rhythm!.navbarToEyebrow).toBeGreaterThanOrEqual(72);
    expect(rhythm!.navbarToEyebrow).toBeLessThanOrEqual(110);
    expect(rhythm!.eyebrowToHeading).toBeGreaterThanOrEqual(18);
    expect(rhythm!.eyebrowToHeading).toBeLessThanOrEqual(36);
    expect(rhythm!.headingToLower).toBeGreaterThanOrEqual(52);
    expect(rhythm!.headingToLower).toBeLessThanOrEqual(96);
    expect(rhythm!.phoneWidth).toBeGreaterThanOrEqual(220);
    expect(rhythm!.phoneWidth).toBeLessThanOrEqual(320);
    expect(rhythm!.separatorFlush).toBe(true);
    await expect(
      page.getByRole("heading", {
        name: "Aftercare that still feels like your clinic.",
      })
    ).toBeVisible();
    await expect(
      page.getByText("Patient aftercare for clinics and practices").first()
    ).toBeVisible();
    await page.locator('[data-mk-chapter="hero"]').screenshot({
      path: "test-results/artifacts/phase-1f12-hero-1440-light.png",
    });
  });

  test("brand flexibility uses an editorial identity panel, not profession cards", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(marketingUrl("/"), { waitUntil: "load" });
    await showStaticScheme(page, "light");
    await waitForHeroReveal(page);

    const section = page.locator('[aria-labelledby="brand-heading"]');
    const preview = page.locator('[aria-labelledby="preview-heading"]');
    const workflows = page.locator('[aria-labelledby="clinic-types-heading"]');
    await scrollSectionIntoView(page, '[aria-labelledby="brand-heading"]');
    await waitForSectionReveal(section);
    await expect(section.getByText("Brand flexibility")).toBeVisible();
    await expect(
      section.getByRole("heading", {
        name: "Your clinic stays visible after the appointment.",
      })
    ).toBeVisible();
    await expect(
      section.getByRole("heading", {
        name: "One platform, many clinic identities",
      })
    ).toHaveCount(0);
    await expect(
      section.getByText("marketing brand stays separate", { exact: false })
    ).toHaveCount(0);
    await expect(section.getByText("Cosmetic clinic")).toHaveCount(0);
    await expect(
      section.getByText("Dental practice", { exact: true })
    ).toHaveCount(0);
    await expect(
      section.getByText("Physiotherapy clinic", { exact: true })
    ).toHaveCount(0);
    await expect(section.getByText("Family dental")).toHaveCount(0);
    await expect(section.getByText("Family practice")).toHaveCount(0);
    await expect(
      section.getByRole("heading", { name: "Your name" })
    ).toBeVisible();
    await expect(
      section.getByRole("heading", { name: "Your colours" })
    ).toBeVisible();
    await expect(
      section.getByRole("heading", { name: "Your terminology" })
    ).toBeVisible();
    await expect(section.getByText("Sample clinic identities")).toBeVisible();
    await expect(
      workflows.getByRole("link", { name: /Dental practices/ })
    ).toBeVisible();

    const desktop = await section.evaluate((root) => {
      const heading = root.querySelector("#brand-heading");
      const whyHeading = document.querySelector("#why-heading");
      const previewHeading = document.querySelector("#preview-heading");
      const copy = root.querySelector("[data-mk-brand-copy]");
      const panel = root.querySelector("[data-mk-brand-identity]");
      const rows = [...root.querySelectorAll("article")];
      const swatches = [
        ...root.querySelectorAll<HTMLElement>("[data-mk-brand-swatch]"),
      ];
      if (
        !(heading instanceof HTMLElement) ||
        !(whyHeading instanceof HTMLElement) ||
        !(copy instanceof HTMLElement) ||
        !(panel instanceof HTMLElement) ||
        rows.length !== 3 ||
        swatches.length !== 3
      ) {
        return null;
      }
      const headingSize = Number.parseFloat(getComputedStyle(heading).fontSize);
      const whySize = Number.parseFloat(getComputedStyle(whyHeading).fontSize);
      const previewSize = previewHeading
        ? Number.parseFloat(getComputedStyle(previewHeading).fontSize)
        : headingSize;
      const copyBox = copy.getBoundingClientRect();
      const panelBox = panel.getBoundingClientRect();
      const rowTops = rows.map((row) =>
        Math.round(row.getBoundingClientRect().top)
      );
      const panelStyles = getComputedStyle(panel);
      return {
        headingSize,
        whySize,
        previewSize,
        paddingTop: Math.round(
          Number.parseFloat(getComputedStyle(root).paddingTop)
        ),
        split: panelBox.left > copyBox.right - 8,
        stackedRows: rowTops[1] > rowTops[0] && rowTops[2] > rowTops[1],
        panelBackground: panelStyles.backgroundColor,
        swatchBackgrounds: swatches.map(
          (swatch) => getComputedStyle(swatch).backgroundColor
        ),
        contrast: {
          color: panelStyles.color,
          background: panelStyles.backgroundColor,
        },
      };
    });

    expect(desktop).not.toBeNull();
    expect(Math.abs(desktop!.headingSize - desktop!.whySize)).toBeLessThan(1);
    expect(Math.abs(desktop!.headingSize - desktop!.previewSize)).toBeLessThan(
      1
    );
    expect(desktop!.split).toBe(true);
    expect(desktop!.stackedRows).toBe(true);
    expect(desktop!.paddingTop).toBe(0);
    expect(
      Math.abs(
        relativeLuminance(desktop!.contrast.color) -
          relativeLuminance(desktop!.contrast.background)
      )
    ).toBeGreaterThan(0.4);
    expect(desktop!.swatchBackgrounds[0]).not.toBe(desktop!.panelBackground);
    expect(new Set(desktop!.swatchBackgrounds).size).toBe(3);

    const order = await page.evaluate(() => {
      const types = document.getElementById("clinic-types-heading");
      const previewHeading = document.getElementById("preview-heading");
      const brand = document.getElementById("brand-heading");
      if (!types || !previewHeading || !brand) {
        return null;
      }
      return {
        typesBeforePreview: Boolean(
          types.compareDocumentPosition(previewHeading) &
          Node.DOCUMENT_POSITION_FOLLOWING
        ),
        previewBeforeBrand: Boolean(
          previewHeading.compareDocumentPosition(brand) &
          Node.DOCUMENT_POSITION_FOLLOWING
        ),
      };
    });
    expect(order).toEqual({
      typesBeforePreview: true,
      previewBeforeBrand: true,
    });

    const previewPadding = await preview.evaluate((root) =>
      Math.round(Number.parseFloat(getComputedStyle(root).paddingTop))
    );
    expect(previewPadding).toBeGreaterThanOrEqual(96);

    await section.screenshot({
      path: "test-results/artifacts/phase-1f14-brand-1440-light.png",
    });
    await section.screenshot({
      path: "test-results/artifacts/phase-1f15-brand-1440-light.png",
    });
    await showStaticScheme(page, "dark");
    await waitForSectionReveal(section);
    await section.screenshot({
      path: "test-results/artifacts/phase-1f14-brand-1440-dark.png",
    });

    await page.setViewportSize({ width: 1280, height: 800 });
    await showStaticScheme(page, "light");
    await scrollSectionIntoView(page, '[aria-labelledby="brand-heading"]');
    await waitForSectionReveal(section);
    await expect
      .poll(async () => {
        return section.evaluate((root) => {
          const copy = root.querySelector("[data-mk-brand-copy]");
          const panel = root.querySelector("[data-mk-brand-identity]");
          if (
            !(copy instanceof HTMLElement) ||
            !(panel instanceof HTMLElement)
          ) {
            return false;
          }
          return (
            panel.getBoundingClientRect().left >
            copy.getBoundingClientRect().right - 8
          );
        });
      })
      .toBe(true);

    await page.setViewportSize({ width: 390, height: 844 });
    await showStaticScheme(page, "light");
    await scrollSectionIntoView(page, '[aria-labelledby="brand-heading"]');
    await waitForSectionReveal(section);
    const mobile = await section.evaluate((root) => {
      const copy = root.querySelector("[data-mk-brand-copy]");
      const panel = root.querySelector("[data-mk-brand-identity]");
      const rows = [...root.querySelectorAll("article")];
      if (
        !(copy instanceof HTMLElement) ||
        !(panel instanceof HTMLElement) ||
        rows.length !== 3
      ) {
        return null;
      }
      const copyBox = copy.getBoundingClientRect();
      const panelBox = panel.getBoundingClientRect();
      const first = rows[0].getBoundingClientRect();
      const second = rows[1].getBoundingClientRect();
      return {
        stacked: panelBox.top > copyBox.bottom - 8,
        rowsStacked: second.top > first.bottom - 8,
        paddingTop: Math.round(
          Number.parseFloat(getComputedStyle(root).paddingTop)
        ),
      };
    });
    expect(mobile).not.toBeNull();
    expect(mobile!.stacked).toBe(true);
    expect(mobile!.rowsStacked).toBe(true);
    expect(mobile!.paddingTop).toBe(0);
    const problemPadding = await page
      .locator('[aria-labelledby="problem-heading"]')
      .evaluate((root) =>
        Math.round(Number.parseFloat(getComputedStyle(root).paddingTop))
      );
    expect(problemPadding).toBeGreaterThanOrEqual(56);
    await expectNoHorizontalOverflow(page);
    await section.screenshot({
      path: "test-results/artifacts/phase-1f14-brand-390-light.png",
    });
    await section.screenshot({
      path: "test-results/artifacts/phase-1f15-brand-390-light.png",
    });
    await showStaticScheme(page, "dark");
    await waitForSectionReveal(section);
    await section.screenshot({
      path: "test-results/artifacts/phase-1f14-brand-390-dark.png",
    });
    await section.screenshot({
      path: "test-results/artifacts/phase-1f15-brand-390-dark.png",
    });
  });

  test("theme trigger tints on hover without moving the icon", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(marketingUrl("/"), { waitUntil: "load" });
    await showMarketingScheme(page, "light");
    await waitForHeroReveal(page);

    const trigger = page.getByRole("button", { name: /Change colour theme/ });
    const rest = await trigger.evaluate((element) => {
      const icon = element.querySelector("svg");
      return {
        transform: getComputedStyle(element).transform,
        iconTransform: icon ? getComputedStyle(icon).transform : "missing",
        background: getComputedStyle(element).backgroundColor,
        radius: getComputedStyle(element).borderRadius,
      };
    });
    expect(
      rest.transform === "none" || rest.transform === "matrix(1, 0, 0, 1, 0, 0)"
    ).toBe(true);
    expect(
      rest.iconTransform === "none" ||
        rest.iconTransform === "matrix(1, 0, 0, 1, 0, 0)"
    ).toBe(true);
    await trigger.screenshot({
      path: "test-results/artifacts/phase-1f14-theme-default-light.png",
    });

    await trigger.hover();
    await expect
      .poll(async () =>
        trigger.evaluate((element) => getComputedStyle(element).backgroundColor)
      )
      .not.toBe(rest.background);
    const hover = await trigger.evaluate((element) => {
      const icon = element.querySelector("svg");
      return {
        transform: getComputedStyle(element).transform,
        iconTransform: icon ? getComputedStyle(icon).transform : "missing",
      };
    });
    expect(
      hover.transform === "none" ||
        hover.transform === "matrix(1, 0, 0, 1, 0, 0)"
    ).toBe(true);
    expect(
      hover.iconTransform === "none" ||
        hover.iconTransform === "matrix(1, 0, 0, 1, 0, 0)"
    ).toBe(true);
    await trigger.screenshot({
      path: "test-results/artifacts/phase-1f14-theme-hover-light.png",
    });

    await page.mouse.move(0, 0);
    await expect
      .poll(async () =>
        trigger.evaluate((element) => getComputedStyle(element).backgroundColor)
      )
      .toBe(rest.background);

    await trigger.focus();
    const focusOutline = await trigger.evaluate((element) =>
      Number.parseFloat(getComputedStyle(element).outlineWidth)
    );
    expect(focusOutline).toBeGreaterThanOrEqual(2);
    await trigger.screenshot({
      path: "test-results/artifacts/phase-1f14-theme-focus-light.png",
    });

    await trigger.click();
    await expect(
      page.getByRole("menu", { name: "Colour theme" })
    ).toBeVisible();
    await expect
      .poll(async () =>
        trigger.evaluate((element) => getComputedStyle(element).backgroundColor)
      )
      .not.toBe(rest.background);
    await page.screenshot({
      path: "test-results/artifacts/phase-1f14-theme-open-light.png",
    });
    await page.keyboard.press("Escape");

    await showMarketingScheme(page, "dark");
    const darkRest = await trigger.evaluate(
      (element) => getComputedStyle(element).backgroundColor
    );
    await trigger.hover();
    await expect
      .poll(async () =>
        trigger.evaluate((element) => getComputedStyle(element).backgroundColor)
      )
      .not.toBe(darkRest);
    await trigger.screenshot({
      path: "test-results/artifacts/phase-1f14-theme-hover-dark.png",
    });
    await trigger.click();
    await page.screenshot({
      path: "test-results/artifacts/phase-1f14-theme-open-dark.png",
    });
    await page.keyboard.press("Escape");
  });

  test("theme trigger reduced motion applies the fill immediately", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "light" });
    await page.goto(marketingUrl("/"), { waitUntil: "load" });
    await showStaticScheme(page, "light");
    await waitForHeroReveal(page);

    const trigger = page.getByRole("button", { name: /Change colour theme/ });
    const reduced = await trigger.evaluate((element) => {
      const styles = getComputedStyle(element);
      return {
        duration: styles.transitionDuration,
        transform: styles.transform,
      };
    });
    expect(
      reduced.duration
        .split(",")
        .every((part) => part.trim() === "0s" || part.trim() === "0ms")
    ).toBe(true);
    expect(
      reduced.transform === "none" ||
        reduced.transform === "matrix(1, 0, 0, 1, 0, 0)"
    ).toBe(true);

    const restBackground = await trigger.evaluate(
      (element) => getComputedStyle(element).backgroundColor
    );
    await trigger.hover();
    const hoverReduced = await trigger.evaluate((element) => {
      const icon = element.querySelector("svg");
      return {
        background: getComputedStyle(element).backgroundColor,
        transform: getComputedStyle(element).transform,
        iconTransform: icon ? getComputedStyle(icon).transform : "missing",
        outline: Number.parseFloat(getComputedStyle(element).outlineWidth),
      };
    });
    expect(hoverReduced.background).not.toBe(restBackground);
    expect(
      hoverReduced.transform === "none" ||
        hoverReduced.transform === "matrix(1, 0, 0, 1, 0, 0)"
    ).toBe(true);
    expect(
      hoverReduced.iconTransform === "none" ||
        hoverReduced.iconTransform === "matrix(1, 0, 0, 1, 0, 0)"
    ).toBe(true);

    await trigger.focus();
    const focusWidth = await trigger.evaluate((element) =>
      Number.parseFloat(getComputedStyle(element).outlineWidth)
    );
    expect(focusWidth).toBeGreaterThanOrEqual(2);
  });

  test("footer copyright sits within documented bottom padding", async ({
    page,
  }) => {
    for (const width of [1440, 390] as const) {
      await page.setViewportSize({
        width,
        height: width === 1440 ? 900 : 844,
      });
      await page.goto(marketingUrl("/"), { waitUntil: "load" });
      await showStaticScheme(page, "light");
      await waitForHeroReveal(page);
      await page.evaluate(() => {
        document.querySelector("footer")?.scrollIntoView({
          block: "end",
          behavior: "instant",
        });
      });

      const geometry = await page.evaluate(() => {
        const footer = document.querySelector("footer");
        const copy = footer?.querySelector('[class*="footerCopy"]');
        if (
          !(footer instanceof HTMLElement) ||
          !(copy instanceof HTMLElement)
        ) {
          return null;
        }
        const footerBox = footer.getBoundingClientRect();
        const copyBox = copy.getBoundingClientRect();
        const styles = getComputedStyle(footer);
        const scrollY = window.scrollY;
        const documentBottom = Math.max(
          document.documentElement.scrollHeight,
          document.body.scrollHeight
        );
        return {
          gap: Math.round(documentBottom - (copyBox.bottom + scrollY)),
          paddingBottom: Number.parseFloat(styles.paddingBottom),
          footerHeight: Math.round(footerBox.height),
        };
      });

      expect(geometry).not.toBeNull();
      expect(geometry!.gap).toBeGreaterThanOrEqual(geometry!.paddingBottom - 6);
      expect(geometry!.gap).toBeLessThanOrEqual(geometry!.paddingBottom + 24);
      expect(geometry!.paddingBottom).toBeGreaterThanOrEqual(16);
      expect(geometry!.paddingBottom).toBeLessThanOrEqual(56);

      await page.screenshot({
        path: `test-results/artifacts/phase-1f14-footer-end-${width}-light.png`,
        fullPage: false,
      });
      await showStaticScheme(page, "dark");
      await page.evaluate(() => {
        document.querySelector("footer")?.scrollIntoView({
          block: "end",
          behavior: "instant",
        });
      });
      await page.screenshot({
        path: `test-results/artifacts/phase-1f14-footer-end-${width}-dark.png`,
        fullPage: false,
      });
    }
  });

  test("public copy no longer includes internal roadmap language", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(marketingUrl("/"), { waitUntil: "load" });
    await showStaticScheme(page, "light");
    await waitForHeroReveal(page);

    await expect(page.getByText("provisional commercial name")).toHaveCount(0);
    await expect(
      page.getByText("Lead capture is not on this page yet.")
    ).toHaveCount(0);
    await expect(page.getByText("Pricing is not locked.")).toHaveCount(0);
    await expect(page.getByText("not in this release")).toHaveCount(0);
    await expect(page.getByText("arbitrary CSS")).toHaveCount(0);
    await expect(page.getByText("phone-sized layout")).toHaveCount(0);
    await expect(
      page.getByText("Give patients a stable URL they can save")
    ).toBeVisible();
    await expect(
      page.getByText("with the clinic still easy to contact")
    ).toBeVisible();
    await expect(page.getByText("Consistent presentation")).toBeVisible();
    await expect(
      page.getByText(
        "Keep approved content consistent across every published guide."
      )
    ).toHaveCount(0);
    await expect(
      page.getByText("keeping the patient experience structured and readable")
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "See what patients actually receive" })
    ).toBeVisible();
    await expect(
      page.getByText("Branded patient aftercare for clinics and practices.")
    ).toBeVisible();
  });

  test("marketing storytelling remains accessible in light and dark", async ({
    page,
  }) => {
    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 390, height: 844 },
    ] as const) {
      for (const scheme of ["light", "dark"] as const) {
        await page.setViewportSize(viewport);
        await page.goto(marketingUrl("/"), { waitUntil: "load" });
        await showMarketingScheme(page, scheme);
        await waitForHeroReveal(page);
        await page.locator("#how-it-works").scrollIntoViewIfNeeded();
        await waitForRevealedMotion(page.locator("#how-it-works"));
        await expectNoSeriousAxeViolations(page, {
          exclude: [
            "[data-mk-pending]",
            "[data-mk-pending] *",
            "[aria-hidden='true']",
          ],
        });
        if (viewport.width === 1440) {
          await page
            .getByRole("button", { name: /Change colour theme/ })
            .click();
          await expect(
            page.getByRole("menu", { name: "Colour theme" })
          ).toBeVisible();
          await expectNoSeriousAxeViolations(page, {
            exclude: [
              "[data-mk-pending]",
              "[data-mk-pending] *",
              "[aria-hidden='true']",
            ],
          });
          await page.keyboard.press("Escape");
        }
      }
    }
  });

  test("captures 360 mobile storytelling screenshots", async ({ page }) => {
    const headerNav = page.getByRole("navigation", { name: "Marketing" });

    for (const scheme of ["light", "dark"] as const) {
      await page.setViewportSize({ width: 360, height: 800 });
      await page.emulateMedia({
        colorScheme: scheme,
        reducedMotion: "reduce",
      });
      await page.goto(marketingUrl("/"), { waitUntil: "load" });
      await showStaticScheme(page, scheme);
      await waitForHeroReveal(page);

      await expect(
        headerNav.getByRole("link", { name: "How it works" })
      ).toHaveCount(0);
      await expect(
        headerNav.getByRole("link", { name: "Clinic preview" })
      ).toHaveCount(0);
      await expect(
        headerNav.getByRole("link", { name: "Early access" })
      ).toHaveCount(0);
      await expect(
        headerNav.getByRole("link", { name: "Sign in", exact: true })
      ).toHaveCount(0);

      await scrollSectionIntoView(page, '[aria-labelledby="product-heading"]');
      await waitForSectionReveal(
        page.locator('[aria-labelledby="product-heading"]')
      );
      await page.locator('[aria-labelledby="product-heading"]').screenshot({
        path: `test-results/artifacts/phase-1f15-product-360-${scheme}.png`,
      });

      await scrollSectionIntoView(page, "#how-it-works");
      await waitForSectionReveal(page.locator("#how-it-works"));
      await page.locator("#how-it-works").screenshot({
        path: `test-results/artifacts/phase-1f15-process-360-${scheme}.png`,
      });

      await scrollSectionIntoView(page, '[aria-labelledby="why-heading"]');
      await waitForSectionReveal(
        page.locator('[aria-labelledby="why-heading"]')
      );
      await page.locator('[aria-labelledby="why-heading"]').screenshot({
        path: `test-results/artifacts/phase-1f15-pillars-360-${scheme}.png`,
      });

      await scrollSectionIntoView(page, '[aria-labelledby="brand-heading"]');
      await waitForSectionReveal(
        page.locator('[aria-labelledby="brand-heading"]')
      );
      const brandPadding = await page
        .locator('[aria-labelledby="brand-heading"]')
        .evaluate((root) =>
          Math.round(Number.parseFloat(getComputedStyle(root).paddingTop))
        );
      expect(brandPadding).toBe(0);
      const previewPadding = await page
        .locator('[aria-labelledby="preview-heading"]')
        .evaluate((root) =>
          Math.round(Number.parseFloat(getComputedStyle(root).paddingTop))
        );
      expect(previewPadding).toBeGreaterThanOrEqual(56);
      await page.locator('[aria-labelledby="brand-heading"]').screenshot({
        path: `test-results/artifacts/phase-1f15-brand-360-${scheme}.png`,
      });

      await scrollSectionIntoView(page, "#see-it");
      await waitForSectionReveal(page.locator("#see-it"));
      const paddingTop = await page
        .locator("#see-it")
        .evaluate((root) =>
          Math.round(Number.parseFloat(getComputedStyle(root).paddingTop))
        );
      expect(paddingTop).toBe(64);
      await page.locator("#see-it").screenshot({
        path: `test-results/artifacts/phase-1f16-closing-cta-360-${scheme}.png`,
      });
      await expectNoHorizontalOverflow(page);
    }
  });

  test("sections animate once and stay visible after scrolling away", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(marketingUrl("/"), { waitUntil: "load" });
    await showMarketingScheme(page, "light");
    await waitForHeroReveal(page);

    const samples = [
      '[aria-labelledby="problem-heading"]',
      "#how-it-works",
      '[aria-labelledby="why-heading"]',
    ] as const;

    for (const selector of samples) {
      await scrollSectionIntoView(page, selector);
      const section = page.locator(selector);
      await waitForSectionReveal(section);
      await expect(section.locator("[data-mk-section]")).toHaveAttribute(
        "data-mk-entered",
        ""
      );
      await expect
        .poll(async () =>
          section.evaluate((root) => {
            const cards = [
              ...root.querySelectorAll<HTMLElement>(
                "[data-mk-card][data-mk-entered]"
              ),
            ];
            return (
              cards.length > 0 &&
              cards.every(
                (node) =>
                  getComputedStyle(node).opacity === "1" &&
                  !node.hasAttribute("data-mk-pending")
              )
            );
          })
        )
        .toBe(true);

      await page.evaluate(() => {
        window.scrollTo({ top: 0, behavior: "instant" });
      });
      await expect(section.locator("[data-mk-section]")).toHaveAttribute(
        "data-mk-entered",
        ""
      );

      await scrollSectionIntoView(page, selector);
      await expect
        .poll(async () =>
          section.evaluate((root) => {
            const heading = root.querySelector("[data-mk-section]");
            const cards = [
              ...root.querySelectorAll<HTMLElement>(
                "[data-mk-card][data-mk-entered]"
              ),
            ];
            const headingReveals = [
              ...root.querySelectorAll<HTMLElement>(
                "[data-mk-section] .mkReveal:not([data-mk-card])"
              ),
            ];
            return Boolean(
              heading?.hasAttribute("data-mk-entered") &&
              headingReveals.length > 0 &&
              headingReveals.every(
                (node) =>
                  getComputedStyle(node).opacity === "1" &&
                  !node.hasAttribute("data-mk-pending")
              ) &&
              cards.length > 0 &&
              cards.every(
                (node) =>
                  getComputedStyle(node).opacity === "1" &&
                  node.hasAttribute("data-mk-entered") &&
                  !node.hasAttribute("data-mk-pending")
              )
            );
          })
        )
        .toBe(true);
    }
  });

  test("reduced motion shows section content immediately without waiting", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "light" });
    await page.goto(marketingUrl("/"), { waitUntil: "load" });
    await showStaticScheme(page, "light");

    await expect(page.locator("html")).toHaveAttribute(
      "data-mk-motion",
      "reduce"
    );
    const hiddenPending = await page.evaluate(() => {
      return [...document.querySelectorAll<HTMLElement>(".mkReveal")].filter(
        (node) => getComputedStyle(node).opacity === "0"
      ).length;
    });
    expect(hiddenPending).toBe(0);
    await expect(
      page.getByRole("heading", {
        name: "From clinic-approved guidance to a page patients keep",
      })
    ).toBeVisible();
  });

  test("section copy waits until it crosses the desktop reveal threshold", async ({
    page,
  }) => {
    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 1280, height: 800 },
    ] as const) {
      await page.setViewportSize(viewport);
      await page.goto(marketingUrl("/"), { waitUntil: "load" });
      await showMarketingScheme(page, "light");
      await waitForHeroReveal(page);

      const headingGroup = page.locator("#how-it-works [data-mk-section]");
      await placeTopFromViewportBottom(
        page,
        "#how-it-works [data-mk-section]",
        40
      );
      await expect(headingGroup).not.toHaveAttribute("data-mk-entered", "");

      await placeTopFromViewportBottom(
        page,
        "#how-it-works [data-mk-section]",
        240
      );
      await expect(headingGroup).toHaveAttribute("data-mk-entered", "");
      await expect(
        page.getByRole("heading", {
          name: "From clinic-approved guidance to a page patients keep",
        })
      ).toBeVisible();
      await page.screenshot({
        path: `test-results/artifacts/marketing-reveal-${viewport.width}x${viewport.height}.png`,
      });
    }
  });

  test("desktop process cards share a row trigger with index stagger", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(marketingUrl("/"), { waitUntil: "load" });
    await showMarketingScheme(page, "light");
    await waitForHeroReveal(page);

    const cards = page.locator(
      "#how-it-works [data-mk-process-card][data-mk-card]"
    );
    await placeTopFromViewportBottom(
      page,
      "#how-it-works [data-mk-process-card][data-mk-card]",
      40
    );
    await expect(cards.nth(0)).not.toHaveAttribute("data-mk-entered", "");
    await expect(cards.nth(3)).not.toHaveAttribute("data-mk-entered", "");

    await placeTopFromViewportBottom(
      page,
      "#how-it-works [data-mk-process-card][data-mk-card]",
      240
    );
    await expect(cards.nth(0)).toHaveAttribute("data-mk-entered", "");
    await expect(cards.nth(3)).toHaveAttribute("data-mk-entered", "");
  });

  for (const viewport of [
    { width: 390, height: 844 },
    { width: 360, height: 800 },
  ] as const) {
    test(`mobile process cards reveal independently at ${viewport.width}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await page.goto(marketingUrl("/"), { waitUntil: "load" });
      await showMarketingScheme(page, "light");
      await waitForHeroReveal(page);

      const cards = page.locator(
        "#how-it-works [data-mk-process-card][data-mk-card]"
      );
      await expect(cards).toHaveCount(4);

      await placeTopFromViewportBottom(
        page,
        "#how-it-works [data-mk-process-card][data-mk-card]",
        40
      );
      await expect(cards.nth(0)).not.toHaveAttribute("data-mk-entered", "");
      await expect(cards.nth(1)).not.toHaveAttribute("data-mk-entered", "");
      await expect(cards.nth(2)).not.toHaveAttribute("data-mk-entered", "");

      await placeTopFromViewportBottom(
        page,
        "#how-it-works [data-mk-process-card][data-mk-card]",
        140
      );
      await expect(cards.nth(0)).toHaveAttribute("data-mk-entered", "");
      await expect(cards.nth(1)).not.toHaveAttribute("data-mk-entered", "");
      await expect(cards.nth(2)).not.toHaveAttribute("data-mk-entered", "");

      await placeTopFromViewportBottom(
        page,
        "#how-it-works [data-mk-process-card][data-mk-card]:nth-of-type(2)",
        140
      );
      await expect(cards.nth(1)).toHaveAttribute("data-mk-entered", "");
      await expect(cards.nth(2)).not.toHaveAttribute("data-mk-entered", "");

      await placeTopFromViewportBottom(
        page,
        "#how-it-works [data-mk-process-card][data-mk-card]:nth-of-type(3)",
        140
      );
      await expect(cards.nth(2)).toHaveAttribute("data-mk-entered", "");
      await page.screenshot({
        path: `test-results/artifacts/marketing-reveal-${viewport.width}x${viewport.height}.png`,
      });
    });
  }
});
