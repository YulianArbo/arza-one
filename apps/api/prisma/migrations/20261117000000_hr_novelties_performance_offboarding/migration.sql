-- B36: talento humano (M12, ficha 17.13), segunda parte. Permisos, licencias y vacaciones
-- (hr_leave_requests), horas extras (hr_overtime), novedades de nómina por mes (hr_payroll_periods,
-- hr_payroll_novelties), evaluación de desempeño (hr_performance_reviews), formación y bienestar
-- (hr_trainings, hr_training_attendance), proceso disciplinario (hr_disciplinary_cases, con los
-- textos cifrados) y retiro con paz y salvo (hr_offboardings). Un mes de nómina cerrado no admite
-- cambios. Solo expande: la versión anterior sigue funcionando con estas tablas y restricciones.

CREATE TABLE "hr_leave_requests" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "starts_on" DATE NOT NULL,
    "ends_on" DATE NOT NULL,
    "days" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'requested',
    "note" TEXT,
    "approver_id" UUID,
    "requested_by" UUID NOT NULL,
    "decided_by" UUID,
    "decided_at" TIMESTAMPTZ(6),
    "decision_note" TEXT,
    "support_file_id" UUID,
    "request_key" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),
    CONSTRAINT "hr_leave_requests_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "hr_leave_requests_type_check" CHECK ("type" ~ '^[A-Z][A-Z0-9_]{1,39}$'),
    CONSTRAINT "hr_leave_requests_status_check" CHECK ("status" IN ('requested', 'approved', 'rejected', 'cancelled', 'taken')),
    CONSTRAINT "hr_leave_requests_dates_check" CHECK ("ends_on" >= "starts_on" AND "days" > 0),
    -- Ficha 17.13: radicada → aprobada o rechazada → disfrutada. Lo decidido dice quién y cuándo;
    -- un rechazo siempre lleva su motivo.
    CONSTRAINT "hr_leave_requests_decision_check" CHECK (
        ("status" IN ('requested', 'cancelled')) = ("decided_by" IS NULL)
        AND ("decided_by" IS NULL) = ("decided_at" IS NULL)
        AND ("status" <> 'rejected' OR "decision_note" IS NOT NULL)
    )
);

CREATE TABLE "hr_overtime" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "work_date" DATE NOT NULL,
    "kind" TEXT NOT NULL,
    "hours" DECIMAL(4,2) NOT NULL,
    "reported_hours" DECIMAL(4,2),
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'requested',
    "approver_id" UUID,
    "requested_by" UUID NOT NULL,
    "decided_by" UUID,
    "decided_at" TIMESTAMPTZ(6),
    "decision_note" TEXT,
    "reported_at" TIMESTAMPTZ(6),
    "request_key" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),
    CONSTRAINT "hr_overtime_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "hr_overtime_kind_check" CHECK ("kind" IN ('day', 'night', 'holiday_day', 'holiday_night')),
    CONSTRAINT "hr_overtime_status_check" CHECK ("status" IN ('requested', 'authorized', 'rejected', 'reported', 'cancelled')),
    CONSTRAINT "hr_overtime_hours_check" CHECK ("hours" > 0 AND "hours" <= 12),
    -- Ficha 17.13: las horas extras exigen autorización previa; solo se reporta lo autorizado y
    -- nunca más horas de las autorizadas.
    CONSTRAINT "hr_overtime_decision_check" CHECK (
        ("status" IN ('requested', 'cancelled')) = ("decided_by" IS NULL)
        AND ("decided_by" IS NULL) = ("decided_at" IS NULL)
        AND ("status" <> 'rejected' OR "decision_note" IS NOT NULL)
    ),
    CONSTRAINT "hr_overtime_report_check" CHECK (
        ("status" = 'reported') = ("reported_hours" IS NOT NULL)
        AND ("reported_hours" IS NULL) = ("reported_at" IS NULL)
        AND ("reported_hours" IS NULL OR ("reported_hours" > 0 AND "reported_hours" <= "hours"))
    )
);

