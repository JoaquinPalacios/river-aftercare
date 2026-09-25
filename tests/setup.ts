import { vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("next/font/local", () => ({
  default: (options: { variable?: string } = {}) => ({
    className: "mock-next-font",
    variable: options.variable ?? "--font-mock",
    style: { fontFamily: "Mock Next Font" },
  }),
}));

if (!process.env.AUTH_SECRET) {
  process.env.AUTH_SECRET = "test-auth-secret";
}
