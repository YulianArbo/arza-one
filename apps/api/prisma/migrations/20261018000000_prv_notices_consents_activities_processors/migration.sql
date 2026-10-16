-- B17: privacidad (M18, ficha 17.19). Avisos y políticas versionados, autorizaciones de
-- tratamiento con la versión exacta aceptada, registro de actividades de tratamiento y encargados.
-- Las autorizaciones que Terceros (B13) guardaba en tres campos pasan a prv_consents.

-- CreateTable
CREATE TABLE "prv_notices" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "version_number" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "purposes" TEXT[],
    "status" TEXT NOT NULL DEFAULT 'draft',
    "effective_from" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "prv_notices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prv_consents" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "party_id" UUID NOT NULL,
    "notice_id" UUID NOT NULL,
    "purposes" TEXT[],
    "channel" TEXT NOT NULL,
    "granted_on" DATE NOT NULL,
    "source" TEXT NOT NULL,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "evidence_file_id" UUID,
    "revoked_at" TIMESTAMPTZ(6),
    "revoked_by" UUID,
    "revocation_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "prv_consents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prv_processing_activities" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "data_categories" TEXT[],
    "holder_types" TEXT[],
    "legal_basis" TEXT NOT NULL,
    "retention" TEXT NOT NULL,
    "international_transfers" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "prv_processing_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prv_processors" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "party_id" UUID NOT NULL,
    "service" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "contract_file_id" UUID,
    "review_on" DATE NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "prv_processors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prv_activity_processors" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "activity_id" UUID NOT NULL,
    "processor_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "prv_activity_processors_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "prv_notices_tenant_id_key_status_idx" ON "prv_notices"("tenant_id", "key", "status");

-- CreateIndex
CREATE UNIQUE INDEX "prv_notices_tenant_id_id_key" ON "prv_notices"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "prv_notices_tenant_id_key_version_number_key" ON "prv_notices"("tenant_id", "key", "version_number");

-- CreateIndex
CREATE INDEX "prv_consents_tenant_id_party_id_idx" ON "prv_consents"("tenant_id", "party_id");

-- CreateIndex
CREATE INDEX "prv_consents_tenant_id_notice_id_idx" ON "prv_consents"("tenant_id", "notice_id");

