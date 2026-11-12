-- B32: presupuesto, gastos, caja menor, conciliación bancaria, certificación de costos, cierre de
-- periodo y exportación contable. Un periodo cerrado no admite cambios: lo garantiza el disparador
-- fin_reject_closed_period sobre cada tabla con fecha contable, también las del B31.

CREATE TABLE "fin_budgets" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "year" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "approved_by" UUID,
    "approved_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),
    CONSTRAINT "fin_budgets_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "fin_budgets_status_check" CHECK ("status" IN ('draft', 'approved')),
    CONSTRAINT "fin_budgets_year_check" CHECK ("year" BETWEEN 2000 AND 2100),
    CONSTRAINT "fin_budgets_approval_check" CHECK (
        "status" <> 'approved' OR ("approved_by" IS NOT NULL AND "approved_at" IS NOT NULL)
    )
);

CREATE TABLE "fin_budget_lines" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "budget_id" UUID NOT NULL,
    "cost_center_id" UUID NOT NULL,
    "category" TEXT NOT NULL,
    "month" SMALLINT NOT NULL,
    "planned" DECIMAL(18,2) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),
    CONSTRAINT "fin_budget_lines_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "fin_budget_lines_values_check" CHECK ("month" BETWEEN 1 AND 12 AND "planned" > 0)
);

CREATE TABLE "fin_expenses" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "cost_center_id" UUID NOT NULL,
    "supplier_id" UUID,
    "expense_date" DATE NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "support_file_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "decided_by" UUID,
    "decided_at" TIMESTAMPTZ(6),
    "decision_note" TEXT,
    "request_key" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),
    CONSTRAINT "fin_expenses_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "fin_expenses_status_check" CHECK ("status" IN ('pending', 'approved', 'rejected')),
    CONSTRAINT "fin_expenses_amount_check" CHECK ("amount" > 0),
    CONSTRAINT "fin_expenses_decision_check" CHECK (
        "status" = 'pending' OR ("decided_by" IS NOT NULL AND "decided_at" IS NOT NULL)
    )
);

CREATE TABLE "fin_petty_cash" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "movement_date" DATE NOT NULL,
    "type" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "concept" TEXT NOT NULL,
    "cost_center_id" UUID,
    "category" TEXT,
    "support_file_id" UUID,
    "balance" DECIMAL(18,2) NOT NULL,
    "request_key" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),
    CONSTRAINT "fin_petty_cash_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "fin_petty_cash_type_check" CHECK ("type" IN ('opening', 'voucher', 'replenishment')),
    CONSTRAINT "fin_petty_cash_values_check" CHECK ("amount" > 0 AND "balance" >= 0),
    CONSTRAINT "fin_petty_cash_voucher_check" CHECK (
        ("type" = 'voucher') = ("cost_center_id" IS NOT NULL AND "category" IS NOT NULL)
    )
);

CREATE TABLE "fin_bank_reconciliations" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "account" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "book_balance" DECIMAL(18,2) NOT NULL,
    "bank_balance" DECIMAL(18,2) NOT NULL,
    "differences" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "reconciled_by" UUID,
    "reconciled_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),
    CONSTRAINT "fin_bank_reconciliations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "fin_bank_reconciliations_status_check" CHECK ("status" IN ('draft', 'reconciled')),
    CONSTRAINT "fin_bank_reconciliations_period_check" CHECK ("period" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
    CONSTRAINT "fin_bank_reconciliations_differences_check" CHECK (jsonb_typeof("differences") = 'array')
);

CREATE TABLE "fin_cost_certifications" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "project_id" UUID NOT NULL,
    "period" TEXT NOT NULL,
    "hours" DECIMAL(10,2) NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "phase" TEXT NOT NULL,
    "request_key" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),
    CONSTRAINT "fin_cost_certifications_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "fin_cost_certifications_period_check" CHECK ("period" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
    CONSTRAINT "fin_cost_certifications_phase_check" CHECK ("phase" IN ('research', 'development', 'innovation')),
    CONSTRAINT "fin_cost_certifications_values_check" CHECK ("hours" > 0 AND "amount" > 0)
);

CREATE TABLE "fin_periods" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "period" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'closed',
    "closed_by" UUID NOT NULL,
    "closed_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),
    CONSTRAINT "fin_periods_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "fin_periods_status_check" CHECK ("status" = 'closed'),
    CONSTRAINT "fin_periods_period_check" CHECK ("period" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$')
);

