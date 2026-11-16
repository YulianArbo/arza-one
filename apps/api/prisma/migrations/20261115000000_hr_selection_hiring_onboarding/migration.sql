-- B35: talento humano (M12, ficha 17.13). Vacantes (hr_vacancies), candidatos con su proceso de
-- selección (hr_candidates, hr_evaluations_selection), colaboradores (hr_employees), contrato
-- laboral con firma electrónica (hr_contracts), tareas de inducción (hr_onboarding_tasks) y lista
-- de chequeo de la historia laboral (hr_file_checklist). Un colaborador solo queda «activo» con su
-- contrato firmado, y un candidato descartado siempre tiene fecha de eliminación de sus datos.
-- Solo expande: la versión anterior sigue funcionando con estas tablas y restricciones.

CREATE TABLE "hr_vacancies" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "position_id" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "opened_on" DATE NOT NULL,
    "closed_on" DATE,
    "close_note" TEXT,
    "closed_by" UUID,
    "request_key" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),
    CONSTRAINT "hr_vacancies_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "hr_vacancies_code_check" CHECK ("code" ~ '^VAC-[0-9]{4}-[0-9]{4,8}$'),
    CONSTRAINT "hr_vacancies_reason_check" CHECK ("reason" IN ('new_position', 'replacement', 'temporary')),
    CONSTRAINT "hr_vacancies_status_check" CHECK ("status" IN ('open', 'closed', 'cancelled')),
    CONSTRAINT "hr_vacancies_closing_check" CHECK (
        ("status" = 'open') = ("closed_on" IS NULL)
        AND ("status" = 'open' OR ("close_note" IS NOT NULL AND "closed_by" IS NOT NULL))
        AND ("closed_on" IS NULL OR "closed_on" >= "opened_on")
    )
);

CREATE TABLE "hr_candidates" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "vacancy_id" UUID NOT NULL,
    "party_id" UUID NOT NULL,
    "source" TEXT NOT NULL,
    "stage" TEXT NOT NULL DEFAULT 'applied',
    "applied_on" DATE NOT NULL,
    "resume_file_id" UUID,
    "talent_bank" BOOLEAN NOT NULL DEFAULT false,
    "consent_id" UUID NOT NULL,
    "discarded_on" DATE,
    "discard_reason" TEXT,
    "retention_until" DATE,
    "retention_extended_at" TIMESTAMPTZ(6),
    "erased_at" TIMESTAMPTZ(6),
    "request_key" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),
    CONSTRAINT "hr_candidates_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "hr_candidates_source_check" CHECK ("source" IN ('job_board', 'referral', 'website', 'social', 'university', 'other')),
    CONSTRAINT "hr_candidates_stage_check" CHECK ("stage" IN ('applied', 'shortlisted', 'evaluating', 'selected', 'hired', 'discarded')),
    -- Ficha 17.13: los datos de quien no queda se eliminan a los doce meses; el descartado
    -- siempre tiene su fecha de eliminación.
    CONSTRAINT "hr_candidates_discard_check" CHECK (
        ("stage" = 'discarded') = ("discarded_on" IS NOT NULL)
        AND ("stage" <> 'discarded' OR ("discard_reason" IS NOT NULL AND "retention_until" > "discarded_on"))
        AND ("stage" = 'discarded' OR "retention_until" IS NULL)
    ),
    CONSTRAINT "hr_candidates_erased_check" CHECK (
        "erased_at" IS NULL OR ("stage" = 'discarded' AND "resume_file_id" IS NULL)
    )
);

CREATE TABLE "hr_evaluations_selection" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "candidate_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "evaluated_on" DATE NOT NULL,
    "score" INTEGER NOT NULL,
    "note" TEXT,
    "evaluator_id" UUID,
    "request_key" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),
    CONSTRAINT "hr_evaluations_selection_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "hr_evaluations_selection_kind_check" CHECK ("kind" IN ('interview', 'technical_test', 'psychometric', 'references')),
    CONSTRAINT "hr_evaluations_selection_score_check" CHECK ("score" BETWEEN 0 AND 100)
);