CREATE TABLE "hr_payroll_periods" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "period" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "closed_at" TIMESTAMPTZ(6),
    "closed_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),
    CONSTRAINT "hr_payroll_periods_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "hr_payroll_periods_period_check" CHECK ("period" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
    CONSTRAINT "hr_payroll_periods_status_check" CHECK ("status" IN ('open', 'closed')),
    CONSTRAINT "hr_payroll_periods_closing_check" CHECK (
        ("status" = 'closed') = ("closed_at" IS NOT NULL)
        AND ("closed_at" IS NULL) = ("closed_by" IS NULL)
    )
);

CREATE TABLE "hr_payroll_novelties" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "period" TEXT NOT NULL,
    "employee_id" UUID NOT NULL,
    "concept" TEXT NOT NULL,
    "quantity" DECIMAL(10,2) NOT NULL,
    "unit" TEXT NOT NULL,
    "amount" DECIMAL(18,2),
    "starts_on" DATE,
    "ends_on" DATE,
    "source_entity" TEXT NOT NULL,
    "source_id" UUID,
    "note" TEXT,
    "request_key" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),
    CONSTRAINT "hr_payroll_novelties_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "hr_payroll_novelties_period_check" CHECK ("period" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
    CONSTRAINT "hr_payroll_novelties_concept_check" CHECK ("concept" ~ '^[A-Z][A-Z0-9_]{1,39}$'),
    CONSTRAINT "hr_payroll_novelties_unit_check" CHECK ("unit" IN ('days', 'hours', 'units')),
    CONSTRAINT "hr_payroll_novelties_values_check" CHECK (
        "quantity" > 0
        AND ("amount" IS NULL OR "amount" >= 0)
        AND ("starts_on" IS NULL) = ("ends_on" IS NULL)
        AND ("ends_on" IS NULL OR "ends_on" >= "starts_on")
    ),
    CONSTRAINT "hr_payroll_novelties_source_check" CHECK (
        "source_entity" IN ('leave', 'overtime', 'offboarding', 'manual')
        AND ("source_entity" = 'manual') = ("source_id" IS NULL)
        AND ("source_entity" = 'manual') = ("request_key" IS NOT NULL)
    )
);

CREATE TABLE "hr_performance_reviews" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "period" TEXT NOT NULL,
    "objectives" JSONB NOT NULL,
    "score" DECIMAL(3,2),
    "status" TEXT NOT NULL DEFAULT 'draft',
    "reviewer_id" UUID,
    "reviewer_comment" TEXT,
    "scored_at" TIMESTAMPTZ(6),
    "employee_comment" TEXT,
    "agreed_on" DATE,
    "request_key" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),
    CONSTRAINT "hr_performance_reviews_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "hr_performance_reviews_status_check" CHECK ("status" IN ('draft', 'scored', 'agreed')),
    CONSTRAINT "hr_performance_reviews_objectives_check" CHECK (jsonb_typeof("objectives") = 'array'),
    CONSTRAINT "hr_performance_reviews_scoring_check" CHECK (
        ("status" = 'draft') = ("score" IS NULL)
        AND ("score" IS NULL OR ("score" >= 1 AND "score" <= 5))
        AND ("status" = 'draft' OR ("reviewer_id" IS NOT NULL AND "reviewer_comment" IS NOT NULL
            AND "scored_at" IS NOT NULL))
        AND ("status" = 'agreed') = ("agreed_on" IS NOT NULL)
    )
);

CREATE TABLE "hr_trainings" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "scheduled_on" DATE NOT NULL,
    "hours" DECIMAL(5,2) NOT NULL,
    "facilitator" TEXT,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "evidence_file_id" UUID,
    "cancel_reason" TEXT,
    "request_key" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),
    CONSTRAINT "hr_trainings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "hr_trainings_code_check" CHECK ("code" ~ '^FOR-[0-9]{4}-[0-9]{4,8}$'),
    CONSTRAINT "hr_trainings_kind_check" CHECK ("kind" IN ('induction', 'reinduction', 'training', 'wellbeing')),
    CONSTRAINT "hr_trainings_status_check" CHECK ("status" IN ('scheduled', 'held', 'cancelled')),
    CONSTRAINT "hr_trainings_hours_check" CHECK ("hours" > 0 AND "hours" <= 200),
    CONSTRAINT "hr_trainings_cancel_check" CHECK (("status" = 'cancelled') = ("cancel_reason" IS NOT NULL))
);

