-- B46 · Tableros de la Dirección y requisitos legales (M16, ficha 17.17).
-- Normograma (RE-DG-001) con su evaluación semestral del cumplimiento (decisiones 6 y 7), objetivos
-- del plan estratégico para el cuadro de mando (decisión 4) y el aviso de requisitos sin evaluar
-- (decisión 8). Los tableros no tienen tablas: se calculan al momento (decisión 11).

CREATE TABLE "qms_legal_requirements" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "norm_type" TEXT NOT NULL,
    "norm" TEXT NOT NULL,
    "issuer" TEXT NOT NULL,
    "article" TEXT,
    "requirement" TEXT NOT NULL,
    "compliance_means" TEXT,
    "process_id" UUID,
    "responsible_id" UUID,
    "applies" BOOLEAN NOT NULL DEFAULT true,
    "reminded_period" DATE,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),
    CONSTRAINT "qms_legal_requirements_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "qms_legal_requirements_code_check" CHECK ("code" ~ '^NRM-[0-9]{3,8}$'),
    CONSTRAINT "qms_legal_requirements_norm_type_check" CHECK (
        "norm_type" IN ('law', 'decree', 'resolution', 'circular', 'standard', 'other')
    ),
    CONSTRAINT "qms_legal_requirements_text_check" CHECK (
        length(btrim("norm")) >= 3 AND length(btrim("issuer")) >= 2
        AND length(btrim("requirement")) >= 5
    )
);

-- Cada evaluación queda fija (solo se agregan nuevas): la última es la que cuenta.
CREATE TABLE "qms_legal_evaluations" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "requirement_id" UUID NOT NULL,
    "period_start" DATE NOT NULL,
    "evaluated_on" DATE NOT NULL,
    "result" TEXT NOT NULL,
    "evidence_note" TEXT NOT NULL,
    "evidence_file_id" UUID,
    "action_id" UUID,
    "evaluated_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),
    CONSTRAINT "qms_legal_evaluations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "qms_legal_evaluations_result_check" CHECK (
        "result" IN ('complies', 'partial', 'fails', 'not_applicable')
    ),
    -- Decisión 7: un resultado parcial o negativo lleva su acción de mejora; los demás no.
    CONSTRAINT "qms_legal_evaluations_action_check" CHECK (
        ("result" IN ('partial', 'fails')) = ("action_id" IS NOT NULL)
    ),
    -- El periodo es el semestre de la fecha de evaluación.
    CONSTRAINT "qms_legal_evaluations_period_check" CHECK (
        "period_start" = make_date(
            EXTRACT(YEAR FROM "evaluated_on")::int,
            CASE WHEN EXTRACT(MONTH FROM "evaluated_on") <= 6 THEN 1 ELSE 7 END,
            1
        )
    ),
    CONSTRAINT "qms_legal_evaluations_evidence_check" CHECK (length(btrim("evidence_note")) >= 5)
);

CREATE TABLE "qms_strategic_objectives" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "perspective" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "year_from" INTEGER NOT NULL,
    "year_to" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),
    CONSTRAINT "qms_strategic_objectives_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "qms_strategic_objectives_code_check" CHECK ("code" ~ '^OBJ-[0-9]{3,8}$'),
    CONSTRAINT "qms_strategic_objectives_perspective_check" CHECK (
        "perspective" IN ('financial', 'customer', 'internal', 'learning')
    ),
    CONSTRAINT "qms_strategic_objectives_years_check" CHECK (
        "year_from" BETWEEN 2020 AND 2100 AND "year_to" BETWEEN "year_from" AND 2100
    )
);

-- Cada indicador mide a lo sumo un objetivo estratégico.
ALTER TABLE "qms_indicators" ADD COLUMN "strategic_objective_id" UUID;

