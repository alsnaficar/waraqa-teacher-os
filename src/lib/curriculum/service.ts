/**
 * Curriculum service — single entry point for the app.
 *
 * Consumers import `getCurriculumService()` and never reference a specific
 * provider. Swapping storage backends later is a one-line change here.
 */

import { GoogleDriveCurriculumProvider } from "./providers/google-drive";
import type { CurriculumProviderId, CurriculumStorageProvider } from "./types";

const DEFAULT_PROVIDER: CurriculumProviderId = "google-drive";

let cached: CurriculumStorageProvider | undefined;

export function getCurriculumService(
  provider: CurriculumProviderId = DEFAULT_PROVIDER,
): CurriculumStorageProvider {
  if (cached && cached.id === provider) return cached;

  switch (provider) {
    case "google-drive":
      cached = new GoogleDriveCurriculumProvider();
      return cached;
    default: {
      const _exhaustive: never = provider;
      throw new Error(`Unknown curriculum provider: ${String(_exhaustive)}`);
    }
  }
}

export type {
  CurriculumFileRef,
  CurriculumProviderId,
  CurriculumStorageProvider,
  ListFilesOptions,
  ListFilesResult,
  UploadFileInput,
} from "./types";
