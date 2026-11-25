import { deepStrictEqual, match, strictEqual, throws } from "node:assert/strict";
import { describe, it } from "node:test";

import {
  isSetupTokenCredential,
  SETUP_TOKEN_LIFETIME_MS,
  setupTokenCredential,
  setupTokenRefreshError,
  toOAuthCredential,
} from "../src/credential.ts";

await describe("toOAuthCredential", async () => {
  await it("expires at the server deadline and leaves the early refresh to Pi", () => {
    const credential = toOAuthCredential({ access: "a", refresh: "r", expiresIn: 3600 }, 1_000);
    deepStrictEqual(credential, {
      type: "oauth",
      access: "a",
      refresh: "r",
      expires: 1_000 + 3_600_000,
    });
  });

  await it("does not store a short-lived token as already expired", () => {
    strictEqual(
      toOAuthCredential({ access: "a", refresh: "r", expiresIn: 300 }, 1_000).expires,
      301_000,
    );
  });
});

await describe("setupTokenCredential", async () => {
  await it("stores a one-year non-refreshable credential", () => {
    const credential = setupTokenCredential(" sk-ant-oat01-token ", 10_000);
    deepStrictEqual(credential, {
      type: "oauth",
      access: "sk-ant-oat01-token",
      refresh: "",
      expires: 10_000 + SETUP_TOKEN_LIFETIME_MS,
    });
    strictEqual(isSetupTokenCredential(credential), true);
  });

  for (const value of ["hunter2", "sk-ant-api03-key", ""]) {
    // oxlint-disable-next-line no-await-in-loop -- Registering a test inside a suite resolves immediately.
    await it(`rejects the non-Claude value ${JSON.stringify(value)}`, () => {
      throws(() => setupTokenCredential(value), /claude setup-token/);
    });
  }

  await it("explains that a setup token cannot be refreshed", () => {
    match(setupTokenRefreshError().message, /cannot be refreshed/);
  });
});
