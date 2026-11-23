-- DropIndex
DROP INDEX "events_id_key";

-- CreateIndex
CREATE UNIQUE INDEX "events_workspace_id_id_key" ON "events"("workspace_id", "id");

-- Append-only guard (ADR-0002): events are never updated. Deletion stays possible for the
-- retention/erasure policy (RSK-004), which will get its own controlled path.
CREATE FUNCTION events_reject_update() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'events is append-only: UPDATE is not allowed (store_sequence=%)', OLD.store_sequence
    USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE TRIGGER events_append_only
BEFORE UPDATE ON events
FOR EACH ROW EXECUTE FUNCTION events_reject_update();
