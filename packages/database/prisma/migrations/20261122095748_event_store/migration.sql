-- AlterTable
ALTER TABLE "workspaces" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "connections" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "adapter_id" TEXT NOT NULL,
    "runtime" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_instances" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "connection_id" TEXT NOT NULL,
    "external_agent_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_instances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "connection_id" TEXT NOT NULL,
    "external_task_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "events" (
    "store_sequence" BIGSERIAL NOT NULL,
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "connection_id" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "content_hash" TEXT NOT NULL,
    "schema_version" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL,
    "received_at" TIMESTAMPTZ(3) NOT NULL,
    "timestamp_quality" TEXT,
    "agent_instance_id" TEXT,
    "task_id" TEXT,
    "project_id" TEXT,
    "mission_id" TEXT,
    "pipeline_run_id" TEXT,
    "node_run_id" TEXT,
    "correlation_id" TEXT NOT NULL,
    "causation_id" TEXT,
    "external_session_id" TEXT,
    "sequence" INTEGER,
    "sensitivity" TEXT,
    "source" JSONB NOT NULL,
    "payload" JSONB NOT NULL,

    CONSTRAINT "events_pkey" PRIMARY KEY ("store_sequence")
);

-- CreateTable
CREATE TABLE "event_outbox" (
    "store_sequence" BIGINT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_outbox_pkey" PRIMARY KEY ("store_sequence")
);

-- CreateIndex
CREATE INDEX "connections_workspace_id_idx" ON "connections"("workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "agent_instances_workspace_id_connection_id_external_agent_i_key" ON "agent_instances"("workspace_id", "connection_id", "external_agent_id");

-- CreateIndex
CREATE UNIQUE INDEX "tasks_workspace_id_connection_id_external_task_id_key" ON "tasks"("workspace_id", "connection_id", "external_task_id");

-- CreateIndex
CREATE UNIQUE INDEX "events_id_key" ON "events"("id");

-- CreateIndex
CREATE INDEX "events_workspace_id_store_sequence_idx" ON "events"("workspace_id", "store_sequence");

-- CreateIndex
CREATE INDEX "events_connection_id_external_session_id_sequence_idx" ON "events"("connection_id", "external_session_id", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "events_workspace_id_connection_id_idempotency_key_key" ON "events"("workspace_id", "connection_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "event_outbox_workspace_id_store_sequence_idx" ON "event_outbox"("workspace_id", "store_sequence");

-- AddForeignKey
ALTER TABLE "connections" ADD CONSTRAINT "connections_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_instances" ADD CONSTRAINT "agent_instances_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_instances" ADD CONSTRAINT "agent_instances_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "connections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "connections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "connections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_outbox" ADD CONSTRAINT "event_outbox_store_sequence_fkey" FOREIGN KEY ("store_sequence") REFERENCES "events"("store_sequence") ON DELETE RESTRICT ON UPDATE CASCADE;
