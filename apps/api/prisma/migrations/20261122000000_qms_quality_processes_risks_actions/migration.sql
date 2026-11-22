-- B38 — Calidad y mejora continua (M14, ficha 17.15). Caracterización de los procesos del núcleo
-- (qms_processes), contexto DOFA-PESTEL (qms_context_items), partes interesadas
-- (qms_stakeholders), riesgos y oportunidades (qms_risks), no conformidades y salidas no
-- conformes (qms_nonconformities), acciones correctivas y de mejora (qms_actions) y lecciones
-- aprendidas (qms_lessons). Solo expande: la versión anterior sigue funcionando.

CREATE TABLE "qms_processes" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "org_unit_id" UUID NOT NULL,
    "process_type" TEXT NOT NULL,
    "objective" TEXT NOT NULL,
    "scope" TEXT,
    "inputs" TEXT,
    "outputs" TEXT,
    "document_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),
    CONSTRAINT "qms_processes_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "qms_processes_type_check" CHECK (
        "process_type" IN ('strategic', 'core', 'support', 'evaluation')
    )
);

CREATE TABLE "qms_context_items" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "pestel_factor" TEXT,
    "description" TEXT NOT NULL,
    "impact" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),
    CONSTRAINT "qms_context_items_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "qms_context_items_kind_check" CHECK (
        "kind" IN ('strength', 'weakness', 'opportunity', 'threat')
    ),
    -- El factor PESTEL solo describe lo externo: oportunidades y amenazas.
    CONSTRAINT "qms_context_items_pestel_check" CHECK (
        "pestel_factor" IS NULL OR ("kind" IN ('opportunity', 'threat') AND "pestel_factor" IN
            ('political', 'economic', 'social', 'technological', 'environmental', 'legal'))
    ),
    CONSTRAINT "qms_context_items_impact_check" CHECK ("impact" IN ('high', 'medium', 'low')),
    CONSTRAINT "qms_context_items_year_check" CHECK ("year" BETWEEN 2020 AND 2100)
);

CREATE TABLE "qms_stakeholders" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "stakeholder_type" TEXT NOT NULL,
    "needs" TEXT NOT NULL,
    "expectations" TEXT NOT NULL,
    "monitoring" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),
    CONSTRAINT "qms_stakeholders_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "qms_stakeholders_type_check" CHECK ("stakeholder_type" IN ('internal', 'external'))
);

CREATE TABLE "qms_risks" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "process_id" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "causes" TEXT,
    "probability" INTEGER NOT NULL,
    "impact" INTEGER NOT NULL,
    "score" INTEGER NOT NULL,
    "level" TEXT NOT NULL,
    "treatment" TEXT NOT NULL,
    "treatment_plan" TEXT,
    "owner_id" UUID NOT NULL,
    "review_on" DATE NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),
    CONSTRAINT "qms_risks_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "qms_risks_code_check" CHECK ("code" ~ '^RSG-[0-9]{4}-[0-9]{4,8}$'),
    CONSTRAINT "qms_risks_kind_check" CHECK ("kind" IN ('risk', 'opportunity')),
    -- Decisión 9: probabilidad e impacto de 1 a 5; valor = producto; nivel por rangos.
    CONSTRAINT "qms_risks_rating_check" CHECK (
        "probability" BETWEEN 1 AND 5 AND "impact" BETWEEN 1 AND 5
        AND "score" = "probability" * "impact"
        AND "level" = CASE WHEN "score" <= 4 THEN 'low' WHEN "score" <= 9 THEN 'moderate'
            WHEN "score" <= 16 THEN 'high' ELSE 'critical' END
    ),
    CONSTRAINT "qms_risks_treatment_check" CHECK (
        ("kind" = 'opportunity' AND "treatment" = 'exploit')
        OR ("kind" = 'risk' AND "treatment" IN ('accept', 'mitigate', 'transfer', 'avoid'))
    ),
    CONSTRAINT "qms_risks_status_check" CHECK ("status" IN ('active', 'retired'))
);