CREATE TABLE "hr_employees" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "party_id" UUID NOT NULL,
    "candidate_id" UUID,
    "position_id" UUID NOT NULL,
    "hire_date" DATE NOT NULL,
    "termination_date" DATE,
    "contract_type" TEXT NOT NULL,
    "work_mode" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "work_email" TEXT NOT NULL,
    "user_id" UUID,
    "activated_at" TIMESTAMPTZ(6),
    "activated_by" UUID,
    "closed_reason" TEXT,
    "request_key" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),
    CONSTRAINT "hr_employees_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "hr_employees_contract_type_check" CHECK ("contract_type" IN ('indefinite', 'fixed', 'work', 'apprenticeship')),
    CONSTRAINT "hr_employees_work_mode_check" CHECK ("work_mode" IN ('on_site', 'telework', 'home', 'remote')),
    CONSTRAINT "hr_employees_status_check" CHECK ("status" IN ('pending', 'active', 'cancelled', 'terminated')),
    CONSTRAINT "hr_employees_activation_check" CHECK (
        "status" NOT IN ('active', 'terminated')
        OR ("user_id" IS NOT NULL AND "activated_at" IS NOT NULL AND "activated_by" IS NOT NULL)
    ),
    CONSTRAINT "hr_employees_cancellation_check" CHECK ("status" <> 'cancelled' OR "closed_reason" IS NOT NULL),
    CONSTRAINT "hr_employees_termination_check" CHECK (
        ("status" = 'terminated') = ("termination_date" IS NOT NULL)
        AND ("termination_date" IS NULL OR "termination_date" >= "hire_date")
    )
);

CREATE TABLE "hr_contracts" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "starts_on" DATE NOT NULL,
    "ends_on" DATE,
    "salary_band" TEXT NOT NULL,
    "salary" DECIMAL(18,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'preparing',
    "sign_by" DATE NOT NULL,
    "company_signer_id" UUID NOT NULL,
    "message" TEXT,
    "form_record_id" UUID,
    "record_code" TEXT,
    "envelope_id" UUID,
    "envelope_code" TEXT,
    "document_id" UUID,
    "signed_on" DATE,
    "closed_reason" TEXT,
    "sent_by" UUID NOT NULL,
    "request_key" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),
    CONSTRAINT "hr_contracts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "hr_contracts_type_check" CHECK ("type" IN ('indefinite', 'fixed', 'work', 'apprenticeship')),
    CONSTRAINT "hr_contracts_status_check" CHECK ("status" IN ('preparing', 'in_signature', 'signed', 'cancelled')),
    CONSTRAINT "hr_contracts_values_check" CHECK (
        "salary" > 0
        AND ("type" = 'indefinite') = ("ends_on" IS NULL)
        AND ("ends_on" IS NULL OR "ends_on" > "starts_on")
    ),
    CONSTRAINT "hr_contracts_signature_check" CHECK ("status" <> 'in_signature' OR "envelope_id" IS NOT NULL),
    -- Ficha 17.13: la vinculación exige el contrato firmado electrónicamente.
    CONSTRAINT "hr_contracts_signed_check" CHECK (
        "status" <> 'signed'
        OR ("envelope_id" IS NOT NULL AND "document_id" IS NOT NULL AND "signed_on" IS NOT NULL)
    ),
    CONSTRAINT "hr_contracts_cancellation_check" CHECK ("status" <> 'cancelled' OR "closed_reason" IS NOT NULL)
);

CREATE TABLE "hr_onboarding_tasks" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "task" TEXT NOT NULL,
    "responsible_id" UUID,
    "due_on" DATE NOT NULL,
    "done_on" DATE,
    "done_by" UUID,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),
    CONSTRAINT "hr_onboarding_tasks_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "hr_onboarding_tasks_kind_check" CHECK ("kind" IN ('medical_exam', 'equipment', 'social_security', 'induction', 'sst_induction', 'job_training')),
    CONSTRAINT "hr_onboarding_tasks_done_check" CHECK (("done_on" IS NULL) = ("done_by" IS NULL))
);

CREATE TABLE "hr_file_checklist" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "item" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "document_id" UUID,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),
    CONSTRAINT "hr_file_checklist_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "hr_file_checklist_item_check" CHECK ("item" IN ('id_document', 'resume', 'education', 'work_certificates', 'background_checks', 'medical_concept', 'health_affiliation', 'pension_affiliation', 'risk_affiliation', 'compensation_fund', 'bank_certificate', 'signed_contract', 'data_authorization')),
    CONSTRAINT "hr_file_checklist_status_check" CHECK ("status" IN ('pending', 'received', 'not_applicable')),
    CONSTRAINT "hr_file_checklist_document_check" CHECK ("status" = 'received' OR "document_id" IS NULL)
);

