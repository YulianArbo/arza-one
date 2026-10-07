-- B03: empresas, bandeja de salida, contexto de empresa y seguridad por fila.
-- Capítulo 12.1, numeral 13.2, ADR-006, ADR-007 y ADR-021.

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- Contexto de empresa y de usuario ------------------------------------------------------------
-- La API fija app.tenant_id y app.user_id con set_config(..., true) al iniciar cada transacción.
-- Sin contexto (o tras terminar la transacción, cuando PostgreSQL deja el valor vacío) las
-- funciones devuelven NULL, y ninguna política deja ver ni escribir filas.

CREATE FUNCTION "core_current_tenant_id"() RETURNS UUID
    LANGUAGE sql STABLE
    AS $$ SELECT NULLIF(current_setting('app.tenant_id', true), '')::uuid $$;

CREATE FUNCTION "core_current_user_id"() RETURNS UUID
    LANGUAGE sql STABLE
    AS $$ SELECT NULLIF(current_setting('app.user_id', true), '')::uuid $$;

-- Columnas de control (capítulo 12.1) -----------------------------------------------------------
-- La base de datos, no el código, fija quién y cuándo creó o modificó la fila y sube la versión
-- (bloqueo optimista). Lo que se envíe en esas columnas se ignora, así no se pueden falsificar.

CREATE FUNCTION "core_set_control_columns"() RETURNS TRIGGER
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        NEW.created_at := now();
        NEW.created_by := core_current_user_id();
        NEW.version := 1;
    ELSE
        IF NEW.id <> OLD.id THEN
            RAISE EXCEPTION 'El identificador de un registro no se puede cambiar'
                USING ERRCODE = 'integrity_constraint_violation';
        END IF;
        NEW.created_at := OLD.created_at;
        NEW.created_by := OLD.created_by;
        NEW.version := OLD.version + 1;
    END IF;
    NEW.updated_at := now();
    NEW.updated_by := core_current_user_id();
    RETURN NEW;
END;
$$;

-- CreateTable
CREATE TABLE "core_tenants" (
    "id" UUID NOT NULL,
    "legal_name" TEXT NOT NULL,
    "trade_name" TEXT,
    "tax_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "settings" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "core_tenants_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "core_tenants_legal_name_check" CHECK (length(btrim("legal_name")) > 0),
    CONSTRAINT "core_tenants_tax_id_check" CHECK (length(btrim("tax_id")) > 0),
    CONSTRAINT "core_tenants_status_check" CHECK ("status" IN ('active', 'suspended', 'closed')),
    CONSTRAINT "core_tenants_settings_check" CHECK (jsonb_typeof("settings") = 'object'),
    CONSTRAINT "core_tenants_version_check" CHECK ("version" > 0)
);

-- CreateTable
CREATE TABLE "core_outbox_events" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "event_type" TEXT NOT NULL,
    "schema_version" INTEGER NOT NULL DEFAULT 1,
    "payload" JSONB NOT NULL,
    "actor_id" UUID,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_at" TIMESTAMPTZ(6),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "core_outbox_events_pkey" PRIMARY KEY ("id"),
    -- Nombres de evento como los del numeral 13.3: «contract.approved», «document.version.approved».
    CONSTRAINT "core_outbox_events_event_type_check" CHECK ("event_type" ~ '^[a-z]+(\.[a-z]+)+$'),
    CONSTRAINT "core_outbox_events_schema_version_check" CHECK ("schema_version" > 0),
    CONSTRAINT "core_outbox_events_payload_check" CHECK (jsonb_typeof("payload") = 'object'),
    CONSTRAINT "core_outbox_events_attempts_check" CHECK ("attempts" >= 0),
    CONSTRAINT "core_outbox_events_version_check" CHECK ("version" > 0)
);

-- CreateIndex
CREATE UNIQUE INDEX "core_tenants_tax_id_key" ON "core_tenants"("tax_id");

-- CreateIndex
CREATE INDEX "core_outbox_events_tenant_id_occurred_at_idx" ON "core_outbox_events"("tenant_id", "occurred_at");

-- AddForeignKey
ALTER TABLE "core_outbox_events" ADD CONSTRAINT "core_outbox_events_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Columnas de control --------------------------------------------------------------------------

CREATE TRIGGER "core_tenants_control_columns"
    BEFORE INSERT OR UPDATE ON "core_tenants"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();

CREATE TRIGGER "core_outbox_events_control_columns"
    BEFORE INSERT OR UPDATE ON "core_outbox_events"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();

-- Seguridad por fila (ADR-007) -----------------------------------------------------------------
-- FORCE aplica las políticas también al dueño de la tabla. USING filtra lo que se lee, modifica
-- o borra; WITH CHECK impide escribir una fila de otra empresa.

ALTER TABLE "core_tenants" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "core_tenants" FORCE ROW LEVEL SECURITY;
CREATE POLICY "core_tenants_tenant_isolation" ON "core_tenants"
    USING ("id" = core_current_tenant_id())
    WITH CHECK ("id" = core_current_tenant_id());

ALTER TABLE "core_outbox_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "core_outbox_events" FORCE ROW LEVEL SECURITY;
CREATE POLICY "core_outbox_events_tenant_isolation" ON "core_outbox_events"
    USING ("tenant_id" = core_current_tenant_id())
    WITH CHECK ("tenant_id" = core_current_tenant_id());

-- Permisos de la API ---------------------------------------------------------------------------
-- Sin DELETE: el borrado es lógico (deleted_at). Cada migración concede solo lo que necesita.

GRANT SELECT, INSERT, UPDATE ON "core_tenants" TO app_user;
GRANT SELECT, INSERT, UPDATE ON "core_outbox_events" TO app_user;
