/**
 * Human Review repository factory.
 *
 * Usage:
 *   import { createRepository } from "../lib/humanReview";
 *   const repo = createRepository();
 *
 * Storage mode selection (in priority order):
 *   1. HUMAN_REVIEW_STORAGE_MODE env var ("durable_postgres" | "local_filesystem")
 *   2. POSTGRES_URL present → "durable_postgres"
 *   3. Default → "local_filesystem"
 *
 * Operator setup for durable_postgres:
 *   1. Create a Vercel Postgres store in the Vercel dashboard.
 *   2. Link the store to your project (Vercel auto-injects POSTGRES_URL).
 *   3. Run the init script once:
 *        psql $POSTGRES_URL < migrations/human-review-init.sql
 */

export type { HumanReviewRepository, SaveSnapshotResult, AppendReviewResult, ListReviewsFilter } from "./HumanReviewRepository";
export { LocalFilesystemHumanReviewRepository } from "./LocalFilesystemHumanReviewRepository";
export { DurableHumanReviewRepository } from "./DurableHumanReviewRepository";

import type { HumanReviewRepository } from "./HumanReviewRepository";
import { LocalFilesystemHumanReviewRepository } from "./LocalFilesystemHumanReviewRepository";
import { DurableHumanReviewRepository } from "./DurableHumanReviewRepository";

/**
 * Create and return the appropriate repository instance.
 *
 * Throws if durable_postgres mode is selected but POSTGRES_URL is absent.
 * Set HUMAN_REVIEW_STORAGE_MODE=local_filesystem to explicitly force local mode.
 */
export function createRepository(): HumanReviewRepository {
  const explicitMode = process.env.HUMAN_REVIEW_STORAGE_MODE;

  if (explicitMode === "durable_postgres") {
    return new DurableHumanReviewRepository();
  }

  if (explicitMode === "local_filesystem") {
    return new LocalFilesystemHumanReviewRepository();
  }

  // Auto-select: use durable if POSTGRES_URL is present.
  if (process.env.POSTGRES_URL) {
    return new DurableHumanReviewRepository();
  }

  return new LocalFilesystemHumanReviewRepository();
}