CREATE TABLE "hr_training_attendance" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "training_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "attended" BOOLEAN,
    "evaluation" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),
    CONSTRAINT "hr_training_attendance_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "hr_training_attendance_evaluation_check" CHECK (
        "evaluation" IS NULL OR ("attended" IS TRUE AND "evaluation" BETWEEN 1 AND 5)
    )
);

CREATE TABLE "hr_disciplinary_cases" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "employee_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'opened',
    "facts_encrypted" TEXT NOT NULL,
    "opened_on" DATE NOT NULL,
    "cited_on" DATE,
    "hearing_on" DATE,
    "citation_file_id" UUID,
    "statement_encrypted" TEXT,
    "hearing_record_file_id" UUID,
    "decision" TEXT,
    "suspension_days" INTEGER,
    "reasoning_encrypted" TEXT,
    "decision_file_id" UUID,
    "decided_on" DATE,
    "request_key" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),
    CONSTRAINT "hr_disciplinary_cases_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "hr_disciplinary_cases_code_check" CHECK ("code" ~ '^DIS-[0-9]{4}-[0-9]{4,8}$'),
    CONSTRAINT "hr_disciplinary_cases_status_check" CHECK ("status" IN ('opened', 'cited', 'heard', 'decided')),
    CONSTRAINT "hr_disciplinary_cases_decision_check" CHECK (
        "decision" IS NULL OR "decision" IN ('warning', 'suspension', 'dismissal', 'archive')
    ),
    -- Debido proceso (RIT-001): citación, descargos y decisión motivada, en ese orden y sin saltos.
    CONSTRAINT "hr_disciplinary_cases_citation_check" CHECK (
        ("status" = 'opened') = ("cited_on" IS NULL)
        AND ("cited_on" IS NULL) = ("hearing_on" IS NULL)
        AND ("hearing_on" IS NULL OR "hearing_on" > "cited_on")
        AND ("cited_on" IS NULL OR "cited_on" >= "opened_on")
    ),
    CONSTRAINT "hr_disciplinary_cases_hearing_check" CHECK (
        ("status" IN ('heard', 'decided')) = ("statement_encrypted" IS NOT NULL)
        AND ("statement_encrypted" IS NULL) = ("hearing_record_file_id" IS NULL)
    ),
    CONSTRAINT "hr_disciplinary_cases_decided_check" CHECK (
        ("status" = 'decided') = ("decision" IS NOT NULL)
        AND ("decision" IS NULL) = ("reasoning_encrypted" IS NULL)
        AND ("decision" IS NULL) = ("decided_on" IS NULL)
        AND ("decided_on" IS NULL OR "decided_on" >= "hearing_on")
        AND (("decision" = 'suspension') = ("suspension_days" IS NOT NULL))
        AND ("suspension_days" IS NULL OR "suspension_days" BETWEEN 1 AND 60)
    )
);