CREATE TABLE "qms_nonconformities" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "origin_id" UUID,
    "origin_code" TEXT,
    "process_id" UUID,
    "description" TEXT NOT NULL,
    "classification" TEXT,
    "detected_on" DATE NOT NULL,
    "reported_by" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'detected',
    "containment" TEXT,
    "contained_on" DATE,
    "contained_by" UUID,
    "analysis" JSONB,
    "root_cause" TEXT,
    "analyzed_by" UUID,
    "close_note" TEXT,
    "closed_on" DATE,
    "closed_by" UUID,
    "reopen_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),
    CONSTRAINT "qms_nonconformities_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "qms_nonconformities_code_check" CHECK ("code" ~ '^NC-[0-9]{4}-[0-9]{4,8}$'),
    CONSTRAINT "qms_nonconformities_source_check" CHECK (
        "source" IN ('report', 'pqrsf', 'sst_incident', 'audit')
    ),
    -- Un reporte interno no tiene origen; los demás lo enlazan con su código.
    CONSTRAINT "qms_nonconformities_origin_check" CHECK (
        ("source" = 'report') = ("origin_id" IS NULL)
        AND ("origin_id" IS NULL) = ("origin_code" IS NULL)
    ),
    CONSTRAINT "qms_nonconformities_class_check" CHECK (
        "classification" IS NULL OR "classification" IN ('nonconforming_output', 'minor', 'major')
    ),
    CONSTRAINT "qms_nonconformities_status_check" CHECK ("status" IN ('detected', 'contained',
        'analyzing', 'planned', 'verified', 'closed', 'reopened')),
    -- Ficha 17.15: después de detectada lleva corrección inmediata, clasificación y proceso.
    CONSTRAINT "qms_nonconformities_contained_check" CHECK (
        ("status" = 'detected') = ("contained_on" IS NULL)
        AND ("contained_on" IS NULL) = ("containment" IS NULL)
        AND ("contained_on" IS NULL) = ("contained_by" IS NULL)
        AND ("contained_on" IS NULL OR ("classification" IS NOT NULL AND "process_id" IS NOT NULL))
    ),
    -- Con plan o después, lleva su análisis y su causa raíz.
    CONSTRAINT "qms_nonconformities_analysis_check" CHECK (
        ("analysis" IS NULL) = ("root_cause" IS NULL)
        AND ("analysis" IS NULL) = ("analyzed_by" IS NULL)
        AND ("status" NOT IN ('planned', 'verified', 'closed') OR "root_cause" IS NOT NULL)
    ),
    CONSTRAINT "qms_nonconformities_closed_check" CHECK (
        ("status" = 'closed') = ("closed_on" IS NOT NULL)
        AND ("closed_on" IS NULL) = ("closed_by" IS NULL)
    )
);

CREATE TABLE "qms_actions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "origin_type" TEXT NOT NULL,
    "nonconformity_id" UUID,
    "risk_id" UUID,
    "process_id" UUID,
    "action_type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "responsible_id" UUID NOT NULL,
    "due_on" DATE NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "executed_on" DATE,
    "executed_by" UUID,
    "evidence_note" TEXT,
    "evidence_file_id" UUID,
    "verified_on" DATE,
    "verified_by" UUID,
    "verification_note" TEXT,
    "notes" TEXT,
    "escalated_on" DATE,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),
    CONSTRAINT "qms_actions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "qms_actions_code_check" CHECK ("code" ~ '^AC-[0-9]{4}-[0-9]{4,8}$'),
    CONSTRAINT "qms_actions_origin_check" CHECK (
        ("origin_type" = 'nonconformity') = ("nonconformity_id" IS NOT NULL)
        AND ("origin_type" = 'risk') = ("risk_id" IS NOT NULL)
        AND "origin_type" IN ('nonconformity', 'risk', 'improvement')
    ),
    CONSTRAINT "qms_actions_type_check" CHECK ("action_type" = CASE
        WHEN "origin_type" = 'nonconformity' THEN 'corrective' ELSE 'improvement' END),
    CONSTRAINT "qms_actions_status_check" CHECK (
        "status" IN ('open', 'executed', 'effective', 'ineffective')
    ),
    CONSTRAINT "qms_actions_executed_check" CHECK (
        ("status" = 'open') = ("executed_on" IS NULL)
        AND ("executed_on" IS NULL) = ("executed_by" IS NULL)
        AND ("executed_on" IS NULL) = ("evidence_note" IS NULL)
    ),
    -- Decisión 8: verifica alguien distinto del responsable y de quien la ejecutó.
    CONSTRAINT "qms_actions_verified_check" CHECK (
        ("status" IN ('effective', 'ineffective')) = ("verified_on" IS NOT NULL)
        AND ("verified_on" IS NULL) = ("verified_by" IS NULL)
        AND ("verified_on" IS NULL) = ("verification_note" IS NULL)
        AND ("verified_by" IS NULL
            OR ("verified_by" <> "responsible_id" AND "verified_by" <> "executed_by"))
    )
);

