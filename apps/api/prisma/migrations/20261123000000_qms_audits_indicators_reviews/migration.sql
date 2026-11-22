-- B39 — Calidad: auditorías internas, indicadores y revisión por la dirección (M14, ficha 17.15).
-- Programa anual (qms_audit_programs), auditorías con lista de chequeo e informe (qms_audits),
-- hallazgos (qms_findings), indicadores con su ficha (qms_indicators), mediciones
-- (qms_measurements) y actas de revisión por la dirección (qms_management_reviews). Las acciones
-- ganan dos orígenes: hallazgo de auditoría y revisión por la dirección. Solo expande: la versión
-- anterior sigue funcionando.

CREATE TABLE "qms_audit_programs" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "year" INTEGER NOT NULL,
    "objectives" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "criteria" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "published_on" DATE,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),
    CONSTRAINT "qms_audit_programs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "qms_audit_programs_year_check" CHECK ("year" BETWEEN 2020 AND 2100),
    CONSTRAINT "qms_audit_programs_status_check" CHECK (
        ("status" = 'draft' AND "published_on" IS NULL)
        OR ("status" = 'published' AND "published_on" IS NOT NULL)
    )
);

CREATE TABLE "qms_audits" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "program_id" UUID NOT NULL,
    "process_id" UUID NOT NULL,
    "auditor_id" UUID NOT NULL,
    "planned_on" DATE NOT NULL,
    "objective" TEXT NOT NULL,
    "criteria" TEXT,
    "status" TEXT NOT NULL DEFAULT 'planned',
    "checklist" JSONB NOT NULL DEFAULT '[]',
    "started_on" DATE,
    "reported_on" DATE,
    "conclusions" TEXT,
    "closed_on" DATE,
    "cancel_reason" TEXT,
    "pdf_status" TEXT NOT NULL DEFAULT 'none',
    "report_file_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),
    CONSTRAINT "qms_audits_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "qms_audits_code_check" CHECK ("code" ~ '^AUD-[0-9]{4}-[0-9]{4,8}$'),
    CONSTRAINT "qms_audits_status_check" CHECK (
        "status" IN ('planned', 'in_progress', 'reported', 'closed', 'cancelled')
    ),
    CONSTRAINT "qms_audits_checklist_check" CHECK (jsonb_typeof("checklist") = 'array'),
    -- En ejecución o después lleva su inicio; con informe, la fecha y las conclusiones.
    CONSTRAINT "qms_audits_steps_check" CHECK (
        ("status" IN ('planned', 'cancelled') OR "started_on" IS NOT NULL)
        AND (("status" IN ('reported', 'closed')) = ("reported_on" IS NOT NULL))
        AND ("reported_on" IS NULL) = ("conclusions" IS NULL)
        AND (("status" = 'closed') = ("closed_on" IS NOT NULL))
        AND (("status" = 'cancelled') = ("cancel_reason" IS NOT NULL))
    ),
    -- El informe en PDF (RE-SGC-004) se genera al emitirse (decisión 9).
    CONSTRAINT "qms_audits_pdf_check" CHECK (
        "pdf_status" IN ('none', 'pending', 'ready')
        AND (("pdf_status" = 'none') = ("reported_on" IS NULL))
        AND (("pdf_status" = 'ready') = ("report_file_id" IS NOT NULL))
    )
);

CREATE TABLE "qms_findings" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "audit_id" UUID NOT NULL,
    "finding_type" TEXT NOT NULL,
    "requirement" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "evidence" TEXT NOT NULL,
    "nonconformity_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),
    CONSTRAINT "qms_findings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "qms_findings_type_check" CHECK (
        "finding_type" IN ('major', 'minor', 'observation', 'opportunity')
    ),
    -- Decisión 3: solo un hallazgo de no conformidad abre no conformidad.
    CONSTRAINT "qms_findings_nonconformity_check" CHECK (
        "nonconformity_id" IS NULL OR "finding_type" IN ('major', 'minor')
    )
);

