-- B37 — Seguridad y salud en el trabajo (M13, ficha 17.14). Matriz de peligros con GTC 45
-- (sst_hazards), plan anual con evidencias (sst_work_plan_items), incidentes y accidentes con su
-- investigación y acciones (sst_incidents, sst_investigations, sst_investigation_actions), actos y
-- condiciones inseguras (sst_unsafe_reports), inspecciones (sst_inspections), evaluaciones médicas
-- con las restricciones cifradas (sst_medical_exams), elementos de protección (sst_ppe_deliveries),
-- comités, actas y quejas de convivencia cifradas (sst_committee_members, sst_committee_minutes,
-- sst_coexistence_complaints) y la autoevaluación de estándares mínimos (sst_standards_assessments).
-- Nunca se guardan diagnósticos. Solo expande: la versión anterior sigue funcionando.

CREATE TABLE "sst_hazards" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "process_id" UUID NOT NULL,
    "activity" TEXT NOT NULL,
    "routine" BOOLEAN NOT NULL DEFAULT true,
    "hazard_class" TEXT NOT NULL,
    "hazard" TEXT NOT NULL,
    "effects" TEXT NOT NULL,
    "existing_controls" TEXT,
    "deficiency" INTEGER NOT NULL,
    "exposure" INTEGER NOT NULL,
    "consequence" INTEGER NOT NULL,
    "probability" INTEGER NOT NULL,
    "risk" INTEGER NOT NULL,
    "risk_level" TEXT NOT NULL,
    "proposed_controls" TEXT,
    "review_on" DATE NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),
    CONSTRAINT "sst_hazards_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sst_hazards_class_check" CHECK ("hazard_class" IN ('biological', 'physical',
        'chemical', 'psychosocial', 'biomechanical', 'safety', 'natural')),
    -- GTC 45: ND, NE y NC con los valores de la guía; NP = ND × NE y NR = NP × NC.
    CONSTRAINT "sst_hazards_levels_check" CHECK (
        "deficiency" IN (0, 2, 6, 10) AND "exposure" BETWEEN 1 AND 4
        AND "consequence" IN (10, 25, 60, 100)
        AND "probability" = "deficiency" * "exposure"
        AND "risk" = "probability" * "consequence"
    ),
    CONSTRAINT "sst_hazards_risk_level_check" CHECK ("risk_level" = CASE
        WHEN "risk" >= 600 THEN 'I' WHEN "risk" >= 150 THEN 'II'
        WHEN "risk" >= 40 THEN 'III' ELSE 'IV' END)
);

CREATE TABLE "sst_work_plan_items" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "year" INTEGER NOT NULL,
    "activity" TEXT NOT NULL,
    "responsible_id" UUID NOT NULL,
    "due_on" DATE NOT NULL,
    "done_on" DATE,
    "done_by" UUID,
    "evidence_file_id" UUID,
    "overdue_notice_on" DATE,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),
    CONSTRAINT "sst_work_plan_items_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sst_work_plan_items_year_check" CHECK (
        "year" BETWEEN 2020 AND 2100 AND EXTRACT(YEAR FROM "due_on") = "year"
    ),
    -- Decisión 14: una actividad se da por hecha solo con su evidencia.
    CONSTRAINT "sst_work_plan_items_done_check" CHECK (
        ("done_on" IS NULL) = ("evidence_file_id" IS NULL)
        AND ("done_on" IS NULL) = ("done_by" IS NULL)
    )
);