CREATE UNIQUE INDEX "hr_vacancies_tenant_id_id_key" ON "hr_vacancies"("tenant_id", "id");
CREATE UNIQUE INDEX "hr_candidates_tenant_id_id_key" ON "hr_candidates"("tenant_id", "id");
CREATE UNIQUE INDEX "hr_evaluations_selection_tenant_id_id_key" ON "hr_evaluations_selection"("tenant_id", "id");
CREATE UNIQUE INDEX "hr_employees_tenant_id_id_key" ON "hr_employees"("tenant_id", "id");
CREATE UNIQUE INDEX "hr_contracts_tenant_id_id_key" ON "hr_contracts"("tenant_id", "id");
CREATE UNIQUE INDEX "hr_onboarding_tasks_tenant_id_id_key" ON "hr_onboarding_tasks"("tenant_id", "id");
CREATE UNIQUE INDEX "hr_file_checklist_tenant_id_id_key" ON "hr_file_checklist"("tenant_id", "id");
CREATE UNIQUE INDEX "hr_vacancies_tenant_id_code_key" ON "hr_vacancies"("tenant_id", "code");
CREATE UNIQUE INDEX "hr_vacancies_tenant_id_request_key_key" ON "hr_vacancies"("tenant_id", "request_key");
CREATE UNIQUE INDEX "hr_candidates_tenant_id_request_key_key" ON "hr_candidates"("tenant_id", "request_key");
CREATE UNIQUE INDEX "hr_evaluations_selection_tenant_id_request_key_key" ON "hr_evaluations_selection"("tenant_id", "request_key");
CREATE UNIQUE INDEX "hr_employees_tenant_id_request_key_key" ON "hr_employees"("tenant_id", "request_key");
CREATE UNIQUE INDEX "hr_contracts_tenant_id_request_key_key" ON "hr_contracts"("tenant_id", "request_key");
CREATE UNIQUE INDEX "hr_onboarding_tasks_tenant_id_employee_id_kind_key" ON "hr_onboarding_tasks"("tenant_id", "employee_id", "kind");
CREATE UNIQUE INDEX "hr_file_checklist_tenant_id_employee_id_item_key" ON "hr_file_checklist"("tenant_id", "employee_id", "item");
CREATE INDEX "hr_vacancies_tenant_id_status_idx" ON "hr_vacancies"("tenant_id", "status");
CREATE INDEX "hr_candidates_tenant_id_vacancy_id_idx" ON "hr_candidates"("tenant_id", "vacancy_id");
CREATE INDEX "hr_candidates_tenant_id_stage_idx" ON "hr_candidates"("tenant_id", "stage");
CREATE INDEX "hr_evaluations_selection_tenant_id_candidate_id_idx" ON "hr_evaluations_selection"("tenant_id", "candidate_id");
CREATE INDEX "hr_employees_tenant_id_status_idx" ON "hr_employees"("tenant_id", "status");
CREATE INDEX "hr_employees_tenant_id_user_id_idx" ON "hr_employees"("tenant_id", "user_id");
CREATE INDEX "hr_contracts_tenant_id_employee_id_idx" ON "hr_contracts"("tenant_id", "employee_id");
CREATE INDEX "hr_contracts_tenant_id_status_idx" ON "hr_contracts"("tenant_id", "status");
CREATE INDEX "hr_onboarding_tasks_tenant_id_responsible_id_idx" ON "hr_onboarding_tasks"("tenant_id", "responsible_id");
-- Una sola vinculación abierta (por vincular o activa) por persona.
CREATE UNIQUE INDEX "hr_employees_one_open" ON "hr_employees"("tenant_id", "party_id")
    WHERE "status" IN ('pending', 'active') AND "deleted_at" IS NULL;
-- Un solo contrato abierto (en preparación o en firma) por colaborador.
CREATE UNIQUE INDEX "hr_contracts_one_open" ON "hr_contracts"("tenant_id", "employee_id")
    WHERE "status" IN ('preparing', 'in_signature') AND "deleted_at" IS NULL;

