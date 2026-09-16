import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import AftercareNotFound from "@/app/(aftercare)/not-found";
import { PRODUCT_LOGO_SRC } from "@/lib/branding/product-assets";
import {
  PRODUCT_MARKETING_ORIGIN,
  PRODUCT_NAME,
} from "@/lib/branding/product-name";
import {
  AFTERCARE_UNAVAILABLE_BODY,
  AFTERCARE_UNAVAILABLE_HEADING,
  AFTERCARE_UNAVAILABLE_HOME_LABEL,
} from "@/lib/aftercare/unavailable-copy";

describe("aftercare not-found", () => {
  const html = renderToStaticMarkup(<AftercareNotFound />);

  it("renders the River Aftercare logo, generic copy, and commercial home link", () => {
    expect(html).toContain(`src="${PRODUCT_LOGO_SRC}"`);
    expect(html).toContain(AFTERCARE_UNAVAILABLE_HEADING);
    expect(html).toContain(AFTERCARE_UNAVAILABLE_BODY);
    expect(html).toContain(`href="${PRODUCT_MARKETING_ORIGIN}"`);
    expect(html).toContain(AFTERCARE_UNAVAILABLE_HOME_LABEL);
    expect(html).toContain(PRODUCT_NAME);
    expect(html).toContain("<style");
    expect(html).toContain("aftercareUnavailable");
  });

  it("does not reveal whether a slug exists, was removed, or is unpublished", () => {
    expect(html.toLowerCase()).not.toContain("unpublished");
    expect(html.toLowerCase()).not.toContain("removed");
    expect(html.toLowerCase()).not.toContain("does not exist");
    expect(html.toLowerCase()).not.toContain("unknown tenant");
    expect(html.toLowerCase()).not.toContain("never existed");
    expect(html).not.toContain("Not found");
    expect(html).not.toContain("This aftercare page is not available.");
  });
});
