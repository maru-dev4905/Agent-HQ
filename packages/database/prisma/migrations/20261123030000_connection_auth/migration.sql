-- AlterTable: add auth columns as nullable first so existing rows can be backfilled.
ALTER TABLE "connections" ADD COLUMN     "display_name" TEXT,
ADD COLUMN     "last_heartbeat_at" TIMESTAMPTZ(3),
ADD COLUMN     "revoked_at" TIMESTAMPTZ(3),
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'pending',
ADD COLUMN     "token_expires_at" TIMESTAMPTZ(3),
ADD COLUMN     "token_hash" TEXT;

-- Connections created before authentication existed have no token. Give each one an
-- unusable marker hash (never the SHA-256 of any token) and mark it revoked, so it can
-- never authenticate and does not count as active.
UPDATE "connections"
SET "token_hash" = 'legacy-no-token:' || "id",
    "token_expires_at" = CURRENT_TIMESTAMP,
    "revoked_at" = CURRENT_TIMESTAMP,
    "status" = 'disconnected'
WHERE "token_hash" IS NULL;

ALTER TABLE "connections" ALTER COLUMN "token_expires_at" SET NOT NULL,
ALTER COLUMN "token_hash" SET NOT NULL;

-- CreateTable
CREATE TABLE "registration_codes" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "code_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "used_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "registration_codes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "registration_codes_code_hash_key" ON "registration_codes"("code_hash");

-- CreateIndex
CREATE INDEX "registration_codes_workspace_id_idx" ON "registration_codes"("workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "connections_token_hash_key" ON "connections"("token_hash");

-- AddForeignKey
ALTER TABLE "registration_codes" ADD CONSTRAINT "registration_codes_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