CREATE TABLE "sst_incidents" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'reported',
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,
    "location" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "photo_file_id" UUID,
    "affected" TEXT NOT NULL,
    "affected_employee_id" UUID,
    "reported_by" UUID NOT NULL,
    "arl_due_on" DATE,
    "arl_reported_on" DATE,
    "arl_filing_number" TEXT,
    "arl_reported_by" UUID,
    "closed_at" TIMESTAMPTZ(6),
    "closed_by" UUID,
    "request_key" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),
    CONSTRAINT "sst_incidents_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sst_incidents_code_check" CHECK ("code" ~ '^SST-[0-9]{4}-[0-9]{4,8}$'),
    CONSTRAINT "sst_incidents_kind_check" CHECK ("kind" IN ('incident', 'accident')),
    CONSTRAINT "sst_incidents_status_check" CHECK (
        "status" IN ('reported', 'investigating', 'action_plan', 'closed')
    ),
    CONSTRAINT "sst_incidents_affected_check" CHECK ("affected" IN ('self', 'other', 'none')),
    -- Ficha 17.14: solo el accidente se reporta a la ARL, dentro de los dos días hábiles siguientes.
    CONSTRAINT "sst_incidents_arl_check" CHECK (
        ("kind" = 'accident') = ("arl_due_on" IS NOT NULL)
        AND ("arl_reported_on" IS NULL) = ("arl_filing_number" IS NULL)
        AND ("arl_reported_on" IS NULL) = ("arl_reported_by" IS NULL)
        AND ("kind" = 'accident' OR "arl_reported_on" IS NULL)
    ),
    CONSTRAINT "sst_incidents_closed_check" CHECK (
        ("status" = 'closed') = ("closed_at" IS NOT NULL)
        AND ("closed_at" IS NULL) = ("closed_by" IS NULL)
        AND ("status" <> 'closed' OR "kind" = 'incident' OR "arl_reported_on" IS NOT NULL)
    )
);

CREATE TABLE "sst_investigations" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "incident_id" UUID NOT NULL,
    "team" TEXT NOT NULL,
    "started_on" DATE NOT NULL,
    "immediate_causes" TEXT,
    "root_causes" TEXT,
    "planned_on" DATE,
    "conclusion" TEXT,
    "closed_on" DATE,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),
    CONSTRAINT "sst_investigations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sst_investigations_plan_check" CHECK (
        ("planned_on" IS NULL) = ("root_causes" IS NULL)
        AND ("root_causes" IS NULL) = ("immediate_causes" IS NULL)
        AND ("closed_on" IS NULL) = ("conclusion" IS NULL)
        AND ("closed_on" IS NULL OR "planned_on" IS NOT NULL)
    )
);

-- Decisión 6: las acciones viven aquí hasta que exista el módulo de Calidad (B38).
CREATE TABLE "sst_investigation_actions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "investigation_id" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "responsible_id" UUID NOT NULL,
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
    CONSTRAINT "sst_investigation_actions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sst_investigation_actions_done_check" CHECK (("done_on" IS NULL) = ("done_by" IS NULL))
);

CREATE TABLE "sst_unsafe_reports" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "photo_file_id" UUID,
    "reported_by" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'reported',
    "response" TEXT,
    "handled_by" UUID,
    "request_key" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),
    CONSTRAINT "sst_unsafe_reports_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sst_unsafe_reports_code_check" CHECK ("code" ~ '^RPT-[0-9]{4}-[0-9]{4,8}$'),
    CONSTRAINT "sst_unsafe_reports_kind_check" CHECK ("kind" IN ('unsafe_condition', 'unsafe_act')),
    CONSTRAINT "sst_unsafe_reports_status_check" CHECK (
        "status" IN ('reported', 'in_progress', 'closed')
        AND ("status" = 'reported') = ("response" IS NULL)
        AND ("response" IS NULL) = ("handled_by" IS NULL)
    )
);