ALTER TABLE "hr_vacancies" ADD CONSTRAINT "hr_vacancies_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "hr_candidates" ADD CONSTRAINT "hr_candidates_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "hr_evaluations_selection" ADD CONSTRAINT "hr_evaluations_selection_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "hr_employees" ADD CONSTRAINT "hr_employees_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "hr_contracts" ADD CONSTRAINT "hr_contracts_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "hr_onboarding_tasks" ADD CONSTRAINT "hr_onboarding_tasks_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "hr_file_checklist" ADD CONSTRAINT "hr_file_checklist_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "hr_candidates" ADD CONSTRAINT "hr_candidates_tenant_id_vacancy_id_fkey"
    FOREIGN KEY ("tenant_id", "vacancy_id") REFERENCES "hr_vacancies"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "hr_evaluations_selection" ADD CONSTRAINT "hr_evaluations_selection_tenant_id_candidate_id_fkey"
    FOREIGN KEY ("tenant_id", "candidate_id") REFERENCES "hr_candidates"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "hr_employees" ADD CONSTRAINT "hr_employees_tenant_id_candidate_id_fkey"
    FOREIGN KEY ("tenant_id", "candidate_id") REFERENCES "hr_candidates"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "hr_contracts" ADD CONSTRAINT "hr_contracts_tenant_id_employee_id_fkey"
    FOREIGN KEY ("tenant_id", "employee_id") REFERENCES "hr_employees"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "hr_onboarding_tasks" ADD CONSTRAINT "hr_onboarding_tasks_tenant_id_employee_id_fkey"
    FOREIGN KEY ("tenant_id", "employee_id") REFERENCES "hr_employees"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "hr_file_checklist" ADD CONSTRAINT "hr_file_checklist_tenant_id_employee_id_fkey"
    FOREIGN KEY ("tenant_id", "employee_id") REFERENCES "hr_employees"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TRIGGER "hr_vacancies_control_columns" BEFORE INSERT OR UPDATE ON "hr_vacancies"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();
CREATE TRIGGER "hr_candidates_control_columns" BEFORE INSERT OR UPDATE ON "hr_candidates"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();
CREATE TRIGGER "hr_evaluations_selection_control_columns" BEFORE INSERT OR UPDATE ON "hr_evaluations_selection"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();
CREATE TRIGGER "hr_employees_control_columns" BEFORE INSERT OR UPDATE ON "hr_employees"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();
CREATE TRIGGER "hr_contracts_control_columns" BEFORE INSERT OR UPDATE ON "hr_contracts"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();
CREATE TRIGGER "hr_onboarding_tasks_control_columns" BEFORE INSERT OR UPDATE ON "hr_onboarding_tasks"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();
CREATE TRIGGER "hr_file_checklist_control_columns" BEFORE INSERT OR UPDATE ON "hr_file_checklist"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();

-- Vincular exige el contrato laboral firmado (ficha 17.13): el colaborador no pasa a «activo» sin
-- un contrato firmado.
CREATE FUNCTION "hr_require_signed_contract"() RETURNS TRIGGER
    LANGUAGE plpgsql SET search_path = public
    AS $$
BEGIN
    IF NEW."status" = 'active' AND NOT EXISTS (
        SELECT 1 FROM "hr_contracts" c
        WHERE c."tenant_id" = NEW."tenant_id" AND c."employee_id" = NEW."id"
          AND c."status" = 'signed' AND c."document_id" IS NOT NULL
          AND c."deleted_at" IS NULL
    ) THEN
        RAISE EXCEPTION 'hr_employees: vincular exige el contrato laboral firmado'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "hr_employees_require_signed_contract" BEFORE INSERT OR UPDATE ON "hr_employees"
    FOR EACH ROW EXECUTE FUNCTION "hr_require_signed_contract"();

ALTER TABLE "hr_vacancies" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "hr_vacancies" FORCE ROW LEVEL SECURITY;
CREATE POLICY "hr_vacancies_tenant_isolation" ON "hr_vacancies"
    USING ("tenant_id" = core_current_tenant_id()) WITH CHECK ("tenant_id" = core_current_tenant_id());
ALTER TABLE "hr_candidates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "hr_candidates" FORCE ROW LEVEL SECURITY;
CREATE POLICY "hr_candidates_tenant_isolation" ON "hr_candidates"
    USING ("tenant_id" = core_current_tenant_id()) WITH CHECK ("tenant_id" = core_current_tenant_id());
