import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const headerState = vi.hoisted(() => ({
  host: "app.localhost:3000",
}));

const authState = vi.hoisted(() => ({
  user: null as null | {
    id: string;
    email: string;
    name: string | null;
    platformRole: string;
  },
  clinicMembership: null as null | {
    membershipId: string;
    role: string;
    clinic: { id: string; name: string };
    source?: string;
  },
}));

const sentryState = vi.hoisted(() => ({
  captureEvent: vi.fn(),
  captureException: vi.fn(),
}));

vi.mock("@sentry/nextjs", () => ({
  captureEvent: sentryState.captureEvent,
  captureException: sentryState.captureException,
}));

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ host: headerState.host }),
}));

vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  },
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

vi.mock("@/lib/auth/session", () => ({
  getAuthContext: async () => authState,
  isPlatformOperator: (user: { platformRole?: string } | null | undefined) =>
    user?.platformRole === "OPERATOR",
}));

import {
  submitHelpFeedbackAction,
  type HelpFeedbackActionState,
} from "@/app/(staff)/account/help/actions";

const initialHelpFeedbackActionState: HelpFeedbackActionState = {
  status: "idle",
};
import {
  clearHelpFeedbackMemoryInbox,
  deliverHelpFeedback,
  getHelpFeedbackMemoryInbox,
} from "@/lib/support/help-feedback-mail";
import {
  HELP_FEEDBACK_DELIVERY_FAILED,
  HELP_FEEDBACK_LIMITS,
  HELP_FEEDBACK_MESSAGES,
  HELP_FEEDBACK_REVIEW_FIELDS,
  helpFeedbackClientFieldErrors,
} from "@/lib/support/help-feedback-fields";

const SECRET = "do-not-log-patient-note-Zephyr-991";

