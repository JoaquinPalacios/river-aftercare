import { vi } from "vitest";

vi.mock("server-only", () => ({}));

if (!process.env.AUTH_SECRET) {
  process.env.AUTH_SECRET = "test-auth-secret";
}
