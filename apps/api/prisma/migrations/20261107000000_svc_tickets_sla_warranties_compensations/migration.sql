-- B28: mesa de ayuda (M08, ficha 17.9, numeral 12.4). Acuerdos de tiempo por prioridad
-- (wf_sla_policies, capítulo 12.3), tiquetes FT-SAC-001 (svc_tickets) y su conversación
-- (svc_ticket_messages), garantías por entregable (svc_warranties) y compensaciones técnicas
-- RE-SAC-001 (svc_compensations). El cliente, el proyecto, el entregable y las personas se guardan
-- por identificador, sin llaves hacia tablas de otros módulos (numeral 8.3). Solo expande: la
-- versión anterior sigue funcionando.

-- CreateTable
CREATE TABLE "wf_sla_policies" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "priority" TEXT NOT NULL,
    "first_response_hours" DECIMAL(6,2) NOT NULL,
    "resolution_hours" DECIMAL(6,2) NOT NULL,
    "calendar" TEXT NOT NULL DEFAULT 'business',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "wf_sla_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "svc_tickets" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "priority" TEXT NOT NULL,
    "level" SMALLINT NOT NULL DEFAULT 1,
    "channel" TEXT NOT NULL DEFAULT 'internal',
    "status" TEXT NOT NULL DEFAULT 'new',
    "party_id" UUID,
    "requester_id" UUID,
    "requester_name" TEXT,
    "project_id" UUID,
    "deliverable_id" UUID,
    "warranty_id" UUID,
    "assignee_id" UUID,
    "sla_policy_id" UUID NOT NULL,
    "sla_consumed_minutes" INTEGER NOT NULL DEFAULT 0,
    "sla_resumed_at" TIMESTAMPTZ(6),
    "response_due_at" TIMESTAMPTZ(6),
    "resolution_due_at" TIMESTAMPTZ(6),
    "warn_at" TIMESTAMPTZ(6),
    "first_response_at" TIMESTAMPTZ(6),
    "paused_at" TIMESTAMPTZ(6),
    "warned_at" TIMESTAMPTZ(6),
    "breached_at" TIMESTAMPTZ(6),
    "resolved_at" TIMESTAMPTZ(6),
    "resolution" TEXT,
    "auto_close_at" TIMESTAMPTZ(6),
    "closed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "svc_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "svc_ticket_messages" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "ticket_id" UUID NOT NULL,
    "author_id" UUID,
    "body" TEXT NOT NULL,
    "is_internal" BOOLEAN NOT NULL DEFAULT false,
    "from_client" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "svc_ticket_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "svc_warranties" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "deliverable_id" UUID NOT NULL,
    "party_id" UUID,
    "starts_on" DATE NOT NULL,
    "ends_on" DATE NOT NULL,
    "scope" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "svc_warranties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "svc_compensations" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "ticket_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "amount" DECIMAL(18,2),
    "hours" DECIMAL(6,2),
    "days" SMALLINT,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'proposed',
    "proposed_by" UUID NOT NULL,
    "approved_by" UUID,
    "decided_at" TIMESTAMPTZ(6),
    "decision_note" TEXT,
    "applied_on" DATE,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "svc_compensations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "wf_sla_policies_tenant_id_id_key" ON "wf_sla_policies"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "wf_sla_policies_tenant_id_priority_key" ON "wf_sla_policies"("tenant_id", "priority");

-- CreateIndex
CREATE INDEX "svc_tickets_tenant_id_status_idx" ON "svc_tickets"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "svc_tickets_tenant_id_assignee_id_idx" ON "svc_tickets"("tenant_id", "assignee_id");

-- CreateIndex
CREATE INDEX "svc_tickets_tenant_id_requester_id_idx" ON "svc_tickets"("tenant_id", "requester_id");

-- CreateIndex
CREATE INDEX "svc_tickets_tenant_id_warn_at_idx" ON "svc_tickets"("tenant_id", "warn_at");

-- CreateIndex
CREATE INDEX "svc_tickets_tenant_id_resolution_due_at_idx" ON "svc_tickets"("tenant_id", "resolution_due_at");

-- CreateIndex
CREATE UNIQUE INDEX "svc_tickets_tenant_id_id_key" ON "svc_tickets"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "svc_tickets_tenant_id_code_key" ON "svc_tickets"("tenant_id", "code");