CREATE TABLE "qms_indicators" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "process_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "objective" TEXT NOT NULL,
    "formula" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "target" DECIMAL(18,4) NOT NULL,
    "direction" TEXT NOT NULL,
    "frequency" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "responsible_id" UUID NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "reminded_period" DATE,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),
    CONSTRAINT "qms_indicators_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "qms_indicators_code_check" CHECK ("code" ~ '^IND-[0-9]{3,8}$'),
    CONSTRAINT "qms_indicators_unit_check" CHECK (
        "unit" IN ('percent', 'count', 'days', 'pesos', 'score')
    ),
    CONSTRAINT "qms_indicators_target_check" CHECK ("target" >= 0),
    CONSTRAINT "qms_indicators_direction_check" CHECK (
        "direction" IN ('higher_better', 'lower_better')
    ),
    CONSTRAINT "qms_indicators_frequency_check" CHECK (
        "frequency" IN ('monthly', 'quarterly', 'semiannual', 'annual')
    ),
    -- Decisión 6: el registro manual o uno de los ocho cálculos automáticos.
    CONSTRAINT "qms_indicators_source_check" CHECK ("source" IN ('manual',
        'qms_actions_effective', 'qms_actions_on_time', 'qms_open_nonconformities',
        'qms_audit_program', 'svc_tickets_within_sla', 'svc_pqrsf_on_time',
        'svc_survey_satisfaction', 'sst_incidents'))
);

CREATE TABLE "qms_measurements" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "indicator_id" UUID NOT NULL,
    "period_start" DATE NOT NULL,
    "value" DECIMAL(18,4) NOT NULL,
    "meets" BOOLEAN NOT NULL,
    "analysis" TEXT,
    "evidence_note" TEXT,
    "evidence_file_id" UUID,
    "automatic" BOOLEAN NOT NULL,
    "measured_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),
    CONSTRAINT "qms_measurements_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "qms_measurements_period_check" CHECK (EXTRACT(DAY FROM "period_start") = 1),
    CONSTRAINT "qms_measurements_value_check" CHECK ("value" >= 0),
    -- Ficha 17.15: lo que no calcula la plataforma se registra con evidencia, análisis y autor.
    CONSTRAINT "qms_measurements_evidence_check" CHECK (
        "automatic" OR ("evidence_note" IS NOT NULL AND "analysis" IS NOT NULL
            AND "measured_by" IS NOT NULL)
    )
);

CREATE TABLE "qms_management_reviews" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "period_from" DATE NOT NULL,
    "period_to" DATE NOT NULL,
    "meeting_on" DATE NOT NULL,
    "attendees" TEXT NOT NULL,
    "inputs" JSONB NOT NULL DEFAULT '[]',
    "inputs_loaded_at" TIMESTAMPTZ(6),
    "conclusions" TEXT,
    "decisions" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "return_reason" TEXT,
    "approved_by" UUID,
    "approved_on" DATE,
    "pdf_status" TEXT NOT NULL DEFAULT 'none',
    "file_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),
    CONSTRAINT "qms_management_reviews_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "qms_management_reviews_code_check" CHECK ("code" ~ '^RD-[0-9]{4}-[0-9]{4,8}$'),
    CONSTRAINT "qms_management_reviews_period_check" CHECK ("period_from" <= "period_to"),
    CONSTRAINT "qms_management_reviews_json_check" CHECK (
        jsonb_typeof("inputs") = 'array' AND jsonb_typeof("decisions") = 'array'
    ),
    CONSTRAINT "qms_management_reviews_status_check" CHECK (
        "status" IN ('draft', 'submitted', 'approved')
    ),
    -- Aprobada: con conclusiones, quién y cuándo; el PDF se genera desde ese momento.
    CONSTRAINT "qms_management_reviews_approved_check" CHECK (
        (("status" = 'approved') = ("approved_by" IS NOT NULL))
        AND ("approved_by" IS NULL) = ("approved_on" IS NULL)
        AND ("status" <> 'approved' OR "conclusions" IS NOT NULL)
        AND "pdf_status" IN ('none', 'pending', 'ready')
        AND (("pdf_status" = 'none') = ("status" <> 'approved'))
        AND (("pdf_status" = 'ready') = ("file_id" IS NOT NULL))
    )
);

ALTER TABLE "qms_actions" ADD COLUMN "finding_id" UUID;
ALTER TABLE "qms_actions" ADD COLUMN "review_id" UUID;
ALTER TABLE "qms_actions" DROP CONSTRAINT "qms_actions_origin_check";
ALTER TABLE "qms_actions" ADD CONSTRAINT "qms_actions_origin_check" CHECK (
    ("origin_type" = 'nonconformity') = ("nonconformity_id" IS NOT NULL)
    AND ("origin_type" = 'risk') = ("risk_id" IS NOT NULL)
    AND ("origin_type" = 'audit') = ("finding_id" IS NOT NULL)
    AND ("origin_type" = 'management_review') = ("review_id" IS NOT NULL)
    AND "origin_type" IN ('nonconformity', 'risk', 'improvement', 'audit', 'management_review')
);