ALTER TABLE "hr_evaluations_selection" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "hr_evaluations_selection" FORCE ROW LEVEL SECURITY;
CREATE POLICY "hr_evaluations_selection_tenant_isolation" ON "hr_evaluations_selection"
    USING ("tenant_id" = core_current_tenant_id()) WITH CHECK ("tenant_id" = core_current_tenant_id());
ALTER TABLE "hr_employees" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "hr_employees" FORCE ROW LEVEL SECURITY;
CREATE POLICY "hr_employees_tenant_isolation" ON "hr_employees"
    USING ("tenant_id" = core_current_tenant_id()) WITH CHECK ("tenant_id" = core_current_tenant_id());
ALTER TABLE "hr_contracts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "hr_contracts" FORCE ROW LEVEL SECURITY;
CREATE POLICY "hr_contracts_tenant_isolation" ON "hr_contracts"
    USING ("tenant_id" = core_current_tenant_id()) WITH CHECK ("tenant_id" = core_current_tenant_id());
ALTER TABLE "hr_onboarding_tasks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "hr_onboarding_tasks" FORCE ROW LEVEL SECURITY;
CREATE POLICY "hr_onboarding_tasks_tenant_isolation" ON "hr_onboarding_tasks"
    USING ("tenant_id" = core_current_tenant_id()) WITH CHECK ("tenant_id" = core_current_tenant_id());
ALTER TABLE "hr_file_checklist" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "hr_file_checklist" FORCE ROW LEVEL SECURITY;
CREATE POLICY "hr_file_checklist_tenant_isolation" ON "hr_file_checklist"
    USING ("tenant_id" = core_current_tenant_id()) WITH CHECK ("tenant_id" = core_current_tenant_id());

GRANT SELECT, INSERT, UPDATE ON "hr_vacancies" TO app_user;
GRANT SELECT, INSERT, UPDATE ON "hr_candidates" TO app_user;
GRANT SELECT, INSERT, UPDATE ON "hr_evaluations_selection" TO app_user;
GRANT SELECT, INSERT, UPDATE ON "hr_employees" TO app_user;
GRANT SELECT, INSERT, UPDATE ON "hr_contracts" TO app_user;
GRANT SELECT, INSERT, UPDATE ON "hr_onboarding_tasks" TO app_user;
GRANT SELECT, INSERT, UPDATE ON "hr_file_checklist" TO app_user;

-- El worker recorre las empresas con contratos laborales por enviar a firma o por cerrar, y con
-- candidatos cuyos datos ya deben eliminarse. Las funciones corren como dueñas del esquema: leen
-- todas las empresas solo para saber cuáles tienen trabajo (como ast_tenants_with_assignments).
CREATE POLICY "hr_contracts_worker_lookup" ON "hr_contracts"
    FOR SELECT TO migration_user USING (true);
CREATE POLICY "hr_candidates_worker_lookup" ON "hr_candidates"
    FOR SELECT TO migration_user USING (true);

CREATE FUNCTION "hr_tenants_with_hiring"() RETURNS SETOF UUID
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
    AS $$ SELECT DISTINCT tenant_id FROM hr_contracts
          WHERE status IN ('preparing', 'in_signature') AND deleted_at IS NULL ORDER BY 1 $$;

CREATE FUNCTION "hr_tenants_with_expired_candidates"(today DATE) RETURNS SETOF UUID
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
    AS $$ SELECT DISTINCT tenant_id FROM hr_candidates
          WHERE stage = 'discarded' AND erased_at IS NULL AND retention_until <= today
            AND deleted_at IS NULL ORDER BY 1 $$;