CREATE TABLE "sst_inspections" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "place" TEXT,
    "employee_id" UUID,
    "inspector_id" UUID,
    "requested_by" UUID,
    "due_on" DATE,
    "inspected_on" DATE,
    "answers" JSONB NOT NULL DEFAULT '[]',
    "failed" INTEGER NOT NULL DEFAULT 0,
    "findings" TEXT,
    "reviewed_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),
    CONSTRAINT "sst_inspections_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sst_inspections_kind_check" CHECK ("kind" IN ('facility', 'home', 'emergency')),
    CONSTRAINT "sst_inspections_status_check" CHECK ("status" IN ('requested', 'submitted', 'reviewed')),
    -- Decisión 11: la del puesto en casa la pide SST a un colaborador y él la responde.
    CONSTRAINT "sst_inspections_home_check" CHECK (
        ("kind" = 'home') = ("employee_id" IS NOT NULL)
        AND ("kind" = 'home') = ("due_on" IS NOT NULL)
        AND ("kind" = 'home' OR "status" = 'reviewed')
    ),
    CONSTRAINT "sst_inspections_answers_check" CHECK (
        jsonb_typeof("answers") = 'array' AND "failed" >= 0
        AND ("status" = 'requested') = ("inspected_on" IS NULL)
        AND ("status" = 'reviewed') = ("reviewed_by" IS NOT NULL)
    )
);

CREATE TABLE "sst_medical_exams" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "exam_date" DATE NOT NULL,
    "provider" TEXT NOT NULL,
    "concept" TEXT NOT NULL,
    "restrictions_encrypted" TEXT,
    "next_due_on" DATE,
    "due_notice_on" DATE,
    "request_key" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),
    CONSTRAINT "sst_medical_exams_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sst_medical_exams_kind_check" CHECK (
        "kind" IN ('entry', 'periodic', 'exit', 'post_leave', 'return')
    ),
    -- Resolución 2346 de 2007: concepto de aptitud y restricciones, nunca diagnósticos.
    CONSTRAINT "sst_medical_exams_concept_check" CHECK (
        "concept" IN ('fit', 'fit_with_restrictions', 'deferred', 'unfit')
        AND ("concept" <> 'fit_with_restrictions' OR "restrictions_encrypted" IS NOT NULL)
        AND ("next_due_on" IS NULL OR "next_due_on" > "exam_date")
    )
);

CREATE TABLE "sst_ppe_deliveries" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "item" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "delivered_on" DATE NOT NULL,
    "delivered_by" UUID NOT NULL,
    "note" TEXT,
    "acknowledged_at" TIMESTAMPTZ(6),
    "request_key" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),
    CONSTRAINT "sst_ppe_deliveries_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sst_ppe_deliveries_item_check" CHECK ("item" ~ '^[A-Z0-9][A-Z0-9_-]{0,19}$'),
    CONSTRAINT "sst_ppe_deliveries_quantity_check" CHECK ("quantity" BETWEEN 1 AND 100)
);

CREATE TABLE "sst_committee_members" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "committee" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "role" TEXT NOT NULL,
    "represents" TEXT NOT NULL,
    "from_on" DATE NOT NULL,
    "until_on" DATE,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),
    CONSTRAINT "sst_committee_members_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sst_committee_members_committee_check" CHECK ("committee" IN ('copasst', 'coexistence')),
    CONSTRAINT "sst_committee_members_role_check" CHECK ("role" IN ('president', 'secretary', 'member')),
    CONSTRAINT "sst_committee_members_represents_check" CHECK ("represents" IN ('employer', 'workers')),
    CONSTRAINT "sst_committee_members_period_check" CHECK ("until_on" IS NULL OR "until_on" > "from_on")
);

CREATE TABLE "sst_committee_minutes" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "committee" TEXT NOT NULL,
    "meeting_on" DATE NOT NULL,
    "summary_encrypted" TEXT NOT NULL,
    "file_id" UUID,
    "recorded_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),
    CONSTRAINT "sst_committee_minutes_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sst_committee_minutes_committee_check" CHECK ("committee" IN ('copasst', 'coexistence'))
);

-- Decisión 9 (Ley 1010 de 2006): canal confidencial; los hechos y la gestión van cifrados.
CREATE TABLE "sst_coexistence_complaints" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "complainant_id" UUID NOT NULL,
    "facts_encrypted" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'received',
    "outcome_encrypted" TEXT,
    "handled_by" UUID,
    "closed_at" TIMESTAMPTZ(6),
    "request_key" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),
    CONSTRAINT "sst_coexistence_complaints_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sst_coexistence_complaints_code_check" CHECK ("code" ~ '^CCL-[0-9]{4}-[0-9]{4,8}$'),
    CONSTRAINT "sst_coexistence_complaints_status_check" CHECK (
        "status" IN ('received', 'in_review', 'closed')
        AND ("status" = 'closed') = ("closed_at" IS NOT NULL)
        AND ("status" <> 'closed' OR "outcome_encrypted" IS NOT NULL)
        AND ("status" = 'received') = ("handled_by" IS NULL)
    )
);