CREATE TABLE "hr_offboardings" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "last_day" DATE NOT NULL,
    "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'in_progress',
    "checklist" JSONB NOT NULL,
    "exit_interview_record_id" UUID,
    "account_deactivated_at" TIMESTAMPTZ(6),
    "cleared_on" DATE,
    "cleared_by" UUID,
    "cancel_reason" TEXT,
    "request_key" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),
    CONSTRAINT "hr_offboardings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "hr_offboardings_reason_check" CHECK ("reason" IN ('resignation', 'just_cause', 'without_cause', 'mutual_agreement', 'contract_end', 'other')),
    CONSTRAINT "hr_offboardings_status_check" CHECK ("status" IN ('in_progress', 'cleared', 'cancelled')),
    CONSTRAINT "hr_offboardings_checklist_check" CHECK (jsonb_typeof("checklist") = 'array'),
    -- El paz y salvo exige la cuenta ya desactivada (numeral 15.1); un retiro anulado no la tocó.
    CONSTRAINT "hr_offboardings_closing_check" CHECK (
        ("status" = 'cleared') = ("cleared_on" IS NOT NULL)
        AND ("cleared_on" IS NULL) = ("cleared_by" IS NULL)
        AND ("status" <> 'cleared' OR "account_deactivated_at" IS NOT NULL)
        AND ("status" = 'cancelled') = ("cancel_reason" IS NOT NULL)
        AND ("status" <> 'cancelled' OR "account_deactivated_at" IS NULL)
    )
);

CREATE UNIQUE INDEX "hr_leave_requests_tenant_id_id_key" ON "hr_leave_requests"("tenant_id", "id");
CREATE UNIQUE INDEX "hr_overtime_tenant_id_id_key" ON "hr_overtime"("tenant_id", "id");
CREATE UNIQUE INDEX "hr_payroll_periods_tenant_id_id_key" ON "hr_payroll_periods"("tenant_id", "id");
CREATE UNIQUE INDEX "hr_payroll_novelties_tenant_id_id_key" ON "hr_payroll_novelties"("tenant_id", "id");
CREATE UNIQUE INDEX "hr_performance_reviews_tenant_id_id_key" ON "hr_performance_reviews"("tenant_id", "id");
CREATE UNIQUE INDEX "hr_trainings_tenant_id_id_key" ON "hr_trainings"("tenant_id", "id");
CREATE UNIQUE INDEX "hr_training_attendance_tenant_id_id_key" ON "hr_training_attendance"("tenant_id", "id");
CREATE UNIQUE INDEX "hr_disciplinary_cases_tenant_id_id_key" ON "hr_disciplinary_cases"("tenant_id", "id");
CREATE UNIQUE INDEX "hr_offboardings_tenant_id_id_key" ON "hr_offboardings"("tenant_id", "id");

CREATE UNIQUE INDEX "hr_leave_requests_tenant_id_request_key_key" ON "hr_leave_requests"("tenant_id", "request_key");
CREATE UNIQUE INDEX "hr_overtime_tenant_id_request_key_key" ON "hr_overtime"("tenant_id", "request_key");
CREATE UNIQUE INDEX "hr_payroll_periods_tenant_id_period_key" ON "hr_payroll_periods"("tenant_id", "period");
CREATE UNIQUE INDEX "hr_payroll_novelties_tenant_id_request_key_key" ON "hr_payroll_novelties"("tenant_id", "request_key");
CREATE UNIQUE INDEX "hr_performance_reviews_tenant_id_request_key_key" ON "hr_performance_reviews"("tenant_id", "request_key");
CREATE UNIQUE INDEX "hr_trainings_tenant_id_code_key" ON "hr_trainings"("tenant_id", "code");
CREATE UNIQUE INDEX "hr_trainings_tenant_id_request_key_key" ON "hr_trainings"("tenant_id", "request_key");
CREATE UNIQUE INDEX "hr_training_attendance_tenant_id_training_id_employee_id_key" ON "hr_training_attendance"("tenant_id", "training_id", "employee_id");
CREATE UNIQUE INDEX "hr_disciplinary_cases_tenant_id_code_key" ON "hr_disciplinary_cases"("tenant_id", "code");
CREATE UNIQUE INDEX "hr_disciplinary_cases_tenant_id_request_key_key" ON "hr_disciplinary_cases"("tenant_id", "request_key");
CREATE UNIQUE INDEX "hr_offboardings_tenant_id_request_key_key" ON "hr_offboardings"("tenant_id", "request_key");

