-- B31: facturas, notas crédito y recaudos. No se generan ni transmiten documentos fiscales.

CREATE TABLE "fin_invoices" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "party_id" UUID NOT NULL,
    "contract_id" UUID,
    "milestone_id" UUID NOT NULL,
    "requested_amount" DECIMAL(18,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'requested',
    "issue_date" DATE,
    "due_date" DATE,
    "subtotal" DECIMAL(18,2),
    "tax_total" DECIMAL(18,2),
    "withholding_total" DECIMAL(18,2),
    "total" DECIMAL(18,2),
    "fiscal_number" TEXT,
    "fiscal_uuid" TEXT,
    "fiscal_file_id" UUID,
    "request_key" TEXT NOT NULL,
    "approval_key" TEXT,
    "fiscal_key" TEXT,
    "approved_by" UUID,
    "approved_at" TIMESTAMPTZ(6),
    "voided_by" UUID,
    "voided_at" TIMESTAMPTZ(6),
    "void_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),
    CONSTRAINT "fin_invoices_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "fin_invoices_status_check" CHECK ("status" IN ('requested', 'approved', 'issued', 'partially_paid', 'paid', 'voided')),
    CONSTRAINT "fin_invoices_requested_amount_check" CHECK ("requested_amount" > 0),
    CONSTRAINT "fin_invoices_totals_check" CHECK (
        ("subtotal" IS NULL OR "subtotal" >= 0) AND
        ("tax_total" IS NULL OR "tax_total" >= 0) AND
        ("withholding_total" IS NULL OR "withholding_total" >= 0) AND
        ("total" IS NULL OR "total" > 0)
    ),
    CONSTRAINT "fin_invoices_fiscal_fields_check" CHECK (
        "status" NOT IN ('issued', 'partially_paid', 'paid') OR
        ("issue_date" IS NOT NULL AND "due_date" IS NOT NULL AND "subtotal" IS NOT NULL AND
         "tax_total" IS NOT NULL AND "withholding_total" IS NOT NULL AND "total" IS NOT NULL AND
         "fiscal_number" IS NOT NULL AND "fiscal_file_id" IS NOT NULL)
    )
);

CREATE TABLE "fin_invoice_items" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(12,2) NOT NULL DEFAULT 1,
    "unit_price" DECIMAL(18,2) NOT NULL,
    "tax_rate" DECIMAL(5,2),
    "line_total" DECIMAL(18,2) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),
    CONSTRAINT "fin_invoice_items_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "fin_invoice_items_values_check" CHECK (
        "position" > 0 AND "quantity" > 0 AND "unit_price" >= 0 AND "line_total" >= 0 AND
        ("tax_rate" IS NULL OR ("tax_rate" >= 0 AND "tax_rate" <= 100))
    )
);

CREATE TABLE "fin_credit_notes" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "issue_date" DATE NOT NULL,
    "fiscal_number" TEXT NOT NULL,
    "fiscal_uuid" TEXT,
    "fiscal_file_id" UUID NOT NULL,
    "request_key" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),
    CONSTRAINT "fin_credit_notes_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "fin_credit_notes_values_check" CHECK ("amount" > 0 AND length(trim("reason")) >= 3)
);

CREATE TABLE "fin_payments" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "paid_on" DATE NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "method" TEXT NOT NULL,
    "reference" TEXT,
    "support_file_id" UUID,
    "request_key" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),
    CONSTRAINT "fin_payments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "fin_payments_values_check" CHECK ("amount" > 0 AND length(trim("method")) > 0)
);