CREATE TABLE "sst_standards_assessments" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "year" INTEGER NOT NULL,
    "standard" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "justification" TEXT,
    "evidence_file_id" UUID,
    "improvement" TEXT,
    "assessed_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),
    CONSTRAINT "sst_standards_assessments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sst_standards_assessments_standard_check" CHECK ("standard" ~ '^[1-7]\.[0-9]{1,2}\.[0-9]{1,2}$'),
    CONSTRAINT "sst_standards_assessments_year_check" CHECK ("year" BETWEEN 2020 AND 2100),
    -- Resolución 0312, artículo 27: «no aplica» exige justificación; el puntaje se calcula aparte.
    CONSTRAINT "sst_standards_assessments_result_check" CHECK (
        "result" IN ('meets', 'not_met', 'not_applicable')
        AND ("result" <> 'not_applicable' OR "justification" IS NOT NULL)
        AND ("result" <> 'not_met' OR "score" = 0) AND "score" BETWEEN 0 AND 500
    )
);

CREATE UNIQUE INDEX "sst_hazards_tenant_id_id_key" ON "sst_hazards"("tenant_id", "id");
CREATE INDEX "sst_hazards_tenant_id_risk_idx" ON "sst_hazards"("tenant_id", "risk" DESC);
CREATE UNIQUE INDEX "sst_work_plan_items_tenant_id_id_key" ON "sst_work_plan_items"("tenant_id", "id");
CREATE INDEX "sst_work_plan_items_tenant_id_year_due_on_idx" ON "sst_work_plan_items"("tenant_id", "year", "due_on");
CREATE UNIQUE INDEX "sst_incidents_tenant_id_id_key" ON "sst_incidents"("tenant_id", "id");
CREATE UNIQUE INDEX "sst_incidents_tenant_id_code_key" ON "sst_incidents"("tenant_id", "code");
CREATE UNIQUE INDEX "sst_incidents_tenant_id_request_key_key" ON "sst_incidents"("tenant_id", "request_key");
CREATE INDEX "sst_incidents_tenant_id_reported_by_idx" ON "sst_incidents"("tenant_id", "reported_by");
CREATE UNIQUE INDEX "sst_investigations_tenant_id_id_key" ON "sst_investigations"("tenant_id", "id");
CREATE UNIQUE INDEX "sst_investigations_tenant_id_incident_id_key" ON "sst_investigations"("tenant_id", "incident_id");
CREATE UNIQUE INDEX "sst_investigation_actions_tenant_id_id_key" ON "sst_investigation_actions"("tenant_id", "id");
CREATE INDEX "sst_investigation_actions_tenant_id_investigation_id_idx" ON "sst_investigation_actions"("tenant_id", "investigation_id");
CREATE INDEX "sst_investigation_actions_tenant_id_responsible_id_idx" ON "sst_investigation_actions"("tenant_id", "responsible_id");
CREATE UNIQUE INDEX "sst_unsafe_reports_tenant_id_id_key" ON "sst_unsafe_reports"("tenant_id", "id");
CREATE UNIQUE INDEX "sst_unsafe_reports_tenant_id_code_key" ON "sst_unsafe_reports"("tenant_id", "code");
CREATE UNIQUE INDEX "sst_unsafe_reports_tenant_id_request_key_key" ON "sst_unsafe_reports"("tenant_id", "request_key");
CREATE INDEX "sst_unsafe_reports_tenant_id_reported_by_idx" ON "sst_unsafe_reports"("tenant_id", "reported_by");
CREATE UNIQUE INDEX "sst_inspections_tenant_id_id_key" ON "sst_inspections"("tenant_id", "id");
CREATE INDEX "sst_inspections_tenant_id_employee_id_idx" ON "sst_inspections"("tenant_id", "employee_id");
CREATE UNIQUE INDEX "sst_medical_exams_tenant_id_id_key" ON "sst_medical_exams"("tenant_id", "id");
CREATE UNIQUE INDEX "sst_medical_exams_tenant_id_request_key_key" ON "sst_medical_exams"("tenant_id", "request_key");
CREATE INDEX "sst_medical_exams_tenant_id_employee_id_idx" ON "sst_medical_exams"("tenant_id", "employee_id");
CREATE UNIQUE INDEX "sst_ppe_deliveries_tenant_id_id_key" ON "sst_ppe_deliveries"("tenant_id", "id");
CREATE UNIQUE INDEX "sst_ppe_deliveries_tenant_id_request_key_key" ON "sst_ppe_deliveries"("tenant_id", "request_key");
CREATE INDEX "sst_ppe_deliveries_tenant_id_employee_id_idx" ON "sst_ppe_deliveries"("tenant_id", "employee_id");
CREATE UNIQUE INDEX "sst_committee_members_tenant_id_id_key" ON "sst_committee_members"("tenant_id", "id");
CREATE INDEX "sst_committee_members_tenant_id_user_id_idx" ON "sst_committee_members"("tenant_id", "user_id");
CREATE UNIQUE INDEX "sst_committee_minutes_tenant_id_id_key" ON "sst_committee_minutes"("tenant_id", "id");
CREATE INDEX "sst_committee_minutes_tenant_id_committee_meeting_on_idx" ON "sst_committee_minutes"("tenant_id", "committee", "meeting_on");
CREATE UNIQUE INDEX "sst_coexistence_complaints_tenant_id_id_key" ON "sst_coexistence_complaints"("tenant_id", "id");
CREATE UNIQUE INDEX "sst_coexistence_complaints_tenant_id_code_key" ON "sst_coexistence_complaints"("tenant_id", "code");
CREATE UNIQUE INDEX "sst_coexistence_complaints_tenant_id_request_key_key" ON "sst_coexistence_complaints"("tenant_id", "request_key");
CREATE UNIQUE INDEX "sst_standards_assessments_tenant_id_id_key" ON "sst_standards_assessments"("tenant_id", "id");
CREATE UNIQUE INDEX "sst_standards_assessments_tenant_id_year_standard_key" ON "sst_standards_assessments"("tenant_id", "year", "standard");