REVOKE EXECUTE ON FUNCTION "hr_tenants_with_hiring"() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "hr_tenants_with_hiring"() TO app_user;
REVOKE EXECUTE ON FUNCTION "hr_tenants_with_expired_candidates"(DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "hr_tenants_with_expired_candidates"(DATE) TO app_user;

-- Firma electrónica: también el contrato laboral de un colaborador. El módulo de Contratos guarda
-- su identificador y la persona que firma; no lee las tablas hr_.
ALTER TABLE "sig_envelopes" DROP CONSTRAINT "sig_envelopes_source_check";
ALTER TABLE "sig_envelopes"
    ADD CONSTRAINT "sig_envelopes_source_check" CHECK (
        ("source" = 'contract' AND "contract_id" IS NOT NULL AND "amendment_id" IS NULL
            AND "source_id" IS NULL)
        OR ("source" = 'amendment' AND "contract_id" IS NOT NULL AND "amendment_id" IS NOT NULL
            AND "source_id" IS NULL)
        OR ("source" IN ('acceptance', 'asset_loan', 'hr_contract') AND "contract_id" IS NULL
            AND "amendment_id" IS NULL AND "source_id" IS NOT NULL AND "party_id" IS NOT NULL));

CREATE UNIQUE INDEX "sig_envelopes_open_hr_contract_key" ON "sig_envelopes"("tenant_id", "source_id")
    WHERE "status" IN ('draft', 'sent') AND "source" = 'hr_contract' AND "deleted_at" IS NULL;

-- Formatos digitales: el contrato laboral CT-GTH-001 que la plataforma llena se une a su contrato.
ALTER TABLE "doc_form_templates" DROP CONSTRAINT "doc_form_templates_entity_type_check";
ALTER TABLE "doc_form_templates"
    ADD CONSTRAINT "doc_form_templates_entity_type_check" CHECK (
        "entity_type" IS NULL OR "entity_type" IN ('doc_version', 'party', 'doc_change_request',
            'prj_acceptance', 'prj_code_review', 'ast_assignment', 'hr_contract'));
ALTER TABLE "doc_form_records" DROP CONSTRAINT "doc_form_records_entity_check";
ALTER TABLE "doc_form_records"
    ADD CONSTRAINT "doc_form_records_entity_check" CHECK (
        ("entity_type" IS NULL) = ("entity_id" IS NULL)
        AND ("entity_type" IS NULL OR "entity_type" IN ('doc_version', 'party', 'doc_change_request',
            'prj_acceptance', 'prj_code_review', 'ast_assignment', 'hr_contract')));

-- Privacidad: las autorizaciones también llegan del registro de candidatos.
ALTER TABLE "prv_consents" DROP CONSTRAINT "prv_consents_source_check";
ALTER TABLE "prv_consents" ADD CONSTRAINT "prv_consents_source_check"
    CHECK ("source" IN ('party_create', 'party_consent', 'prior_record', 'crm_lead', 'hr_candidate'));

-- Aviso nuevo: la tarea de inducción que le corresponde a una persona.
ALTER TABLE "ntf_templates" DROP CONSTRAINT "ntf_templates_key_check";
ALTER TABLE "ntf_notifications" DROP CONSTRAINT "ntf_notifications_kind_check";
ALTER TABLE "ntf_preferences" DROP CONSTRAINT "ntf_preferences_event_key_check";

ALTER TABLE "ntf_templates"
    ADD CONSTRAINT "ntf_templates_key_check" CHECK ("key" IN ('task_assigned', 'task_escalated',
        'comment_mention', 'security_alert', 'doc_read_requested', 'doc_request_decided',
        'crm_activity_due', 'crm_quote_update', 'ctr_contract_update', 'prj_project_update',
        'svc_ticket_update', 'svc_ticket_alert', 'svc_pqrsf_update', 'hr_onboarding_task'));
ALTER TABLE "ntf_notifications"
    ADD CONSTRAINT "ntf_notifications_kind_check" CHECK ("kind" IN ('task_assigned', 'task_escalated',
        'comment_mention', 'security_alert', 'doc_read_requested', 'doc_request_decided',
        'crm_activity_due', 'crm_quote_update', 'ctr_contract_update', 'prj_project_update',
        'svc_ticket_update', 'svc_ticket_alert', 'svc_pqrsf_update', 'hr_onboarding_task'));
ALTER TABLE "ntf_preferences"
    ADD CONSTRAINT "ntf_preferences_event_key_check" CHECK ("event_key" IN ('task_assigned',
        'task_escalated', 'comment_mention', 'security_alert', 'doc_read_requested',
        'doc_request_decided', 'crm_activity_due', 'crm_quote_update', 'ctr_contract_update',
        'prj_project_update', 'svc_ticket_update', 'svc_ticket_alert', 'svc_pqrsf_update',
        'hr_onboarding_task'));
