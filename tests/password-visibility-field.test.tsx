import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { PasswordVisibilityField } from "@/app/(staff)/components/password-visibility-field";

describe("password visibility field", () => {
  it("hides the password by default and uses a labelled non-submit control", () => {
    const html = renderToStaticMarkup(
      <PasswordVisibilityField value="secret" onChange={() => undefined} />
    );

    expect(html).toContain('type="password"');
    expect(html).not.toContain('type="text"');
    expect(html).toContain('name="password"');
    expect(html).toContain('autoComplete="current-password"');
    expect(html).toContain('type="button"');
    expect(html).toContain('aria-label="Show password"');
    expect(html).toContain("aria-pressed");
    expect(html).not.toContain("Hide password");
  });

  it("disables the input and visibility toggle while pending", () => {
    const html = renderToStaticMarkup(
      <PasswordVisibilityField
        value="secret"
        onChange={() => undefined}
        disabled
      />
    );

    expect(html).toContain("disabled");
    expect(html).toContain('aria-label="Show password"');
  });

  it("wires the eye control into staff login without making it the submit button", () => {
    const source = readFileSync("app/(staff)/login/login-form.tsx", "utf8");
    const field = readFileSync(
      "app/(staff)/components/password-visibility-field.tsx",
      "utf8"
    );

    expect(source).toContain("PasswordVisibilityField");
    expect(source).toContain('method="post"');
    expect(source).toContain("event.preventDefault()");
    expect(source).toContain('type="submit"');
    expect(source).toContain("disabled={pending}");
    expect(field).toContain('type="button"');
    expect(field).toContain('visible ? "Hide password" : "Show password"');
    expect(field).toContain("disabled={disabled}");
    expect(field).toContain("aria-pressed={visible}");
  });
});