ALTER TABLE "sst_hazards" ADD CONSTRAINT "sst_hazards_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sst_work_plan_items" ADD CONSTRAINT "sst_work_plan_items_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sst_incidents" ADD CONSTRAINT "sst_incidents_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sst_investigations" ADD CONSTRAINT "sst_investigations_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sst_investigation_actions" ADD CONSTRAINT "sst_investigation_actions_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sst_unsafe_reports" ADD CONSTRAINT "sst_unsafe_reports_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sst_inspections" ADD CONSTRAINT "sst_inspections_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sst_medical_exams" ADD CONSTRAINT "sst_medical_exams_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sst_ppe_deliveries" ADD CONSTRAINT "sst_ppe_deliveries_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sst_committee_members" ADD CONSTRAINT "sst_committee_members_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sst_committee_minutes" ADD CONSTRAINT "sst_committee_minutes_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sst_coexistence_complaints" ADD CONSTRAINT "sst_coexistence_complaints_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sst_standards_assessments" ADD CONSTRAINT "sst_standards_assessments_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sst_incidents" ADD CONSTRAINT "sst_incidents_tenant_id_affected_employee_id_fkey"
    FOREIGN KEY ("tenant_id", "affected_employee_id") REFERENCES "hr_employees"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sst_investigations" ADD CONSTRAINT "sst_investigations_tenant_id_incident_id_fkey"
    FOREIGN KEY ("tenant_id", "incident_id") REFERENCES "sst_incidents"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sst_investigation_actions" ADD CONSTRAINT "sst_investigation_actions_tenant_id_investigation_id_fkey"
    FOREIGN KEY ("tenant_id", "investigation_id") REFERENCES "sst_investigations"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sst_inspections" ADD CONSTRAINT "sst_inspections_tenant_id_employee_id_fkey"
    FOREIGN KEY ("tenant_id", "employee_id") REFERENCES "hr_employees"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sst_medical_exams" ADD CONSTRAINT "sst_medical_exams_tenant_id_employee_id_fkey"
    FOREIGN KEY ("tenant_id", "employee_id") REFERENCES "hr_employees"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sst_ppe_deliveries" ADD CONSTRAINT "sst_ppe_deliveries_tenant_id_employee_id_fkey"
    FOREIGN KEY ("tenant_id", "employee_id") REFERENCES "hr_employees"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TRIGGER "sst_hazards_control_columns" BEFORE INSERT OR UPDATE ON "sst_hazards"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();
