-- B13: terceros, sus papeles, contactos y firmantes, cuentas bancarias cifradas con doble
-- aprobación y conocimiento del tercero. Ficha 17.3, capítulo 12.3, ADR-007.

-- CreateTable
CREATE TABLE "pty_parties" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "legal_name" TEXT,
    "trade_name" TEXT,
    "first_name" TEXT,
    "last_name" TEXT,
    "id_type" TEXT NOT NULL,
    "id_number" TEXT NOT NULL,
    "check_digit" SMALLINT,
    "email" TEXT,
    "phone" TEXT,
    "city" TEXT,
    "address" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "status_reason" TEXT,
    "data_purpose" TEXT,
    "data_authorization" TEXT,
    "data_authorized_on" DATE,
    "merged_into_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "pty_parties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pty_party_roles" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "party_id" UUID NOT NULL,
    "role" TEXT NOT NULL,
    "since" DATE NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "pty_party_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pty_contacts" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "job_title" TEXT,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "can_sign" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "pty_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pty_bank_accounts" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "party_id" UUID NOT NULL,
    "bank" TEXT NOT NULL,
    "account_type" TEXT NOT NULL,
    "account_number_encrypted" TEXT NOT NULL,
    "account_last4" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "replaces_id" UUID,
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMPTZ(6),
    "review_note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "pty_bank_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pty_due_diligence" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "party_id" UUID NOT NULL,
    "risk_level" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMPTZ(6),
    "review_note" TEXT,
    "next_review_on" DATE,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "pty_due_diligence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pty_parties_tenant_id_merged_into_id_idx" ON "pty_parties"("tenant_id", "merged_into_id");

-- CreateIndex
CREATE INDEX "pty_parties_tenant_id_status_idx" ON "pty_parties"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "pty_parties_tenant_id_email_idx" ON "pty_parties"("tenant_id", "email");

