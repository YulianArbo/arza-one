-- B34: activos (M11, ficha 17.12). Inventario de activos fijos y licencias (ast_assets),
-- asignación en comodato (ast_assignments) y mantenimientos (ast_maintenance). Un activo solo
-- queda «asignado» con su contrato de comodato firmado: además de la API, lo impiden una
-- restricción y un disparador. La firma electrónica (sig_envelopes) firma también comodatos.
-- Solo expande: la versión anterior sigue funcionando con estas tablas y restricciones.

CREATE TABLE "ast_assets" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "serial" TEXT,
    "purchase_date" DATE NOT NULL,
    "cost" DECIMAL(18,2) NOT NULL,
    "useful_life_months" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'available',
    "location" TEXT,
    "retired_on" DATE,
    "retire_reason" TEXT,
    "retire_note" TEXT,
    "retired_by" UUID,
    "request_key" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),
    CONSTRAINT "ast_assets_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ast_assets_code_check" CHECK ("code" ~ '^ACT-[0-9]{4}-[0-9]{4,8}$'),
    CONSTRAINT "ast_assets_category_check" CHECK ("category" IN ('computer', 'peripheral', 'furniture', 'software_license', 'other')),
    CONSTRAINT "ast_assets_status_check" CHECK ("status" IN ('available', 'reserved', 'assigned', 'retired')),
    CONSTRAINT "ast_assets_values_check" CHECK ("cost" >= 0 AND "useful_life_months" BETWEEN 1 AND 600),
    CONSTRAINT "ast_assets_retire_reason_check" CHECK ("retire_reason" IS NULL OR "retire_reason" IN ('damage', 'obsolescence', 'loss', 'sale', 'donation')),
    CONSTRAINT "ast_assets_retirement_check" CHECK (
        ("status" = 'retired') = ("retired_on" IS NOT NULL)
        AND ("status" <> 'retired' OR ("retire_reason" IS NOT NULL AND "retire_note" IS NOT NULL AND "retired_by" IS NOT NULL))
        AND ("retired_on" IS NULL OR "retired_on" >= "purchase_date")
    )
);

CREATE TABLE "ast_assignments" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "asset_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "signer_party_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'preparing',
    "assigned_on" DATE NOT NULL,
    "sign_by" DATE NOT NULL,
    "message" TEXT,
    "form_record_id" UUID,
    "record_code" TEXT,
    "envelope_id" UUID,
    "envelope_code" TEXT,
    "contract_document_id" UUID,
    "assigned_by" UUID NOT NULL,
    "activated_at" TIMESTAMPTZ(6),
    "returned_on" DATE,
    "return_note" TEXT,
    "returned_by" UUID,
    "closed_reason" TEXT,
    "request_key" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),
    CONSTRAINT "ast_assignments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ast_assignments_status_check" CHECK ("status" IN ('preparing', 'in_signature', 'active', 'returned', 'cancelled')),
    -- Regla de la ficha 17.12: vigente (o ya devuelta) solo con su comodato firmado.
    CONSTRAINT "ast_assignments_signed_loan_check" CHECK (
        "status" NOT IN ('active', 'returned')
        OR ("contract_document_id" IS NOT NULL AND "envelope_id" IS NOT NULL AND "activated_at" IS NOT NULL)
    ),
    CONSTRAINT "ast_assignments_signature_check" CHECK ("status" <> 'in_signature' OR "envelope_id" IS NOT NULL),
    CONSTRAINT "ast_assignments_return_check" CHECK (
        ("status" = 'returned') = ("returned_on" IS NOT NULL)
        AND ("status" <> 'returned' OR ("return_note" IS NOT NULL AND "returned_by" IS NOT NULL AND "returned_on" >= "assigned_on"))
    ),
    CONSTRAINT "ast_assignments_cancellation_check" CHECK ("status" <> 'cancelled' OR "closed_reason" IS NOT NULL)
);

CREATE TABLE "ast_maintenance" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "asset_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "scheduled_on" DATE NOT NULL,
    "done_on" DATE,
    "cost" DECIMAL(18,2),
    "note" TEXT,
    "request_key" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),
    CONSTRAINT "ast_maintenance_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ast_maintenance_kind_check" CHECK ("kind" IN ('preventive', 'corrective')),
    CONSTRAINT "ast_maintenance_done_check" CHECK (
        ("done_on" IS NULL) = ("cost" IS NULL) AND ("cost" IS NULL OR "cost" >= 0)
    )
);