CREATE TRIGGER "sst_work_plan_items_control_columns" BEFORE INSERT OR UPDATE ON "sst_work_plan_items"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();
CREATE TRIGGER "sst_incidents_control_columns" BEFORE INSERT OR UPDATE ON "sst_incidents"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();
CREATE TRIGGER "sst_investigations_control_columns" BEFORE INSERT OR UPDATE ON "sst_investigations"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();
CREATE TRIGGER "sst_investigation_actions_control_columns" BEFORE INSERT OR UPDATE ON "sst_investigation_actions"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();
CREATE TRIGGER "sst_unsafe_reports_control_columns" BEFORE INSERT OR UPDATE ON "sst_unsafe_reports"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();
CREATE TRIGGER "sst_inspections_control_columns" BEFORE INSERT OR UPDATE ON "sst_inspections"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();
CREATE TRIGGER "sst_medical_exams_control_columns" BEFORE INSERT OR UPDATE ON "sst_medical_exams"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();
CREATE TRIGGER "sst_ppe_deliveries_control_columns" BEFORE INSERT OR UPDATE ON "sst_ppe_deliveries"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();
CREATE TRIGGER "sst_committee_members_control_columns" BEFORE INSERT OR UPDATE ON "sst_committee_members"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();
CREATE TRIGGER "sst_committee_minutes_control_columns" BEFORE INSERT OR UPDATE ON "sst_committee_minutes"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();
CREATE TRIGGER "sst_coexistence_complaints_control_columns" BEFORE INSERT OR UPDATE ON "sst_coexistence_complaints"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();
CREATE TRIGGER "sst_standards_assessments_control_columns" BEFORE INSERT OR UPDATE ON "sst_standards_assessments"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();

ALTER TABLE "sst_hazards" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sst_hazards" FORCE ROW LEVEL SECURITY;
CREATE POLICY "sst_hazards_tenant_isolation" ON "sst_hazards"
    USING ("tenant_id" = core_current_tenant_id()) WITH CHECK ("tenant_id" = core_current_tenant_id());
ALTER TABLE "sst_work_plan_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sst_work_plan_items" FORCE ROW LEVEL SECURITY;
CREATE POLICY "sst_work_plan_items_tenant_isolation" ON "sst_work_plan_items"
    USING ("tenant_id" = core_current_tenant_id()) WITH CHECK ("tenant_id" = core_current_tenant_id());
ALTER TABLE "sst_incidents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sst_incidents" FORCE ROW LEVEL SECURITY;
CREATE POLICY "sst_incidents_tenant_isolation" ON "sst_incidents"
    USING ("tenant_id" = core_current_tenant_id()) WITH CHECK ("tenant_id" = core_current_tenant_id());
ALTER TABLE "sst_investigations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sst_investigations" FORCE ROW LEVEL SECURITY;
CREATE POLICY "sst_investigations_tenant_isolation" ON "sst_investigations"
    USING ("tenant_id" = core_current_tenant_id()) WITH CHECK ("tenant_id" = core_current_tenant_id());
