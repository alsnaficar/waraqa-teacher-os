export type AdminHomePath = "/admin" | "/dashboard";

/**
 * Single-role post-login destination from an explicit admin-row check.
 * Dual historical rows: presence of admin wins (same as assertAdmin).
 */
export function pickPostLoginPath(isAdmin: boolean): AdminHomePath {
  return isAdmin ? "/admin" : "/dashboard";
}