CREATE INDEX "hr_leave_requests_tenant_id_employee_id_idx" ON "hr_leave_requests"("tenant_id", "employee_id");
CREATE INDEX "hr_leave_requests_tenant_id_approver_id_status_idx" ON "hr_leave_requests"("tenant_id", "approver_id", "status");
CREATE INDEX "hr_leave_requests_tenant_id_status_idx" ON "hr_leave_requests"("tenant_id", "status");
CREATE INDEX "hr_overtime_tenant_id_employee_id_work_date_idx" ON "hr_overtime"("tenant_id", "employee_id", "work_date");
CREATE INDEX "hr_overtime_tenant_id_approver_id_status_idx" ON "hr_overtime"("tenant_id", "approver_id", "status");
CREATE INDEX "hr_payroll_novelties_tenant_id_period_idx" ON "hr_payroll_novelties"("tenant_id", "period");
CREATE INDEX "hr_payroll_novelties_tenant_id_employee_id_idx" ON "hr_payroll_novelties"("tenant_id", "employee_id");
CREATE INDEX "hr_payroll_novelties_tenant_id_source_idx" ON "hr_payroll_novelties"("tenant_id", "source_entity", "source_id");
CREATE INDEX "hr_performance_reviews_tenant_id_employee_id_idx" ON "hr_performance_reviews"("tenant_id", "employee_id");
CREATE INDEX "hr_training_attendance_tenant_id_employee_id_idx" ON "hr_training_attendance"("tenant_id", "employee_id");
CREATE INDEX "hr_disciplinary_cases_tenant_id_employee_id_idx" ON "hr_disciplinary_cases"("tenant_id", "employee_id");
CREATE INDEX "hr_offboardings_tenant_id_status_idx" ON "hr_offboardings"("tenant_id", "status");

-- Una sola evaluación por colaborador y periodo, y un solo retiro vigente por colaborador.
CREATE UNIQUE INDEX "hr_performance_reviews_one_per_period" ON "hr_performance_reviews"("tenant_id", "employee_id", "period")
    WHERE "deleted_at" IS NULL;
CREATE UNIQUE INDEX "hr_offboardings_one_open" ON "hr_offboardings"("tenant_id", "employee_id")
    WHERE "status" <> 'cancelled' AND "deleted_at" IS NULL;

ALTER TABLE "hr_leave_requests" ADD CONSTRAINT "hr_leave_requests_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "hr_overtime" ADD CONSTRAINT "hr_overtime_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "hr_payroll_periods" ADD CONSTRAINT "hr_payroll_periods_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "hr_payroll_novelties" ADD CONSTRAINT "hr_payroll_novelties_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "hr_performance_reviews" ADD CONSTRAINT "hr_performance_reviews_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "hr_trainings" ADD CONSTRAINT "hr_trainings_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "hr_training_attendance" ADD CONSTRAINT "hr_training_attendance_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "hr_disciplinary_cases" ADD CONSTRAINT "hr_disciplinary_cases_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "hr_offboardings" ADD CONSTRAINT "hr_offboardings_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "hr_leave_requests" ADD CONSTRAINT "hr_leave_requests_tenant_id_employee_id_fkey"
    FOREIGN KEY ("tenant_id", "employee_id") REFERENCES "hr_employees"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "hr_overtime" ADD CONSTRAINT "hr_overtime_tenant_id_employee_id_fkey"
    FOREIGN KEY ("tenant_id", "employee_id") REFERENCES "hr_employees"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "hr_payroll_novelties" ADD CONSTRAINT "hr_payroll_novelties_tenant_id_employee_id_fkey"
    FOREIGN KEY ("tenant_id", "employee_id") REFERENCES "hr_employees"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "hr_performance_reviews" ADD CONSTRAINT "hr_performance_reviews_tenant_id_employee_id_fkey"
    FOREIGN KEY ("tenant_id", "employee_id") REFERENCES "hr_employees"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "hr_training_attendance" ADD CONSTRAINT "hr_training_attendance_tenant_id_training_id_fkey"
    FOREIGN KEY ("tenant_id", "training_id") REFERENCES "hr_trainings"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "hr_training_attendance" ADD CONSTRAINT "hr_training_attendance_tenant_id_employee_id_fkey"
    FOREIGN KEY ("tenant_id", "employee_id") REFERENCES "hr_employees"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "hr_disciplinary_cases" ADD CONSTRAINT "hr_disciplinary_cases_tenant_id_employee_id_fkey"
    FOREIGN KEY ("tenant_id", "employee_id") REFERENCES "hr_employees"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "hr_offboardings" ADD CONSTRAINT "hr_offboardings_tenant_id_employee_id_fkey"
    FOREIGN KEY ("tenant_id", "employee_id") REFERENCES "hr_employees"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TRIGGER "hr_leave_requests_control_columns" BEFORE INSERT OR UPDATE ON "hr_leave_requests"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();
