-- B15: motor de flujos y tareas (M04, ADR-011). Definiciones versionadas con estados, transiciones,
-- permisos, condiciones y plazos; trámites, historial, tareas y decisiones de aprobación.

-- CreateTable
CREATE TABLE "wf_definitions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "version_number" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "entity_type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "published_at" TIMESTAMPTZ(6),
    "published_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "wf_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wf_states" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "definition_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "sla_hours" INTEGER,
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "assignee" JSONB,
    "approval" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "wf_states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wf_transitions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "definition_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "from_state" TEXT NOT NULL,
    "to_state" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "required_permission" TEXT,
    "condition" JSONB,
    "requires_comment" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "wf_transitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wf_instances" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "definition_id" UUID NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "current_state" TEXT NOT NULL,
    "facts" JSONB NOT NULL DEFAULT '{}',
    "started_by" UUID,
    "started_at" TIMESTAMPTZ(6) NOT NULL,
    "due_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "wf_instances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wf_history" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "instance_id" UUID NOT NULL,
    "from_state" TEXT,
    "to_state" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actor_id" UUID,
    "on_behalf_of" UUID,
    "comment" TEXT,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "wf_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wf_tasks" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "instance_id" UUID NOT NULL,
    "entry_id" UUID NOT NULL,
    "state_key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "assignee_id" UUID,
    "assignee_role" TEXT,
    "required_permission" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "due_at" TIMESTAMPTZ(6),
    "status" TEXT NOT NULL DEFAULT 'pending',
    "started_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "completed_by" UUID,
    "delegated_from_id" UUID,
    "escalated_to_id" UUID,
    "escalated_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "wf_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wf_approvals" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "approver_id" UUID NOT NULL,
    "on_behalf_of" UUID,
    "decision" TEXT NOT NULL,
    "comment" TEXT,
    "decided_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "wf_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "wf_definitions_tenant_id_status_idx" ON "wf_definitions"("tenant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "wf_definitions_tenant_id_id_key" ON "wf_definitions"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "wf_definitions_tenant_id_key_version_number_key" ON "wf_definitions"("tenant_id", "key", "version_number");

-- CreateIndex
CREATE INDEX "wf_states_tenant_id_definition_id_idx" ON "wf_states"("tenant_id", "definition_id");

-- CreateIndex
CREATE UNIQUE INDEX "wf_states_tenant_id_id_key" ON "wf_states"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "wf_states_definition_id_key_key" ON "wf_states"("definition_id", "key");

-- CreateIndex
CREATE INDEX "wf_transitions_tenant_id_definition_id_idx" ON "wf_transitions"("tenant_id", "definition_id");

-- CreateIndex
CREATE UNIQUE INDEX "wf_transitions_tenant_id_id_key" ON "wf_transitions"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "wf_transitions_definition_id_from_state_action_key" ON "wf_transitions"("definition_id", "from_state", "action");

-- CreateIndex
CREATE INDEX "wf_instances_tenant_id_definition_id_idx" ON "wf_instances"("tenant_id", "definition_id");

-- CreateIndex
CREATE INDEX "wf_instances_tenant_id_entity_type_entity_id_idx" ON "wf_instances"("tenant_id", "entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "wf_instances_tenant_id_started_by_idx" ON "wf_instances"("tenant_id", "started_by");

-- CreateIndex
CREATE UNIQUE INDEX "wf_instances_tenant_id_id_key" ON "wf_instances"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "wf_history_tenant_id_instance_id_occurred_at_idx" ON "wf_history"("tenant_id", "instance_id", "occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "wf_history_tenant_id_id_key" ON "wf_history"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "wf_tasks_tenant_id_instance_id_idx" ON "wf_tasks"("tenant_id", "instance_id");

-- CreateIndex
CREATE INDEX "wf_tasks_tenant_id_entry_id_idx" ON "wf_tasks"("tenant_id", "entry_id");

-- CreateIndex
CREATE INDEX "wf_tasks_tenant_id_assignee_id_status_idx" ON "wf_tasks"("tenant_id", "assignee_id", "status");

-- CreateIndex
CREATE INDEX "wf_tasks_tenant_id_assignee_role_status_idx" ON "wf_tasks"("tenant_id", "assignee_role", "status");

-- CreateIndex
CREATE INDEX "wf_tasks_tenant_id_escalated_to_id_status_idx" ON "wf_tasks"("tenant_id", "escalated_to_id", "status");

-- CreateIndex
CREATE INDEX "wf_tasks_tenant_id_status_due_at_idx" ON "wf_tasks"("tenant_id", "status", "due_at");

-- CreateIndex
CREATE UNIQUE INDEX "wf_tasks_tenant_id_id_key" ON "wf_tasks"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "wf_approvals_tenant_id_id_key" ON "wf_approvals"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "wf_approvals_tenant_id_task_id_key" ON "wf_approvals"("tenant_id", "task_id");

-- AddForeignKey
ALTER TABLE "wf_definitions" ADD CONSTRAINT "wf_definitions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wf_states" ADD CONSTRAINT "wf_states_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wf_states" ADD CONSTRAINT "wf_states_tenant_id_definition_id_fkey" FOREIGN KEY ("tenant_id", "definition_id") REFERENCES "wf_definitions"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wf_transitions" ADD CONSTRAINT "wf_transitions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wf_transitions" ADD CONSTRAINT "wf_transitions_tenant_id_definition_id_fkey" FOREIGN KEY ("tenant_id", "definition_id") REFERENCES "wf_definitions"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wf_instances" ADD CONSTRAINT "wf_instances_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wf_instances" ADD CONSTRAINT "wf_instances_tenant_id_definition_id_fkey" FOREIGN KEY ("tenant_id", "definition_id") REFERENCES "wf_definitions"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wf_history" ADD CONSTRAINT "wf_history_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wf_history" ADD CONSTRAINT "wf_history_tenant_id_instance_id_fkey" FOREIGN KEY ("tenant_id", "instance_id") REFERENCES "wf_instances"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wf_tasks" ADD CONSTRAINT "wf_tasks_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wf_tasks" ADD CONSTRAINT "wf_tasks_tenant_id_instance_id_fkey" FOREIGN KEY ("tenant_id", "instance_id") REFERENCES "wf_instances"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wf_tasks" ADD CONSTRAINT "wf_tasks_tenant_id_entry_id_fkey" FOREIGN KEY ("tenant_id", "entry_id") REFERENCES "wf_history"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wf_approvals" ADD CONSTRAINT "wf_approvals_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wf_approvals" ADD CONSTRAINT "wf_approvals_tenant_id_task_id_fkey" FOREIGN KEY ("tenant_id", "task_id") REFERENCES "wf_tasks"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Reglas de los datos -------------------------------------------------------------------------
-- Los valores permitidos son los de packages/contracts/src/wf. Una definición publicada o
-- retirada no cambia: los trámites en curso terminan con la versión con la que iniciaron.

ALTER TABLE "wf_definitions"
    ADD CONSTRAINT "wf_definitions_status_check" CHECK ("status" IN ('draft', 'published', 'retired')),
    ADD CONSTRAINT "wf_definitions_version_number_check" CHECK ("version_number" >= 1),
    ADD CONSTRAINT "wf_definitions_published_check"
        CHECK (("status" = 'draft') = ("published_at" IS NULL));

ALTER TABLE "wf_states"
    ADD CONSTRAINT "wf_states_kind_check" CHECK ("kind" IN ('initial', 'normal', 'approval', 'final')),
    ADD CONSTRAINT "wf_states_priority_check"
        CHECK ("priority" IN ('low', 'normal', 'high', 'urgent')),
    ADD CONSTRAINT "wf_states_sla_hours_check" CHECK ("sla_hours" IS NULL OR "sla_hours" BETWEEN 1 AND 2000),
    ADD CONSTRAINT "wf_states_approval_check" CHECK (("kind" = 'approval') = ("approval" IS NOT NULL));

ALTER TABLE "wf_tasks"
    ADD CONSTRAINT "wf_tasks_kind_check" CHECK ("kind" IN ('action', 'approval')),
    ADD CONSTRAINT "wf_tasks_status_check"
        CHECK ("status" IN ('pending', 'in_progress', 'completed', 'overdue', 'cancelled')),
    ADD CONSTRAINT "wf_tasks_priority_check" CHECK ("priority" IN ('low', 'normal', 'high', 'urgent')),
    ADD CONSTRAINT "wf_tasks_closed_check"
        CHECK (("status" IN ('completed', 'cancelled')) = ("completed_at" IS NOT NULL));

ALTER TABLE "wf_approvals"
    ADD CONSTRAINT "wf_approvals_decision_check" CHECK ("decision" IN ('approved', 'rejected'));

CREATE FUNCTION "wf_keep_published_definitions"() RETURNS TRIGGER
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF OLD.status <> 'draft' AND (
        NEW.key IS DISTINCT FROM OLD.key
        OR NEW.version_number IS DISTINCT FROM OLD.version_number
        OR NEW.entity_type IS DISTINCT FROM OLD.entity_type
        OR NEW.name IS DISTINCT FROM OLD.name
        OR NEW.description IS DISTINCT FROM OLD.description
        OR NEW.published_at IS DISTINCT FROM OLD.published_at
        OR NEW.status = 'draft') THEN
        RAISE EXCEPTION 'Una versión publicada de un flujo no se puede cambiar'
            USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "wf_definitions_keep_published"
    BEFORE UPDATE ON "wf_definitions"
    FOR EACH ROW EXECUTE FUNCTION "wf_keep_published_definitions"();

-- Los estados y transiciones solo se escriben mientras su definición es un borrador.
CREATE FUNCTION "wf_only_draft_parts"() RETURNS TRIGGER
    LANGUAGE plpgsql
    AS $$
DECLARE
    parent_status TEXT;
BEGIN
    SELECT status INTO parent_status FROM "wf_definitions"
        WHERE id = NEW.definition_id;
    IF parent_status IS DISTINCT FROM 'draft' THEN
        RAISE EXCEPTION 'Solo un borrador de flujo se puede editar'
            USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "wf_states_only_draft"
    BEFORE INSERT OR UPDATE ON "wf_states"
    FOR EACH ROW EXECUTE FUNCTION "wf_only_draft_parts"();

CREATE TRIGGER "wf_transitions_only_draft"
    BEFORE INSERT OR UPDATE ON "wf_transitions"
    FOR EACH ROW EXECUTE FUNCTION "wf_only_draft_parts"();

-- Columnas de control --------------------------------------------------------------------------

CREATE TRIGGER "wf_definitions_control_columns"
    BEFORE INSERT OR UPDATE ON "wf_definitions"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();
CREATE TRIGGER "wf_states_control_columns"
    BEFORE INSERT OR UPDATE ON "wf_states"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();
CREATE TRIGGER "wf_transitions_control_columns"
    BEFORE INSERT OR UPDATE ON "wf_transitions"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();
CREATE TRIGGER "wf_instances_control_columns"
    BEFORE INSERT OR UPDATE ON "wf_instances"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();
CREATE TRIGGER "wf_history_control_columns"
    BEFORE INSERT OR UPDATE ON "wf_history"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();
CREATE TRIGGER "wf_tasks_control_columns"
    BEFORE INSERT OR UPDATE ON "wf_tasks"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();
CREATE TRIGGER "wf_approvals_control_columns"
    BEFORE INSERT OR UPDATE ON "wf_approvals"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();

-- Seguridad por fila (ADR-007) -----------------------------------------------------------------

ALTER TABLE "wf_definitions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "wf_definitions" FORCE ROW LEVEL SECURITY;
CREATE POLICY "wf_definitions_tenant_isolation" ON "wf_definitions"
    USING ("tenant_id" = core_current_tenant_id())
    WITH CHECK ("tenant_id" = core_current_tenant_id());

ALTER TABLE "wf_states" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "wf_states" FORCE ROW LEVEL SECURITY;
CREATE POLICY "wf_states_tenant_isolation" ON "wf_states"
    USING ("tenant_id" = core_current_tenant_id())
    WITH CHECK ("tenant_id" = core_current_tenant_id());

ALTER TABLE "wf_transitions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "wf_transitions" FORCE ROW LEVEL SECURITY;
CREATE POLICY "wf_transitions_tenant_isolation" ON "wf_transitions"
    USING ("tenant_id" = core_current_tenant_id())
    WITH CHECK ("tenant_id" = core_current_tenant_id());

ALTER TABLE "wf_instances" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "wf_instances" FORCE ROW LEVEL SECURITY;
CREATE POLICY "wf_instances_tenant_isolation" ON "wf_instances"
    USING ("tenant_id" = core_current_tenant_id())
    WITH CHECK ("tenant_id" = core_current_tenant_id());

ALTER TABLE "wf_history" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "wf_history" FORCE ROW LEVEL SECURITY;
CREATE POLICY "wf_history_tenant_isolation" ON "wf_history"
    USING ("tenant_id" = core_current_tenant_id())
    WITH CHECK ("tenant_id" = core_current_tenant_id());

ALTER TABLE "wf_tasks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "wf_tasks" FORCE ROW LEVEL SECURITY;
CREATE POLICY "wf_tasks_tenant_isolation" ON "wf_tasks"
    USING ("tenant_id" = core_current_tenant_id())
    WITH CHECK ("tenant_id" = core_current_tenant_id());

ALTER TABLE "wf_approvals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "wf_approvals" FORCE ROW LEVEL SECURITY;
CREATE POLICY "wf_approvals_tenant_isolation" ON "wf_approvals"
    USING ("tenant_id" = core_current_tenant_id())
    WITH CHECK ("tenant_id" = core_current_tenant_id());

-- Permisos de la API ---------------------------------------------------------------------------
-- Sin DELETE: el borrado es lógico (deleted_at); al editar un borrador, los estados y transiciones
-- que salen quedan borrados lógicamente. El historial y las decisiones solo se agregan.

GRANT SELECT, INSERT, UPDATE ON "wf_definitions" TO app_user;
GRANT SELECT, INSERT, UPDATE ON "wf_states" TO app_user;
GRANT SELECT, INSERT, UPDATE ON "wf_transitions" TO app_user;
GRANT SELECT, INSERT, UPDATE ON "wf_instances" TO app_user;
GRANT SELECT, INSERT ON "wf_history" TO app_user;
GRANT SELECT, INSERT, UPDATE ON "wf_tasks" TO app_user;
GRANT SELECT, INSERT ON "wf_approvals" TO app_user;