CREATE UNIQUE INDEX "ast_assets_tenant_id_id_key" ON "ast_assets"("tenant_id", "id");
CREATE UNIQUE INDEX "ast_assignments_tenant_id_id_key" ON "ast_assignments"("tenant_id", "id");
CREATE UNIQUE INDEX "ast_maintenance_tenant_id_id_key" ON "ast_maintenance"("tenant_id", "id");
CREATE UNIQUE INDEX "ast_assets_tenant_id_code_key" ON "ast_assets"("tenant_id", "code");
CREATE UNIQUE INDEX "ast_assets_tenant_id_request_key_key" ON "ast_assets"("tenant_id", "request_key");
CREATE UNIQUE INDEX "ast_assignments_tenant_id_request_key_key" ON "ast_assignments"("tenant_id", "request_key");
CREATE UNIQUE INDEX "ast_maintenance_tenant_id_request_key_key" ON "ast_maintenance"("tenant_id", "request_key");
CREATE INDEX "ast_assets_tenant_id_status_idx" ON "ast_assets"("tenant_id", "status");
CREATE INDEX "ast_assignments_tenant_id_asset_id_idx" ON "ast_assignments"("tenant_id", "asset_id");
CREATE INDEX "ast_assignments_tenant_id_user_id_idx" ON "ast_assignments"("tenant_id", "user_id");
CREATE INDEX "ast_assignments_tenant_id_status_idx" ON "ast_assignments"("tenant_id", "status");
CREATE INDEX "ast_maintenance_tenant_id_asset_id_idx" ON "ast_maintenance"("tenant_id", "asset_id");
-- Una sola asignación abierta por activo: en preparación, en firma o vigente.
CREATE UNIQUE INDEX "ast_assignments_one_open" ON "ast_assignments"("tenant_id", "asset_id")
    WHERE "status" IN ('preparing', 'in_signature', 'active') AND "deleted_at" IS NULL;

ALTER TABLE "ast_assets" ADD CONSTRAINT "ast_assets_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ast_assignments" ADD CONSTRAINT "ast_assignments_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ast_maintenance" ADD CONSTRAINT "ast_maintenance_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ast_assignments" ADD CONSTRAINT "ast_assignments_tenant_id_asset_id_fkey"
    FOREIGN KEY ("tenant_id", "asset_id") REFERENCES "ast_assets"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ast_maintenance" ADD CONSTRAINT "ast_maintenance_tenant_id_asset_id_fkey"
    FOREIGN KEY ("tenant_id", "asset_id") REFERENCES "ast_assets"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TRIGGER "ast_assets_control_columns" BEFORE INSERT OR UPDATE ON "ast_assets"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();
CREATE TRIGGER "ast_assignments_control_columns" BEFORE INSERT OR UPDATE ON "ast_assignments"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();
CREATE TRIGGER "ast_maintenance_control_columns" BEFORE INSERT OR UPDATE ON "ast_maintenance"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();

-- Todo activo asignado tiene contrato de comodato firmado (ficha 17.12): el activo no pasa a
-- «asignado» sin una asignación vigente con su comodato firmado.
CREATE FUNCTION "ast_require_signed_loan"() RETURNS TRIGGER
    LANGUAGE plpgsql SET search_path = public
    AS $$
BEGIN
    IF NEW."status" = 'assigned' AND NOT EXISTS (
        SELECT 1 FROM "ast_assignments" a
        WHERE a."tenant_id" = NEW."tenant_id" AND a."asset_id" = NEW."id"
          AND a."status" = 'active' AND a."contract_document_id" IS NOT NULL
          AND a."deleted_at" IS NULL
    ) THEN
        RAISE EXCEPTION 'ast_assets: un activo asignado exige su comodato firmado'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "ast_assets_require_signed_loan" BEFORE INSERT OR UPDATE ON "ast_assets"
    FOR EACH ROW EXECUTE FUNCTION "ast_require_signed_loan"();

