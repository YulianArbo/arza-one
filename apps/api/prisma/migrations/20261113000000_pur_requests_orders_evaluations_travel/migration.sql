-- B33: compras, proveedores y viajes (M11, ficha 17.12). Solicitud → aprobación por montos →
-- cotizaciones y cuadro comparativo → orden → recepción → cierre; evaluación de proveedores; viajes
-- con su legalización. Quien solicita no aprueba: además de la API, lo impide una restricción.

CREATE TABLE "pur_requests" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "requester_id" UUID NOT NULL,
    "cost_center_id" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "estimated_amount" DECIMAL(18,2) NOT NULL,
    "approved_amount" DECIMAL(18,2),
    "status" TEXT NOT NULL DEFAULT 'draft',
    "submitted_at" TIMESTAMPTZ(6),
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
    CONSTRAINT "pur_requests_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "pur_requests_status_check" CHECK ("status" IN ('draft', 'in_approval', 'approved', 'rejected', 'quoted', 'ordered', 'received', 'closed')),
    CONSTRAINT "pur_requests_amount_check" CHECK ("estimated_amount" > 0 AND ("approved_amount" IS NULL OR "approved_amount" > 0)),
    CONSTRAINT "pur_requests_approval_check" CHECK (
        "status" NOT IN ('approved', 'quoted', 'ordered', 'received', 'closed')
        OR ("approved_amount" IS NOT NULL AND "decided_by" IS NOT NULL AND "decided_at" IS NOT NULL)
    ),
    CONSTRAINT "pur_requests_rejection_check" CHECK (
        "status" <> 'rejected' OR ("decided_by" IS NOT NULL AND "decision_note" IS NOT NULL)
    ),
    CONSTRAINT "pur_requests_segregation_check" CHECK ("decided_by" IS NULL OR "decided_by" <> "requester_id")
);

CREATE TABLE "pur_quotes" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "supplier_id" UUID NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "delivery_days" INTEGER NOT NULL,
    "file_id" UUID NOT NULL,
    "selected" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),
    CONSTRAINT "pur_quotes_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "pur_quotes_values_check" CHECK ("amount" > 0 AND "delivery_days" BETWEEN 0 AND 365)
);

CREATE TABLE "pur_orders" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "request_id" UUID NOT NULL,
    "supplier_id" UUID NOT NULL,
    "total" DECIMAL(18,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'issued',
    "document_id" UUID,
    "issued_by" UUID NOT NULL,
    "issued_at" TIMESTAMPTZ(6) NOT NULL,
    "closed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),
    CONSTRAINT "pur_orders_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "pur_orders_status_check" CHECK ("status" IN ('issued', 'received', 'closed')),
    CONSTRAINT "pur_orders_total_check" CHECK ("total" > 0),
    CONSTRAINT "pur_orders_closure_check" CHECK (("status" = 'closed') = ("closed_at" IS NOT NULL))
);

CREATE TABLE "pur_receipts" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "received_on" DATE NOT NULL,
    "received_by" UUID NOT NULL,
    "conforming" BOOLEAN NOT NULL,
    "note" TEXT,
    "request_key" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),
    CONSTRAINT "pur_receipts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "pur_receipts_note_check" CHECK ("conforming" OR "note" IS NOT NULL)
);

CREATE TABLE "pur_supplier_evaluations" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "supplier_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "criteria" JSONB NOT NULL,
    "score" DECIMAL(3,2) NOT NULL,
    "result" TEXT NOT NULL,
    "note" TEXT,
    "evaluated_by" UUID NOT NULL,
    "evaluated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),
    CONSTRAINT "pur_supplier_evaluations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "pur_supplier_evaluations_kind_check" CHECK ("kind" IN ('selection', 'reevaluation')),
    CONSTRAINT "pur_supplier_evaluations_period_check" CHECK ("period" ~ '^[0-9]{4}(-[12])?$'),
    CONSTRAINT "pur_supplier_evaluations_result_check" CHECK ("result" IN ('approved', 'conditional', 'rejected')),
    CONSTRAINT "pur_supplier_evaluations_score_check" CHECK ("score" BETWEEN 1 AND 5),
    CONSTRAINT "pur_supplier_evaluations_criteria_check" CHECK (jsonb_typeof("criteria") = 'object')
);