CREATE TABLE "fin_export_batches" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "period" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "row_count" INTEGER NOT NULL,
    "totals" JSONB NOT NULL,
    "checksum" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_id" UUID,
    "exported_by" UUID NOT NULL,
    "exported_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),
    CONSTRAINT "fin_export_batches_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "fin_export_batches_kind_check" CHECK ("kind" IN ('preliminary', 'definitive')),
    CONSTRAINT "fin_export_batches_period_check" CHECK ("period" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
    CONSTRAINT "fin_export_batches_row_count_check" CHECK ("row_count" >= 0)
);

CREATE UNIQUE INDEX "fin_budgets_tenant_id_id_key" ON "fin_budgets"("tenant_id", "id");
CREATE UNIQUE INDEX "fin_budget_lines_tenant_id_id_key" ON "fin_budget_lines"("tenant_id", "id");
CREATE UNIQUE INDEX "fin_expenses_tenant_id_id_key" ON "fin_expenses"("tenant_id", "id");
CREATE UNIQUE INDEX "fin_petty_cash_tenant_id_id_key" ON "fin_petty_cash"("tenant_id", "id");
CREATE UNIQUE INDEX "fin_bank_reconciliations_tenant_id_id_key" ON "fin_bank_reconciliations"("tenant_id", "id");
CREATE UNIQUE INDEX "fin_cost_certifications_tenant_id_id_key" ON "fin_cost_certifications"("tenant_id", "id");
CREATE UNIQUE INDEX "fin_periods_tenant_id_id_key" ON "fin_periods"("tenant_id", "id");
CREATE UNIQUE INDEX "fin_export_batches_tenant_id_id_key" ON "fin_export_batches"("tenant_id", "id");
CREATE UNIQUE INDEX "fin_budgets_tenant_id_year_key" ON "fin_budgets"("tenant_id", "year");
CREATE UNIQUE INDEX "fin_expenses_tenant_id_code_key" ON "fin_expenses"("tenant_id", "code");
CREATE UNIQUE INDEX "fin_expenses_tenant_id_request_key_key" ON "fin_expenses"("tenant_id", "request_key");
CREATE UNIQUE INDEX "fin_petty_cash_tenant_id_code_key" ON "fin_petty_cash"("tenant_id", "code");
CREATE UNIQUE INDEX "fin_petty_cash_tenant_id_request_key_key" ON "fin_petty_cash"("tenant_id", "request_key");
CREATE UNIQUE INDEX "fin_bank_reconciliations_tenant_id_account_period_key" ON "fin_bank_reconciliations"("tenant_id", "account", "period");
CREATE UNIQUE INDEX "fin_cost_certifications_tenant_id_code_key" ON "fin_cost_certifications"("tenant_id", "code");
CREATE UNIQUE INDEX "fin_cost_certifications_tenant_id_project_id_period_key" ON "fin_cost_certifications"("tenant_id", "project_id", "period");
CREATE UNIQUE INDEX "fin_cost_certifications_tenant_id_request_key_key" ON "fin_cost_certifications"("tenant_id", "request_key");
CREATE UNIQUE INDEX "fin_periods_tenant_id_period_key" ON "fin_periods"("tenant_id", "period");
CREATE INDEX "fin_budget_lines_tenant_id_budget_id_idx" ON "fin_budget_lines"("tenant_id", "budget_id");
CREATE INDEX "fin_expenses_tenant_id_expense_date_status_idx" ON "fin_expenses"("tenant_id", "expense_date", "status");
CREATE INDEX "fin_expenses_tenant_id_created_by_idx" ON "fin_expenses"("tenant_id", "created_by");
CREATE INDEX "fin_petty_cash_tenant_id_movement_date_idx" ON "fin_petty_cash"("tenant_id", "movement_date");
CREATE INDEX "fin_export_batches_tenant_id_period_idx" ON "fin_export_batches"("tenant_id", "period");
-- Una línea vigente por centro de costo, rubro y mes; las reemplazadas se marcan como borradas.
CREATE UNIQUE INDEX "fin_budget_lines_one_per_slot" ON "fin_budget_lines"("tenant_id", "budget_id", "cost_center_id", "category", "month")
    WHERE "deleted_at" IS NULL;