ALTER TABLE "sst_investigation_actions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sst_investigation_actions" FORCE ROW LEVEL SECURITY;
CREATE POLICY "sst_investigation_actions_tenant_isolation" ON "sst_investigation_actions"
    USING ("tenant_id" = core_current_tenant_id()) WITH CHECK ("tenant_id" = core_current_tenant_id());
ALTER TABLE "sst_unsafe_reports" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sst_unsafe_reports" FORCE ROW LEVEL SECURITY;
CREATE POLICY "sst_unsafe_reports_tenant_isolation" ON "sst_unsafe_reports"
    USING ("tenant_id" = core_current_tenant_id()) WITH CHECK ("tenant_id" = core_current_tenant_id());
ALTER TABLE "sst_inspections" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sst_inspections" FORCE ROW LEVEL SECURITY;
CREATE POLICY "sst_inspections_tenant_isolation" ON "sst_inspections"
    USING ("tenant_id" = core_current_tenant_id()) WITH CHECK ("tenant_id" = core_current_tenant_id());
ALTER TABLE "sst_medical_exams" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sst_medical_exams" FORCE ROW LEVEL SECURITY;
CREATE POLICY "sst_medical_exams_tenant_isolation" ON "sst_medical_exams"
    USING ("tenant_id" = core_current_tenant_id()) WITH CHECK ("tenant_id" = core_current_tenant_id());
ALTER TABLE "sst_ppe_deliveries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sst_ppe_deliveries" FORCE ROW LEVEL SECURITY;
CREATE POLICY "sst_ppe_deliveries_tenant_isolation" ON "sst_ppe_deliveries"
    USING ("tenant_id" = core_current_tenant_id()) WITH CHECK ("tenant_id" = core_current_tenant_id());
ALTER TABLE "sst_committee_members" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sst_committee_members" FORCE ROW LEVEL SECURITY;
CREATE POLICY "sst_committee_members_tenant_isolation" ON "sst_committee_members"
    USING ("tenant_id" = core_current_tenant_id()) WITH CHECK ("tenant_id" = core_current_tenant_id());
ALTER TABLE "sst_committee_minutes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sst_committee_minutes" FORCE ROW LEVEL SECURITY;
CREATE POLICY "sst_committee_minutes_tenant_isolation" ON "sst_committee_minutes"
    USING ("tenant_id" = core_current_tenant_id()) WITH CHECK ("tenant_id" = core_current_tenant_id());
ALTER TABLE "sst_coexistence_complaints" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sst_coexistence_complaints" FORCE ROW LEVEL SECURITY;
CREATE POLICY "sst_coexistence_complaints_tenant_isolation" ON "sst_coexistence_complaints"
    USING ("tenant_id" = core_current_tenant_id()) WITH CHECK ("tenant_id" = core_current_tenant_id());
ALTER TABLE "sst_standards_assessments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sst_standards_assessments" FORCE ROW LEVEL SECURITY;
CREATE POLICY "sst_standards_assessments_tenant_isolation" ON "sst_standards_assessments"
    USING ("tenant_id" = core_current_tenant_id()) WITH CHECK ("tenant_id" = core_current_tenant_id());

GRANT SELECT, INSERT, UPDATE ON "sst_hazards" TO app_user;
GRANT SELECT, INSERT, UPDATE ON "sst_work_plan_items" TO app_user;
GRANT SELECT, INSERT, UPDATE ON "sst_incidents" TO app_user;
GRANT SELECT, INSERT, UPDATE ON "sst_investigations" TO app_user;
GRANT SELECT, INSERT, UPDATE ON "sst_investigation_actions" TO app_user;
GRANT SELECT, INSERT, UPDATE ON "sst_unsafe_reports" TO app_user;
GRANT SELECT, INSERT, UPDATE ON "sst_inspections" TO app_user;
GRANT SELECT, INSERT, UPDATE ON "sst_medical_exams" TO app_user;
GRANT SELECT, INSERT, UPDATE ON "sst_ppe_deliveries" TO app_user;
GRANT SELECT, INSERT, UPDATE ON "sst_committee_members" TO app_user;
GRANT SELECT, INSERT, UPDATE ON "sst_committee_minutes" TO app_user;
GRANT SELECT, INSERT, UPDATE ON "sst_coexistence_complaints" TO app_user;
GRANT SELECT, INSERT, UPDATE ON "sst_standards_assessments" TO app_user;

