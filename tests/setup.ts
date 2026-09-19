import { vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("next/font/google", () => {
  const createFont = (options: { variable?: string } = {}) => ({
    className: "mock-next-font",
    variable: options.variable ?? "--font-mock",
    style: { fontFamily: "Mock Next Font" },
  });

  return {
    Geist: createFont,
    Geist_Mono: createFont,
    Open_Sans: createFont,
    Roboto: createFont,
    Montserrat: createFont,
    Lato: createFont,
    Poppins: createFont,
    Inter: createFont,
  };
});

if (!process.env.AUTH_SECRET) {
  process.env.AUTH_SECRET = "test-auth-secret";
}