-- Un solo lote definitivo por mes: el que se genera al cerrarlo.
CREATE UNIQUE INDEX "fin_export_batches_one_definitive" ON "fin_export_batches"("tenant_id", "period")
    WHERE "kind" = 'definitive';

ALTER TABLE "fin_budgets" ADD CONSTRAINT "fin_budgets_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fin_budget_lines" ADD CONSTRAINT "fin_budget_lines_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fin_expenses" ADD CONSTRAINT "fin_expenses_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fin_petty_cash" ADD CONSTRAINT "fin_petty_cash_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fin_bank_reconciliations" ADD CONSTRAINT "fin_bank_reconciliations_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fin_cost_certifications" ADD CONSTRAINT "fin_cost_certifications_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fin_periods" ADD CONSTRAINT "fin_periods_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fin_export_batches" ADD CONSTRAINT "fin_export_batches_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fin_budget_lines" ADD CONSTRAINT "fin_budget_lines_tenant_id_budget_id_fkey"
    FOREIGN KEY ("tenant_id", "budget_id") REFERENCES "fin_budgets"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TRIGGER "fin_budgets_control_columns" BEFORE INSERT OR UPDATE ON "fin_budgets"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();
CREATE TRIGGER "fin_budget_lines_control_columns" BEFORE INSERT OR UPDATE ON "fin_budget_lines"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();
CREATE TRIGGER "fin_expenses_control_columns" BEFORE INSERT OR UPDATE ON "fin_expenses"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();
CREATE TRIGGER "fin_petty_cash_control_columns" BEFORE INSERT OR UPDATE ON "fin_petty_cash"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();
CREATE TRIGGER "fin_bank_reconciliations_control_columns" BEFORE INSERT OR UPDATE ON "fin_bank_reconciliations"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();
CREATE TRIGGER "fin_cost_certifications_control_columns" BEFORE INSERT OR UPDATE ON "fin_cost_certifications"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();
CREATE TRIGGER "fin_periods_control_columns" BEFORE INSERT OR UPDATE ON "fin_periods"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();
CREATE TRIGGER "fin_export_batches_control_columns" BEFORE INSERT OR UPDATE ON "fin_export_batches"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();

-- Periodo cerrado: rechaza crear o cambiar un registro cuya fecha contable (argumento: la columna)
-- cae en un mes cerrado, antes o después del cambio. La API lo revisa primero con un mensaje claro;
-- esto es el respaldo para que ni un error de código lo permita.
CREATE FUNCTION "fin_reject_closed_period"() RETURNS TRIGGER
    LANGUAGE plpgsql
    AS $$
DECLARE
    new_period TEXT;
    old_period TEXT;
BEGIN
    EXECUTE format('SELECT left(($1).%I::text, 7)', TG_ARGV[0]) USING NEW INTO new_period;
    IF TG_OP = 'UPDATE' THEN
        EXECUTE format('SELECT left(($1).%I::text, 7)', TG_ARGV[0]) USING OLD INTO old_period;
    END IF;
    IF EXISTS (
        SELECT 1 FROM "fin_periods"
         WHERE "tenant_id" = NEW."tenant_id" AND "period" IN (new_period, old_period)
           AND "deleted_at" IS NULL
    ) THEN
        RAISE EXCEPTION 'El periodo contable está cerrado y no admite cambios'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "fin_expenses_closed_period" BEFORE INSERT OR UPDATE ON "fin_expenses"
    FOR EACH ROW EXECUTE FUNCTION "fin_reject_closed_period"('expense_date');
CREATE TRIGGER "fin_petty_cash_closed_period" BEFORE INSERT OR UPDATE ON "fin_petty_cash"
    FOR EACH ROW EXECUTE FUNCTION "fin_reject_closed_period"('movement_date');
CREATE TRIGGER "fin_bank_reconciliations_closed_period" BEFORE INSERT OR UPDATE ON "fin_bank_reconciliations"
    FOR EACH ROW EXECUTE FUNCTION "fin_reject_closed_period"('period');
CREATE TRIGGER "fin_cost_certifications_closed_period" BEFORE INSERT OR UPDATE ON "fin_cost_certifications"
    FOR EACH ROW EXECUTE FUNCTION "fin_reject_closed_period"('period');