-- Las acciones que nacen de una evaluación legal apuntan a su requisito (decisión 7).
ALTER TABLE "qms_actions" ADD COLUMN "legal_requirement_id" UUID;
ALTER TABLE "qms_actions" DROP CONSTRAINT "qms_actions_origin_check";
ALTER TABLE "qms_actions" ADD CONSTRAINT "qms_actions_origin_check" CHECK (
    ("origin_type" = 'nonconformity') = ("nonconformity_id" IS NOT NULL)
    AND ("origin_type" = 'risk') = ("risk_id" IS NOT NULL)
    AND ("origin_type" = 'audit') = ("finding_id" IS NOT NULL)
    AND ("origin_type" = 'management_review') = ("review_id" IS NOT NULL)
    AND ("origin_type" = 'legal_evaluation') = ("legal_requirement_id" IS NOT NULL)
    AND "origin_type" IN ('nonconformity', 'risk', 'improvement', 'audit', 'management_review',
        'legal_evaluation')
);

CREATE UNIQUE INDEX "qms_legal_requirements_tenant_id_id_key" ON "qms_legal_requirements"("tenant_id", "id");
CREATE UNIQUE INDEX "qms_legal_requirements_tenant_id_code_key" ON "qms_legal_requirements"("tenant_id", "code");
CREATE INDEX "qms_legal_requirements_tenant_id_process_id_idx" ON "qms_legal_requirements"("tenant_id", "process_id");
CREATE UNIQUE INDEX "qms_legal_evaluations_tenant_id_id_key" ON "qms_legal_evaluations"("tenant_id", "id");
CREATE INDEX "qms_legal_evaluations_tenant_id_requirement_id_idx" ON "qms_legal_evaluations"("tenant_id", "requirement_id");
CREATE UNIQUE INDEX "qms_legal_evaluations_tenant_id_action_id_key" ON "qms_legal_evaluations"("tenant_id", "action_id");
CREATE UNIQUE INDEX "qms_strategic_objectives_tenant_id_id_key" ON "qms_strategic_objectives"("tenant_id", "id");
CREATE UNIQUE INDEX "qms_strategic_objectives_tenant_id_code_key" ON "qms_strategic_objectives"("tenant_id", "code");
CREATE INDEX "qms_indicators_tenant_id_strategic_objective_id_idx" ON "qms_indicators"("tenant_id", "strategic_objective_id");
CREATE INDEX "qms_actions_tenant_id_legal_requirement_id_idx" ON "qms_actions"("tenant_id", "legal_requirement_id");

ALTER TABLE "qms_legal_requirements" ADD CONSTRAINT "qms_legal_requirements_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "qms_legal_evaluations" ADD CONSTRAINT "qms_legal_evaluations_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "qms_legal_evaluations" ADD CONSTRAINT "qms_legal_evaluations_tenant_id_requirement_id_fkey"
    FOREIGN KEY ("tenant_id", "requirement_id") REFERENCES "qms_legal_requirements"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "qms_legal_evaluations" ADD CONSTRAINT "qms_legal_evaluations_tenant_id_action_id_fkey"
    FOREIGN KEY ("tenant_id", "action_id") REFERENCES "qms_actions"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "qms_strategic_objectives" ADD CONSTRAINT "qms_strategic_objectives_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "qms_indicators" ADD CONSTRAINT "qms_indicators_tenant_id_strategic_objective_id_fkey"
    FOREIGN KEY ("tenant_id", "strategic_objective_id") REFERENCES "qms_strategic_objectives"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "qms_actions" ADD CONSTRAINT "qms_actions_tenant_id_legal_requirement_id_fkey"
    FOREIGN KEY ("tenant_id", "legal_requirement_id") REFERENCES "qms_legal_requirements"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TRIGGER "qms_legal_requirements_control_columns" BEFORE INSERT OR UPDATE ON "qms_legal_requirements"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();
CREATE TRIGGER "qms_legal_evaluations_control_columns" BEFORE INSERT OR UPDATE ON "qms_legal_evaluations"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();
CREATE TRIGGER "qms_strategic_objectives_control_columns" BEFORE INSERT OR UPDATE ON "qms_strategic_objectives"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();

ALTER TABLE "qms_legal_requirements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "qms_legal_requirements" FORCE ROW LEVEL SECURITY;
CREATE POLICY "qms_legal_requirements_tenant_isolation" ON "qms_legal_requirements"
    USING ("tenant_id" = core_current_tenant_id()) WITH CHECK ("tenant_id" = core_current_tenant_id());
ALTER TABLE "qms_legal_evaluations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "qms_legal_evaluations" FORCE ROW LEVEL SECURITY;
CREATE POLICY "qms_legal_evaluations_tenant_isolation" ON "qms_legal_evaluations"
    USING ("tenant_id" = core_current_tenant_id()) WITH CHECK ("tenant_id" = core_current_tenant_id());