-- CreateIndex
CREATE INDEX "pty_parties_tenant_id_phone_idx" ON "pty_parties"("tenant_id", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "pty_parties_tenant_id_id_key" ON "pty_parties"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "pty_parties_tenant_id_id_type_id_number_key" ON "pty_parties"("tenant_id", "id_type", "id_number");

-- CreateIndex
CREATE UNIQUE INDEX "pty_party_roles_tenant_id_party_id_role_key" ON "pty_party_roles"("tenant_id", "party_id", "role");

-- CreateIndex
CREATE INDEX "pty_contacts_tenant_id_person_id_idx" ON "pty_contacts"("tenant_id", "person_id");

-- CreateIndex
CREATE UNIQUE INDEX "pty_contacts_tenant_id_organization_id_person_id_key" ON "pty_contacts"("tenant_id", "organization_id", "person_id");

-- CreateIndex
CREATE INDEX "pty_bank_accounts_tenant_id_party_id_idx" ON "pty_bank_accounts"("tenant_id", "party_id");

-- CreateIndex
CREATE INDEX "pty_bank_accounts_tenant_id_replaces_id_idx" ON "pty_bank_accounts"("tenant_id", "replaces_id");

-- CreateIndex
CREATE UNIQUE INDEX "pty_bank_accounts_tenant_id_id_key" ON "pty_bank_accounts"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "pty_due_diligence_tenant_id_party_id_idx" ON "pty_due_diligence"("tenant_id", "party_id");

-- AddForeignKey
ALTER TABLE "pty_parties" ADD CONSTRAINT "pty_parties_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pty_parties" ADD CONSTRAINT "pty_parties_tenant_id_merged_into_id_fkey" FOREIGN KEY ("tenant_id", "merged_into_id") REFERENCES "pty_parties"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pty_party_roles" ADD CONSTRAINT "pty_party_roles_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pty_party_roles" ADD CONSTRAINT "pty_party_roles_tenant_id_party_id_fkey" FOREIGN KEY ("tenant_id", "party_id") REFERENCES "pty_parties"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pty_contacts" ADD CONSTRAINT "pty_contacts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pty_contacts" ADD CONSTRAINT "pty_contacts_tenant_id_organization_id_fkey" FOREIGN KEY ("tenant_id", "organization_id") REFERENCES "pty_parties"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pty_contacts" ADD CONSTRAINT "pty_contacts_tenant_id_person_id_fkey" FOREIGN KEY ("tenant_id", "person_id") REFERENCES "pty_parties"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pty_bank_accounts" ADD CONSTRAINT "pty_bank_accounts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pty_bank_accounts" ADD CONSTRAINT "pty_bank_accounts_tenant_id_party_id_fkey" FOREIGN KEY ("tenant_id", "party_id") REFERENCES "pty_parties"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pty_bank_accounts" ADD CONSTRAINT "pty_bank_accounts_tenant_id_replaces_id_fkey" FOREIGN KEY ("tenant_id", "replaces_id") REFERENCES "pty_bank_accounts"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pty_due_diligence" ADD CONSTRAINT "pty_due_diligence_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pty_due_diligence" ADD CONSTRAINT "pty_due_diligence_tenant_id_party_id_fkey" FOREIGN KEY ("tenant_id", "party_id") REFERENCES "pty_parties"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Reglas de los datos -------------------------------------------------------------------------

-- Dígito de verificación del NIT (ficha 17.3): módulo 11 con los pesos de la DIAN. La API y la
-- web usan el mismo cálculo (packages/contracts/src/party/nit.ts).
CREATE FUNCTION "pty_nit_check_digit"("nit" TEXT) RETURNS SMALLINT
    LANGUAGE plpgsql IMMUTABLE STRICT
    AS $$
DECLARE
    weights INTEGER[] := ARRAY[3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71];
    total INTEGER := 0;
    remainder INTEGER;
BEGIN
    FOR idx IN 1..char_length(nit) LOOP
        total := total + substr(nit, char_length(nit) - idx + 1, 1)::INTEGER * weights[idx];
    END LOOP;
    remainder := total % 11;
    RETURN CASE WHEN remainder > 1 THEN 11 - remainder ELSE remainder END;
END;
$$;

ALTER TABLE "pty_parties"
    ADD CONSTRAINT "pty_parties_kind_check" CHECK ("kind" IN ('person', 'organization')),
    ADD CONSTRAINT "pty_parties_name_check" CHECK (
        ("kind" = 'organization' AND char_length(btrim("legal_name")) BETWEEN 2 AND 160
            AND "first_name" IS NULL AND "last_name" IS NULL)
        OR ("kind" = 'person' AND "legal_name" IS NULL AND "trade_name" IS NULL
            AND char_length(btrim("first_name")) BETWEEN 2 AND 80
            AND char_length(btrim("last_name")) BETWEEN 2 AND 80)),
    ADD CONSTRAINT "pty_parties_id_number_check" CHECK ("id_number" ~ '^[A-Z0-9]{3,20}$'),
    ADD CONSTRAINT "pty_parties_check_digit_check" CHECK (
        ("id_type" = 'NIT' AND "id_number" ~ '^[0-9]{5,15}$'
            AND "check_digit" = pty_nit_check_digit("id_number"))
        OR ("id_type" <> 'NIT' AND "check_digit" IS NULL)),
    ADD CONSTRAINT "pty_parties_status_check" CHECK ("status" IN ('prospect', 'active', 'inactive', 'blocked')),
    ADD CONSTRAINT "pty_parties_blocked_reason_check" CHECK ("status" <> 'blocked' OR "status_reason" IS NOT NULL),
    -- Todo dato personal con su finalidad y su autorización (ficha 17.3, M18).
    ADD CONSTRAINT "pty_parties_personal_data_check" CHECK (
        "kind" = 'organization'
        OR ("data_purpose" IS NOT NULL AND "data_authorized_on" IS NOT NULL
            AND "data_authorization" IN ('written', 'digital', 'verbal', 'contract'))),
    ADD CONSTRAINT "pty_parties_merge_check" CHECK (
        "merged_into_id" IS NULL OR ("merged_into_id" <> "id" AND "deleted_at" IS NOT NULL)),
    ADD CONSTRAINT "pty_parties_version_check" CHECK ("version" > 0);

ALTER TABLE "pty_party_roles"
    ADD CONSTRAINT "pty_party_roles_role_check" CHECK ("role" IN ('customer', 'supplier', 'employee', 'contact', 'candidate')),
    ADD CONSTRAINT "pty_party_roles_status_check" CHECK ("status" IN ('active', 'ended')),
    ADD CONSTRAINT "pty_party_roles_version_check" CHECK ("version" > 0);

ALTER TABLE "pty_contacts"
    ADD CONSTRAINT "pty_contacts_people_check" CHECK ("organization_id" <> "person_id"),
    ADD CONSTRAINT "pty_contacts_job_title_check" CHECK ("job_title" IS NULL OR char_length(btrim("job_title")) BETWEEN 2 AND 120),
    ADD CONSTRAINT "pty_contacts_version_check" CHECK ("version" > 0);

-- Doble aprobación (ficha 17.3): quien revisa nunca es quien registró. created_by lo fija el
-- disparador de las columnas de control con la persona de la sesión, no la API.
ALTER TABLE "pty_bank_accounts"
    ADD CONSTRAINT "pty_bank_accounts_type_check" CHECK ("account_type" IN ('savings', 'checking')),
    ADD CONSTRAINT "pty_bank_accounts_last4_check" CHECK ("account_last4" ~ '^[0-9]{4}$'),
    ADD CONSTRAINT "pty_bank_accounts_encrypted_check" CHECK ("account_number_encrypted" LIKE 'v1.%'),
    ADD CONSTRAINT "pty_bank_accounts_status_check" CHECK ("status" IN ('pending', 'approved', 'rejected', 'replaced')),
    ADD CONSTRAINT "pty_bank_accounts_review_check" CHECK (
        ("status" = 'pending' AND "reviewed_by" IS NULL AND "reviewed_at" IS NULL)
        OR ("status" <> 'pending' AND "reviewed_by" IS NOT NULL AND "reviewed_at" IS NOT NULL)),
    ADD CONSTRAINT "pty_bank_accounts_reviewer_check" CHECK ("reviewed_by" IS NULL OR "reviewed_by" IS DISTINCT FROM "created_by"),
    ADD CONSTRAINT "pty_bank_accounts_replaces_check" CHECK ("replaces_id" IS NULL OR "replaces_id" <> "id"),
    ADD CONSTRAINT "pty_bank_accounts_version_check" CHECK ("version" > 0);

ALTER TABLE "pty_due_diligence"
    ADD CONSTRAINT "pty_due_diligence_risk_check" CHECK ("risk_level" IN ('low', 'medium', 'high')),
    ADD CONSTRAINT "pty_due_diligence_summary_check" CHECK (char_length(btrim("summary")) BETWEEN 10 AND 4000),
    ADD CONSTRAINT "pty_due_diligence_status_check" CHECK ("status" IN ('pending', 'approved', 'rejected')),
    ADD CONSTRAINT "pty_due_diligence_review_check" CHECK (
        ("status" = 'pending' AND "reviewed_by" IS NULL AND "reviewed_at" IS NULL)
        OR ("status" <> 'pending' AND "reviewed_by" IS NOT NULL AND "reviewed_at" IS NOT NULL)),
    ADD CONSTRAINT "pty_due_diligence_approved_check" CHECK ("status" <> 'approved' OR "next_review_on" IS NOT NULL),
    ADD CONSTRAINT "pty_due_diligence_reviewer_check" CHECK ("reviewed_by" IS NULL OR "reviewed_by" IS DISTINCT FROM "created_by"),
    ADD CONSTRAINT "pty_due_diligence_version_check" CHECK ("version" > 0);

-- Una revisión cerrada no se reabre ni cambia: el número cifrado, el banco y el riesgo quedan
-- como se aprobaron. Una cuenta aprobada solo puede pasar a reemplazada.
CREATE FUNCTION "pty_keep_reviews"() RETURNS TRIGGER
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF TG_TABLE_NAME = 'pty_bank_accounts' THEN
        IF NEW.account_number_encrypted <> OLD.account_number_encrypted OR NEW.bank <> OLD.bank
            OR NEW.account_type <> OLD.account_type OR NEW.account_last4 <> OLD.account_last4
            OR (OLD.status = 'approved' AND NEW.status NOT IN ('approved', 'replaced'))
            OR (OLD.status IN ('rejected', 'replaced') AND NEW.status <> OLD.status) THEN
            RAISE EXCEPTION 'Una cuenta bancaria revisada no se modifica: registre una nueva'
                USING ERRCODE = 'integrity_constraint_violation';
        END IF;
    ELSIF NEW.risk_level <> OLD.risk_level OR NEW.summary <> OLD.summary
        OR (OLD.status <> 'pending' AND NEW.status <> OLD.status) THEN
        RAISE EXCEPTION 'Un conocimiento del tercero revisado no se modifica: registre uno nuevo'
            USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "pty_bank_accounts_keep_reviews"
    BEFORE UPDATE ON "pty_bank_accounts"
    FOR EACH ROW EXECUTE FUNCTION "pty_keep_reviews"();

CREATE TRIGGER "pty_due_diligence_keep_reviews"
    BEFORE UPDATE ON "pty_due_diligence"
    FOR EACH ROW EXECUTE FUNCTION "pty_keep_reviews"();

-- Columnas de control --------------------------------------------------------------------------

CREATE TRIGGER "pty_parties_control_columns"
    BEFORE INSERT OR UPDATE ON "pty_parties"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();

CREATE TRIGGER "pty_party_roles_control_columns"
    BEFORE INSERT OR UPDATE ON "pty_party_roles"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();

CREATE TRIGGER "pty_contacts_control_columns"
    BEFORE INSERT OR UPDATE ON "pty_contacts"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();

CREATE TRIGGER "pty_bank_accounts_control_columns"
    BEFORE INSERT OR UPDATE ON "pty_bank_accounts"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();

CREATE TRIGGER "pty_due_diligence_control_columns"
    BEFORE INSERT OR UPDATE ON "pty_due_diligence"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();

-- Seguridad por fila (ADR-007) -----------------------------------------------------------------

ALTER TABLE "pty_parties" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "pty_parties" FORCE ROW LEVEL SECURITY;
CREATE POLICY "pty_parties_tenant_isolation" ON "pty_parties"
    USING ("tenant_id" = core_current_tenant_id())
    WITH CHECK ("tenant_id" = core_current_tenant_id());

ALTER TABLE "pty_party_roles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "pty_party_roles" FORCE ROW LEVEL SECURITY;
CREATE POLICY "pty_party_roles_tenant_isolation" ON "pty_party_roles"
    USING ("tenant_id" = core_current_tenant_id())
    WITH CHECK ("tenant_id" = core_current_tenant_id());

ALTER TABLE "pty_contacts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "pty_contacts" FORCE ROW LEVEL SECURITY;
CREATE POLICY "pty_contacts_tenant_isolation" ON "pty_contacts"
    USING ("tenant_id" = core_current_tenant_id())
    WITH CHECK ("tenant_id" = core_current_tenant_id());

ALTER TABLE "pty_bank_accounts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "pty_bank_accounts" FORCE ROW LEVEL SECURITY;
CREATE POLICY "pty_bank_accounts_tenant_isolation" ON "pty_bank_accounts"
    USING ("tenant_id" = core_current_tenant_id())
    WITH CHECK ("tenant_id" = core_current_tenant_id());

ALTER TABLE "pty_due_diligence" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "pty_due_diligence" FORCE ROW LEVEL SECURITY;
CREATE POLICY "pty_due_diligence_tenant_isolation" ON "pty_due_diligence"
    USING ("tenant_id" = core_current_tenant_id())
    WITH CHECK ("tenant_id" = core_current_tenant_id());

-- Permisos de la API ---------------------------------------------------------------------------
-- Sin DELETE: el borrado es lógico (deleted_at).

GRANT SELECT, INSERT, UPDATE ON "pty_parties" TO app_user;
GRANT SELECT, INSERT, UPDATE ON "pty_party_roles" TO app_user;
GRANT SELECT, INSERT, UPDATE ON "pty_contacts" TO app_user;
GRANT SELECT, INSERT, UPDATE ON "pty_bank_accounts" TO app_user;
GRANT SELECT, INSERT, UPDATE ON "pty_due_diligence" TO app_user;
GRANT EXECUTE ON FUNCTION "pty_nit_check_digit"(TEXT) TO app_user;
