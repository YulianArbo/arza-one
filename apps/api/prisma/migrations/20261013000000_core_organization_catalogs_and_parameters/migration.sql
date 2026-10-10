-- B12: sedes, procesos y áreas, cargos, centros de costo, catálogos, consecutivos, parámetros
-- con vigencia y festivos. Ficha 17.1, capítulo 12.3, ADR-007 y ADR-021.

-- CreateTable
CREATE TABLE "core_sites" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "is_main" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "core_sites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core_org_units" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "parent_id" UUID,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "owner_position_id" UUID,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "core_org_units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core_positions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "org_unit_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "reports_to_id" UUID,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "core_positions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core_cost_centers" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "org_unit_id" UUID,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "core_cost_centers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core_catalogs" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "core_catalogs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core_catalog_items" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "catalog_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "core_catalog_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core_sequences" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "next_value" INTEGER NOT NULL DEFAULT 1,
    "padding" INTEGER NOT NULL DEFAULT 4,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "core_sequences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core_parameters" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "valid_from" DATE NOT NULL,
    "valid_to" DATE,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "core_parameters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core_holidays" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "holiday_date" DATE NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "core_holidays_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "core_sites_tenant_id_idx" ON "core_sites"("tenant_id");

-- CreateIndex
CREATE INDEX "core_org_units_tenant_id_parent_id_idx" ON "core_org_units"("tenant_id", "parent_id");

-- CreateIndex
CREATE INDEX "core_org_units_tenant_id_owner_position_id_idx" ON "core_org_units"("tenant_id", "owner_position_id");

-- CreateIndex
CREATE UNIQUE INDEX "core_org_units_tenant_id_id_key" ON "core_org_units"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "core_org_units_tenant_id_code_key" ON "core_org_units"("tenant_id", "code");

-- CreateIndex
CREATE INDEX "core_positions_tenant_id_org_unit_id_idx" ON "core_positions"("tenant_id", "org_unit_id");

-- CreateIndex
CREATE INDEX "core_positions_tenant_id_reports_to_id_idx" ON "core_positions"("tenant_id", "reports_to_id");

-- CreateIndex
CREATE UNIQUE INDEX "core_positions_tenant_id_id_key" ON "core_positions"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "core_cost_centers_tenant_id_org_unit_id_idx" ON "core_cost_centers"("tenant_id", "org_unit_id");