-- El trabajo diario de SST recorre las empresas con alertas pendientes: accidentes sin reportar a
-- la ARL, evaluaciones médicas que vencen en 30 días o menos sin aviso y actividades del plan
-- vencidas. La función corre como dueña del esquema: lee todas las empresas solo para saber cuáles.
CREATE POLICY "sst_incidents_worker_lookup" ON "sst_incidents"
    FOR SELECT TO migration_user USING (true);
CREATE POLICY "sst_medical_exams_worker_lookup" ON "sst_medical_exams"
    FOR SELECT TO migration_user USING (true);
CREATE POLICY "sst_work_plan_items_worker_lookup" ON "sst_work_plan_items"
    FOR SELECT TO migration_user USING (true);
CREATE FUNCTION "sst_tenants_with_daily_work"(today DATE) RETURNS SETOF UUID
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
    AS $$ SELECT tenant_id FROM sst_incidents
          WHERE kind = 'accident' AND arl_reported_on IS NULL AND status <> 'closed'
            AND deleted_at IS NULL
          UNION
          SELECT tenant_id FROM sst_medical_exams
          WHERE next_due_on IS NOT NULL AND next_due_on <= today + 30
            AND (due_notice_on IS NULL OR due_notice_on < next_due_on - 30)
            AND deleted_at IS NULL
          UNION
          SELECT tenant_id FROM sst_work_plan_items
          WHERE done_on IS NULL AND due_on < today AND overdue_notice_on IS NULL
            AND deleted_at IS NULL
          ORDER BY 1 $$;
REVOKE EXECUTE ON FUNCTION "sst_tenants_with_daily_work"(DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "sst_tenants_with_daily_work"(DATE) TO app_user;

-- Avisos nuevos de SST: reporte recibido, accidente por reportar a la ARL, evaluación por vencer,
-- tarea asignada (acción, autoinspección o elemento por confirmar) y queja de convivencia.
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
        'sst_task_assigned', 'sst_complaint_received'));
ALTER TABLE "ntf_notifications"
    ADD CONSTRAINT "ntf_notifications_kind_check" CHECK ("kind" IN ('task_assigned', 'task_escalated',
        'comment_mention', 'security_alert', 'doc_read_requested', 'doc_request_decided',
        'crm_activity_due', 'crm_quote_update', 'ctr_contract_update', 'prj_project_update',
        'svc_ticket_update', 'svc_ticket_alert', 'svc_pqrsf_update', 'hr_onboarding_task',
        'hr_leave_update', 'hr_overtime_update', 'hr_review_update', 'hr_disciplinary_notice',
        'hr_offboarding_task', 'sst_report_received', 'sst_arl_due', 'sst_exam_due',
        'sst_task_assigned', 'sst_complaint_received'));
ALTER TABLE "ntf_preferences"
    ADD CONSTRAINT "ntf_preferences_event_key_check" CHECK ("event_key" IN ('task_assigned', 'task_escalated',
        'comment_mention', 'security_alert', 'doc_read_requested', 'doc_request_decided',
        'crm_activity_due', 'crm_quote_update', 'ctr_contract_update', 'prj_project_update',
        'svc_ticket_update', 'svc_ticket_alert', 'svc_pqrsf_update', 'hr_onboarding_task',
        'hr_leave_update', 'hr_overtime_update', 'hr_review_update', 'hr_disciplinary_notice',
        'hr_offboarding_task', 'sst_report_received', 'sst_arl_due', 'sst_exam_due',
        'sst_task_assigned', 'sst_complaint_received'));