CREATE TABLE "qms_lessons" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "context" TEXT NOT NULL,
    "lesson" TEXT NOT NULL,
    "process_id" UUID,
    "nonconformity_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),
    CONSTRAINT "qms_lessons_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "qms_processes_tenant_id_id_key" ON "qms_processes"("tenant_id", "id");
CREATE UNIQUE INDEX "qms_processes_tenant_id_org_unit_id_key" ON "qms_processes"("tenant_id", "org_unit_id");
CREATE UNIQUE INDEX "qms_context_items_tenant_id_id_key" ON "qms_context_items"("tenant_id", "id");
CREATE INDEX "qms_context_items_tenant_id_year_idx" ON "qms_context_items"("tenant_id", "year");
CREATE UNIQUE INDEX "qms_stakeholders_tenant_id_id_key" ON "qms_stakeholders"("tenant_id", "id");
CREATE UNIQUE INDEX "qms_risks_tenant_id_id_key" ON "qms_risks"("tenant_id", "id");
CREATE UNIQUE INDEX "qms_risks_tenant_id_code_key" ON "qms_risks"("tenant_id", "code");
CREATE INDEX "qms_risks_tenant_id_score_idx" ON "qms_risks"("tenant_id", "score" DESC);
CREATE UNIQUE INDEX "qms_nonconformities_tenant_id_id_key" ON "qms_nonconformities"("tenant_id", "id");
CREATE UNIQUE INDEX "qms_nonconformities_tenant_id_code_key" ON "qms_nonconformities"("tenant_id", "code");
-- Un mismo origen (una PQRSF, un incidente) abre a lo sumo una no conformidad.
CREATE UNIQUE INDEX "qms_nonconformities_tenant_id_source_origin_id_key" ON "qms_nonconformities"("tenant_id", "source", "origin_id");
CREATE INDEX "qms_nonconformities_tenant_id_reported_by_idx" ON "qms_nonconformities"("tenant_id", "reported_by");
CREATE UNIQUE INDEX "qms_actions_tenant_id_id_key" ON "qms_actions"("tenant_id", "id");
CREATE UNIQUE INDEX "qms_actions_tenant_id_code_key" ON "qms_actions"("tenant_id", "code");
CREATE INDEX "qms_actions_tenant_id_nonconformity_id_idx" ON "qms_actions"("tenant_id", "nonconformity_id");
CREATE INDEX "qms_actions_tenant_id_risk_id_idx" ON "qms_actions"("tenant_id", "risk_id");
CREATE INDEX "qms_actions_tenant_id_responsible_id_idx" ON "qms_actions"("tenant_id", "responsible_id");
CREATE UNIQUE INDEX "qms_lessons_tenant_id_id_key" ON "qms_lessons"("tenant_id", "id");
CREATE INDEX "qms_lessons_tenant_id_nonconformity_id_idx" ON "qms_lessons"("tenant_id", "nonconformity_id");

ALTER TABLE "qms_processes" ADD CONSTRAINT "qms_processes_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "qms_context_items" ADD CONSTRAINT "qms_context_items_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "qms_stakeholders" ADD CONSTRAINT "qms_stakeholders_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "qms_risks" ADD CONSTRAINT "qms_risks_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "qms_nonconformities" ADD CONSTRAINT "qms_nonconformities_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "qms_actions" ADD CONSTRAINT "qms_actions_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "qms_lessons" ADD CONSTRAINT "qms_lessons_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "qms_actions" ADD CONSTRAINT "qms_actions_tenant_id_nonconformity_id_fkey"
    FOREIGN KEY ("tenant_id", "nonconformity_id") REFERENCES "qms_nonconformities"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "qms_actions" ADD CONSTRAINT "qms_actions_tenant_id_risk_id_fkey"
    FOREIGN KEY ("tenant_id", "risk_id") REFERENCES "qms_risks"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "qms_lessons" ADD CONSTRAINT "qms_lessons_tenant_id_nonconformity_id_fkey"
    FOREIGN KEY ("tenant_id", "nonconformity_id") REFERENCES "qms_nonconformities"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TRIGGER "qms_processes_control_columns" BEFORE INSERT OR UPDATE ON "qms_processes"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();