ALTER TABLE "qms_strategic_objectives" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "qms_strategic_objectives" FORCE ROW LEVEL SECURITY;
CREATE POLICY "qms_strategic_objectives_tenant_isolation" ON "qms_strategic_objectives"
    USING ("tenant_id" = core_current_tenant_id()) WITH CHECK ("tenant_id" = core_current_tenant_id());

GRANT SELECT, INSERT, UPDATE ON "qms_legal_requirements" TO app_user;
-- Las evaluaciones no se cambian: la aplicación solo puede leerlas y agregarlas.
GRANT SELECT, INSERT ON "qms_legal_evaluations" TO app_user;
GRANT SELECT, INSERT, UPDATE ON "qms_strategic_objectives" TO app_user;

-- El worker recorre solo las empresas con requisitos que aplican (aviso de la decisión 8). La
-- función corre como dueña del esquema: lee todas las empresas solo para saber cuáles.
CREATE POLICY "qms_legal_requirements_worker_lookup" ON "qms_legal_requirements"
    FOR SELECT TO migration_user USING (true);
CREATE FUNCTION "qms_tenants_with_legal_requirements"() RETURNS SETOF UUID
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
    AS $$ SELECT DISTINCT tenant_id FROM qms_legal_requirements
          WHERE applies AND deleted_at IS NULL ORDER BY 1 $$;
REVOKE EXECUTE ON FUNCTION "qms_tenants_with_legal_requirements"() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "qms_tenants_with_legal_requirements"() TO app_user;

-- Aviso nuevo (decisión 8): requisitos legales sin evaluar cerca del fin del semestre.
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
        'qms_action_assigned', 'qms_action_to_verify', 'qms_action_overdue',
        'qms_audit_assigned', 'qms_indicator_due', 'qms_review_to_approve',
        'prv_request_received', 'prv_request_due', 'prv_incident_due', 'qms_legal_due'));
ALTER TABLE "ntf_notifications"
    ADD CONSTRAINT "ntf_notifications_kind_check" CHECK ("kind" IN ('task_assigned', 'task_escalated',
        'comment_mention', 'security_alert', 'doc_read_requested', 'doc_request_decided',
        'crm_activity_due', 'crm_quote_update', 'ctr_contract_update', 'prj_project_update',
        'svc_ticket_update', 'svc_ticket_alert', 'svc_pqrsf_update', 'hr_onboarding_task',
        'hr_leave_update', 'hr_overtime_update', 'hr_review_update', 'hr_disciplinary_notice',
        'hr_offboarding_task', 'sst_report_received', 'sst_arl_due', 'sst_exam_due',
        'sst_task_assigned', 'sst_complaint_received', 'qms_nonconformity_reported',
        'qms_action_assigned', 'qms_action_to_verify', 'qms_action_overdue',
        'qms_audit_assigned', 'qms_indicator_due', 'qms_review_to_approve',
        'prv_request_received', 'prv_request_due', 'prv_incident_due', 'qms_legal_due'));
ALTER TABLE "ntf_preferences"
    ADD CONSTRAINT "ntf_preferences_event_key_check" CHECK ("event_key" IN ('task_assigned', 'task_escalated',
        'comment_mention', 'security_alert', 'doc_read_requested', 'doc_request_decided',
        'crm_activity_due', 'crm_quote_update', 'ctr_contract_update', 'prj_project_update',
        'svc_ticket_update', 'svc_ticket_alert', 'svc_pqrsf_update', 'hr_onboarding_task',
        'hr_leave_update', 'hr_overtime_update', 'hr_review_update', 'hr_disciplinary_notice',
        'hr_offboarding_task', 'sst_report_received', 'sst_arl_due', 'sst_exam_due',
        'sst_task_assigned', 'sst_complaint_received', 'qms_nonconformity_reported',
        'qms_action_assigned', 'qms_action_to_verify', 'qms_action_overdue',
        'qms_audit_assigned', 'qms_indicator_due', 'qms_review_to_approve',
        'prv_request_received', 'prv_request_due', 'prv_incident_due', 'qms_legal_due'));
