/**
 * Google Drive curriculum storage provider — STUB.
 *
 * This file intentionally does NOT call the Google Drive API, handle
 * authentication, or transfer files. It only declares the provider shape
 * so the rest of the app can depend on the abstraction today and the
 * real implementation can land later behind the same interface.
 */

import type {
  CurriculumFileRef,
  CurriculumStorageProvider,
  ListFilesOptions,
  ListFilesResult,
  UploadFileInput,
} from "../types";

function notImplemented(method: string): never {
  throw new Error(
    `GoogleDriveCurriculumProvider.${method} is not implemented yet. ` +
      `The Google Drive integration will be wired up in a later step.`,
  );
}

export class GoogleDriveCurriculumProvider implements CurriculumStorageProvider {
  readonly id = "google-drive" as const;

  async listFiles(_options?: ListFilesOptions): Promise<ListFilesResult> {
    notImplemented("listFiles");
  }

  async getFile(_fileId: string): Promise<CurriculumFileRef> {
    notImplemented("getFile");
  }

  async downloadFile(_fileId: string): Promise<Blob> {
    notImplemented("downloadFile");
  }

  async uploadFile(_input: UploadFileInput): Promise<CurriculumFileRef> {
    notImplemented("uploadFile");
  }

  async deleteFile(_fileId: string): Promise<void> {
    notImplemented("deleteFile");
  }
}