CREATE UNIQUE INDEX "qms_audit_programs_tenant_id_id_key" ON "qms_audit_programs"("tenant_id", "id");
-- Un programa por año.
CREATE UNIQUE INDEX "qms_audit_programs_tenant_id_year_key" ON "qms_audit_programs"("tenant_id", "year");
CREATE UNIQUE INDEX "qms_audits_tenant_id_id_key" ON "qms_audits"("tenant_id", "id");
CREATE UNIQUE INDEX "qms_audits_tenant_id_code_key" ON "qms_audits"("tenant_id", "code");
CREATE INDEX "qms_audits_tenant_id_program_id_idx" ON "qms_audits"("tenant_id", "program_id");
CREATE INDEX "qms_audits_tenant_id_auditor_id_idx" ON "qms_audits"("tenant_id", "auditor_id");
CREATE UNIQUE INDEX "qms_findings_tenant_id_id_key" ON "qms_findings"("tenant_id", "id");
CREATE INDEX "qms_findings_tenant_id_audit_id_idx" ON "qms_findings"("tenant_id", "audit_id");
CREATE UNIQUE INDEX "qms_findings_tenant_id_nonconformity_id_key" ON "qms_findings"("tenant_id", "nonconformity_id");
CREATE UNIQUE INDEX "qms_indicators_tenant_id_id_key" ON "qms_indicators"("tenant_id", "id");
CREATE UNIQUE INDEX "qms_indicators_tenant_id_code_key" ON "qms_indicators"("tenant_id", "code");
CREATE INDEX "qms_indicators_tenant_id_responsible_id_idx" ON "qms_indicators"("tenant_id", "responsible_id");
CREATE UNIQUE INDEX "qms_measurements_tenant_id_id_key" ON "qms_measurements"("tenant_id", "id");
-- Una medición por indicador y periodo.
CREATE UNIQUE INDEX "qms_measurements_tenant_id_indicator_id_period_start_key" ON "qms_measurements"("tenant_id", "indicator_id", "period_start");
CREATE UNIQUE INDEX "qms_management_reviews_tenant_id_id_key" ON "qms_management_reviews"("tenant_id", "id");
CREATE UNIQUE INDEX "qms_management_reviews_tenant_id_code_key" ON "qms_management_reviews"("tenant_id", "code");
CREATE INDEX "qms_actions_tenant_id_finding_id_idx" ON "qms_actions"("tenant_id", "finding_id");
CREATE INDEX "qms_actions_tenant_id_review_id_idx" ON "qms_actions"("tenant_id", "review_id");

ALTER TABLE "qms_audit_programs" ADD CONSTRAINT "qms_audit_programs_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "qms_audits" ADD CONSTRAINT "qms_audits_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "qms_findings" ADD CONSTRAINT "qms_findings_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "qms_indicators" ADD CONSTRAINT "qms_indicators_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "qms_measurements" ADD CONSTRAINT "qms_measurements_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "qms_management_reviews" ADD CONSTRAINT "qms_management_reviews_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "qms_audits" ADD CONSTRAINT "qms_audits_tenant_id_program_id_fkey"
    FOREIGN KEY ("tenant_id", "program_id") REFERENCES "qms_audit_programs"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "qms_findings" ADD CONSTRAINT "qms_findings_tenant_id_audit_id_fkey"
    FOREIGN KEY ("tenant_id", "audit_id") REFERENCES "qms_audits"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "qms_findings" ADD CONSTRAINT "qms_findings_tenant_id_nonconformity_id_fkey"
    FOREIGN KEY ("tenant_id", "nonconformity_id") REFERENCES "qms_nonconformities"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "qms_measurements" ADD CONSTRAINT "qms_measurements_tenant_id_indicator_id_fkey"
    FOREIGN KEY ("tenant_id", "indicator_id") REFERENCES "qms_indicators"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "qms_actions" ADD CONSTRAINT "qms_actions_tenant_id_finding_id_fkey"
    FOREIGN KEY ("tenant_id", "finding_id") REFERENCES "qms_findings"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "qms_actions" ADD CONSTRAINT "qms_actions_tenant_id_review_id_fkey"
    FOREIGN KEY ("tenant_id", "review_id") REFERENCES "qms_management_reviews"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TRIGGER "qms_audit_programs_control_columns" BEFORE INSERT OR UPDATE ON "qms_audit_programs"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();
