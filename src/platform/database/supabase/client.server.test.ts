import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import {
  resetSupabaseAdminClientForTests,
  resolveSupabaseAdminEnv,
  supabaseAdmin,
} from "./client.server.ts";

const ENV_KEYS = ["NODE_ENV", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"] as const;

type EnvSnapshot = Record<(typeof ENV_KEYS)[number], string | undefined>;

function snapshotEnv(): EnvSnapshot {
  return {
    NODE_ENV: process.env.NODE_ENV,
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
}

function restoreEnv(snapshot: EnvSnapshot): void {
  for (const key of ENV_KEYS) {
    const value = snapshot[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  resetSupabaseAdminClientForTests();
}

describe("resolveSupabaseAdminEnv", () => {
  let envSnapshot: EnvSnapshot;

  afterEach(() => {
    restoreEnv(envSnapshot);
  });

  it("throws in production when admin env is missing", () => {
    envSnapshot = snapshotEnv();
    process.env.NODE_ENV = "production";
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    assert.throws(() => resolveSupabaseAdminEnv(), /Missing required server environment configuration/);
  });

  it("throws in production when admin env uses placeholder values", () => {
    envSnapshot = snapshotEnv();
    process.env.NODE_ENV = "production";
    process.env.SUPABASE_URL = "https://placeholder.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "placeholder-key";

    assert.throws(() => resolveSupabaseAdminEnv(), /Missing required server environment configuration/);
  });

  it("returns configured credentials in production when env is valid", () => {
    envSnapshot = snapshotEnv();
    process.env.NODE_ENV = "production";
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "sb_secret_test_key_for_unit_tests";

    const resolved = resolveSupabaseAdminEnv();
    assert.equal(resolved.supabaseUrl, "https://example.supabase.co");
    assert.equal(resolved.serviceRoleKey, "sb_secret_test_key_for_unit_tests");
  });

  it("allows placeholder fallback outside production for developer experience", () => {
    envSnapshot = snapshotEnv();
    process.env.NODE_ENV = "development";
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    const resolved = resolveSupabaseAdminEnv();
    assert.equal(resolved.supabaseUrl, "https://placeholder.supabase.co");
    assert.equal(resolved.serviceRoleKey, "placeholder-key");
  });
});

describe("supabaseAdmin proxy", () => {
  let envSnapshot: EnvSnapshot;

  afterEach(() => {
    restoreEnv(envSnapshot);
  });

  it("fails hard on first access in production when admin env is missing", () => {
    envSnapshot = snapshotEnv();
    process.env.NODE_ENV = "production";
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    resetSupabaseAdminClientForTests();

    assert.throws(() => supabaseAdmin.from("profiles"), /Missing required server environment configuration/);
  });

  it("creates a client on first access in production when admin env is valid", () => {
    envSnapshot = snapshotEnv();
    process.env.NODE_ENV = "production";
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "sb_secret_test_key_for_unit_tests";
    resetSupabaseAdminClientForTests();

    assert.equal(typeof supabaseAdmin.from, "function");
  });
});
