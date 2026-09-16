import { ProductLogo } from "@/lib/branding/product-logo";
import { PRODUCT_MARKETING_ORIGIN } from "@/lib/branding/product-name";
import {
  AFTERCARE_UNAVAILABLE_BODY,
  AFTERCARE_UNAVAILABLE_HEADING,
  AFTERCARE_UNAVAILABLE_HOME_LABEL,
} from "@/lib/aftercare/unavailable-copy";

const UNAVAILABLE_CSS = `
.aftercareUnavailable {
  --nf-bg: #07090e;
  --nf-ink: #f5f3ee;
  --nf-muted: #98a2b3;
  --nf-link: #a6b8ff;
  --nf-link-hover: #c5d0ff;
  --nf-focus: #a6b8ff;
  position: fixed;
  inset: 0;
  z-index: 10;
  isolation: isolate;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  margin: 0;
  padding: 2.5rem 1.25rem 3rem;
  overflow: auto;
  background: var(--nf-bg);
  color: var(--nf-ink);
  color-scheme: dark;
  font-family: var(--font-geist-sans), sans-serif;
}
.aftercareUnavailableInner {
  width: min(28rem, 100%);
  text-align: center;
}
.aftercareUnavailableLogo {
  display: block;
  width: auto;
  height: 2.15rem;
  margin: 0 auto 1.75rem;
  object-fit: contain;
}
.aftercareUnavailableTitle {
  margin: 0;
  font-size: 1.35rem;
  font-weight: 650;
  letter-spacing: -0.035em;
  line-height: 1.25;
}
.aftercareUnavailableCopy {
  margin: 0.85rem 0 0;
  color: var(--nf-muted);
  font-size: 0.98rem;
  line-height: 1.55;
}
.aftercareUnavailableHome {
  display: inline-flex;
  margin-top: 1.45rem;
  color: var(--nf-link);
  font-size: 0.95rem;
  font-weight: 650;
  letter-spacing: -0.02em;
  text-decoration: none;
}
@media (hover: hover) and (pointer: fine) {
  .aftercareUnavailableHome:hover {
    color: var(--nf-link-hover);
    text-decoration: underline;
    text-underline-offset: 0.22em;
  }
}
.aftercareUnavailableHome:focus-visible {
  color: var(--nf-link-hover);
  outline: var(--interaction-focus-width, 2px) solid var(--nf-focus);
  outline-offset: 3px;
  border-radius: 0.2rem;
}
`;

export default function AftercareNotFound() {
  return (
    <main className="aftercareUnavailable">
      <style dangerouslySetInnerHTML={{ __html: UNAVAILABLE_CSS }} />
      <div className="aftercareUnavailableInner">
        <ProductLogo className="aftercareUnavailableLogo" />
        <h1 className="aftercareUnavailableTitle">
          {AFTERCARE_UNAVAILABLE_HEADING}
        </h1>
        <p className="aftercareUnavailableCopy">{AFTERCARE_UNAVAILABLE_BODY}</p>
        <a className="aftercareUnavailableHome" href={PRODUCT_MARKETING_ORIGIN}>
          {AFTERCARE_UNAVAILABLE_HOME_LABEL}
        </a>
      </div>
    </main>
  );
}
