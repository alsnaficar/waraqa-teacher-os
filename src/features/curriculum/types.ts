/**
 * Curriculum storage service — provider-agnostic types.
 *
 * These types describe the contract every storage provider (Google Drive,
 * Supabase Storage, etc.) must satisfy. No provider is implemented yet.
 */

export type CurriculumProviderId = "google-drive";

export interface CurriculumFileRef {
  /** Provider-specific file identifier (e.g. Google Drive file ID). */
  id: string;
  /** Human-readable file name including extension. */
  name: string;
  /** MIME type reported by the provider. */
  mimeType: string;
  /** Size in bytes, when known. */
  size?: number;
  /** ISO timestamp of last modification, when known. */
  modifiedAt?: string;
  /** Optional provider-specific parent/folder identifier. */
  parentId?: string;
}

export interface ListFilesOptions {
  /** Restrict to a specific folder (provider-specific ID). */
  folderId?: string;
  /** Free-text search query. */
  query?: string;
  /** Page size hint. */
  pageSize?: number;
  /** Opaque pagination cursor returned by a previous call. */
  pageToken?: string;
}

export interface ListFilesResult {
  files: CurriculumFileRef[];
  /** Opaque cursor for the next page, if any. */
  nextPageToken?: string;
}

export interface UploadFileInput {
  name: string;
  mimeType: string;
  data: Blob | ArrayBuffer;
  folderId?: string;
}

/**
 * Contract implemented by every curriculum storage provider.
 * All methods are async and return provider-agnostic shapes.
 */
export interface CurriculumStorageProvider {
  readonly id: CurriculumProviderId;
  listFiles(options?: ListFilesOptions): Promise<ListFilesResult>;
  getFile(fileId: string): Promise<CurriculumFileRef>;
  downloadFile(fileId: string): Promise<Blob>;
  uploadFile(input: UploadFileInput): Promise<CurriculumFileRef>;
  deleteFile(fileId: string): Promise<void>;
}