CREATE TRIGGER "fin_payments_closed_period" BEFORE INSERT OR UPDATE ON "fin_payments"
    FOR EACH ROW EXECUTE FUNCTION "fin_reject_closed_period"('paid_on');
CREATE TRIGGER "fin_credit_notes_closed_period" BEFORE INSERT OR UPDATE ON "fin_credit_notes"
    FOR EACH ROW EXECUTE FUNCTION "fin_reject_closed_period"('issue_date');
-- En la factura solo cuenta el registro del documento fiscal (cambia la fecha de emisión): un
-- recaudo de un mes abierto sí actualiza el estado de una factura emitida en un mes cerrado.
CREATE TRIGGER "fin_invoices_closed_period" BEFORE UPDATE OF "issue_date" ON "fin_invoices"
    FOR EACH ROW WHEN (OLD."issue_date" IS DISTINCT FROM NEW."issue_date")
    EXECUTE FUNCTION "fin_reject_closed_period"('issue_date');

ALTER TABLE "fin_budgets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "fin_budgets" FORCE ROW LEVEL SECURITY;
CREATE POLICY "fin_budgets_tenant_isolation" ON "fin_budgets"
    USING ("tenant_id" = core_current_tenant_id()) WITH CHECK ("tenant_id" = core_current_tenant_id());
ALTER TABLE "fin_budget_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "fin_budget_lines" FORCE ROW LEVEL SECURITY;
CREATE POLICY "fin_budget_lines_tenant_isolation" ON "fin_budget_lines"
    USING ("tenant_id" = core_current_tenant_id()) WITH CHECK ("tenant_id" = core_current_tenant_id());
ALTER TABLE "fin_expenses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "fin_expenses" FORCE ROW LEVEL SECURITY;
CREATE POLICY "fin_expenses_tenant_isolation" ON "fin_expenses"
    USING ("tenant_id" = core_current_tenant_id()) WITH CHECK ("tenant_id" = core_current_tenant_id());
ALTER TABLE "fin_petty_cash" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "fin_petty_cash" FORCE ROW LEVEL SECURITY;
CREATE POLICY "fin_petty_cash_tenant_isolation" ON "fin_petty_cash"
    USING ("tenant_id" = core_current_tenant_id()) WITH CHECK ("tenant_id" = core_current_tenant_id());
ALTER TABLE "fin_bank_reconciliations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "fin_bank_reconciliations" FORCE ROW LEVEL SECURITY;
CREATE POLICY "fin_bank_reconciliations_tenant_isolation" ON "fin_bank_reconciliations"
    USING ("tenant_id" = core_current_tenant_id()) WITH CHECK ("tenant_id" = core_current_tenant_id());
ALTER TABLE "fin_cost_certifications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "fin_cost_certifications" FORCE ROW LEVEL SECURITY;
CREATE POLICY "fin_cost_certifications_tenant_isolation" ON "fin_cost_certifications"
    USING ("tenant_id" = core_current_tenant_id()) WITH CHECK ("tenant_id" = core_current_tenant_id());
ALTER TABLE "fin_periods" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "fin_periods" FORCE ROW LEVEL SECURITY;
CREATE POLICY "fin_periods_tenant_isolation" ON "fin_periods"
    USING ("tenant_id" = core_current_tenant_id()) WITH CHECK ("tenant_id" = core_current_tenant_id());
ALTER TABLE "fin_export_batches" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "fin_export_batches" FORCE ROW LEVEL SECURITY;
CREATE POLICY "fin_export_batches_tenant_isolation" ON "fin_export_batches"
    USING ("tenant_id" = core_current_tenant_id()) WITH CHECK ("tenant_id" = core_current_tenant_id());

GRANT SELECT, INSERT, UPDATE ON "fin_budgets" TO app_user;
GRANT SELECT, INSERT, UPDATE ON "fin_budget_lines" TO app_user;
GRANT SELECT, INSERT, UPDATE ON "fin_expenses" TO app_user;
GRANT SELECT, INSERT ON "fin_petty_cash" TO app_user;
GRANT SELECT, INSERT, UPDATE ON "fin_bank_reconciliations" TO app_user;
GRANT SELECT, INSERT ON "fin_cost_certifications" TO app_user;
GRANT SELECT, INSERT ON "fin_periods" TO app_user;
GRANT SELECT, INSERT ON "fin_export_batches" TO app_user;