CREATE TRIGGER "qms_audits_control_columns" BEFORE INSERT OR UPDATE ON "qms_audits"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();
CREATE TRIGGER "qms_findings_control_columns" BEFORE INSERT OR UPDATE ON "qms_findings"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();
CREATE TRIGGER "qms_indicators_control_columns" BEFORE INSERT OR UPDATE ON "qms_indicators"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();
CREATE TRIGGER "qms_measurements_control_columns" BEFORE INSERT OR UPDATE ON "qms_measurements"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();
CREATE TRIGGER "qms_management_reviews_control_columns" BEFORE INSERT OR UPDATE ON "qms_management_reviews"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();

-- El acta aprobada no cambia (decisión 9): después de aprobada solo se le amarra su PDF.
CREATE FUNCTION "qms_management_reviews_freeze"() RETURNS trigger
    LANGUAGE plpgsql AS $$
BEGIN
    IF OLD."status" = 'approved' AND (
        NEW."status" IS DISTINCT FROM OLD."status"
        OR NEW."attendees" IS DISTINCT FROM OLD."attendees"
        OR NEW."inputs" IS DISTINCT FROM OLD."inputs"
        OR NEW."conclusions" IS DISTINCT FROM OLD."conclusions"
        OR NEW."decisions" IS DISTINCT FROM OLD."decisions"
        OR NEW."period_from" IS DISTINCT FROM OLD."period_from"
        OR NEW."period_to" IS DISTINCT FROM OLD."period_to"
        OR NEW."meeting_on" IS DISTINCT FROM OLD."meeting_on"
        OR NEW."approved_by" IS DISTINCT FROM OLD."approved_by"
        OR NEW."approved_on" IS DISTINCT FROM OLD."approved_on"
        OR NEW."deleted_at" IS DISTINCT FROM OLD."deleted_at"
    ) THEN
        RAISE EXCEPTION 'El acta aprobada % no se modifica.', OLD."code"
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER "qms_management_reviews_frozen" BEFORE UPDATE ON "qms_management_reviews"
    FOR EACH ROW EXECUTE FUNCTION "qms_management_reviews_freeze"();

ALTER TABLE "qms_audit_programs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "qms_audit_programs" FORCE ROW LEVEL SECURITY;
CREATE POLICY "qms_audit_programs_tenant_isolation" ON "qms_audit_programs"
    USING ("tenant_id" = core_current_tenant_id()) WITH CHECK ("tenant_id" = core_current_tenant_id());
ALTER TABLE "qms_audits" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "qms_audits" FORCE ROW LEVEL SECURITY;
CREATE POLICY "qms_audits_tenant_isolation" ON "qms_audits"
    USING ("tenant_id" = core_current_tenant_id()) WITH CHECK ("tenant_id" = core_current_tenant_id());
ALTER TABLE "qms_findings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "qms_findings" FORCE ROW LEVEL SECURITY;
CREATE POLICY "qms_findings_tenant_isolation" ON "qms_findings"
    USING ("tenant_id" = core_current_tenant_id()) WITH CHECK ("tenant_id" = core_current_tenant_id());
ALTER TABLE "qms_indicators" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "qms_indicators" FORCE ROW LEVEL SECURITY;
CREATE POLICY "qms_indicators_tenant_isolation" ON "qms_indicators"
    USING ("tenant_id" = core_current_tenant_id()) WITH CHECK ("tenant_id" = core_current_tenant_id());
ALTER TABLE "qms_measurements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "qms_measurements" FORCE ROW LEVEL SECURITY;
CREATE POLICY "qms_measurements_tenant_isolation" ON "qms_measurements"
    USING ("tenant_id" = core_current_tenant_id()) WITH CHECK ("tenant_id" = core_current_tenant_id());
ALTER TABLE "qms_management_reviews" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "qms_management_reviews" FORCE ROW LEVEL SECURITY;
CREATE POLICY "qms_management_reviews_tenant_isolation" ON "qms_management_reviews"
    USING ("tenant_id" = core_current_tenant_id()) WITH CHECK ("tenant_id" = core_current_tenant_id());