CREATE TABLE "pur_travel_requests" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "traveler_id" UUID NOT NULL,
    "destination" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "starts_on" DATE NOT NULL,
    "ends_on" DATE NOT NULL,
    "advance_amount" DECIMAL(18,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "submitted_at" TIMESTAMPTZ(6),
    "decided_by" UUID,
    "decided_at" TIMESTAMPTZ(6),
    "decision_note" TEXT,
    "legalized_at" TIMESTAMPTZ(6),
    "request_key" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),
    CONSTRAINT "pur_travel_requests_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "pur_travel_requests_status_check" CHECK ("status" IN ('draft', 'in_approval', 'approved', 'rejected', 'legalized')),
    CONSTRAINT "pur_travel_requests_values_check" CHECK ("advance_amount" >= 0 AND "ends_on" >= "starts_on"),
    CONSTRAINT "pur_travel_requests_decision_check" CHECK (
        "status" IN ('draft', 'in_approval') OR ("decided_by" IS NOT NULL AND "decided_at" IS NOT NULL)
    ),
    CONSTRAINT "pur_travel_requests_legalization_check" CHECK (("status" = 'legalized') = ("legalized_at" IS NOT NULL)),
    CONSTRAINT "pur_travel_requests_segregation_check" CHECK ("decided_by" IS NULL OR "decided_by" <> "traveler_id")
);

CREATE TABLE "pur_travel_expenses" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "travel_request_id" UUID NOT NULL,
    "concept" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "support_file_id" UUID NOT NULL,
    "request_key" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),
    CONSTRAINT "pur_travel_expenses_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "pur_travel_expenses_amount_check" CHECK ("amount" > 0)
);

CREATE UNIQUE INDEX "pur_requests_tenant_id_id_key" ON "pur_requests"("tenant_id", "id");
CREATE UNIQUE INDEX "pur_quotes_tenant_id_id_key" ON "pur_quotes"("tenant_id", "id");
CREATE UNIQUE INDEX "pur_orders_tenant_id_id_key" ON "pur_orders"("tenant_id", "id");
CREATE UNIQUE INDEX "pur_receipts_tenant_id_id_key" ON "pur_receipts"("tenant_id", "id");
CREATE UNIQUE INDEX "pur_supplier_evaluations_tenant_id_id_key" ON "pur_supplier_evaluations"("tenant_id", "id");
CREATE UNIQUE INDEX "pur_travel_requests_tenant_id_id_key" ON "pur_travel_requests"("tenant_id", "id");
CREATE UNIQUE INDEX "pur_travel_expenses_tenant_id_id_key" ON "pur_travel_expenses"("tenant_id", "id");
CREATE UNIQUE INDEX "pur_requests_tenant_id_code_key" ON "pur_requests"("tenant_id", "code");
CREATE UNIQUE INDEX "pur_requests_tenant_id_request_key_key" ON "pur_requests"("tenant_id", "request_key");
CREATE UNIQUE INDEX "pur_orders_tenant_id_code_key" ON "pur_orders"("tenant_id", "code");
CREATE UNIQUE INDEX "pur_receipts_tenant_id_request_key_key" ON "pur_receipts"("tenant_id", "request_key");
CREATE UNIQUE INDEX "pur_travel_requests_tenant_id_code_key" ON "pur_travel_requests"("tenant_id", "code");
CREATE UNIQUE INDEX "pur_travel_requests_tenant_id_request_key_key" ON "pur_travel_requests"("tenant_id", "request_key");
CREATE UNIQUE INDEX "pur_travel_expenses_tenant_id_request_key_key" ON "pur_travel_expenses"("tenant_id", "request_key");
CREATE INDEX "pur_requests_tenant_id_status_idx" ON "pur_requests"("tenant_id", "status");
CREATE INDEX "pur_requests_tenant_id_requester_id_idx" ON "pur_requests"("tenant_id", "requester_id");
CREATE INDEX "pur_quotes_tenant_id_request_id_idx" ON "pur_quotes"("tenant_id", "request_id");
CREATE INDEX "pur_orders_tenant_id_status_idx" ON "pur_orders"("tenant_id", "status");
CREATE INDEX "pur_receipts_tenant_id_order_id_idx" ON "pur_receipts"("tenant_id", "order_id");
CREATE INDEX "pur_supplier_evaluations_tenant_id_supplier_id_idx" ON "pur_supplier_evaluations"("tenant_id", "supplier_id");
CREATE INDEX "pur_travel_requests_tenant_id_status_idx" ON "pur_travel_requests"("tenant_id", "status");
CREATE INDEX "pur_travel_requests_tenant_id_traveler_id_idx" ON "pur_travel_requests"("tenant_id", "traveler_id");
CREATE INDEX "pur_travel_expenses_tenant_id_travel_request_id_idx" ON "pur_travel_expenses"("tenant_id", "travel_request_id");
-- Una cotización vigente por proveedor en cada solicitud.
CREATE UNIQUE INDEX "pur_quotes_one_per_supplier" ON "pur_quotes"("tenant_id", "request_id", "supplier_id")
    WHERE "deleted_at" IS NULL;