CREATE TRIGGER "hr_overtime_control_columns" BEFORE INSERT OR UPDATE ON "hr_overtime"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();
CREATE TRIGGER "hr_payroll_periods_control_columns" BEFORE INSERT OR UPDATE ON "hr_payroll_periods"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();
CREATE TRIGGER "hr_payroll_novelties_control_columns" BEFORE INSERT OR UPDATE ON "hr_payroll_novelties"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();
CREATE TRIGGER "hr_performance_reviews_control_columns" BEFORE INSERT OR UPDATE ON "hr_performance_reviews"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();
CREATE TRIGGER "hr_trainings_control_columns" BEFORE INSERT OR UPDATE ON "hr_trainings"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();
CREATE TRIGGER "hr_training_attendance_control_columns" BEFORE INSERT OR UPDATE ON "hr_training_attendance"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();
CREATE TRIGGER "hr_disciplinary_cases_control_columns" BEFORE INSERT OR UPDATE ON "hr_disciplinary_cases"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();
CREATE TRIGGER "hr_offboardings_control_columns" BEFORE INSERT OR UPDATE ON "hr_offboardings"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();

-- Ficha 17.13: las novedades del periodo se cierran y exportan. Con el mes cerrado ninguna novedad
-- se agrega, cambia ni sale de él, aunque el código se equivoque.
CREATE FUNCTION "hr_novelty_period_open"() RETURNS TRIGGER
    LANGUAGE plpgsql SET search_path = public
    AS $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM "hr_payroll_periods" p
        WHERE p."tenant_id" = NEW."tenant_id" AND p."period" = NEW."period"
          AND p."status" = 'closed' AND p."deleted_at" IS NULL
    ) OR (TG_OP = 'UPDATE' AND EXISTS (
        SELECT 1 FROM "hr_payroll_periods" p
        WHERE p."tenant_id" = OLD."tenant_id" AND p."period" = OLD."period"
          AND p."status" = 'closed' AND p."deleted_at" IS NULL
    )) THEN
        RAISE EXCEPTION 'hr_payroll_novelties: el mes de nómina está cerrado'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER "hr_payroll_novelties_period_open" BEFORE INSERT OR UPDATE ON "hr_payroll_novelties"
    FOR EACH ROW EXECUTE FUNCTION "hr_novelty_period_open"();

-- Un mes cerrado no se reabre.
CREATE FUNCTION "hr_payroll_period_stays_closed"() RETURNS TRIGGER
    LANGUAGE plpgsql SET search_path = public
    AS $$
BEGIN
    IF OLD."status" = 'closed' AND (NEW."status" <> 'closed' OR NEW."deleted_at" IS NOT NULL) THEN
        RAISE EXCEPTION 'hr_payroll_periods: un mes cerrado no se reabre'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER "hr_payroll_periods_stay_closed" BEFORE UPDATE ON "hr_payroll_periods"
    FOR EACH ROW EXECUTE FUNCTION "hr_payroll_period_stays_closed"();

ALTER TABLE "hr_leave_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "hr_leave_requests" FORCE ROW LEVEL SECURITY;
CREATE POLICY "hr_leave_requests_tenant_isolation" ON "hr_leave_requests"
    USING ("tenant_id" = core_current_tenant_id()) WITH CHECK ("tenant_id" = core_current_tenant_id());