ALTER TABLE "ast_assets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ast_assets" FORCE ROW LEVEL SECURITY;
CREATE POLICY "ast_assets_tenant_isolation" ON "ast_assets"
    USING ("tenant_id" = core_current_tenant_id()) WITH CHECK ("tenant_id" = core_current_tenant_id());
ALTER TABLE "ast_assignments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ast_assignments" FORCE ROW LEVEL SECURITY;
CREATE POLICY "ast_assignments_tenant_isolation" ON "ast_assignments"
    USING ("tenant_id" = core_current_tenant_id()) WITH CHECK ("tenant_id" = core_current_tenant_id());
ALTER TABLE "ast_maintenance" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ast_maintenance" FORCE ROW LEVEL SECURITY;
CREATE POLICY "ast_maintenance_tenant_isolation" ON "ast_maintenance"
    USING ("tenant_id" = core_current_tenant_id()) WITH CHECK ("tenant_id" = core_current_tenant_id());

GRANT SELECT, INSERT, UPDATE ON "ast_assets" TO app_user;
GRANT SELECT, INSERT, UPDATE ON "ast_assignments" TO app_user;
GRANT SELECT, INSERT, UPDATE ON "ast_maintenance" TO app_user;

-- El worker recorre las empresas con comodatos por enviar a firma o por cerrar.
-- La función corre como dueña del esquema: lee las asignaciones de todas las empresas solo para
-- saber cuáles tienen trabajo (como prj_tenants_with_acceptances).
CREATE POLICY "ast_assignments_worker_lookup" ON "ast_assignments"
    FOR SELECT TO migration_user USING (true);

CREATE FUNCTION "ast_tenants_with_assignments"() RETURNS SETOF UUID
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
    AS $$ SELECT DISTINCT tenant_id FROM ast_assignments
          WHERE status IN ('preparing', 'in_signature') AND deleted_at IS NULL ORDER BY 1 $$;

REVOKE EXECUTE ON FUNCTION "ast_tenants_with_assignments"() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "ast_tenants_with_assignments"() TO app_user;

-- Firma electrónica: además del contrato, el otrosí y el acta de entrega, el contrato de comodato
-- de un activo. El módulo de Contratos guarda su identificador y la persona que firma; no lee las
-- tablas ast_.
ALTER TABLE "sig_envelopes" DROP CONSTRAINT "sig_envelopes_source_check";
ALTER TABLE "sig_envelopes"
    ADD CONSTRAINT "sig_envelopes_source_check" CHECK (
        ("source" = 'contract' AND "contract_id" IS NOT NULL AND "amendment_id" IS NULL
            AND "source_id" IS NULL)
        OR ("source" = 'amendment' AND "contract_id" IS NOT NULL AND "amendment_id" IS NOT NULL
            AND "source_id" IS NULL)
        OR ("source" IN ('acceptance', 'asset_loan') AND "contract_id" IS NULL
            AND "amendment_id" IS NULL AND "source_id" IS NOT NULL AND "party_id" IS NOT NULL));

CREATE UNIQUE INDEX "sig_envelopes_open_loan_key" ON "sig_envelopes"("tenant_id", "source_id")
    WHERE "status" IN ('draft', 'sent') AND "source" = 'asset_loan' AND "deleted_at" IS NULL;

-- Formatos digitales: el contrato de comodato CT-ADM-001 que la plataforma llena desde una
-- asignación se une a ella.
ALTER TABLE "doc_form_templates" DROP CONSTRAINT "doc_form_templates_entity_type_check";
ALTER TABLE "doc_form_templates"
    ADD CONSTRAINT "doc_form_templates_entity_type_check" CHECK (
        "entity_type" IS NULL OR "entity_type" IN ('doc_version', 'party', 'doc_change_request',
            'prj_acceptance', 'prj_code_review', 'ast_assignment'));
ALTER TABLE "doc_form_records" DROP CONSTRAINT "doc_form_records_entity_check";
ALTER TABLE "doc_form_records"
    ADD CONSTRAINT "doc_form_records_entity_check" CHECK (
        ("entity_type" IS NULL) = ("entity_id" IS NULL)
        AND ("entity_type" IS NULL OR "entity_type" IN ('doc_version', 'party', 'doc_change_request',
            'prj_acceptance', 'prj_code_review', 'ast_assignment')));