-- Una sola cotización elegida por solicitud: la del cuadro comparativo.
CREATE UNIQUE INDEX "pur_quotes_one_selected" ON "pur_quotes"("tenant_id", "request_id")
    WHERE "selected" AND "deleted_at" IS NULL;
-- Una orden vigente por solicitud.
CREATE UNIQUE INDEX "pur_orders_one_per_request" ON "pur_orders"("tenant_id", "request_id")
    WHERE "deleted_at" IS NULL;
-- Una recepción conforme por orden; las novedades (no conformes) pueden ser varias.
CREATE UNIQUE INDEX "pur_receipts_one_conforming" ON "pur_receipts"("tenant_id", "order_id")
    WHERE "conforming" AND "deleted_at" IS NULL;
-- Una evaluación por proveedor, tipo y periodo.
CREATE UNIQUE INDEX "pur_supplier_evaluations_one_per_period" ON "pur_supplier_evaluations"("tenant_id", "supplier_id", "kind", "period")
    WHERE "deleted_at" IS NULL;

ALTER TABLE "pur_requests" ADD CONSTRAINT "pur_requests_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pur_quotes" ADD CONSTRAINT "pur_quotes_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pur_orders" ADD CONSTRAINT "pur_orders_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pur_receipts" ADD CONSTRAINT "pur_receipts_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pur_supplier_evaluations" ADD CONSTRAINT "pur_supplier_evaluations_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pur_travel_requests" ADD CONSTRAINT "pur_travel_requests_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pur_travel_expenses" ADD CONSTRAINT "pur_travel_expenses_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pur_quotes" ADD CONSTRAINT "pur_quotes_tenant_id_request_id_fkey"
    FOREIGN KEY ("tenant_id", "request_id") REFERENCES "pur_requests"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pur_orders" ADD CONSTRAINT "pur_orders_tenant_id_request_id_fkey"
    FOREIGN KEY ("tenant_id", "request_id") REFERENCES "pur_requests"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pur_receipts" ADD CONSTRAINT "pur_receipts_tenant_id_order_id_fkey"
    FOREIGN KEY ("tenant_id", "order_id") REFERENCES "pur_orders"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pur_travel_expenses" ADD CONSTRAINT "pur_travel_expenses_tenant_id_travel_request_id_fkey"
    FOREIGN KEY ("tenant_id", "travel_request_id") REFERENCES "pur_travel_requests"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TRIGGER "pur_requests_control_columns" BEFORE INSERT OR UPDATE ON "pur_requests"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();