CREATE TRIGGER "qms_context_items_control_columns" BEFORE INSERT OR UPDATE ON "qms_context_items"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();
CREATE TRIGGER "qms_stakeholders_control_columns" BEFORE INSERT OR UPDATE ON "qms_stakeholders"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();
CREATE TRIGGER "qms_risks_control_columns" BEFORE INSERT OR UPDATE ON "qms_risks"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();
CREATE TRIGGER "qms_nonconformities_control_columns" BEFORE INSERT OR UPDATE ON "qms_nonconformities"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();
CREATE TRIGGER "qms_actions_control_columns" BEFORE INSERT OR UPDATE ON "qms_actions"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();
CREATE TRIGGER "qms_lessons_control_columns" BEFORE INSERT OR UPDATE ON "qms_lessons"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();

ALTER TABLE "qms_processes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "qms_processes" FORCE ROW LEVEL SECURITY;
CREATE POLICY "qms_processes_tenant_isolation" ON "qms_processes"
    USING ("tenant_id" = core_current_tenant_id()) WITH CHECK ("tenant_id" = core_current_tenant_id());
ALTER TABLE "qms_context_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "qms_context_items" FORCE ROW LEVEL SECURITY;
CREATE POLICY "qms_context_items_tenant_isolation" ON "qms_context_items"
    USING ("tenant_id" = core_current_tenant_id()) WITH CHECK ("tenant_id" = core_current_tenant_id());
ALTER TABLE "qms_stakeholders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "qms_stakeholders" FORCE ROW LEVEL SECURITY;
CREATE POLICY "qms_stakeholders_tenant_isolation" ON "qms_stakeholders"
    USING ("tenant_id" = core_current_tenant_id()) WITH CHECK ("tenant_id" = core_current_tenant_id());
ALTER TABLE "qms_risks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "qms_risks" FORCE ROW LEVEL SECURITY;
CREATE POLICY "qms_risks_tenant_isolation" ON "qms_risks"
    USING ("tenant_id" = core_current_tenant_id()) WITH CHECK ("tenant_id" = core_current_tenant_id());
ALTER TABLE "qms_nonconformities" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "qms_nonconformities" FORCE ROW LEVEL SECURITY;
CREATE POLICY "qms_nonconformities_tenant_isolation" ON "qms_nonconformities"
    USING ("tenant_id" = core_current_tenant_id()) WITH CHECK ("tenant_id" = core_current_tenant_id());
ALTER TABLE "qms_actions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "qms_actions" FORCE ROW LEVEL SECURITY;
CREATE POLICY "qms_actions_tenant_isolation" ON "qms_actions"
    USING ("tenant_id" = core_current_tenant_id()) WITH CHECK ("tenant_id" = core_current_tenant_id());
ALTER TABLE "qms_lessons" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "qms_lessons" FORCE ROW LEVEL SECURITY;
CREATE POLICY "qms_lessons_tenant_isolation" ON "qms_lessons"
    USING ("tenant_id" = core_current_tenant_id()) WITH CHECK ("tenant_id" = core_current_tenant_id());

GRANT SELECT, INSERT, UPDATE ON "qms_processes" TO app_user;
GRANT SELECT, INSERT, UPDATE ON "qms_context_items" TO app_user;
GRANT SELECT, INSERT, UPDATE ON "qms_stakeholders" TO app_user;
GRANT SELECT, INSERT, UPDATE ON "qms_risks" TO app_user;
GRANT SELECT, INSERT, UPDATE ON "qms_nonconformities" TO app_user;
GRANT SELECT, INSERT, UPDATE ON "qms_actions" TO app_user;
GRANT SELECT, INSERT, UPDATE ON "qms_lessons" TO app_user;

