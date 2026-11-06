-- B27: horas, entregables, actas y control de proyectos (M07, ficha 17.8, numeral 12.4). Horas
-- (prj_time_entries), entregables (prj_deliverables), actas de entrega FT-TEC-001 con firma del
-- cliente (prj_acceptances), riesgos (prj_risks), liberaciones (prj_releases), revisiones de código
-- FT-TEC-002 (prj_code_reviews) e incidentes FT-TEC-004 (prj_incidents). Los proyectos ganan el
-- cierre y la configuración de las actas; los hitos, «listo para facturar». La firma electrónica
-- (sig_envelopes) firma también actas, sin contrato. Los registros de formatos (doc_form_records),
-- los archivos y las personas se guardan por identificador, sin llaves hacia tablas de otros
-- módulos (numeral 8.3). Solo expande: la versión anterior sigue funcionando con estas columnas.

-- AlterTable
ALTER TABLE "sig_envelopes" ADD COLUMN     "party_id" UUID,
ADD COLUMN     "source_id" UUID,
ALTER COLUMN "contract_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "prj_projects" ADD COLUMN     "closed_at" TIMESTAMPTZ(6),
ADD COLUMN     "closing_note" TEXT,
ADD COLUMN     "closing_started_at" TIMESTAMPTZ(6),
ADD COLUMN     "hour_cost" DECIMAL(18,2),
ADD COLUMN     "respond_days" SMALLINT NOT NULL DEFAULT 10,
ADD COLUMN     "tacit_acceptance" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "tacit_clause" TEXT;

-- AlterTable
ALTER TABLE "prj_milestones" ADD COLUMN     "billable_amount" DECIMAL(18,2),
ADD COLUMN     "billable_at" TIMESTAMPTZ(6);

-- CreateTable
CREATE TABLE "prj_time_entries" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "item_id" UUID,
    "user_id" UUID NOT NULL,
    "work_date" DATE NOT NULL,
    "hours" DECIMAL(4,2) NOT NULL,
    "billable" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'registered',
    "decided_by" UUID,
    "decided_at" TIMESTAMPTZ(6),
    "decision_note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "prj_time_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prj_deliverables" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "milestone_id" UUID,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "version_label" TEXT,
    "evidence_url" TEXT,
    "status" TEXT NOT NULL DEFAULT 'preparing',
    "accepted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "prj_deliverables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prj_acceptances" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "deliverable_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'preparing',
    "signer_party_id" UUID NOT NULL,
    "signer_name" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "pending_note" TEXT,
    "message" TEXT,
    "respond_by" DATE NOT NULL,
    "form_record_id" UUID,
    "record_code" TEXT,
    "envelope_id" UUID,
    "envelope_code" TEXT,
    "signed_file_id" UUID,
    "delivered_by" UUID NOT NULL,
    "delivered_at" TIMESTAMPTZ(6) NOT NULL,
    "answered_at" TIMESTAMPTZ(6),
    "accepted_at" TIMESTAMPTZ(6),
    "client_note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "prj_acceptances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prj_risks" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "probability" SMALLINT NOT NULL,
    "impact" SMALLINT NOT NULL,
    "response" TEXT,
    "owner_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "closed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "prj_risks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prj_releases" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "version_label" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "released_on" DATE NOT NULL,
    "notes" TEXT NOT NULL,
    "test_report_file_id" UUID NOT NULL,
    "released_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "prj_releases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prj_code_reviews" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "reference_url" TEXT NOT NULL,
    "reviewer_id" UUID NOT NULL,
    "answers" JSONB NOT NULL,
    "result" TEXT NOT NULL,
    "notes" TEXT,
    "checklist_record_id" UUID,
    "record_code" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "prj_code_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prj_incidents" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "detected_at" TIMESTAMPTZ(6) NOT NULL,
    "personal_data" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'open',
    "resolved_at" TIMESTAMPTZ(6),
    "root_cause" TEXT,
    "actions" TEXT,
    "reported_by" UUID NOT NULL,
    "form_record_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "prj_incidents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "prj_time_entries_tenant_id_project_id_status_idx" ON "prj_time_entries"("tenant_id", "project_id", "status");

-- CreateIndex
CREATE INDEX "prj_time_entries_tenant_id_user_id_work_date_idx" ON "prj_time_entries"("tenant_id", "user_id", "work_date");

