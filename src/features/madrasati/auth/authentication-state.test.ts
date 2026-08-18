import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { detectMadrasatiAuthenticationState } from "./authentication-state.ts";

describe("Madrasati authentication state detection", () => {
  it("detects Microsoft sign-in as not authenticated", () => {
    assert.equal(
      detectMadrasatiAuthenticationState({
        url: "https://login.microsoftonline.com/organizations/oauth2/v2.0/authorize",
        title: "Sign in to your account",
        text: "قائمة المدارس قائمة الأبناء الإعلانات",
      }),
      "not_authenticated",
    );
  });

  it("detects Madrasati sign-in page as not authenticated", () => {
    assert.equal(
      detectMadrasatiAuthenticationState({
        url: "https://schools.madrasati.sa/Auth/SignIn",
        title: "Madrasati",
        text: "تسجيل الدخول قائمة المدارس قائمة الأبناء",
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

  it("detects authenticated school/children/announcements home", () => {
    assert.equal(
      detectMadrasatiAuthenticationState({
        url: "https://schools.madrasati.sa/Home",
        title: "مدرستي",
        text: "قائمة المدارس\nقائمة الأبناء\nالإعلانات",
      }),
      "authenticated",
    );
  });

  it("detects an authenticated Madrasati teacher home after Microsoft SSO", () => {
    assert.equal(
      detectMadrasatiAuthenticationState({
        url: "https://schools.madrasati.sa/",
        title: "مدرستي",
        text: "جدولي\nالمقررات والمصادر\nالواجبات",
      }),
      "authenticated",
    );
  });

  it("detects authenticated teacher home on a Madrasati subdomain", () => {
    assert.equal(
      detectMadrasatiAuthenticationState({
        url: "https://lms.madrasati.sa/Home",
        title: "مدرستي",
        text: "تسجيل الخروج\nالاختبارات",
      }),
      "authenticated",
    );
  });

  it("still treats Microsoft login as not authenticated when teacher markers are present", () => {
    assert.equal(
      detectMadrasatiAuthenticationState({
        url: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
        title: "Sign in",
        text: "جدولي المقررات الواجبات تسجيل الخروج",
      }),
      "not_authenticated",
    );
  });

  it("fails closed for an unknown page", () => {
    assert.equal(
      detectMadrasatiAuthenticationState({
        url: "https://example.com/",
        title: "Example",
        text: "Example Domain قائمة المدارس قائمة الأبناء",
      }),
      "not_authenticated",
    );
  });

  it("fails closed for a Madrasati page without authenticated markers", () => {
    assert.equal(
      detectMadrasatiAuthenticationState({
        url: "https://schools.madrasati.sa/unknown",
        title: "مدرستي",
        text: "صفحة عامة بدون مؤشرات كافية",
      }),
      "not_authenticated",
    );
  });

  it("fails closed when only one authenticated marker is present", () => {
    assert.equal(
      detectMadrasatiAuthenticationState({
        url: "https://schools.madrasati.sa/",
        title: "مدرستي",
        text: "الإعلانات فقط",
      }),
      "not_authenticated",
    );
  });
});
