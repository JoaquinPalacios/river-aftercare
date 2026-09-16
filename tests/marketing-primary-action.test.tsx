import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { MarketingPrimaryAnchor } from "@/app/(marketing)/components/marketing-primary-anchor";
import { MarketingPrimaryButton } from "@/app/(marketing)/components/marketing-primary-button";
import { MarketingPrimaryLink } from "@/app/(marketing)/components/marketing-primary-link";

describe("marketing primary actions", () => {
  it("keeps link and button as explicit variants sharing the primary classes", () => {
    const link = renderToStaticMarkup(
      <MarketingPrimaryLink href="/contact">
        Request a demo
      </MarketingPrimaryLink>
    );
    const anchor = renderToStaticMarkup(
      <MarketingPrimaryAnchor href="http://demodental.localhost:3000/">
        View the dental demo
      </MarketingPrimaryAnchor>
    );
    const button = renderToStaticMarkup(
      <MarketingPrimaryButton type="submit">
        Send enquiry
      </MarketingPrimaryButton>
    );

    expect(link).toContain("Request a demo");
    expect(link).toContain('href="/contact"');
    expect(anchor).toContain("View the dental demo");
    expect(anchor).toContain("<a ");
    expect(button).toContain("<button");
    expect(button).toContain('type="submit"');
    expect(button).toContain("Send enquiry");
    expect(button).not.toContain("aria-busy");
    expect(link).not.toContain("isLink");
    expect(button).not.toContain("isSubmit");
  });

  it("reserves the idle label width while announcing Sending…", () => {
    const html = renderToStaticMarkup(
      <MarketingPrimaryButton type="submit" busy>
        Send enquiry
      </MarketingPrimaryButton>
    );

    expect(html).toContain("Send enquiry");
    expect(html).toContain("Sending…");
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("disabled");
  });
});