-- CreateIndex
CREATE INDEX "svc_ticket_messages_tenant_id_ticket_id_created_at_idx" ON "svc_ticket_messages"("tenant_id", "ticket_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "svc_ticket_messages_tenant_id_id_key" ON "svc_ticket_messages"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "svc_warranties_tenant_id_ends_on_idx" ON "svc_warranties"("tenant_id", "ends_on");

-- CreateIndex
CREATE UNIQUE INDEX "svc_warranties_tenant_id_id_key" ON "svc_warranties"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "svc_warranties_tenant_id_deliverable_id_key" ON "svc_warranties"("tenant_id", "deliverable_id");

-- CreateIndex
CREATE INDEX "svc_compensations_tenant_id_ticket_id_idx" ON "svc_compensations"("tenant_id", "ticket_id");

-- CreateIndex
CREATE INDEX "svc_compensations_tenant_id_status_idx" ON "svc_compensations"("tenant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "svc_compensations_tenant_id_id_key" ON "svc_compensations"("tenant_id", "id");

-- AddForeignKey
ALTER TABLE "wf_sla_policies" ADD CONSTRAINT "wf_sla_policies_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "svc_tickets" ADD CONSTRAINT "svc_tickets_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "svc_tickets" ADD CONSTRAINT "svc_tickets_tenant_id_sla_policy_id_fkey" FOREIGN KEY ("tenant_id", "sla_policy_id") REFERENCES "wf_sla_policies"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "svc_tickets" ADD CONSTRAINT "svc_tickets_tenant_id_warranty_id_fkey" FOREIGN KEY ("tenant_id", "warranty_id") REFERENCES "svc_warranties"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "svc_ticket_messages" ADD CONSTRAINT "svc_ticket_messages_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "svc_ticket_messages" ADD CONSTRAINT "svc_ticket_messages_tenant_id_ticket_id_fkey" FOREIGN KEY ("tenant_id", "ticket_id") REFERENCES "svc_tickets"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "svc_warranties" ADD CONSTRAINT "svc_warranties_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "svc_compensations" ADD CONSTRAINT "svc_compensations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "svc_compensations" ADD CONSTRAINT "svc_compensations_tenant_id_ticket_id_fkey" FOREIGN KEY ("tenant_id", "ticket_id") REFERENCES "svc_tickets"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Reglas de los datos ----------------------------------------------------------------------------

ALTER TABLE "wf_sla_policies"
    ADD CONSTRAINT "wf_sla_policies_priority_check"
        CHECK ("priority" IN ('critical', 'high', 'medium', 'low')),
    ADD CONSTRAINT "wf_sla_policies_calendar_check" CHECK ("calendar" IN ('business', 'continuous')),
    ADD CONSTRAINT "wf_sla_policies_hours_check" CHECK (
        "first_response_hours" > 0 AND "resolution_hours" <= 2000
        AND "resolution_hours" >= "first_response_hours"),
    ADD CONSTRAINT "wf_sla_policies_version_check" CHECK ("version" > 0);

ALTER TABLE "svc_tickets"
    ADD CONSTRAINT "svc_tickets_code_check" CHECK ("code" ~ '^TIQ-[0-9]{4}-[0-9]{4,8}$'),
    ADD CONSTRAINT "svc_tickets_category_check" CHECK (
        "category" IN ('support', 'incident', 'change', 'question', 'platform', 'other')),
    ADD CONSTRAINT "svc_tickets_priority_check"
        CHECK ("priority" IN ('critical', 'high', 'medium', 'low')),
    ADD CONSTRAINT "svc_tickets_level_check" CHECK ("level" BETWEEN 1 AND 3),
    ADD CONSTRAINT "svc_tickets_channel_check"
        CHECK ("channel" IN ('internal', 'email', 'phone', 'portal')),
    ADD CONSTRAINT "svc_tickets_text_check" CHECK (
        char_length(btrim("subject")) BETWEEN 3 AND 160
        AND char_length(btrim("description")) BETWEEN 3 AND 8000
        AND ("requester_name" IS NULL OR char_length(btrim("requester_name")) BETWEEN 3 AND 160)),
    ADD CONSTRAINT "svc_tickets_deliverable_check"
        CHECK ("deliverable_id" IS NULL OR "project_id" IS NOT NULL),
    ADD CONSTRAINT "svc_tickets_consumed_check" CHECK ("sla_consumed_minutes" >= 0),
    -- Asignado o más adelante: con responsable. En espera: el reloj pausado. Resuelto: con la
    -- solución y el cierre automático programado. Cerrado: con la fecha de cierre.
    ADD CONSTRAINT "svc_tickets_status_check" CHECK (
        "status" IN ('new', 'assigned', 'in_progress', 'waiting_customer', 'resolved', 'closed')
        AND ("status" = 'new' OR "assignee_id" IS NOT NULL)
        AND (("status" = 'waiting_customer') = ("paused_at" IS NOT NULL))
        AND (("status" IN ('new', 'assigned', 'in_progress')) = ("sla_resumed_at" IS NOT NULL))
        AND (("status" IN ('resolved', 'closed')) = ("resolved_at" IS NOT NULL))
        AND (("status" IN ('resolved', 'closed')) = ("resolution" IS NOT NULL))
        AND (("status" = 'resolved') = ("auto_close_at" IS NOT NULL))
        AND (("status" = 'closed') = ("closed_at" IS NOT NULL))),
    ADD CONSTRAINT "svc_tickets_version_check" CHECK ("version" > 0);

ALTER TABLE "svc_ticket_messages"
    ADD CONSTRAINT "svc_ticket_messages_body_check"
        CHECK (char_length(btrim("body")) BETWEEN 1 AND 8000),
    ADD CONSTRAINT "svc_ticket_messages_kind_check" CHECK (NOT ("is_internal" AND "from_client")),
    ADD CONSTRAINT "svc_ticket_messages_version_check" CHECK ("version" > 0);

ALTER TABLE "svc_warranties"
    ADD CONSTRAINT "svc_warranties_dates_check" CHECK ("ends_on" >= "starts_on"),
    ADD CONSTRAINT "svc_warranties_scope_check" CHECK (char_length(btrim("scope")) BETWEEN 3 AND 2000),
    ADD CONSTRAINT "svc_warranties_version_check" CHECK ("version" > 0);

ALTER TABLE "svc_compensations"
    ADD CONSTRAINT "svc_compensations_type_check" CHECK (
        ("type" = 'discount' AND "amount" > 0 AND "hours" IS NULL AND "days" IS NULL)
        OR ("type" = 'support_hours' AND "hours" > 0 AND "amount" IS NULL AND "days" IS NULL)
        OR ("type" = 'service_extension' AND "days" > 0 AND "amount" IS NULL AND "hours" IS NULL)),
    ADD CONSTRAINT "svc_compensations_reason_check"
        CHECK (char_length(btrim("reason")) BETWEEN 3 AND 2000),
    -- Nadie aprueba la compensación que propuso (decisión 11).
    ADD CONSTRAINT "svc_compensations_status_check" CHECK (
        "status" IN ('proposed', 'approved', 'rejected', 'applied')
        AND (("status" = 'proposed') = ("approved_by" IS NULL))
        AND (("status" = 'proposed') = ("decided_at" IS NULL))
        AND ("approved_by" IS NULL OR "approved_by" <> "proposed_by")
        AND (("status" = 'applied') = ("applied_on" IS NOT NULL))),
    ADD CONSTRAINT "svc_compensations_version_check" CHECK ("version" > 0);

-- Avisos de la mesa de ayuda: novedades y alertas de plazo (urgentes).
ALTER TABLE "ntf_templates" DROP CONSTRAINT "ntf_templates_key_check";
ALTER TABLE "ntf_notifications" DROP CONSTRAINT "ntf_notifications_kind_check";
ALTER TABLE "ntf_preferences" DROP CONSTRAINT "ntf_preferences_event_key_check";

ALTER TABLE "ntf_templates"
    ADD CONSTRAINT "ntf_templates_key_check" CHECK ("key" IN ('task_assigned', 'task_escalated',
        'comment_mention', 'security_alert', 'doc_read_requested', 'doc_request_decided',
        'crm_activity_due', 'crm_quote_update', 'ctr_contract_update', 'prj_project_update',
        'svc_ticket_update', 'svc_ticket_alert'));
ALTER TABLE "ntf_notifications"
    ADD CONSTRAINT "ntf_notifications_kind_check" CHECK ("kind" IN ('task_assigned', 'task_escalated',
        'comment_mention', 'security_alert', 'doc_read_requested', 'doc_request_decided',
        'crm_activity_due', 'crm_quote_update', 'ctr_contract_update', 'prj_project_update',
        'svc_ticket_update', 'svc_ticket_alert'));
ALTER TABLE "ntf_preferences"
    ADD CONSTRAINT "ntf_preferences_event_key_check" CHECK ("event_key" IN ('task_assigned',
        'task_escalated', 'comment_mention', 'security_alert', 'doc_read_requested',
        'doc_request_decided', 'crm_activity_due', 'crm_quote_update', 'ctr_contract_update',
        'prj_project_update', 'svc_ticket_update', 'svc_ticket_alert'));

-- Columnas de control --------------------------------------------------------------------------

CREATE TRIGGER "wf_sla_policies_control_columns"
    BEFORE INSERT OR UPDATE ON "wf_sla_policies"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();
CREATE TRIGGER "svc_tickets_control_columns"
    BEFORE INSERT OR UPDATE ON "svc_tickets"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();
CREATE TRIGGER "svc_ticket_messages_control_columns"
    BEFORE INSERT OR UPDATE ON "svc_ticket_messages"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();
CREATE TRIGGER "svc_warranties_control_columns"
    BEFORE INSERT OR UPDATE ON "svc_warranties"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();
CREATE TRIGGER "svc_compensations_control_columns"
    BEFORE INSERT OR UPDATE ON "svc_compensations"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();

-- Seguridad por fila (ADR-007) -----------------------------------------------------------------

ALTER TABLE "wf_sla_policies" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "wf_sla_policies" FORCE ROW LEVEL SECURITY;
CREATE POLICY "wf_sla_policies_tenant_isolation" ON "wf_sla_policies"
    USING ("tenant_id" = core_current_tenant_id())
    WITH CHECK ("tenant_id" = core_current_tenant_id());

ALTER TABLE "svc_tickets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "svc_tickets" FORCE ROW LEVEL SECURITY;
CREATE POLICY "svc_tickets_tenant_isolation" ON "svc_tickets"
    USING ("tenant_id" = core_current_tenant_id())
    WITH CHECK ("tenant_id" = core_current_tenant_id());

ALTER TABLE "svc_ticket_messages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "svc_ticket_messages" FORCE ROW LEVEL SECURITY;
CREATE POLICY "svc_ticket_messages_tenant_isolation" ON "svc_ticket_messages"
    USING ("tenant_id" = core_current_tenant_id())
    WITH CHECK ("tenant_id" = core_current_tenant_id());

ALTER TABLE "svc_warranties" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "svc_warranties" FORCE ROW LEVEL SECURITY;
CREATE POLICY "svc_warranties_tenant_isolation" ON "svc_warranties"
    USING ("tenant_id" = core_current_tenant_id())
    WITH CHECK ("tenant_id" = core_current_tenant_id());

ALTER TABLE "svc_compensations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "svc_compensations" FORCE ROW LEVEL SECURITY;
CREATE POLICY "svc_compensations_tenant_isolation" ON "svc_compensations"
    USING ("tenant_id" = core_current_tenant_id())
    WITH CHECK ("tenant_id" = core_current_tenant_id());

-- Permisos de la API ---------------------------------------------------------------------------
-- Sin DELETE en ninguna. La conversación de un tiquete no se edita ni se borra (sin UPDATE).

GRANT SELECT, INSERT, UPDATE ON "wf_sla_policies" TO app_user;
GRANT SELECT, INSERT, UPDATE ON "svc_tickets" TO app_user;
GRANT SELECT, INSERT ON "svc_ticket_messages" TO app_user;
GRANT SELECT, INSERT, UPDATE ON "svc_warranties" TO app_user;
GRANT SELECT, INSERT, UPDATE ON "svc_compensations" TO app_user;

-- Trabajo del worker ---------------------------------------------------------------------------
-- Las empresas con tiquetes que piden algo al reloj: alerta al 80 %, plazo vencido o cierre
-- automático de un resuelto. La función corre como dueña del esquema: lee los tiquetes de todas las
-- empresas solo para saber cuáles tienen trabajo (como prj_tenants_with_acceptances).
CREATE POLICY "svc_tickets_worker_lookup" ON "svc_tickets"
    FOR SELECT TO migration_user USING (true);

CREATE FUNCTION "svc_tenants_with_sla_work"(at TIMESTAMPTZ) RETURNS SETOF UUID
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
    AS $$ SELECT DISTINCT tenant_id FROM svc_tickets
          WHERE deleted_at IS NULL AND (
              (status IN ('new', 'assigned', 'in_progress') AND warned_at IS NULL AND warn_at <= at)
              OR (status IN ('new', 'assigned', 'in_progress') AND breached_at IS NULL
                  AND resolution_due_at <= at)
              OR (status = 'resolved' AND auto_close_at <= at))
          ORDER BY 1 $$;

REVOKE EXECUTE ON FUNCTION "svc_tenants_with_sla_work"(TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "svc_tenants_with_sla_work"(TIMESTAMPTZ) TO app_user;
