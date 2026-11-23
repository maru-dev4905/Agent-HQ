-- DropForeignKey
ALTER TABLE "events" DROP CONSTRAINT "events_connection_id_fkey";

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_connection_id_workspace_id_fkey" FOREIGN KEY ("connection_id", "workspace_id") REFERENCES "connections"("id", "workspace_id") ON DELETE RESTRICT ON UPDATE CASCADE;