-- CreateIndex
CREATE UNIQUE INDEX "core_cost_centers_tenant_id_code_key" ON "core_cost_centers"("tenant_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "core_catalogs_tenant_id_id_key" ON "core_catalogs"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "core_catalogs_tenant_id_key_key" ON "core_catalogs"("tenant_id", "key");

-- CreateIndex
CREATE INDEX "core_catalog_items_tenant_id_catalog_id_idx" ON "core_catalog_items"("tenant_id", "catalog_id");

-- CreateIndex
CREATE UNIQUE INDEX "core_catalog_items_catalog_id_code_key" ON "core_catalog_items"("catalog_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "core_sequences_tenant_id_key_year_key" ON "core_sequences"("tenant_id", "key", "year");

-- CreateIndex
CREATE UNIQUE INDEX "core_parameters_tenant_id_key_valid_from_key" ON "core_parameters"("tenant_id", "key", "valid_from");

-- CreateIndex
CREATE UNIQUE INDEX "core_holidays_tenant_id_holiday_date_key" ON "core_holidays"("tenant_id", "holiday_date");

-- CreateIndex
CREATE INDEX "iam_users_tenant_id_position_id_idx" ON "iam_users"("tenant_id", "position_id");

-- AddForeignKey
ALTER TABLE "iam_users" ADD CONSTRAINT "iam_users_tenant_id_position_id_fkey" FOREIGN KEY ("tenant_id", "position_id") REFERENCES "core_positions"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core_sites" ADD CONSTRAINT "core_sites_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core_org_units" ADD CONSTRAINT "core_org_units_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core_org_units" ADD CONSTRAINT "core_org_units_tenant_id_parent_id_fkey" FOREIGN KEY ("tenant_id", "parent_id") REFERENCES "core_org_units"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core_org_units" ADD CONSTRAINT "core_org_units_tenant_id_owner_position_id_fkey" FOREIGN KEY ("tenant_id", "owner_position_id") REFERENCES "core_positions"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core_positions" ADD CONSTRAINT "core_positions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core_positions" ADD CONSTRAINT "core_positions_tenant_id_org_unit_id_fkey" FOREIGN KEY ("tenant_id", "org_unit_id") REFERENCES "core_org_units"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core_positions" ADD CONSTRAINT "core_positions_tenant_id_reports_to_id_fkey" FOREIGN KEY ("tenant_id", "reports_to_id") REFERENCES "core_positions"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core_cost_centers" ADD CONSTRAINT "core_cost_centers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core_cost_centers" ADD CONSTRAINT "core_cost_centers_tenant_id_org_unit_id_fkey" FOREIGN KEY ("tenant_id", "org_unit_id") REFERENCES "core_org_units"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core_catalogs" ADD CONSTRAINT "core_catalogs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core_catalog_items" ADD CONSTRAINT "core_catalog_items_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core_catalog_items" ADD CONSTRAINT "core_catalog_items_tenant_id_catalog_id_fkey" FOREIGN KEY ("tenant_id", "catalog_id") REFERENCES "core_catalogs"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core_sequences" ADD CONSTRAINT "core_sequences_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core_parameters" ADD CONSTRAINT "core_parameters_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core_holidays" ADD CONSTRAINT "core_holidays_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Reglas de los datos -------------------------------------------------------------------------

ALTER TABLE "core_sites"
    ADD CONSTRAINT "core_sites_name_check" CHECK (char_length(btrim("name")) BETWEEN 2 AND 120),
    ADD CONSTRAINT "core_sites_city_check" CHECK (char_length(btrim("city")) BETWEEN 2 AND 120),
    ADD CONSTRAINT "core_sites_address_check" CHECK (char_length(btrim("address")) BETWEEN 5 AND 200),
    ADD CONSTRAINT "core_sites_version_check" CHECK ("version" > 0);

ALTER TABLE "core_org_units"
    ADD CONSTRAINT "core_org_units_code_check" CHECK ("code" ~ '^[A-Z0-9][A-Z0-9-]{0,19}$'),
    ADD CONSTRAINT "core_org_units_name_check" CHECK (char_length(btrim("name")) BETWEEN 2 AND 120),
    ADD CONSTRAINT "core_org_units_kind_check" CHECK ("kind" IN ('process', 'area')),
    ADD CONSTRAINT "core_org_units_parent_check" CHECK ("parent_id" IS NULL OR "parent_id" <> "id"),
    ADD CONSTRAINT "core_org_units_version_check" CHECK ("version" > 0);

ALTER TABLE "core_positions"
    ADD CONSTRAINT "core_positions_name_check" CHECK (char_length(btrim("name")) BETWEEN 2 AND 120),
    ADD CONSTRAINT "core_positions_reports_to_check" CHECK ("reports_to_id" IS NULL OR "reports_to_id" <> "id"),
    ADD CONSTRAINT "core_positions_version_check" CHECK ("version" > 0);

ALTER TABLE "core_cost_centers"
    ADD CONSTRAINT "core_cost_centers_code_check" CHECK ("code" ~ '^[A-Z0-9][A-Z0-9-]{0,19}$'),
    ADD CONSTRAINT "core_cost_centers_name_check" CHECK (char_length(btrim("name")) BETWEEN 2 AND 120),
    ADD CONSTRAINT "core_cost_centers_version_check" CHECK ("version" > 0);

ALTER TABLE "core_catalogs"
    ADD CONSTRAINT "core_catalogs_key_check" CHECK ("key" ~ '^[a-z][a-z0-9_]{1,59}$'),
    ADD CONSTRAINT "core_catalogs_name_check" CHECK (char_length(btrim("name")) BETWEEN 2 AND 120),
    ADD CONSTRAINT "core_catalogs_version_check" CHECK ("version" > 0);

ALTER TABLE "core_catalog_items"
    ADD CONSTRAINT "core_catalog_items_code_check" CHECK ("code" ~ '^[A-Z0-9][A-Z0-9_-]{0,19}$'),
    ADD CONSTRAINT "core_catalog_items_label_check" CHECK (char_length(btrim("label")) BETWEEN 2 AND 120),
    ADD CONSTRAINT "core_catalog_items_sort_order_check" CHECK ("sort_order" BETWEEN 0 AND 9999),
    ADD CONSTRAINT "core_catalog_items_version_check" CHECK ("version" > 0);

-- El código PREFIJO-AAAA-NNNN (ADR-021): el número empieza en 1 y solo sube.
ALTER TABLE "core_sequences"
    ADD CONSTRAINT "core_sequences_key_check" CHECK ("key" ~ '^[a-z][a-z0-9_]*(\.[a-z0-9_]+)*$' AND char_length("key") <= 60),
    ADD CONSTRAINT "core_sequences_name_check" CHECK (char_length(btrim("name")) BETWEEN 2 AND 120),
    ADD CONSTRAINT "core_sequences_prefix_check" CHECK ("prefix" ~ '^[A-Z]{2,6}$'),
    ADD CONSTRAINT "core_sequences_year_check" CHECK ("year" BETWEEN 2000 AND 2100),
    ADD CONSTRAINT "core_sequences_next_value_check" CHECK ("next_value" >= 1),
    ADD CONSTRAINT "core_sequences_padding_check" CHECK ("padding" BETWEEN 3 AND 8),
    ADD CONSTRAINT "core_sequences_version_check" CHECK ("version" > 0);

ALTER TABLE "core_parameters"
    ADD CONSTRAINT "core_parameters_key_check" CHECK ("key" ~ '^[a-z]+(\.[a-z_]+)+$'),
    ADD CONSTRAINT "core_parameters_value_check" CHECK (jsonb_typeof("value") = 'object'),
    ADD CONSTRAINT "core_parameters_validity_check" CHECK ("valid_to" IS NULL OR "valid_to" >= "valid_from"),
    ADD CONSTRAINT "core_parameters_version_check" CHECK ("version" > 0);

ALTER TABLE "core_holidays"
    ADD CONSTRAINT "core_holidays_name_check" CHECK (char_length(btrim("name")) BETWEEN 2 AND 120),
    ADD CONSTRAINT "core_holidays_version_check" CHECK ("version" > 0);

-- Un parámetro nunca se sobrescribe (ficha 17.1): de una vigencia solo se puede fijar su fin,
-- una vez, y nunca se retira. Lo garantiza la base de datos, no solo la API.
CREATE FUNCTION "core_parameters_keep_history"() RETURNS TRIGGER
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF NEW.key <> OLD.key OR NEW.value <> OLD.value OR NEW.valid_from <> OLD.valid_from
        OR OLD.valid_to IS NOT NULL OR NEW.deleted_at IS NOT NULL THEN
        RAISE EXCEPTION 'Una vigencia de un parámetro no se modifica: cree una nueva'
            USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "core_parameters_keep_history"
    BEFORE UPDATE ON "core_parameters"
    FOR EACH ROW EXECUTE FUNCTION "core_parameters_keep_history"();

-- Columnas de control --------------------------------------------------------------------------

CREATE TRIGGER "core_sites_control_columns"
    BEFORE INSERT OR UPDATE ON "core_sites"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();

CREATE TRIGGER "core_org_units_control_columns"
    BEFORE INSERT OR UPDATE ON "core_org_units"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();

CREATE TRIGGER "core_positions_control_columns"
    BEFORE INSERT OR UPDATE ON "core_positions"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();

CREATE TRIGGER "core_cost_centers_control_columns"
    BEFORE INSERT OR UPDATE ON "core_cost_centers"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();

CREATE TRIGGER "core_catalogs_control_columns"
    BEFORE INSERT OR UPDATE ON "core_catalogs"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();

CREATE TRIGGER "core_catalog_items_control_columns"
    BEFORE INSERT OR UPDATE ON "core_catalog_items"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();

CREATE TRIGGER "core_sequences_control_columns"
    BEFORE INSERT OR UPDATE ON "core_sequences"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();

CREATE TRIGGER "core_parameters_control_columns"
    BEFORE INSERT OR UPDATE ON "core_parameters"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();

CREATE TRIGGER "core_holidays_control_columns"
    BEFORE INSERT OR UPDATE ON "core_holidays"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();

-- Seguridad por fila (ADR-007) -----------------------------------------------------------------

ALTER TABLE "core_sites" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "core_sites" FORCE ROW LEVEL SECURITY;
CREATE POLICY "core_sites_tenant_isolation" ON "core_sites"
    USING ("tenant_id" = core_current_tenant_id())
    WITH CHECK ("tenant_id" = core_current_tenant_id());

ALTER TABLE "core_org_units" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "core_org_units" FORCE ROW LEVEL SECURITY;
CREATE POLICY "core_org_units_tenant_isolation" ON "core_org_units"
    USING ("tenant_id" = core_current_tenant_id())
    WITH CHECK ("tenant_id" = core_current_tenant_id());

ALTER TABLE "core_positions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "core_positions" FORCE ROW LEVEL SECURITY;
CREATE POLICY "core_positions_tenant_isolation" ON "core_positions"
    USING ("tenant_id" = core_current_tenant_id())
    WITH CHECK ("tenant_id" = core_current_tenant_id());

ALTER TABLE "core_cost_centers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "core_cost_centers" FORCE ROW LEVEL SECURITY;
CREATE POLICY "core_cost_centers_tenant_isolation" ON "core_cost_centers"
    USING ("tenant_id" = core_current_tenant_id())
    WITH CHECK ("tenant_id" = core_current_tenant_id());

ALTER TABLE "core_catalogs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "core_catalogs" FORCE ROW LEVEL SECURITY;
CREATE POLICY "core_catalogs_tenant_isolation" ON "core_catalogs"
    USING ("tenant_id" = core_current_tenant_id())
    WITH CHECK ("tenant_id" = core_current_tenant_id());

ALTER TABLE "core_catalog_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "core_catalog_items" FORCE ROW LEVEL SECURITY;
CREATE POLICY "core_catalog_items_tenant_isolation" ON "core_catalog_items"
    USING ("tenant_id" = core_current_tenant_id())
    WITH CHECK ("tenant_id" = core_current_tenant_id());

ALTER TABLE "core_sequences" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "core_sequences" FORCE ROW LEVEL SECURITY;
CREATE POLICY "core_sequences_tenant_isolation" ON "core_sequences"
    USING ("tenant_id" = core_current_tenant_id())
    WITH CHECK ("tenant_id" = core_current_tenant_id());

ALTER TABLE "core_parameters" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "core_parameters" FORCE ROW LEVEL SECURITY;
CREATE POLICY "core_parameters_tenant_isolation" ON "core_parameters"
    USING ("tenant_id" = core_current_tenant_id())
    WITH CHECK ("tenant_id" = core_current_tenant_id());

ALTER TABLE "core_holidays" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "core_holidays" FORCE ROW LEVEL SECURITY;
CREATE POLICY "core_holidays_tenant_isolation" ON "core_holidays"
    USING ("tenant_id" = core_current_tenant_id())
    WITH CHECK ("tenant_id" = core_current_tenant_id());

-- Permisos de la API ---------------------------------------------------------------------------
-- Sin DELETE: el borrado es lógico (deleted_at).

GRANT SELECT, INSERT, UPDATE ON "core_sites" TO app_user;
GRANT SELECT, INSERT, UPDATE ON "core_org_units" TO app_user;
GRANT SELECT, INSERT, UPDATE ON "core_positions" TO app_user;
GRANT SELECT, INSERT, UPDATE ON "core_cost_centers" TO app_user;
GRANT SELECT, INSERT, UPDATE ON "core_catalogs" TO app_user;
GRANT SELECT, INSERT, UPDATE ON "core_catalog_items" TO app_user;
GRANT SELECT, INSERT, UPDATE ON "core_sequences" TO app_user;
GRANT SELECT, INSERT, UPDATE ON "core_parameters" TO app_user;
GRANT SELECT, INSERT, UPDATE ON "core_holidays" TO app_user;
