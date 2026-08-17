import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { detectMadrasatiAuthenticationState } from "./authentication-state.ts";

describe("Madrasati authentication state detection", () => {
  it("detects Microsoft sign-in as not authenticated", () => {
    assert.equal(
      detectMadrasatiAuthenticationState({
        url: "https://login.microsoftonline.com/organizations/oauth2/v2.0/authorize",
        title: "Sign in to your account",
        text: "",
      }),
      "not_authenticated",
    );
  });

  it("detects Madrasati sign-in page as not authenticated", () => {
    assert.equal(
      detectMadrasatiAuthenticationState({
        url: "https://schools.madrasati.sa/Auth/SignIn",
        title: "Madrasati",
        text: "تسجيل الدخول",
      }),
      "not_authenticated",
    );
  });

  it("detects an authenticated Madrasati landing page", () => {
    assert.equal(
      detectMadrasatiAuthenticationState({
        url: "https://schools.madrasati.sa/",
        title: "مدرستي",
        text: "لوحة التحكم الرئيسية",
      }),
      "authenticated",
    );
  });

  it("fails closed for an unknown page", () => {
    assert.equal(
      detectMadrasatiAuthenticationState({
        url: "https://example.com/",
        title: "Example",
        text: "Example Domain",
      }),
      "not_authenticated",
    );
  });
});
