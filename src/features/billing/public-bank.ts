import type { PublicBankDetails } from "./types";

type EnvLike = Record<string, string | undefined>;

function readTrimmed(env: EnvLike, key: string): string {
  return env[key]?.trim() ?? "";
}

/**
 * Public bank destination from server env. Missing/blank values yield null
 * rather than a partial object. Never reads payment_methods.settings.
 */
export function readPublicBankDetails(env: EnvLike = process.env): PublicBankDetails | null {
  const name = readTrimmed(env, "BILLING_BANK_NAME");
  const beneficiary = readTrimmed(env, "BILLING_BANK_BENEFICIARY");
  const iban = readTrimmed(env, "BILLING_BANK_IBAN");

  if (!name || !beneficiary || !iban) {
    return null;
  }

  return { name, beneficiary, iban };
}

export const PUBLIC_BANK_FIELDS = ["name", "beneficiary", "iban"] as const;
