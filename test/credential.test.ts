import { describe, expect, it } from "vitest";

import {
  isSetupTokenCredential,
  SETUP_TOKEN_LIFETIME_MS,
  setupTokenCredential,
  setupTokenRefreshError,
  toOAuthCredential,
} from "../src/credential.ts";
import { ClaudeAuthError } from "../src/oauth.ts";

describe("toOAuthCredential", () => {
  it("expires at the server deadline and leaves the early refresh to Pi", () => {
    const credential = toOAuthCredential({ access: "a", refresh: "r", expiresIn: 3600 }, 1_000);
    expect(credential).toEqual({
      type: "oauth",
      access: "a",
      refresh: "r",
      expires: 1_000 + 3_600_000,
    });
  });

  it("does not store a short-lived token as already expired", () => {
    expect(toOAuthCredential({ access: "a", refresh: "r", expiresIn: 300 }, 1_000).expires).toBe(
      301_000,
    );
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

  it.each(["hunter2", "sk-ant-api03-key", ""])("rejects the non-Claude value %j", (value) => {
    expect(() => setupTokenCredential(value)).toThrow(/claude setup-token/);
  });

  it.each(["sk-ant-oat01-AAAA\nBBBB", "sk-ant-oat01-AAAA BBBB", "sk-ant-oat01-AAAABBBB\u201d"])(
    "rejects the malformed setup token %j without echoing it",
    (value) => {
      expect(() => setupTokenCredential(value)).toThrow(ClaudeAuthError);
      expect(() => setupTokenCredential(value)).not.toThrow(/AAAA/);
    },
  );

  it("explains that a setup token cannot be refreshed", () => {
    expect(setupTokenRefreshError().message).toMatch(/cannot be refreshed/);
  });
});