CREATE UNIQUE INDEX "fin_invoices_tenant_id_id_key" ON "fin_invoices"("tenant_id", "id");
CREATE UNIQUE INDEX "fin_invoices_tenant_id_code_key" ON "fin_invoices"("tenant_id", "code");
CREATE UNIQUE INDEX "fin_invoices_tenant_id_request_key_key" ON "fin_invoices"("tenant_id", "request_key");
CREATE UNIQUE INDEX "fin_invoices_tenant_id_milestone_id_key" ON "fin_invoices"("tenant_id", "milestone_id");
CREATE UNIQUE INDEX "fin_invoices_tenant_id_fiscal_number_key" ON "fin_invoices"("tenant_id", "fiscal_number");
CREATE UNIQUE INDEX "fin_invoices_tenant_id_fiscal_uuid_key" ON "fin_invoices"("tenant_id", "fiscal_uuid");
CREATE INDEX "fin_invoices_tenant_id_party_id_status_idx" ON "fin_invoices"("tenant_id", "party_id", "status");
CREATE INDEX "fin_invoices_tenant_id_milestone_id_idx" ON "fin_invoices"("tenant_id", "milestone_id");
CREATE UNIQUE INDEX "fin_invoice_items_tenant_id_id_key" ON "fin_invoice_items"("tenant_id", "id");
CREATE UNIQUE INDEX "fin_invoice_items_tenant_id_invoice_id_position_key" ON "fin_invoice_items"("tenant_id", "invoice_id", "position");
CREATE UNIQUE INDEX "fin_credit_notes_tenant_id_id_key" ON "fin_credit_notes"("tenant_id", "id");
CREATE UNIQUE INDEX "fin_credit_notes_tenant_id_fiscal_number_key" ON "fin_credit_notes"("tenant_id", "fiscal_number");
CREATE UNIQUE INDEX "fin_credit_notes_tenant_id_request_key_key" ON "fin_credit_notes"("tenant_id", "request_key");
CREATE INDEX "fin_credit_notes_tenant_id_invoice_id_idx" ON "fin_credit_notes"("tenant_id", "invoice_id");
CREATE UNIQUE INDEX "fin_payments_tenant_id_id_key" ON "fin_payments"("tenant_id", "id");
CREATE UNIQUE INDEX "fin_payments_tenant_id_request_key_key" ON "fin_payments"("tenant_id", "request_key");
CREATE INDEX "fin_payments_tenant_id_invoice_id_paid_on_idx" ON "fin_payments"("tenant_id", "invoice_id", "paid_on");

ALTER TABLE "fin_invoices" ADD CONSTRAINT "fin_invoices_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fin_invoice_items" ADD CONSTRAINT "fin_invoice_items_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fin_invoice_items" ADD CONSTRAINT "fin_invoice_items_tenant_id_invoice_id_fkey"
    FOREIGN KEY ("tenant_id", "invoice_id") REFERENCES "fin_invoices"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fin_credit_notes" ADD CONSTRAINT "fin_credit_notes_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fin_credit_notes" ADD CONSTRAINT "fin_credit_notes_tenant_id_invoice_id_fkey"
    FOREIGN KEY ("tenant_id", "invoice_id") REFERENCES "fin_invoices"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fin_payments" ADD CONSTRAINT "fin_payments_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fin_payments" ADD CONSTRAINT "fin_payments_tenant_id_invoice_id_fkey"
    FOREIGN KEY ("tenant_id", "invoice_id") REFERENCES "fin_invoices"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TRIGGER "fin_invoices_control_columns" BEFORE INSERT OR UPDATE ON "fin_invoices"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();
CREATE TRIGGER "fin_invoice_items_control_columns" BEFORE INSERT OR UPDATE ON "fin_invoice_items"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();
CREATE TRIGGER "fin_credit_notes_control_columns" BEFORE INSERT OR UPDATE ON "fin_credit_notes"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();
CREATE TRIGGER "fin_payments_control_columns" BEFORE INSERT OR UPDATE ON "fin_payments"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();

ALTER TABLE "fin_invoices" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "fin_invoices" FORCE ROW LEVEL SECURITY;
CREATE POLICY "fin_invoices_tenant_isolation" ON "fin_invoices"
    USING ("tenant_id" = core_current_tenant_id()) WITH CHECK ("tenant_id" = core_current_tenant_id());
ALTER TABLE "fin_invoice_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "fin_invoice_items" FORCE ROW LEVEL SECURITY;
CREATE POLICY "fin_invoice_items_tenant_isolation" ON "fin_invoice_items"
    USING ("tenant_id" = core_current_tenant_id()) WITH CHECK ("tenant_id" = core_current_tenant_id());
ALTER TABLE "fin_credit_notes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "fin_credit_notes" FORCE ROW LEVEL SECURITY;
CREATE POLICY "fin_credit_notes_tenant_isolation" ON "fin_credit_notes"
    USING ("tenant_id" = core_current_tenant_id()) WITH CHECK ("tenant_id" = core_current_tenant_id());
ALTER TABLE "fin_payments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "fin_payments" FORCE ROW LEVEL SECURITY;
CREATE POLICY "fin_payments_tenant_isolation" ON "fin_payments"
    USING ("tenant_id" = core_current_tenant_id()) WITH CHECK ("tenant_id" = core_current_tenant_id());

GRANT SELECT, INSERT, UPDATE ON "fin_invoices" TO app_user;
GRANT SELECT, INSERT, UPDATE ON "fin_invoice_items" TO app_user;
GRANT SELECT, INSERT ON "fin_credit_notes" TO app_user;
GRANT SELECT, INSERT ON "fin_payments" TO app_user;