-- CreateIndex
CREATE UNIQUE INDEX "prj_time_entries_tenant_id_id_key" ON "prj_time_entries"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "prj_deliverables_tenant_id_project_id_idx" ON "prj_deliverables"("tenant_id", "project_id");

-- CreateIndex
CREATE INDEX "prj_deliverables_tenant_id_milestone_id_idx" ON "prj_deliverables"("tenant_id", "milestone_id");

-- CreateIndex
CREATE UNIQUE INDEX "prj_deliverables_tenant_id_id_key" ON "prj_deliverables"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "prj_acceptances_tenant_id_deliverable_id_idx" ON "prj_acceptances"("tenant_id", "deliverable_id");

-- CreateIndex
CREATE INDEX "prj_acceptances_tenant_id_status_idx" ON "prj_acceptances"("tenant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "prj_acceptances_tenant_id_id_key" ON "prj_acceptances"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "prj_risks_tenant_id_project_id_idx" ON "prj_risks"("tenant_id", "project_id");

-- CreateIndex
CREATE UNIQUE INDEX "prj_risks_tenant_id_id_key" ON "prj_risks"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "prj_releases_tenant_id_project_id_idx" ON "prj_releases"("tenant_id", "project_id");

-- CreateIndex
CREATE UNIQUE INDEX "prj_releases_tenant_id_id_key" ON "prj_releases"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "prj_code_reviews_tenant_id_project_id_idx" ON "prj_code_reviews"("tenant_id", "project_id");

-- CreateIndex
CREATE INDEX "prj_code_reviews_tenant_id_item_id_idx" ON "prj_code_reviews"("tenant_id", "item_id");

-- CreateIndex
CREATE UNIQUE INDEX "prj_code_reviews_tenant_id_id_key" ON "prj_code_reviews"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "prj_incidents_tenant_id_project_id_idx" ON "prj_incidents"("tenant_id", "project_id");

-- CreateIndex
CREATE UNIQUE INDEX "prj_incidents_tenant_id_id_key" ON "prj_incidents"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "prj_incidents_tenant_id_code_key" ON "prj_incidents"("tenant_id", "code");

-- AddForeignKey
ALTER TABLE "prj_time_entries" ADD CONSTRAINT "prj_time_entries_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prj_time_entries" ADD CONSTRAINT "prj_time_entries_tenant_id_project_id_fkey" FOREIGN KEY ("tenant_id", "project_id") REFERENCES "prj_projects"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prj_time_entries" ADD CONSTRAINT "prj_time_entries_tenant_id_item_id_fkey" FOREIGN KEY ("tenant_id", "item_id") REFERENCES "prj_items"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prj_deliverables" ADD CONSTRAINT "prj_deliverables_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prj_deliverables" ADD CONSTRAINT "prj_deliverables_tenant_id_project_id_fkey" FOREIGN KEY ("tenant_id", "project_id") REFERENCES "prj_projects"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prj_deliverables" ADD CONSTRAINT "prj_deliverables_tenant_id_milestone_id_fkey" FOREIGN KEY ("tenant_id", "milestone_id") REFERENCES "prj_milestones"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prj_acceptances" ADD CONSTRAINT "prj_acceptances_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prj_acceptances" ADD CONSTRAINT "prj_acceptances_tenant_id_project_id_fkey" FOREIGN KEY ("tenant_id", "project_id") REFERENCES "prj_projects"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prj_acceptances" ADD CONSTRAINT "prj_acceptances_tenant_id_deliverable_id_fkey" FOREIGN KEY ("tenant_id", "deliverable_id") REFERENCES "prj_deliverables"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prj_risks" ADD CONSTRAINT "prj_risks_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prj_risks" ADD CONSTRAINT "prj_risks_tenant_id_project_id_fkey" FOREIGN KEY ("tenant_id", "project_id") REFERENCES "prj_projects"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prj_releases" ADD CONSTRAINT "prj_releases_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prj_releases" ADD CONSTRAINT "prj_releases_tenant_id_project_id_fkey" FOREIGN KEY ("tenant_id", "project_id") REFERENCES "prj_projects"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prj_code_reviews" ADD CONSTRAINT "prj_code_reviews_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prj_code_reviews" ADD CONSTRAINT "prj_code_reviews_tenant_id_project_id_fkey" FOREIGN KEY ("tenant_id", "project_id") REFERENCES "prj_projects"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prj_code_reviews" ADD CONSTRAINT "prj_code_reviews_tenant_id_item_id_fkey" FOREIGN KEY ("tenant_id", "item_id") REFERENCES "prj_items"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prj_incidents" ADD CONSTRAINT "prj_incidents_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prj_incidents" ADD CONSTRAINT "prj_incidents_tenant_id_project_id_fkey" FOREIGN KEY ("tenant_id", "project_id") REFERENCES "prj_projects"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;



-- Reglas de los datos -------------------------------------------------------------------------
-- Los valores permitidos son los de packages/contracts/src/project.

-- Proyecto: el cierre (en cierre → cerrado), el plazo de las actas y la aceptación tácita.
ALTER TABLE "prj_projects" DROP CONSTRAINT "prj_projects_status_check";
ALTER TABLE "prj_projects"
    ADD CONSTRAINT "prj_projects_status_check" CHECK ("status" IN ('planning', 'in_progress',
        'at_risk', 'paused', 'closing', 'closed')),
    ADD CONSTRAINT "prj_projects_control_check" CHECK (
        ("hour_cost" IS NULL OR "hour_cost" >= 0)
        AND "respond_days" BETWEEN 1 AND 30
        AND ("tacit_acceptance" = ("tacit_clause" IS NOT NULL))
        AND ("tacit_clause" IS NULL OR char_length(btrim("tacit_clause")) BETWEEN 3 AND 300)),
    ADD CONSTRAINT "prj_projects_closing_check" CHECK (
        (("status" IN ('closing', 'closed')) = ("closing_started_at" IS NOT NULL))
        AND (("status" = 'closed') = ("closed_at" IS NOT NULL))
        AND (("status" = 'closed') = ("closing_note" IS NOT NULL))
        AND ("closing_note" IS NULL OR char_length(btrim("closing_note")) BETWEEN 3 AND 4000));

-- Hito: listo para facturar, con la fecha y el valor.
ALTER TABLE "prj_milestones" DROP CONSTRAINT "prj_milestones_status_check";
ALTER TABLE "prj_milestones"
    ADD CONSTRAINT "prj_milestones_status_check" CHECK (
        "status" IN ('pending', 'done', 'billable')
        AND (("status" = 'pending') = ("done_at" IS NULL))
        AND (("status" = 'billable') = ("billable_at" IS NOT NULL))
        AND (("status" = 'billable') = ("billable_amount" IS NOT NULL))
        AND ("billable_amount" IS NULL OR "billable_amount" >= 0));

-- Ítem terminado: con la fecha y la nota de pruebas. La revisión de código ya no es un enlace
-- suelto: es una revisión FT-TEC-002 aprobada (prj_code_reviews), que revisa la API.
ALTER TABLE "prj_items" DROP CONSTRAINT "prj_items_done_check";
ALTER TABLE "prj_items"
    ADD CONSTRAINT "prj_items_done_check" CHECK (
        (("status" = 'done') = ("done_at" IS NOT NULL))
        AND ("status" <> 'done' OR "test_note" IS NOT NULL));

ALTER TABLE "prj_time_entries"
    -- Cuartos de hora, de 0,25 a 24 (decisión 8).
    ADD CONSTRAINT "prj_time_entries_hours_check"
        CHECK ("hours" BETWEEN 0.25 AND 24 AND "hours" * 4 = trunc("hours" * 4)),
    ADD CONSTRAINT "prj_time_entries_status_check"
        CHECK ("status" IN ('registered', 'approved', 'returned')),
    ADD CONSTRAINT "prj_time_entries_decision_check" CHECK (
        (("status" = 'registered') = ("decided_at" IS NULL))
        AND (("decided_at" IS NULL) = ("decided_by" IS NULL))
        AND (("status" = 'returned') = ("decision_note" IS NOT NULL))
        AND ("decision_note" IS NULL OR char_length(btrim("decision_note")) BETWEEN 3 AND 500)),
    -- Nadie aprueba ni devuelve sus propias horas.
    ADD CONSTRAINT "prj_time_entries_self_check" CHECK ("decided_by" IS DISTINCT FROM "user_id"
        OR "decided_by" IS NULL),
    ADD CONSTRAINT "prj_time_entries_note_check"
        CHECK ("note" IS NULL OR char_length(btrim("note")) BETWEEN 3 AND 500),
    ADD CONSTRAINT "prj_time_entries_version_check" CHECK ("version" > 0);

ALTER TABLE "prj_deliverables"
    ADD CONSTRAINT "prj_deliverables_text_check" CHECK (
        char_length(btrim("name")) BETWEEN 3 AND 160
        AND ("description" IS NULL OR char_length(btrim("description")) BETWEEN 3 AND 2000)
        AND ("version_label" IS NULL OR char_length(btrim("version_label")) BETWEEN 1 AND 40)
        AND ("evidence_url" IS NULL
             OR ("evidence_url" ~ '^https://' AND char_length("evidence_url") <= 500))),
    ADD CONSTRAINT "prj_deliverables_status_check" CHECK (
        "status" IN ('preparing', 'delivered', 'accepted', 'returned')
        AND (("status" = 'accepted') = ("accepted_at" IS NOT NULL))),
    ADD CONSTRAINT "prj_deliverables_version_check" CHECK ("version" > 0);

ALTER TABLE "prj_acceptances"
    ADD CONSTRAINT "prj_acceptances_status_check" CHECK ("status" IN ('preparing', 'in_signature',
        'accepted', 'tacit', 'returned', 'unanswered', 'cancelled')),
    ADD CONSTRAINT "prj_acceptances_environment_check" CHECK ("environment" IN ('test', 'production')),
    ADD CONSTRAINT "prj_acceptances_text_check" CHECK (
        char_length(btrim("signer_name")) BETWEEN 3 AND 160
        AND ("pending_note" IS NULL OR char_length(btrim("pending_note")) BETWEEN 3 AND 2000)
        AND ("message" IS NULL OR char_length(btrim("message")) BETWEEN 3 AND 1000)
        AND ("client_note" IS NULL OR char_length(btrim("client_note")) BETWEEN 1 AND 2000)),
    -- En firma: con su acta y su proceso de firma. Aceptada: con la fecha; firmada, con su copia.
    ADD CONSTRAINT "prj_acceptances_flow_check" CHECK (
        ("status" IN ('preparing', 'cancelled') OR "form_record_id" IS NOT NULL)
        AND ("status" NOT IN ('in_signature', 'accepted', 'returned', 'unanswered')
             OR "envelope_id" IS NOT NULL)
        AND (("status" IN ('accepted', 'tacit')) = ("accepted_at" IS NOT NULL))
        AND ("status" <> 'accepted' OR "signed_file_id" IS NOT NULL)
        AND (("status" IN ('preparing', 'in_signature')) = ("answered_at" IS NULL))),
    ADD CONSTRAINT "prj_acceptances_version_check" CHECK ("version" > 0);

-- Un entregable tiene a lo sumo un acta abierta.
CREATE UNIQUE INDEX "prj_acceptances_open_key" ON "prj_acceptances"("tenant_id", "deliverable_id")
    WHERE "status" IN ('preparing', 'in_signature') AND "deleted_at" IS NULL;

ALTER TABLE "prj_risks"
    ADD CONSTRAINT "prj_risks_scale_check"
        CHECK ("probability" BETWEEN 1 AND 5 AND "impact" BETWEEN 1 AND 5),
    ADD CONSTRAINT "prj_risks_text_check" CHECK (
        char_length(btrim("description")) BETWEEN 3 AND 1000
        AND ("response" IS NULL OR char_length(btrim("response")) BETWEEN 3 AND 2000)),
    ADD CONSTRAINT "prj_risks_status_check" CHECK (
        "status" IN ('open', 'mitigating', 'closed')
        AND (("status" = 'closed') = ("closed_at" IS NOT NULL))),
    ADD CONSTRAINT "prj_risks_version_check" CHECK ("version" > 0);

ALTER TABLE "prj_releases"
    ADD CONSTRAINT "prj_releases_environment_check" CHECK ("environment" IN ('test', 'production')),
    ADD CONSTRAINT "prj_releases_text_check" CHECK (
        char_length(btrim("version_label")) BETWEEN 1 AND 40
        AND char_length(btrim("notes")) BETWEEN 3 AND 4000),
    ADD CONSTRAINT "prj_releases_version_check" CHECK ("version" > 0);

ALTER TABLE "prj_code_reviews"
    ADD CONSTRAINT "prj_code_reviews_url_check"
        CHECK ("reference_url" ~ '^https://' AND char_length("reference_url") <= 500),
    ADD CONSTRAINT "prj_code_reviews_result_check"
        CHECK ("result" IN ('approved', 'changes_requested')),
    ADD CONSTRAINT "prj_code_reviews_answers_check" CHECK (jsonb_typeof("answers") = 'array'),
    ADD CONSTRAINT "prj_code_reviews_notes_check"
        CHECK ("notes" IS NULL OR char_length(btrim("notes")) BETWEEN 3 AND 2000),
    ADD CONSTRAINT "prj_code_reviews_version_check" CHECK ("version" > 0);

ALTER TABLE "prj_incidents"
    ADD CONSTRAINT "prj_incidents_code_check" CHECK ("code" ~ '^INC-[0-9]{4}-[0-9]{4,8}$'),
    ADD CONSTRAINT "prj_incidents_kind_check" CHECK ("kind" IN ('failure', 'security')),
    ADD CONSTRAINT "prj_incidents_severity_check"
        CHECK ("severity" IN ('critical', 'high', 'medium', 'low')),
    ADD CONSTRAINT "prj_incidents_text_check" CHECK (
        char_length(btrim("title")) BETWEEN 3 AND 160
        AND char_length(btrim("description")) BETWEEN 3 AND 4000),
    -- Resuelto: con la fecha, la causa raíz y las acciones.
    ADD CONSTRAINT "prj_incidents_status_check" CHECK (
        "status" IN ('open', 'resolved')
        AND (("status" = 'resolved') = ("resolved_at" IS NOT NULL))
        AND (("status" = 'resolved') = ("root_cause" IS NOT NULL))
        AND (("status" = 'resolved') = ("actions" IS NOT NULL))
        AND ("resolved_at" IS NULL OR "resolved_at" >= "detected_at")),
    ADD CONSTRAINT "prj_incidents_version_check" CHECK ("version" > 0);

-- Firma electrónica: además del contrato y el otrosí, el acta de entrega de un proyecto. El
-- módulo de Contratos guarda su identificador y su cliente; no lee las tablas prj_.
ALTER TABLE "sig_envelopes" DROP CONSTRAINT "sig_envelopes_source_check";
ALTER TABLE "sig_envelopes"
    ADD CONSTRAINT "sig_envelopes_source_check" CHECK (
        ("source" = 'contract' AND "contract_id" IS NOT NULL AND "amendment_id" IS NULL
            AND "source_id" IS NULL)
        OR ("source" = 'amendment' AND "contract_id" IS NOT NULL AND "amendment_id" IS NOT NULL
            AND "source_id" IS NULL)
        OR ("source" = 'acceptance' AND "contract_id" IS NULL AND "amendment_id" IS NULL
            AND "source_id" IS NOT NULL AND "party_id" IS NOT NULL));

CREATE UNIQUE INDEX "sig_envelopes_open_source_key" ON "sig_envelopes"("tenant_id", "source_id")
    WHERE "status" IN ('draft', 'sent') AND "source" = 'acceptance' AND "deleted_at" IS NULL;
CREATE INDEX "sig_envelopes_tenant_id_source_id_idx" ON "sig_envelopes"("tenant_id", "source_id");

-- Formatos digitales: el acta FT-TEC-001 y la lista FT-TEC-002 que la plataforma llena desde un
-- proyecto se unen a su acta o a su revisión.
ALTER TABLE "doc_form_templates" DROP CONSTRAINT "doc_form_templates_entity_type_check";
ALTER TABLE "doc_form_templates"
    ADD CONSTRAINT "doc_form_templates_entity_type_check" CHECK (
        "entity_type" IS NULL OR "entity_type" IN ('doc_version', 'party', 'doc_change_request',
            'prj_acceptance', 'prj_code_review'));
ALTER TABLE "doc_form_records" DROP CONSTRAINT "doc_form_records_entity_check";
ALTER TABLE "doc_form_records"
    ADD CONSTRAINT "doc_form_records_entity_check" CHECK (
        ("entity_type" IS NULL) = ("entity_id" IS NULL)
        AND ("entity_type" IS NULL OR "entity_type" IN ('doc_version', 'party', 'doc_change_request',
            'prj_acceptance', 'prj_code_review')));

-- La revisión de código y la liberación son registros históricos: no cambian (sin UPDATE).

-- Columnas de control --------------------------------------------------------------------------

CREATE TRIGGER "prj_time_entries_control_columns"
    BEFORE INSERT OR UPDATE ON "prj_time_entries"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();
CREATE TRIGGER "prj_deliverables_control_columns"
    BEFORE INSERT OR UPDATE ON "prj_deliverables"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();
CREATE TRIGGER "prj_acceptances_control_columns"
    BEFORE INSERT OR UPDATE ON "prj_acceptances"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();
CREATE TRIGGER "prj_risks_control_columns"
    BEFORE INSERT OR UPDATE ON "prj_risks"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();
CREATE TRIGGER "prj_releases_control_columns"
    BEFORE INSERT OR UPDATE ON "prj_releases"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();
CREATE TRIGGER "prj_code_reviews_control_columns"
    BEFORE INSERT OR UPDATE ON "prj_code_reviews"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();
CREATE TRIGGER "prj_incidents_control_columns"
    BEFORE INSERT OR UPDATE ON "prj_incidents"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();

-- Seguridad por fila (ADR-007) -----------------------------------------------------------------

ALTER TABLE "prj_time_entries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "prj_time_entries" FORCE ROW LEVEL SECURITY;
CREATE POLICY "prj_time_entries_tenant_isolation" ON "prj_time_entries"
    USING ("tenant_id" = core_current_tenant_id())
    WITH CHECK ("tenant_id" = core_current_tenant_id());

ALTER TABLE "prj_deliverables" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "prj_deliverables" FORCE ROW LEVEL SECURITY;
CREATE POLICY "prj_deliverables_tenant_isolation" ON "prj_deliverables"
    USING ("tenant_id" = core_current_tenant_id())
    WITH CHECK ("tenant_id" = core_current_tenant_id());

ALTER TABLE "prj_acceptances" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "prj_acceptances" FORCE ROW LEVEL SECURITY;
CREATE POLICY "prj_acceptances_tenant_isolation" ON "prj_acceptances"
    USING ("tenant_id" = core_current_tenant_id())
    WITH CHECK ("tenant_id" = core_current_tenant_id());

ALTER TABLE "prj_risks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "prj_risks" FORCE ROW LEVEL SECURITY;
CREATE POLICY "prj_risks_tenant_isolation" ON "prj_risks"
    USING ("tenant_id" = core_current_tenant_id())
    WITH CHECK ("tenant_id" = core_current_tenant_id());

ALTER TABLE "prj_releases" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "prj_releases" FORCE ROW LEVEL SECURITY;
CREATE POLICY "prj_releases_tenant_isolation" ON "prj_releases"
    USING ("tenant_id" = core_current_tenant_id())
    WITH CHECK ("tenant_id" = core_current_tenant_id());

ALTER TABLE "prj_code_reviews" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "prj_code_reviews" FORCE ROW LEVEL SECURITY;
CREATE POLICY "prj_code_reviews_tenant_isolation" ON "prj_code_reviews"
    USING ("tenant_id" = core_current_tenant_id())
    WITH CHECK ("tenant_id" = core_current_tenant_id());

ALTER TABLE "prj_incidents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "prj_incidents" FORCE ROW LEVEL SECURITY;
CREATE POLICY "prj_incidents_tenant_isolation" ON "prj_incidents"
    USING ("tenant_id" = core_current_tenant_id())
    WITH CHECK ("tenant_id" = core_current_tenant_id());

-- Permisos de la API ---------------------------------------------------------------------------
-- Sin DELETE: borrar una hora o retirar un riesgo marca deleted_at y queda en la auditoría. Las
-- revisiones de código y las liberaciones no se editan.

GRANT SELECT, INSERT, UPDATE ON "prj_time_entries" TO app_user;
GRANT SELECT, INSERT, UPDATE ON "prj_deliverables" TO app_user;
GRANT SELECT, INSERT, UPDATE ON "prj_acceptances" TO app_user;
GRANT SELECT, INSERT, UPDATE ON "prj_risks" TO app_user;
GRANT SELECT, INSERT ON "prj_releases" TO app_user;
GRANT SELECT, INSERT ON "prj_code_reviews" TO app_user;
GRANT SELECT, INSERT, UPDATE ON "prj_incidents" TO app_user;

-- Trabajo del worker ---------------------------------------------------------------------------
-- Las empresas con actas por enviar a firma o esperando la respuesta del cliente: cada pocos
-- segundos el worker envía las listas y lee cómo terminó la firma (B27).
CREATE FUNCTION "prj_tenants_with_acceptances"() RETURNS SETOF UUID
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
    AS $$ SELECT DISTINCT tenant_id FROM prj_acceptances
          WHERE status IN ('preparing', 'in_signature') AND deleted_at IS NULL ORDER BY 1 $$;

REVOKE EXECUTE ON FUNCTION "prj_tenants_with_acceptances"() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "prj_tenants_with_acceptances"() TO app_user;