CREATE TRIGGER "pur_quotes_control_columns" BEFORE INSERT OR UPDATE ON "pur_quotes"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();
CREATE TRIGGER "pur_orders_control_columns" BEFORE INSERT OR UPDATE ON "pur_orders"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();
CREATE TRIGGER "pur_receipts_control_columns" BEFORE INSERT OR UPDATE ON "pur_receipts"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();
CREATE TRIGGER "pur_supplier_evaluations_control_columns" BEFORE INSERT OR UPDATE ON "pur_supplier_evaluations"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();
CREATE TRIGGER "pur_travel_requests_control_columns" BEFORE INSERT OR UPDATE ON "pur_travel_requests"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();
CREATE TRIGGER "pur_travel_expenses_control_columns" BEFORE INSERT OR UPDATE ON "pur_travel_expenses"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();

ALTER TABLE "pur_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "pur_requests" FORCE ROW LEVEL SECURITY;
CREATE POLICY "pur_requests_tenant_isolation" ON "pur_requests"
    USING ("tenant_id" = core_current_tenant_id()) WITH CHECK ("tenant_id" = core_current_tenant_id());
ALTER TABLE "pur_quotes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "pur_quotes" FORCE ROW LEVEL SECURITY;
CREATE POLICY "pur_quotes_tenant_isolation" ON "pur_quotes"
    USING ("tenant_id" = core_current_tenant_id()) WITH CHECK ("tenant_id" = core_current_tenant_id());
ALTER TABLE "pur_orders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "pur_orders" FORCE ROW LEVEL SECURITY;
CREATE POLICY "pur_orders_tenant_isolation" ON "pur_orders"
    USING ("tenant_id" = core_current_tenant_id()) WITH CHECK ("tenant_id" = core_current_tenant_id());
ALTER TABLE "pur_receipts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "pur_receipts" FORCE ROW LEVEL SECURITY;
CREATE POLICY "pur_receipts_tenant_isolation" ON "pur_receipts"
    USING ("tenant_id" = core_current_tenant_id()) WITH CHECK ("tenant_id" = core_current_tenant_id());
ALTER TABLE "pur_supplier_evaluations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "pur_supplier_evaluations" FORCE ROW LEVEL SECURITY;
CREATE POLICY "pur_supplier_evaluations_tenant_isolation" ON "pur_supplier_evaluations"
    USING ("tenant_id" = core_current_tenant_id()) WITH CHECK ("tenant_id" = core_current_tenant_id());
ALTER TABLE "pur_travel_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "pur_travel_requests" FORCE ROW LEVEL SECURITY;
CREATE POLICY "pur_travel_requests_tenant_isolation" ON "pur_travel_requests"
    USING ("tenant_id" = core_current_tenant_id()) WITH CHECK ("tenant_id" = core_current_tenant_id());
ALTER TABLE "pur_travel_expenses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "pur_travel_expenses" FORCE ROW LEVEL SECURITY;
CREATE POLICY "pur_travel_expenses_tenant_isolation" ON "pur_travel_expenses"
    USING ("tenant_id" = core_current_tenant_id()) WITH CHECK ("tenant_id" = core_current_tenant_id());

GRANT SELECT, INSERT, UPDATE ON "pur_requests" TO app_user;
GRANT SELECT, INSERT, UPDATE ON "pur_quotes" TO app_user;
GRANT SELECT, INSERT, UPDATE ON "pur_orders" TO app_user;
GRANT SELECT, INSERT ON "pur_receipts" TO app_user;
GRANT SELECT, INSERT ON "pur_supplier_evaluations" TO app_user;
GRANT SELECT, INSERT, UPDATE ON "pur_travel_requests" TO app_user;
GRANT SELECT, INSERT, UPDATE ON "pur_travel_expenses" TO app_user;
