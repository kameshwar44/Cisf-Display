-- The one table the gate server adds to `cisf`: an append-only record of
-- operator actions. Applied automatically on server start (idempotent).
CREATE TABLE IF NOT EXISTS "public"."audit_log" (
  "id"                   SERIAL PRIMARY KEY,
  "gate_transaction_id"  INTEGER NULL REFERENCES "public"."gate_transactions" ("id") ON DELETE SET NULL,
  "username"             VARCHAR(100) NULL,
  "action"               VARCHAR(50) NOT NULL,
  "detail"               JSONB NULL,
  "created_at"           TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "audit_log_gate_transaction_id_idx"
  ON "public"."audit_log" ("gate_transaction_id");