ALTER TABLE "hr_overtime" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "hr_overtime" FORCE ROW LEVEL SECURITY;
CREATE POLICY "hr_overtime_tenant_isolation" ON "hr_overtime"
    USING ("tenant_id" = core_current_tenant_id()) WITH CHECK ("tenant_id" = core_current_tenant_id());
ALTER TABLE "hr_payroll_periods" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "hr_payroll_periods" FORCE ROW LEVEL SECURITY;
CREATE POLICY "hr_payroll_periods_tenant_isolation" ON "hr_payroll_periods"
    USING ("tenant_id" = core_current_tenant_id()) WITH CHECK ("tenant_id" = core_current_tenant_id());
ALTER TABLE "hr_payroll_novelties" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "hr_payroll_novelties" FORCE ROW LEVEL SECURITY;
CREATE POLICY "hr_payroll_novelties_tenant_isolation" ON "hr_payroll_novelties"
    USING ("tenant_id" = core_current_tenant_id()) WITH CHECK ("tenant_id" = core_current_tenant_id());
ALTER TABLE "hr_performance_reviews" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "hr_performance_reviews" FORCE ROW LEVEL SECURITY;
CREATE POLICY "hr_performance_reviews_tenant_isolation" ON "hr_performance_reviews"
    USING ("tenant_id" = core_current_tenant_id()) WITH CHECK ("tenant_id" = core_current_tenant_id());
ALTER TABLE "hr_trainings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "hr_trainings" FORCE ROW LEVEL SECURITY;
CREATE POLICY "hr_trainings_tenant_isolation" ON "hr_trainings"
    USING ("tenant_id" = core_current_tenant_id()) WITH CHECK ("tenant_id" = core_current_tenant_id());
ALTER TABLE "hr_training_attendance" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "hr_training_attendance" FORCE ROW LEVEL SECURITY;
CREATE POLICY "hr_training_attendance_tenant_isolation" ON "hr_training_attendance"
    USING ("tenant_id" = core_current_tenant_id()) WITH CHECK ("tenant_id" = core_current_tenant_id());
ALTER TABLE "hr_disciplinary_cases" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "hr_disciplinary_cases" FORCE ROW LEVEL SECURITY;
CREATE POLICY "hr_disciplinary_cases_tenant_isolation" ON "hr_disciplinary_cases"
    USING ("tenant_id" = core_current_tenant_id()) WITH CHECK ("tenant_id" = core_current_tenant_id());
ALTER TABLE "hr_offboardings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "hr_offboardings" FORCE ROW LEVEL SECURITY;
CREATE POLICY "hr_offboardings_tenant_isolation" ON "hr_offboardings"
    USING ("tenant_id" = core_current_tenant_id()) WITH CHECK ("tenant_id" = core_current_tenant_id());

GRANT SELECT, INSERT, UPDATE ON "hr_leave_requests" TO app_user;
GRANT SELECT, INSERT, UPDATE ON "hr_overtime" TO app_user;
GRANT SELECT, INSERT, UPDATE ON "hr_payroll_periods" TO app_user;
GRANT SELECT, INSERT, UPDATE ON "hr_payroll_novelties" TO app_user;
GRANT SELECT, INSERT, UPDATE ON "hr_performance_reviews" TO app_user;
GRANT SELECT, INSERT, UPDATE ON "hr_trainings" TO app_user;
GRANT SELECT, INSERT, UPDATE ON "hr_training_attendance" TO app_user;
GRANT SELECT, INSERT, UPDATE ON "hr_disciplinary_cases" TO app_user;
GRANT SELECT, INSERT, UPDATE ON "hr_offboardings" TO app_user;

-- El trabajo diario recorre las empresas con ausencias aprobadas que ya terminaron (pasan a
-- «disfrutada») y con retiros cuyo último día ya pasó (se desactiva la cuenta, numeral 15.1). La
-- función corre como dueña del esquema: lee todas las empresas solo para saber cuáles tienen trabajo.
CREATE POLICY "hr_leave_requests_worker_lookup" ON "hr_leave_requests"
    FOR SELECT TO migration_user USING (true);
