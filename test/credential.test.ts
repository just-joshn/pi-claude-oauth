import { describe, expect, it } from "vitest";
import {
  EXPIRY_SKEW_MS,
  isClaudeToken,
  isSetupTokenCredential,
  SETUP_TOKEN_LIFETIME_MS,
  setupTokenCredential,
  setupTokenRefreshError,
  toOAuthCredential,
} from "../extensions/claude-oauth/credential";

describe("toOAuthCredential", () => {
  it("expires five minutes before the server deadline", () => {
    const credential = toOAuthCredential({ access: "a", refresh: "r", expiresIn: 3600 }, "", 1_000);
    expect(credential).toEqual({ type: "oauth", access: "a", refresh: "r", expires: 1_000 + 3_600_000 - EXPIRY_SKEW_MS });
  });

  it("keeps the previous refresh token when a refresh does not rotate it", () => {
    expect(toOAuthCredential({ access: "a", expiresIn: 60 }, "old-refresh").refresh).toBe("old-refresh");
  });

  it("prefers a rotated refresh token", () => {
    expect(toOAuthCredential({ access: "a", refresh: "new", expiresIn: 60 }, "old").refresh).toBe("new");
  });
});

describe("isClaudeToken", () => {
  it("accepts subscription access and setup tokens", () => {
    expect(isClaudeToken("sk-ant-oat01-token")).toBe(true);
    expect(isClaudeToken("  sk-ant-oat01-token  ")).toBe(true);
  });

  it("rejects API keys and junk", () => {
    expect(isClaudeToken("sk-ant-api03-key")).toBe(false);
    expect(isClaudeToken("")).toBe(false);
  });
});

describe("setupTokenCredential", () => {
  it("stores a one-year non-refreshable credential", () => {
    const credential = setupTokenCredential(" sk-ant-oat01-token ", 10_000);
    expect(credential).toEqual({
      type: "oauth",
      access: "sk-ant-oat01-token",
      refresh: "",
      expires: 10_000 + SETUP_TOKEN_LIFETIME_MS,
    });
    expect(isSetupTokenCredential(credential)).toBe(true);
  });

  it("rejects a non-Claude value", () => {
    expect(() => setupTokenCredential("hunter2")).toThrow(/claude setup-token/);
  });

  it("explains that a setup token cannot be refreshed", () => {
    expect(setupTokenRefreshError().message).toMatch(/cannot be refreshed/);
  });
});