GRANT SELECT, INSERT, UPDATE ON "qms_audit_programs" TO app_user;
GRANT SELECT, INSERT, UPDATE ON "qms_audits" TO app_user;
GRANT SELECT, INSERT, UPDATE ON "qms_findings" TO app_user;
GRANT SELECT, INSERT, UPDATE ON "qms_indicators" TO app_user;
GRANT SELECT, INSERT, UPDATE ON "qms_measurements" TO app_user;
GRANT SELECT, INSERT, UPDATE ON "qms_management_reviews" TO app_user;

-- El worker recorre solo las empresas con trabajo: indicadores activos (cálculo y recordatorio,
-- decisión 7) y PDF pendientes del informe o del acta (decisión 9). Las funciones corren como
-- dueñas del esquema: leen todas las empresas solo para saber cuáles.
CREATE POLICY "qms_indicators_worker_lookup" ON "qms_indicators"
    FOR SELECT TO migration_user USING (true);
CREATE POLICY "qms_audits_worker_lookup" ON "qms_audits"
    FOR SELECT TO migration_user USING (true);
CREATE POLICY "qms_management_reviews_worker_lookup" ON "qms_management_reviews"
    FOR SELECT TO migration_user USING (true);
CREATE FUNCTION "qms_tenants_with_indicators"() RETURNS SETOF UUID
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
    AS $$ SELECT DISTINCT tenant_id FROM qms_indicators
          WHERE active AND deleted_at IS NULL ORDER BY 1 $$;
CREATE FUNCTION "qms_tenants_with_pdf_work"() RETURNS SETOF UUID
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
    AS $$ SELECT tenant_id FROM qms_audits WHERE pdf_status = 'pending' AND deleted_at IS NULL
          UNION
          SELECT tenant_id FROM qms_management_reviews
          WHERE pdf_status = 'pending' AND deleted_at IS NULL
          ORDER BY 1 $$;
REVOKE EXECUTE ON FUNCTION "qms_tenants_with_indicators"() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "qms_tenants_with_indicators"() TO app_user;
REVOKE EXECUTE ON FUNCTION "qms_tenants_with_pdf_work"() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "qms_tenants_with_pdf_work"() TO app_user;

-- Avisos nuevos de Calidad (decisión 11): auditoría asignada, indicador por medir y acta por
-- aprobar.
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
        'qms_audit_assigned', 'qms_indicator_due', 'qms_review_to_approve'));
ALTER TABLE "ntf_notifications"
    ADD CONSTRAINT "ntf_notifications_kind_check" CHECK ("kind" IN ('task_assigned', 'task_escalated',
        'comment_mention', 'security_alert', 'doc_read_requested', 'doc_request_decided',
        'crm_activity_due', 'crm_quote_update', 'ctr_contract_update', 'prj_project_update',
        'svc_ticket_update', 'svc_ticket_alert', 'svc_pqrsf_update', 'hr_onboarding_task',
        'hr_leave_update', 'hr_overtime_update', 'hr_review_update', 'hr_disciplinary_notice',
        'hr_offboarding_task', 'sst_report_received', 'sst_arl_due', 'sst_exam_due',
        'sst_task_assigned', 'sst_complaint_received', 'qms_nonconformity_reported',
        'qms_action_assigned', 'qms_action_to_verify', 'qms_action_overdue',
        'qms_audit_assigned', 'qms_indicator_due', 'qms_review_to_approve'));
ALTER TABLE "ntf_preferences"
    ADD CONSTRAINT "ntf_preferences_event_key_check" CHECK ("event_key" IN ('task_assigned', 'task_escalated',
        'comment_mention', 'security_alert', 'doc_read_requested', 'doc_request_decided',
        'crm_activity_due', 'crm_quote_update', 'ctr_contract_update', 'prj_project_update',
        'svc_ticket_update', 'svc_ticket_alert', 'svc_pqrsf_update', 'hr_onboarding_task',
        'hr_leave_update', 'hr_overtime_update', 'hr_review_update', 'hr_disciplinary_notice',
        'hr_offboarding_task', 'sst_report_received', 'sst_arl_due', 'sst_exam_due',
        'sst_task_assigned', 'sst_complaint_received', 'qms_nonconformity_reported',
        'qms_action_assigned', 'qms_action_to_verify', 'qms_action_overdue',
        'qms_audit_assigned', 'qms_indicator_due', 'qms_review_to_approve'));