-- El trabajo diario de Calidad recorre las empresas con acciones vencidas sin ejecutar que no se
-- han escalado en los últimos 7 días (decisión 11). La función corre como dueña del esquema: lee
-- todas las empresas solo para saber cuáles.
CREATE POLICY "qms_actions_worker_lookup" ON "qms_actions"
    FOR SELECT TO migration_user USING (true);
CREATE FUNCTION "qms_tenants_with_overdue_actions"(today DATE) RETURNS SETOF UUID
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
    AS $$ SELECT DISTINCT tenant_id FROM qms_actions
          WHERE status = 'open' AND due_on < today
            AND (escalated_on IS NULL OR escalated_on <= today - 7)
            AND deleted_at IS NULL
          ORDER BY 1 $$;
REVOKE EXECUTE ON FUNCTION "qms_tenants_with_overdue_actions"(DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "qms_tenants_with_overdue_actions"(DATE) TO app_user;

-- Avisos nuevos de Calidad: no conformidad registrada, acción asignada, acción por verificar y
-- acción vencida.
ALTER TABLE "ntf_templates" DROP CONSTRAINT "ntf_templates_key_check";
ALTER TABLE "ntf_notifications" DROP CONSTRAINT "ntf_notifications_kind_check";
ALTER TABLE "ntf_preferences" DROP CONSTRAINT "ntf_preferences_event_key_check";

ALTER TABLE "ntf_templates"
    ADD CONSTRAINT "ntf_templates_key_check" CHECK ("key" IN ('task_assigned', 'task_escalated',
        'comment_mention', 'security_alert', 'doc_read_requested', 'doc_request_decided',
        'crm_activity_due', 'crm_quote_update', 'ctr_contract_update', 'prj_project_update',
        'svc_ticket_update', 'svc_ticket_alert', 'svc_pqrsf_update', 'hr_onboarding_task',
        'hr_leave_update', 'hr_overtime_update', 'hr_review_update', 'hr_disciplinary_notice',
        'hr_offboarding_task', 'sst_report_received', 'sst_arl_due', 'sst_exam_due',
        'sst_task_assigned', 'sst_complaint_received', 'qms_nonconformity_reported',
        'qms_action_assigned', 'qms_action_to_verify', 'qms_action_overdue'));
ALTER TABLE "ntf_notifications"
    ADD CONSTRAINT "ntf_notifications_kind_check" CHECK ("kind" IN ('task_assigned', 'task_escalated',
        'comment_mention', 'security_alert', 'doc_read_requested', 'doc_request_decided',
        'crm_activity_due', 'crm_quote_update', 'ctr_contract_update', 'prj_project_update',
        'svc_ticket_update', 'svc_ticket_alert', 'svc_pqrsf_update', 'hr_onboarding_task',
        'hr_leave_update', 'hr_overtime_update', 'hr_review_update', 'hr_disciplinary_notice',
        'hr_offboarding_task', 'sst_report_received', 'sst_arl_due', 'sst_exam_due',
        'sst_task_assigned', 'sst_complaint_received', 'qms_nonconformity_reported',
        'qms_action_assigned', 'qms_action_to_verify', 'qms_action_overdue'));
ALTER TABLE "ntf_preferences"
    ADD CONSTRAINT "ntf_preferences_event_key_check" CHECK ("event_key" IN ('task_assigned', 'task_escalated',
        'comment_mention', 'security_alert', 'doc_read_requested', 'doc_request_decided',
        'crm_activity_due', 'crm_quote_update', 'ctr_contract_update', 'prj_project_update',
        'svc_ticket_update', 'svc_ticket_alert', 'svc_pqrsf_update', 'hr_onboarding_task',
        'hr_leave_update', 'hr_overtime_update', 'hr_review_update', 'hr_disciplinary_notice',
        'hr_offboarding_task', 'sst_report_received', 'sst_arl_due', 'sst_exam_due',
        'sst_task_assigned', 'sst_complaint_received', 'qms_nonconformity_reported',
        'qms_action_assigned', 'qms_action_to_verify', 'qms_action_overdue'));
