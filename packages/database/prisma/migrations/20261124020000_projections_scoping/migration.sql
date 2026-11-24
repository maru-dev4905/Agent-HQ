-- DropForeignKey
ALTER TABLE "agent_current_state" DROP CONSTRAINT "agent_current_state_agent_instance_id_fkey";

-- DropForeignKey
ALTER TABLE "task_current_state" DROP CONSTRAINT "task_current_state_task_id_fkey";

-- AlterTable: add as nullable, backfill, then require (coding-standards §6). Read models are
-- rebuildable, so last_event_at is an acceptable backfill until the next replay.
ALTER TABLE "agent_current_state" ADD COLUMN "last_received_at" TIMESTAMPTZ(3);
ALTER TABLE "task_current_state" ADD COLUMN "last_received_at" TIMESTAMPTZ(3);
UPDATE "agent_current_state" SET "last_received_at" = "last_event_at" WHERE "last_received_at" IS NULL;
UPDATE "task_current_state" SET "last_received_at" = "last_event_at" WHERE "last_received_at" IS NULL;
ALTER TABLE "agent_current_state" ALTER COLUMN "last_received_at" SET NOT NULL;
ALTER TABLE "task_current_state" ALTER COLUMN "last_received_at" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "agent_instances_id_workspace_id_key" ON "agent_instances"("id", "workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "tasks_id_workspace_id_key" ON "tasks"("id", "workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "agent_current_state_agent_instance_id_workspace_id_key" ON "agent_current_state"("agent_instance_id", "workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "task_current_state_task_id_workspace_id_key" ON "task_current_state"("task_id", "workspace_id");

-- AddForeignKey
ALTER TABLE "agent_current_state" ADD CONSTRAINT "agent_current_state_agent_instance_id_workspace_id_fkey" FOREIGN KEY ("agent_instance_id", "workspace_id") REFERENCES "agent_instances"("id", "workspace_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_current_state" ADD CONSTRAINT "task_current_state_task_id_workspace_id_fkey" FOREIGN KEY ("task_id", "workspace_id") REFERENCES "tasks"("id", "workspace_id") ON DELETE RESTRICT ON UPDATE CASCADE;