CREATE POLICY "hr_offboardings_worker_lookup" ON "hr_offboardings"
    FOR SELECT TO migration_user USING (true);
CREATE FUNCTION "hr_tenants_with_daily_work"(today DATE) RETURNS SETOF UUID
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
    AS $$ SELECT tenant_id FROM hr_leave_requests
          WHERE status = 'approved' AND ends_on < today AND deleted_at IS NULL
          UNION
          SELECT tenant_id FROM hr_offboardings
          WHERE status = 'in_progress' AND account_deactivated_at IS NULL AND last_day < today
            AND deleted_at IS NULL
          ORDER BY 1 $$;
REVOKE EXECUTE ON FUNCTION "hr_tenants_with_daily_work"(DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "hr_tenants_with_daily_work"(DATE) TO app_user;

-- Identidad: el retiro cierra las sesiones con su propio motivo.
ALTER TABLE "iam_sessions" DROP CONSTRAINT "iam_sessions_revoked_reason_check";
ALTER TABLE "iam_sessions" ADD CONSTRAINT "iam_sessions_revoked_reason_check" CHECK (
    "revoked_reason" IS NULL
    OR "revoked_reason" IN (
        'logout', 'idle', 'password_changed', 'password_reset',
        'remote_revoke', 'mfa_failures', 'mfa_changed', 'mfa_reset', 'account_locked',
        'offboarding'
    )
);

-- Avisos nuevos: ausencias y horas extras (al jefe y al colaborador), evaluación por aceptar,
-- citación a descargos y tareas del retiro.
ALTER TABLE "ntf_templates" DROP CONSTRAINT "ntf_templates_key_check";
ALTER TABLE "ntf_notifications" DROP CONSTRAINT "ntf_notifications_kind_check";
ALTER TABLE "ntf_preferences" DROP CONSTRAINT "ntf_preferences_event_key_check";

ALTER TABLE "ntf_templates"
    ADD CONSTRAINT "ntf_templates_key_check" CHECK ("key" IN ('task_assigned', 'task_escalated',
        'comment_mention', 'security_alert', 'doc_read_requested', 'doc_request_decided',
        'crm_activity_due', 'crm_quote_update', 'ctr_contract_update', 'prj_project_update',
        'svc_ticket_update', 'svc_ticket_alert', 'svc_pqrsf_update', 'hr_onboarding_task',
        'hr_leave_update', 'hr_overtime_update', 'hr_review_update', 'hr_disciplinary_notice',
        'hr_offboarding_task'));
ALTER TABLE "ntf_notifications"
    ADD CONSTRAINT "ntf_notifications_kind_check" CHECK ("kind" IN ('task_assigned', 'task_escalated',
        'comment_mention', 'security_alert', 'doc_read_requested', 'doc_request_decided',
        'crm_activity_due', 'crm_quote_update', 'ctr_contract_update', 'prj_project_update',
        'svc_ticket_update', 'svc_ticket_alert', 'svc_pqrsf_update', 'hr_onboarding_task',
        'hr_leave_update', 'hr_overtime_update', 'hr_review_update', 'hr_disciplinary_notice',
        'hr_offboarding_task'));
ALTER TABLE "ntf_preferences"
    ADD CONSTRAINT "ntf_preferences_event_key_check" CHECK ("event_key" IN ('task_assigned',
        'task_escalated', 'comment_mention', 'security_alert', 'doc_read_requested',
        'doc_request_decided', 'crm_activity_due', 'crm_quote_update', 'ctr_contract_update',
        'prj_project_update', 'svc_ticket_update', 'svc_ticket_alert', 'svc_pqrsf_update',
        'hr_onboarding_task', 'hr_leave_update', 'hr_overtime_update', 'hr_review_update',
        'hr_disciplinary_notice', 'hr_offboarding_task'));
