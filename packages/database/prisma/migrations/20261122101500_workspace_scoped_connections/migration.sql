-- DropForeignKey
ALTER TABLE "agent_instances" DROP CONSTRAINT "agent_instances_connection_id_fkey";

-- DropForeignKey
ALTER TABLE "tasks" DROP CONSTRAINT "tasks_connection_id_fkey";

-- CreateIndex
CREATE UNIQUE INDEX "connections_id_workspace_id_key" ON "connections"("id", "workspace_id");

-- AddForeignKey
ALTER TABLE "agent_instances" ADD CONSTRAINT "agent_instances_connection_id_workspace_id_fkey" FOREIGN KEY ("connection_id", "workspace_id") REFERENCES "connections"("id", "workspace_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_connection_id_workspace_id_fkey" FOREIGN KEY ("connection_id", "workspace_id") REFERENCES "connections"("id", "workspace_id") ON DELETE RESTRICT ON UPDATE CASCADE;
