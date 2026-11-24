-- CreateTable
CREATE TABLE "agent_current_state" (
    "agent_instance_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "connection_id" TEXT NOT NULL,
    "observed_status" TEXT NOT NULL,
    "raw_status" TEXT,
    "agent_name" TEXT,
    "role_hint" TEXT,
    "parent_external_agent_id" TEXT,
    "execution_location" TEXT,
    "last_event_type" TEXT NOT NULL,
    "last_event_at" TIMESTAMPTZ(3) NOT NULL,
    "last_store_sequence" BIGINT NOT NULL,
    "order_keys" JSONB NOT NULL,

    CONSTRAINT "agent_current_state_pkey" PRIMARY KEY ("agent_instance_id")
);

-- CreateTable
CREATE TABLE "task_current_state" (
    "task_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "connection_id" TEXT NOT NULL,
    "agent_instance_id" TEXT,
    "status" TEXT NOT NULL,
    "title" TEXT,
    "parent_external_task_id" TEXT,
    "last_event_type" TEXT NOT NULL,
    "last_event_at" TIMESTAMPTZ(3) NOT NULL,
    "last_store_sequence" BIGINT NOT NULL,
    "order_keys" JSONB NOT NULL,

    CONSTRAINT "task_current_state_pkey" PRIMARY KEY ("task_id")
);

-- CreateIndex
CREATE INDEX "agent_current_state_workspace_id_idx" ON "agent_current_state"("workspace_id");

-- CreateIndex
CREATE INDEX "task_current_state_workspace_id_idx" ON "task_current_state"("workspace_id");

-- AddForeignKey
ALTER TABLE "agent_current_state" ADD CONSTRAINT "agent_current_state_agent_instance_id_fkey" FOREIGN KEY ("agent_instance_id") REFERENCES "agent_instances"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_current_state" ADD CONSTRAINT "task_current_state_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