-- CreateIndex
CREATE INDEX "prv_consents_tenant_id_created_at_idx" ON "prv_consents"("tenant_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "prv_consents_tenant_id_id_key" ON "prv_consents"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "prv_processing_activities_tenant_id_id_key" ON "prv_processing_activities"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "prv_processors_tenant_id_party_id_idx" ON "prv_processors"("tenant_id", "party_id");

-- CreateIndex
CREATE UNIQUE INDEX "prv_processors_tenant_id_id_key" ON "prv_processors"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "prv_activity_processors_tenant_id_processor_id_idx" ON "prv_activity_processors"("tenant_id", "processor_id");

-- CreateIndex
CREATE UNIQUE INDEX "prv_activity_processors_tenant_id_id_key" ON "prv_activity_processors"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "prv_activity_processors_tenant_id_activity_id_processor_id_key" ON "prv_activity_processors"("tenant_id", "activity_id", "processor_id");

-- AddForeignKey
ALTER TABLE "prv_notices" ADD CONSTRAINT "prv_notices_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prv_consents" ADD CONSTRAINT "prv_consents_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prv_consents" ADD CONSTRAINT "prv_consents_tenant_id_notice_id_fkey" FOREIGN KEY ("tenant_id", "notice_id") REFERENCES "prv_notices"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prv_processing_activities" ADD CONSTRAINT "prv_processing_activities_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prv_processors" ADD CONSTRAINT "prv_processors_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prv_activity_processors" ADD CONSTRAINT "prv_activity_processors_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prv_activity_processors" ADD CONSTRAINT "prv_activity_processors_tenant_id_activity_id_fkey" FOREIGN KEY ("tenant_id", "activity_id") REFERENCES "prv_processing_activities"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prv_activity_processors" ADD CONSTRAINT "prv_activity_processors_tenant_id_processor_id_fkey" FOREIGN KEY ("tenant_id", "processor_id") REFERENCES "prv_processors"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;



-- Reglas de los datos -------------------------------------------------------------------------
-- Los valores permitidos son los de packages/contracts/src/privacy.

ALTER TABLE "prv_notices"
    ADD CONSTRAINT "prv_notices_key_check" CHECK ("key" IN (
        'privacy_policy', 'privacy_notice', 'authorization_customer', 'authorization_supplier',
        'authorization_employee', 'authorization_candidate', 'authorization_contact',
        'authorization_prior')),
    ADD CONSTRAINT "prv_notices_status_check" CHECK ("status" IN ('draft', 'published', 'replaced')),
    ADD CONSTRAINT "prv_notices_version_number_check" CHECK ("version_number" >= 1),
    ADD CONSTRAINT "prv_notices_title_check" CHECK (char_length(btrim("title")) BETWEEN 3 AND 200),
    ADD CONSTRAINT "prv_notices_body_check" CHECK (char_length(btrim("body")) BETWEEN 50 AND 20000),
    ADD CONSTRAINT "prv_notices_purposes_check" CHECK (cardinality("purposes") <= 20),
    ADD CONSTRAINT "prv_notices_effective_check" CHECK (("status" = 'draft') = ("effective_from" IS NULL)),
    ADD CONSTRAINT "prv_notices_version_check" CHECK ("version" > 0);

ALTER TABLE "prv_consents"
    ADD CONSTRAINT "prv_consents_channel_check" CHECK ("channel" IN ('written', 'digital', 'verbal', 'contract')),
    ADD CONSTRAINT "prv_consents_source_check" CHECK ("source" IN ('party_create', 'party_consent', 'prior_record')),
    ADD CONSTRAINT "prv_consents_purposes_check" CHECK (cardinality("purposes") BETWEEN 1 AND 20),
    ADD CONSTRAINT "prv_consents_revocation_check" CHECK (
        ("revoked_at" IS NULL AND "revoked_by" IS NULL AND "revocation_reason" IS NULL)
        OR ("revoked_at" IS NOT NULL AND "revoked_by" IS NOT NULL
            AND char_length(btrim("revocation_reason")) BETWEEN 5 AND 500)),
    ADD CONSTRAINT "prv_consents_version_check" CHECK ("version" > 0);

ALTER TABLE "prv_processing_activities"
    ADD CONSTRAINT "prv_processing_activities_name_check" CHECK (char_length(btrim("name")) BETWEEN 3 AND 150),
    ADD CONSTRAINT "prv_processing_activities_purpose_check" CHECK (char_length(btrim("purpose")) BETWEEN 10 AND 1000),
    ADD CONSTRAINT "prv_processing_activities_categories_check" CHECK (
        cardinality("data_categories") BETWEEN 1 AND 10
        AND "data_categories" <@ ARRAY['identification', 'contact', 'demographic', 'financial',
            'employment', 'education', 'images', 'location', 'health', 'biometric']),
    ADD CONSTRAINT "prv_processing_activities_holders_check" CHECK (
        cardinality("holder_types") BETWEEN 1 AND 7
        AND "holder_types" <@ ARRAY['customers', 'suppliers', 'employees', 'candidates', 'contacts',
            'visitors', 'users']),
    ADD CONSTRAINT "prv_processing_activities_legal_basis_check" CHECK (char_length(btrim("legal_basis")) BETWEEN 10 AND 500),
    ADD CONSTRAINT "prv_processing_activities_retention_check" CHECK (char_length(btrim("retention")) BETWEEN 5 AND 300),
    ADD CONSTRAINT "prv_processing_activities_transfers_check" CHECK (
        "international_transfers" IS NULL OR char_length(btrim("international_transfers")) BETWEEN 5 AND 500),
    ADD CONSTRAINT "prv_processing_activities_status_check" CHECK ("status" IN ('active', 'inactive')),
    ADD CONSTRAINT "prv_processing_activities_version_check" CHECK ("version" > 0);

ALTER TABLE "prv_processors"
    ADD CONSTRAINT "prv_processors_service_check" CHECK (char_length(btrim("service")) BETWEEN 3 AND 300),
    ADD CONSTRAINT "prv_processors_country_check" CHECK ("country" ~ '^[A-Z]{2}$'),
    ADD CONSTRAINT "prv_processors_status_check" CHECK ("status" IN ('active', 'inactive')),
    ADD CONSTRAINT "prv_processors_version_check" CHECK ("version" > 0);

ALTER TABLE "prv_activity_processors"
    ADD CONSTRAINT "prv_activity_processors_version_check" CHECK ("version" > 0);

-- Un texto publicado no cambia: solo pasa a reemplazado. Por clase hay a lo más un borrador y un
-- publicado; el caso de uso además toma un bloqueo por clase para que dos personas no choquen.
CREATE FUNCTION "prv_keep_notices"() RETURNS TRIGGER
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF TG_OP = 'UPDATE' AND (
        NEW.key IS DISTINCT FROM OLD.key
        OR NEW.version_number IS DISTINCT FROM OLD.version_number
        OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
        OR (OLD.status <> 'draft' AND (NEW.title IS DISTINCT FROM OLD.title
            OR NEW.body IS DISTINCT FROM OLD.body
            OR NEW.purposes IS DISTINCT FROM OLD.purposes
            OR NEW.effective_from IS DISTINCT FROM OLD.effective_from))
        OR NOT ((OLD.status = NEW.status)
            OR (OLD.status = 'draft' AND NEW.status = 'published')
            OR (OLD.status = 'published' AND NEW.status = 'replaced'))) THEN
        RAISE EXCEPTION 'Un texto publicado no se puede cambiar; cree una versión nueva'
            USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    IF NEW.status IN ('draft', 'published') AND EXISTS (
        SELECT 1 FROM "prv_notices"
        WHERE tenant_id = NEW.tenant_id AND key = NEW.key AND status = NEW.status
            AND id <> NEW.id AND deleted_at IS NULL) THEN
        RAISE EXCEPTION 'Ya hay un texto en ese estado para esa clase'
            USING ERRCODE = 'unique_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "prv_notices_keep"
    BEFORE INSERT OR UPDATE ON "prv_notices"
    FOR EACH ROW EXECUTE FUNCTION "prv_keep_notices"();

-- Una autorización solo se toma sobre un texto de autorización publicado, no se edita y se revoca
-- una sola vez. El registro anterior a B17 es la única excepción a «publicado».
CREATE FUNCTION "prv_keep_consents"() RETURNS TRIGGER
    LANGUAGE plpgsql
    AS $$
DECLARE
    notice_key TEXT;
    notice_status TEXT;
BEGIN
    IF TG_OP = 'INSERT' THEN
        SELECT key, status INTO notice_key, notice_status FROM "prv_notices"
            WHERE tenant_id = NEW.tenant_id AND id = NEW.notice_id;
        IF notice_key NOT LIKE 'authorization\_%'
            OR (NEW.source = 'prior_record') <> (notice_key = 'authorization_prior')
            OR (NEW.source <> 'prior_record' AND notice_status <> 'published') THEN
            RAISE EXCEPTION 'La autorización exige un texto de autorización publicado'
                USING ERRCODE = 'integrity_constraint_violation';
        END IF;
        RETURN NEW;
    END IF;
    IF NEW.party_id IS DISTINCT FROM OLD.party_id
        OR NEW.notice_id IS DISTINCT FROM OLD.notice_id
        OR NEW.purposes IS DISTINCT FROM OLD.purposes
        OR NEW.channel IS DISTINCT FROM OLD.channel
        OR NEW.granted_on IS DISTINCT FROM OLD.granted_on
        OR NEW.source IS DISTINCT FROM OLD.source
        OR NEW.ip_address IS DISTINCT FROM OLD.ip_address
        OR NEW.user_agent IS DISTINCT FROM OLD.user_agent
        OR NEW.evidence_file_id IS DISTINCT FROM OLD.evidence_file_id
        OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
        OR OLD.revoked_at IS NOT NULL THEN
        RAISE EXCEPTION 'Una autorización no se edita; solo se revoca una vez'
            USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "prv_consents_keep"
    BEFORE INSERT OR UPDATE ON "prv_consents"
    FOR EACH ROW EXECUTE FUNCTION "prv_keep_consents"();

-- Columnas de control --------------------------------------------------------------------------

CREATE TRIGGER "prv_notices_control_columns"
    BEFORE INSERT OR UPDATE ON "prv_notices"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();
CREATE TRIGGER "prv_consents_control_columns"
    BEFORE INSERT OR UPDATE ON "prv_consents"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();
CREATE TRIGGER "prv_processing_activities_control_columns"
    BEFORE INSERT OR UPDATE ON "prv_processing_activities"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();
CREATE TRIGGER "prv_processors_control_columns"
    BEFORE INSERT OR UPDATE ON "prv_processors"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();
CREATE TRIGGER "prv_activity_processors_control_columns"
    BEFORE INSERT OR UPDATE ON "prv_activity_processors"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();

-- Traslado de las autorizaciones de Terceros (B13) ------------------------------------------------
-- Cada persona que tenía finalidad, canal y fecha recibe una autorización ligada al texto
-- «Registro anterior a B17» de su empresa, que nace reemplazado para que nadie la use de nuevo.
-- El dueño de las tablas no ve filas con la seguridad por fila forzada y sin empresa fijada: se
-- suspende en pty_parties solo durante el traslado, dentro de esta misma transacción. Las tablas
-- prv_ todavía no la tienen activa.

CREATE FUNCTION pg_temp.prv_uuid_v7() RETURNS UUID
    LANGUAGE sql VOLATILE
    AS $$ SELECT encode(set_bit(set_bit(overlay(uuid_send(gen_random_uuid())
              PLACING substring(int8send((extract(epoch FROM clock_timestamp()) * 1000)::BIGINT) FROM 3)
              FROM 1 FOR 6), 52, 1), 53, 1), 'hex')::UUID $$;

ALTER TABLE "pty_parties" NO FORCE ROW LEVEL SECURITY;

INSERT INTO "prv_notices" ("id", "tenant_id", "key", "version_number", "title", "body", "purposes",
                           "status", "effective_from")
SELECT pg_temp.prv_uuid_v7(), "tenant_id", 'authorization_prior', 1,
       'Autorización registrada antes de B17',
       'Autorización de tratamiento de datos obtenida antes de que ARZA ONE guardara el texto '
       || 'aceptado. El canal y la fecha son los que se registraron en la ficha del tercero; el '
       || 'soporte se conserva donde se archivó en su momento.',
       array_agg(DISTINCT "data_purpose" ORDER BY "data_purpose"), 'replaced', min("created_at")
FROM "pty_parties"
WHERE "kind" = 'person' AND "data_authorization" IS NOT NULL
GROUP BY "tenant_id";

INSERT INTO "prv_consents" ("id", "tenant_id", "party_id", "notice_id", "purposes", "channel",
                            "granted_on", "source")
SELECT pg_temp.prv_uuid_v7(), p."tenant_id", p."id", n."id", ARRAY[p."data_purpose"],
       p."data_authorization", p."data_authorized_on", 'prior_record'
FROM "pty_parties" p
JOIN "prv_notices" n ON n."tenant_id" = p."tenant_id" AND n."key" = 'authorization_prior'
WHERE p."kind" = 'person' AND p."data_authorization" IS NOT NULL
ORDER BY p."created_at";

ALTER TABLE "pty_parties" FORCE ROW LEVEL SECURITY;

ALTER TABLE "pty_parties" DROP CONSTRAINT "pty_parties_personal_data_check";

-- AlterTable
ALTER TABLE "pty_parties" DROP COLUMN "data_authorization",
DROP COLUMN "data_authorized_on",
DROP COLUMN "data_purpose";

-- Seguridad por fila (ADR-007) -----------------------------------------------------------------

ALTER TABLE "prv_notices" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "prv_notices" FORCE ROW LEVEL SECURITY;
CREATE POLICY "prv_notices_tenant_isolation" ON "prv_notices"
    USING ("tenant_id" = core_current_tenant_id())
    WITH CHECK ("tenant_id" = core_current_tenant_id());

ALTER TABLE "prv_consents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "prv_consents" FORCE ROW LEVEL SECURITY;
CREATE POLICY "prv_consents_tenant_isolation" ON "prv_consents"
    USING ("tenant_id" = core_current_tenant_id())
    WITH CHECK ("tenant_id" = core_current_tenant_id());

ALTER TABLE "prv_processing_activities" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "prv_processing_activities" FORCE ROW LEVEL SECURITY;
CREATE POLICY "prv_processing_activities_tenant_isolation" ON "prv_processing_activities"
    USING ("tenant_id" = core_current_tenant_id())
    WITH CHECK ("tenant_id" = core_current_tenant_id());

ALTER TABLE "prv_processors" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "prv_processors" FORCE ROW LEVEL SECURITY;
CREATE POLICY "prv_processors_tenant_isolation" ON "prv_processors"
    USING ("tenant_id" = core_current_tenant_id())
    WITH CHECK ("tenant_id" = core_current_tenant_id());

ALTER TABLE "prv_activity_processors" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "prv_activity_processors" FORCE ROW LEVEL SECURITY;
CREATE POLICY "prv_activity_processors_tenant_isolation" ON "prv_activity_processors"
    USING ("tenant_id" = core_current_tenant_id())
    WITH CHECK ("tenant_id" = core_current_tenant_id());

-- Permisos de la API ---------------------------------------------------------------------------
-- Sin DELETE: el borrado es lógico. Un encargado que sale de una actividad se marca retirado.

GRANT SELECT, INSERT, UPDATE ON "prv_notices" TO app_user;
GRANT SELECT, INSERT, UPDATE ON "prv_consents" TO app_user;
GRANT SELECT, INSERT, UPDATE ON "prv_processing_activities" TO app_user;
GRANT SELECT, INSERT, UPDATE ON "prv_processors" TO app_user;
GRANT SELECT, INSERT, UPDATE ON "prv_activity_processors" TO app_user;
