-- Cloudflare D1 schema for XRPL Flow template marketplace.
-- The current Express MVP uses an in-memory store; this schema is the target
-- shape for a Durable/Worker-backed marketplace deployment.

CREATE TABLE IF NOT EXISTS marketplace_users (
  address TEXT PRIMARY KEY,
  display_name TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS marketplace_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  tags_json TEXT NOT NULL,
  author_address TEXT NOT NULL,
  workflow_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  published INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY (author_address) REFERENCES marketplace_users(address)
);

CREATE INDEX IF NOT EXISTS marketplace_templates_updated_idx
  ON marketplace_templates(updated_at DESC);

CREATE INDEX IF NOT EXISTS marketplace_templates_author_idx
  ON marketplace_templates(author_address);