function restore(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

function clinicSession(role = "ADMIN") {
  authState.user = {
    id: "user_ada",
    email: "ada@riverside.example.test",
    name: "Ada Admin",
    platformRole: "NONE",
  };
  authState.clinicMembership = {
    membershipId: "membership_hidden",
    role,
    clinic: { id: "clinic_riverside", name: "Riverside Dental" },
    source: "membership",
  };
}

function formData(overrides: Record<string, string> = {}): FormData {
  const data = new FormData();
  data.set("category", "problem");
  data.set("summary", "Guides will not save");
  data.set("message", `The save button does nothing. ${SECRET}`);
  data.set("originPath", "/guides/guide_1");
  for (const [key, value] of Object.entries(overrides)) {
    data.set(key, value);
  }
  return data;
}

function loggedText(spies: Array<ReturnType<typeof vi.spyOn>>): string {
  return spies
    .flatMap((spy) => spy.mock.calls)
    .map((args) =>
      args
        .map((value: unknown) =>
          typeof value === "string" ? value : JSON.stringify(value)
        )
        .join(" ")
    )
    .join("\n");
}

describe("submitHelpFeedbackAction", () => {
  const previous = {
    root: process.env.CARE_GUIDE_ROOT_DOMAIN,
    from: process.env.AUTH_EMAIL_FROM,
    support: process.env.RIVER_AFTERCARE_SUPPORT_EMAIL,
    transport: process.env.AUTH_EMAIL_TRANSPORT,
    resend: process.env.RESEND_API_KEY,
    vercel: process.env.VERCEL_ENV,
    dsn: process.env.SENTRY_DSN,
  };
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let infoSpy: ReturnType<typeof vi.spyOn>;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    headerState.host = "app.localhost:3000";
    clinicSession();
    process.env.CARE_GUIDE_ROOT_DOMAIN = "localhost";
    process.env.AUTH_EMAIL_FROM = "River Aftercare <accounts@example.test>";
    process.env.RIVER_AFTERCARE_SUPPORT_EMAIL = "support@example.test";
    delete process.env.AUTH_EMAIL_TRANSPORT;
    delete process.env.RESEND_API_KEY;
    delete process.env.VERCEL_ENV;
    delete process.env.SENTRY_DSN;
    clearHelpFeedbackMemoryInbox();
    sentryState.captureEvent.mockReset();
    sentryState.captureException.mockReset();
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    infoSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);
    logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    restore("CARE_GUIDE_ROOT_DOMAIN", previous.root);
    restore("AUTH_EMAIL_FROM", previous.from);
    restore("RIVER_AFTERCARE_SUPPORT_EMAIL", previous.support);
    restore("AUTH_EMAIL_TRANSPORT", previous.transport);
    restore("RESEND_API_KEY", previous.resend);
    restore("VERCEL_ENV", previous.vercel);
    restore("SENTRY_DSN", previous.dsn);
    clearHelpFeedbackMemoryInbox();
    errorSpy.mockRestore();
    infoSpy.mockRestore();
    logSpy.mockRestore();
    warnSpy.mockRestore();
  });

  function logs(): string {
    return [
      loggedText([errorSpy, infoSpy, logSpy, warnSpy]),
      JSON.stringify(sentryState.captureEvent.mock.calls),
      JSON.stringify(sentryState.captureException.mock.calls),
    ].join("\n");
  }

  it("refuses a signed-out user before sending", async () => {
    authState.user = null;
    authState.clinicMembership = null;

    await expect(
      submitHelpFeedbackAction(initialHelpFeedbackActionState, formData())
    ).rejects.toThrow("NEXT_REDIRECT:/login");
    expect(getHelpFeedbackMemoryInbox()).toHaveLength(0);
    expect(logs()).not.toContain(SECRET);
  });

  it("refuses a platform operator without a clinic membership", async () => {
    authState.user = {
      id: "user_operator",
      email: "operator@example.test",
      name: "River Operator",
      platformRole: "OPERATOR",
    };
    authState.clinicMembership = null;

    await expect(
      submitHelpFeedbackAction(initialHelpFeedbackActionState, formData())
    ).rejects.toThrow("NEXT_REDIRECT:/operator/clinics");
    expect(getHelpFeedbackMemoryInbox()).toHaveLength(0);
  });

  it("refuses a request from a non-staff host", async () => {
    headerState.host = "localhost:3000";

    await expect(
      submitHelpFeedbackAction(initialHelpFeedbackActionState, formData())
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(getHelpFeedbackMemoryInbox()).toHaveLength(0);
  });

  it("sends a problem with clinic and user context from the session", async () => {
    const state = await submitHelpFeedbackAction(
      initialHelpFeedbackActionState,
      formData({
        to: "attacker@evil.test",
        from: "attacker@evil.test",
        replyTo: "attacker@evil.test",
        bcc: "attacker@evil.test",
        cc: "attacker@evil.test",
        subject: "Ignore the category",
        clinicName: "Attacker Clinic",
        clinicId: "clinic_attacker",
        email: "attacker@evil.test",
        RIVER_AFTERCARE_SUPPORT_EMAIL: "attacker@evil.test",
      })
    );

    expect(state).toEqual({ status: "success", category: "problem" });
    expect(getHelpFeedbackMemoryInbox()).toHaveLength(1);
    const message = getHelpFeedbackMemoryInbox()[0];
    expect(message?.to).toBe("support@example.test");
    expect(message?.from).toBe("River Aftercare <accounts@example.test>");
    expect(message?.replyTo).toBe("ada@riverside.example.test");
    expect(message?.subject).toBe(
      "[River Aftercare Support] Problem — Guides will not save"
    );
    expect(message).not.toHaveProperty("bcc");
    expect(message).not.toHaveProperty("cc");
    expect(message?.text).toContain("Clinic: Riverside Dental");
    expect(message?.text).toContain("Account: clinic_riverside");
    expect(message?.text).toContain("Name: Ada Admin");
    expect(message?.text).toContain("Email: ada@riverside.example.test");
    expect(message?.text).toContain("Category: Problem");
    expect(message?.text).toContain("Page: /guides/guide_1");
    expect(message?.text).toContain("Environment: test");
    expect(message?.text).toMatch(/Submitted: \d{4}-\d{2}-\d{2}T/);
    expect(message?.text).toContain(SECRET);
    expect(message?.text).not.toContain("Attacker Clinic");
    expect(message?.text).not.toContain("membership_hidden");
    expect(message?.text).not.toContain("attacker@evil.test");
    expect(logs()).not.toContain(SECRET);
    expect(logs()).not.toContain("ada@riverside.example.test");
  });

  it("sends a question with the question subject", async () => {
    const state = await submitHelpFeedbackAction(
      initialHelpFeedbackActionState,
      formData({
        category: "question",
        summary: "Where is print?",
        message: "Which control opens the patient print view?",
      })
    );

    expect(state.status).toBe("success");
    const message = getHelpFeedbackMemoryInbox()[0];
    expect(message?.subject).toBe(
      "[River Aftercare Support] Question — Where is print?"
    );
    expect(message?.text).toContain("Category: Question");
    expect(message?.text).toContain(
      "Which control opens the patient print view?"
    );
  });

  it("sends a feature request without importance", async () => {
    clinicSession("STAFF");
    authState.user = {
      id: "user_sam",
      email: "sam@riverside.example.test",
      name: null,
      platformRole: "NONE",
    };

    const state = await submitHelpFeedbackAction(
      initialHelpFeedbackActionState,
      formData({
        category: "feature",
        summary: "Ignore this subject",
        message: "Ignore this message",
        goal: "Share one guide with a new location",
        problem: "We copy the same instructions by hand.",
        importance: "",
      })
    );

    expect(state).toEqual({ status: "success", category: "feature" });
    const message = getHelpFeedbackMemoryInbox()[0];
    expect(message?.subject).toBe(
      "[River Aftercare Feedback] Feature request — Share one guide with a new location"
    );
    expect(message?.replyTo).toBe("sam@riverside.example.test");
    expect(message?.text).toContain("Name: Not provided");
    expect(message?.text).toContain("Clinic: Riverside Dental");
    expect(message?.text).toContain("Account: clinic_riverside");
    expect(message?.text).toContain(
      "What would you like River Aftercare to help you do?"
    );
    expect(message?.text).toContain("Share one guide with a new location");
    expect(message?.text).toContain("We copy the same instructions by hand.");
    expect(message?.text).toContain("Importance: Not specified");
    expect(message?.text).not.toContain("Ignore this subject");
  });

  it("includes a chosen feature importance", async () => {
    const state = await submitHelpFeedbackAction(
      initialHelpFeedbackActionState,
      formData({
        category: "feature",
        goal: "Export a plain-text guide",
        problem: "Some staff cannot open the formatted page.",
        importance: "very_important",
      })
    );

    expect(state.status).toBe("success");
    expect(getHelpFeedbackMemoryInbox()[0]?.text).toContain(
      "Importance: Very important"
    );
  });

  it("drops an unsafe origin path without changing a normal subject", async () => {
    const state = await submitHelpFeedbackAction(
      initialHelpFeedbackActionState,
      formData({
        summary: "Save failed",
        originPath: "https://evil.test/phish",
        message: "The button stays disabled.",
      })
    );

    expect(state.status).toBe("success");
    const message = getHelpFeedbackMemoryInbox()[0];
    expect(message?.subject).toBe(
      "[River Aftercare Support] Problem — Save failed"
    );
    expect(message?.to).toBe("support@example.test");
    expect(message?.text).toContain("Page: Not provided");
  });

  it("mirrors the line-break rejection in the client field check", () => {
    expect(
      helpFeedbackClientFieldErrors({
        category: "problem",
        summary: "Save failed\r\nBcc: attacker@evil.test",
        message: "The button stays disabled.",
        goal: "",
        problem: "",
        importance: "",
        originPath: "/guides",
      }).summary
    ).toBe(HELP_FEEDBACK_MESSAGES.lineBreaks);
    expect(
      helpFeedbackClientFieldErrors({
        category: "feature",
        summary: "",
        message: "",
        goal: "Export a guide\n",
        problem: "Staff retype the same status.",
        importance: "",
        originPath: "",
      }).goal
    ).toBe(HELP_FEEDBACK_MESSAGES.lineBreaks);
  });

  it("rejects a summary that contains a carriage return", async () => {
    const state = await submitHelpFeedbackAction(
      initialHelpFeedbackActionState,
      formData({ summary: "Save failed\r" })
    );

    expect(state.status).toBe("error");
    if (state.status === "error") {
      expect(state.fieldErrors?.summary).toBe(
        HELP_FEEDBACK_MESSAGES.lineBreaks
      );
    }
    expect(getHelpFeedbackMemoryInbox()).toHaveLength(0);
  });

  it("rejects a summary that contains a line feed", async () => {
    const state = await submitHelpFeedbackAction(
      initialHelpFeedbackActionState,
      formData({ summary: "Save failed\n" })
    );

    expect(state.status).toBe("error");
    if (state.status === "error") {
      expect(state.fieldErrors?.summary).toBe(
        HELP_FEEDBACK_MESSAGES.lineBreaks
      );
    }
    expect(getHelpFeedbackMemoryInbox()).toHaveLength(0);
  });

  it("rejects a summary that contains another ASCII header control", async () => {
    const state = await submitHelpFeedbackAction(
      initialHelpFeedbackActionState,
      formData({ summary: "Save failed\u007f" })
    );

    expect(state.status).toBe("error");
    if (state.status === "error") {
      expect(state.fieldErrors?.summary).toBe(
        HELP_FEEDBACK_MESSAGES.lineBreaks
      );
    }
    expect(getHelpFeedbackMemoryInbox()).toHaveLength(0);
  });

  it("does not send when the summary tries to append a header", async () => {
    const state = await submitHelpFeedbackAction(
      initialHelpFeedbackActionState,
      formData({
        summary: "Save failed\r\nBcc: attacker@evil.test",
        message: "The button stays disabled.",
      })
    );

    expect(state.status).toBe("error");
    if (state.status === "error") {
      expect(state.fieldErrors?.summary).toBe(
        HELP_FEEDBACK_MESSAGES.lineBreaks
      );
      expect(state.error).toBe(HELP_FEEDBACK_REVIEW_FIELDS);
    }
    expect(getHelpFeedbackMemoryInbox()).toHaveLength(0);
    expect(logs()).not.toContain("attacker@evil.test");
    expect(logs()).not.toContain("Bcc:");
  });

  it("rejects a feature goal that contains a line feed", async () => {
    const state = await submitHelpFeedbackAction(
      initialHelpFeedbackActionState,
      formData({
        category: "feature",
        goal: "Export a guide\nBcc: attacker@evil.test",
        problem: "Staff retype the same status.",
      })
    );

    expect(state.status).toBe("error");
    if (state.status === "error") {
      expect(state.fieldErrors?.goal).toBe(HELP_FEEDBACK_MESSAGES.lineBreaks);
    }
    expect(getHelpFeedbackMemoryInbox()).toHaveLength(0);
    expect(logs()).not.toContain("attacker@evil.test");
  });

  it("keeps line breaks in the message body off the subject", async () => {
    const state = await submitHelpFeedbackAction(
      initialHelpFeedbackActionState,
      formData({
        summary: "Save failed",
        message: "The button stays disabled.\nIt never enables.",
      })
    );

    expect(state.status).toBe("success");
    const message = getHelpFeedbackMemoryInbox()[0];
    expect(message?.subject).toBe(
      "[River Aftercare Support] Problem — Save failed"
    );
    expect(message?.subject).not.toMatch(/[\r\n\u0000-\u001f\u007f]/);
    expect(message?.text).toContain(
      "The button stays disabled.\nIt never enables."
    );
  });

  it("does not send when delivery is given a subject with a line break", async () => {
    const result = await deliverHelpFeedback({
      submission: {
        category: "problem",
        summary: "Save failed\r\nBcc: attacker@evil.test",
        message: "The button stays disabled.",
        originPath: null,
      },
      clinic: { id: "clinic_riverside", name: "Riverside Dental" },
      user: { name: "Ada Admin", email: "ada@riverside.example.test" },
    });

    expect(result).toEqual({ ok: false });
    expect(getHelpFeedbackMemoryInbox()).toHaveLength(0);
    expect(logs()).not.toContain("Save failed");
    expect(logs()).not.toContain("Bcc:");
    expect(logs()).not.toContain("attacker@evil.test");
    expect(errorSpy).toHaveBeenCalledWith({
      event: "help_feedback_delivery_failed",
      clinicId: "clinic_riverside",
      category: "problem",
      failureCode: "invalid_message",
    });
  });

  it("rejects a recipient that is not a single email address", async () => {
    process.env.RIVER_AFTERCARE_SUPPORT_EMAIL =
      "support@example.test\r\nBcc: attacker@evil.test";

    const state = await submitHelpFeedbackAction(
      initialHelpFeedbackActionState,
      formData()
    );

    expect(state).toMatchObject({
      status: "error",
      error: HELP_FEEDBACK_DELIVERY_FAILED,
    });
    expect(state.error).not.toMatch(/resend|smtp|bcc|support@example/i);
    expect(getHelpFeedbackMemoryInbox()).toHaveLength(0);
    expect(errorSpy).toHaveBeenCalledWith({
      event: "help_feedback_not_configured",
      clinicId: "clinic_riverside",
      category: "problem",
      failureCode: "not_configured",
    });
    expect(logs()).not.toContain(SECRET);
  });

  it("requires a summary and a message, and enforces length limits", async () => {
    const missing = await submitHelpFeedbackAction(
      initialHelpFeedbackActionState,
      formData({ summary: "   ", message: "" })
    );
    expect(missing.status).toBe("error");
    if (missing.status === "error") {
      expect(missing.fieldErrors?.summary).toMatch(/summary/i);
      expect(missing.fieldErrors?.message).toMatch(/message/i);
    }
    expect(getHelpFeedbackMemoryInbox()).toHaveLength(0);

    const overlong = await submitHelpFeedbackAction(
      initialHelpFeedbackActionState,
      formData({
        summary: "S".repeat(HELP_FEEDBACK_LIMITS.summary + 1),
        message: "M".repeat(HELP_FEEDBACK_LIMITS.message + 1),
      })
    );
    expect(overlong.status).toBe("error");
    if (overlong.status === "error") {
      expect(overlong.fieldErrors?.summary).toMatch(/too long/i);
      expect(overlong.fieldErrors?.message).toMatch(/too long/i);
    }
    expect(getHelpFeedbackMemoryInbox()).toHaveLength(0);
  });

  it("requires the feature problem and treats importance as optional", async () => {
    const missing = await submitHelpFeedbackAction(
      initialHelpFeedbackActionState,
      formData({
        category: "feature",
        goal: "",
        problem: "",
        importance: "urgent\r\nBcc: attacker@evil.test",
      })
    );
    expect(missing.status).toBe("error");
    if (missing.status === "error") {
      expect(missing.fieldErrors?.goal).toBeTruthy();
      expect(missing.fieldErrors?.problem).toBeTruthy();
      expect(missing.fieldErrors?.importance).toMatch(/importance/i);
    }
    expect(getHelpFeedbackMemoryInbox()).toHaveLength(0);
    expect(logs()).not.toContain("attacker@evil.test");
  });

  it("does not write the message body when delivery is not configured", async () => {
    delete process.env.RIVER_AFTERCARE_SUPPORT_EMAIL;
    process.env.VERCEL_ENV = "preview";
    process.env.SENTRY_DSN =
      "https://examplePublicKey@o0.ingest.example.test/0";

    const state = await submitHelpFeedbackAction(
      initialHelpFeedbackActionState,
      formData()
    );

    expect(state).toMatchObject({
      status: "error",
      error: HELP_FEEDBACK_DELIVERY_FAILED,
    });
    expect(getHelpFeedbackMemoryInbox()).toHaveLength(0);
    expect(logs()).not.toContain(SECRET);
    expect(sentryState.captureEvent).toHaveBeenCalled();
    expect(JSON.stringify(sentryState.captureEvent.mock.calls)).toContain(
      "support_email_not_configured"
    );
    expect(JSON.stringify(sentryState.captureEvent.mock.calls)).not.toContain(
      SECRET
    );
  });
});
