-- B24: contratos (M06, ficha 17.7, numeral 12.4). Biblioteca de cláusulas aprobadas con sus
-- versiones (ctr_clause_library), plantillas CT-COM y OS-COM (ctr_templates, ctr_template_clauses),
-- contratos y órdenes de servicio con su texto cláusula por cláusula (ctr_contracts,
-- ctr_contract_clauses), obligaciones (ctr_obligations) y otrosíes y prórrogas (ctr_amendments).
-- El cliente (pty_parties), la cotización (crm_quotes) y los PDF (doc_files) se guardan por
-- identificador, sin llaves hacia tablas de otros módulos (numeral 8.3). Solo expande: la versión
-- anterior no lee ni escribe estas tablas.

-- CreateTable
CREATE TABLE "ctr_clause_library" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "clause_version" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "numbered" BOOLEAN NOT NULL,
    "legal_validated" BOOLEAN NOT NULL DEFAULT false,
    "approved_by" UUID,
    "approved_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "ctr_clause_library_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ctr_templates" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "format_version" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "ctr_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ctr_template_clauses" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "position" SMALLINT NOT NULL,
    "clause_key" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "ctr_template_clauses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ctr_contracts" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "template_id" UUID NOT NULL,
    "party_id" UUID NOT NULL,
    "quote_id" UUID,
    "title" TEXT NOT NULL,
    "object" TEXT NOT NULL,
    "value" DECIMAL(18,2),
    "payment_terms" TEXT,
    "starts_on" DATE NOT NULL,
    "ends_on" DATE NOT NULL,
    "renewal" TEXT NOT NULL,
    "responsible_id" UUID,
    "client_signer_name" TEXT NOT NULL,
    "client_signer_document" TEXT NOT NULL,
    "variable_values" JSONB NOT NULL,
    "has_modified_clauses" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "workflow_instance_id" UUID,
    "submitted_at" TIMESTAMPTZ(6),
    "decided_by" UUID,
    "decided_at" TIMESTAMPTZ(6),
    "decision_note" TEXT,
    "legal_note" TEXT,
    "pdf_status" TEXT NOT NULL DEFAULT 'none',
    "pdf_file_id" UUID,
    "pdf_sha256" TEXT,
    "signed_file_id" UUID,
    "signed_on" DATE,
    "signed_by" UUID,
    "terminated_on" DATE,
    "termination_reason" TEXT,
    "terminated_by" UUID,
    "last_alert_days" SMALLINT,
    "closed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "ctr_contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ctr_contract_clauses" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "contract_id" UUID NOT NULL,
    "position" SMALLINT NOT NULL,
    "clause_key" TEXT,
    "clause_version" INTEGER,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "origin" TEXT NOT NULL,
    "numbered" BOOLEAN NOT NULL,
    "required" BOOLEAN NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "ctr_contract_clauses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ctr_obligations" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "contract_id" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "responsible_id" UUID NOT NULL,
    "due_on" DATE NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "done_at" TIMESTAMPTZ(6),
    "done_by" UUID,
    "done_note" TEXT,
    "reminded_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "ctr_obligations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ctr_amendments" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "contract_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "sequence" SMALLINT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "effective_on" DATE NOT NULL,
    "new_ends_on" DATE,
    "new_value" DECIMAL(18,2),
    "workflow_instance_id" UUID,
    "decided_by" UUID,
    "decided_at" TIMESTAMPTZ(6),
    "decision_note" TEXT,
    "pdf_status" TEXT NOT NULL DEFAULT 'none',
    "pdf_file_id" UUID,
    "pdf_sha256" TEXT,
    "signed_file_id" UUID,
    "signed_on" DATE,
    "signed_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "ctr_amendments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ctr_clause_library_tenant_id_id_key" ON "ctr_clause_library"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ctr_clause_library_tenant_id_key_clause_version_key" ON "ctr_clause_library"("tenant_id", "key", "clause_version");

-- CreateIndex
CREATE UNIQUE INDEX "ctr_templates_tenant_id_id_key" ON "ctr_templates"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ctr_templates_tenant_id_code_key" ON "ctr_templates"("tenant_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "ctr_template_clauses_tenant_id_id_key" ON "ctr_template_clauses"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ctr_template_clauses_tenant_id_template_id_position_key" ON "ctr_template_clauses"("tenant_id", "template_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "ctr_template_clauses_tenant_id_template_id_clause_key_key" ON "ctr_template_clauses"("tenant_id", "template_id", "clause_key");

-- CreateIndex
CREATE INDEX "ctr_contracts_tenant_id_status_idx" ON "ctr_contracts"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "ctr_contracts_tenant_id_party_id_idx" ON "ctr_contracts"("tenant_id", "party_id");

-- CreateIndex
CREATE INDEX "ctr_contracts_tenant_id_quote_id_idx" ON "ctr_contracts"("tenant_id", "quote_id");

-- CreateIndex
CREATE INDEX "ctr_contracts_tenant_id_responsible_id_idx" ON "ctr_contracts"("tenant_id", "responsible_id");

-- CreateIndex
CREATE INDEX "ctr_contracts_tenant_id_created_at_idx" ON "ctr_contracts"("tenant_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "ctr_contracts_tenant_id_id_key" ON "ctr_contracts"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ctr_contracts_tenant_id_code_key" ON "ctr_contracts"("tenant_id", "code");

-- CreateIndex
CREATE INDEX "ctr_contract_clauses_tenant_id_contract_id_idx" ON "ctr_contract_clauses"("tenant_id", "contract_id");

-- CreateIndex
CREATE UNIQUE INDEX "ctr_contract_clauses_tenant_id_id_key" ON "ctr_contract_clauses"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "ctr_obligations_tenant_id_contract_id_idx" ON "ctr_obligations"("tenant_id", "contract_id");

-- CreateIndex
CREATE INDEX "ctr_obligations_tenant_id_status_due_on_idx" ON "ctr_obligations"("tenant_id", "status", "due_on");

-- CreateIndex
CREATE UNIQUE INDEX "ctr_obligations_tenant_id_id_key" ON "ctr_obligations"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ctr_amendments_tenant_id_id_key" ON "ctr_amendments"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ctr_amendments_tenant_id_code_key" ON "ctr_amendments"("tenant_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "ctr_amendments_tenant_id_contract_id_sequence_key" ON "ctr_amendments"("tenant_id", "contract_id", "sequence");

-- AddForeignKey
ALTER TABLE "ctr_clause_library" ADD CONSTRAINT "ctr_clause_library_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ctr_templates" ADD CONSTRAINT "ctr_templates_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ctr_template_clauses" ADD CONSTRAINT "ctr_template_clauses_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ctr_template_clauses" ADD CONSTRAINT "ctr_template_clauses_tenant_id_template_id_fkey" FOREIGN KEY ("tenant_id", "template_id") REFERENCES "ctr_templates"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ctr_contracts" ADD CONSTRAINT "ctr_contracts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ctr_contracts" ADD CONSTRAINT "ctr_contracts_tenant_id_template_id_fkey" FOREIGN KEY ("tenant_id", "template_id") REFERENCES "ctr_templates"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ctr_contract_clauses" ADD CONSTRAINT "ctr_contract_clauses_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ctr_contract_clauses" ADD CONSTRAINT "ctr_contract_clauses_tenant_id_contract_id_fkey" FOREIGN KEY ("tenant_id", "contract_id") REFERENCES "ctr_contracts"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ctr_obligations" ADD CONSTRAINT "ctr_obligations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ctr_obligations" ADD CONSTRAINT "ctr_obligations_tenant_id_contract_id_fkey" FOREIGN KEY ("tenant_id", "contract_id") REFERENCES "ctr_contracts"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ctr_amendments" ADD CONSTRAINT "ctr_amendments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ctr_amendments" ADD CONSTRAINT "ctr_amendments_tenant_id_contract_id_fkey" FOREIGN KEY ("tenant_id", "contract_id") REFERENCES "ctr_contracts"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Reglas de los datos -------------------------------------------------------------------------
-- Los valores permitidos son los de packages/contracts/src/contract.

ALTER TABLE "ctr_clause_library"
    ADD CONSTRAINT "ctr_clause_library_key_check" CHECK ("key" ~ '^[a-z][a-z0-9-]{2,59}$'),
    ADD CONSTRAINT "ctr_clause_library_clause_version_check" CHECK ("clause_version" > 0),
    ADD CONSTRAINT "ctr_clause_library_text_check" CHECK (
        char_length(btrim("title")) BETWEEN 3 AND 120
        AND char_length(btrim("body")) BETWEEN 10 AND 10000),
    ADD CONSTRAINT "ctr_clause_library_version_check" CHECK ("version" > 0);

ALTER TABLE "ctr_templates"
    ADD CONSTRAINT "ctr_templates_code_check" CHECK ("code" ~ '^(CT|OS)-[A-Z]{3}-[0-9]{3}$'),
    ADD CONSTRAINT "ctr_templates_name_check" CHECK (char_length(btrim("name")) BETWEEN 3 AND 160),
    ADD CONSTRAINT "ctr_templates_kind_check" CHECK ("kind" IN ('contract', 'nda', 'service_order')),
    ADD CONSTRAINT "ctr_templates_format_version_check" CHECK ("format_version" ~ '^[0-9]{2}$'),
    ADD CONSTRAINT "ctr_templates_version_check" CHECK ("version" > 0);

ALTER TABLE "ctr_template_clauses"
    ADD CONSTRAINT "ctr_template_clauses_position_check" CHECK ("position" BETWEEN 1 AND 30),
    ADD CONSTRAINT "ctr_template_clauses_key_check" CHECK ("clause_key" ~ '^[a-z][a-z0-9-]{2,59}$'),
    ADD CONSTRAINT "ctr_template_clauses_version_check" CHECK ("version" > 0);

ALTER TABLE "ctr_contracts"
    ADD CONSTRAINT "ctr_contracts_code_check" CHECK ("code" ~ '^(CTR|OS)-[0-9]{4}-[0-9]{4,8}$'),
    ADD CONSTRAINT "ctr_contracts_kind_check" CHECK ("kind" IN ('contract', 'nda', 'service_order')),
    -- La orden de servicio lleva el prefijo OS; los contratos y acuerdos, CTR.
    ADD CONSTRAINT "ctr_contracts_code_kind_check"
        CHECK (("kind" = 'service_order') = ("code" LIKE 'OS-%')),
    ADD CONSTRAINT "ctr_contracts_text_check" CHECK (
        char_length(btrim("title")) BETWEEN 3 AND 160
        AND char_length(btrim("object")) BETWEEN 10 AND 4000
        AND ("payment_terms" IS NULL OR char_length(btrim("payment_terms")) BETWEEN 3 AND 1000)
        AND char_length(btrim("client_signer_name")) BETWEEN 3 AND 160
        AND char_length(btrim("client_signer_document")) BETWEEN 3 AND 40),
    -- Solo un acuerdo de confidencialidad puede no tener valor.
    ADD CONSTRAINT "ctr_contracts_value_check" CHECK (
        ("value" IS NULL OR "value" >= 0) AND ("kind" = 'nda' OR "value" IS NOT NULL)),
    ADD CONSTRAINT "ctr_contracts_dates_check" CHECK ("ends_on" >= "starts_on"),
    ADD CONSTRAINT "ctr_contracts_renewal_check"
        CHECK ("renewal" IN ('none', 'automatic', 'by_agreement')),
    ADD CONSTRAINT "ctr_contracts_variable_values_check"
        CHECK (jsonb_typeof("variable_values") = 'object'),
    ADD CONSTRAINT "ctr_contracts_status_check" CHECK ("status" IN ('draft', 'in_review',
        'approved', 'active', 'expiring', 'terminated')),
    -- Fuera de borrador ya se pidió la revisión.
    ADD CONSTRAINT "ctr_contracts_submitted_check"
        CHECK (("status" = 'draft') = ("submitted_at" IS NULL)),
    -- Aprobado o más adelante: la Dirección decidió y hay PDF definitivo (o se está preparando).
    ADD CONSTRAINT "ctr_contracts_decided_check" CHECK (
        "status" IN ('draft', 'in_review')
        OR ("decided_by" IS NOT NULL AND "decided_at" IS NOT NULL AND "pdf_status" <> 'none')),
    ADD CONSTRAINT "ctr_contracts_pdf_check" CHECK (
        "pdf_status" IN ('none', 'pending', 'ready')
        AND (("pdf_status" = 'ready') = ("pdf_file_id" IS NOT NULL))
        AND (("pdf_status" = 'ready') = ("pdf_sha256" IS NOT NULL))),
    -- Vigente, por vencer o terminado después de firmar: tiene su copia firmada.
    ADD CONSTRAINT "ctr_contracts_signed_check" CHECK (
        (("signed_file_id" IS NULL) = ("signed_on" IS NULL))
        AND ("status" NOT IN ('active', 'expiring') OR "signed_file_id" IS NOT NULL)),
    ADD CONSTRAINT "ctr_contracts_terminated_check" CHECK (
        (("status" = 'terminated') = ("terminated_on" IS NOT NULL))
        AND (("terminated_on" IS NULL) = ("termination_reason" IS NULL))
        AND (("status" = 'terminated') = ("closed_at" IS NOT NULL))
        AND ("termination_reason" IS NULL
             OR char_length(btrim("termination_reason")) BETWEEN 3 AND 2000)),
    ADD CONSTRAINT "ctr_contracts_alert_check"
        CHECK ("last_alert_days" IS NULL OR "last_alert_days" IN (90, 60, 30)),
    ADD CONSTRAINT "ctr_contracts_version_check" CHECK ("version" > 0);

ALTER TABLE "ctr_contract_clauses"
    ADD CONSTRAINT "ctr_contract_clauses_position_check" CHECK ("position" BETWEEN 1 AND 30),
    ADD CONSTRAINT "ctr_contract_clauses_origin_check"
        CHECK ("origin" IN ('library', 'modified', 'added')),
    -- Una cláusula nueva no viene de la biblioteca; las demás dicen de qué versión salen.
    ADD CONSTRAINT "ctr_contract_clauses_source_check" CHECK (
        (("origin" = 'added') = ("clause_key" IS NULL))
        AND (("clause_key" IS NULL) = ("clause_version" IS NULL))),
    ADD CONSTRAINT "ctr_contract_clauses_text_check" CHECK (
        char_length(btrim("title")) BETWEEN 3 AND 120
        AND char_length(btrim("body")) BETWEEN 10 AND 12000),
    ADD CONSTRAINT "ctr_contract_clauses_version_check" CHECK ("version" > 0);

ALTER TABLE "ctr_obligations"
    ADD CONSTRAINT "ctr_obligations_description_check"
        CHECK (char_length(btrim("description")) BETWEEN 3 AND 1000),
    ADD CONSTRAINT "ctr_obligations_status_check" CHECK ("status" IN ('pending', 'done', 'overdue')),
    ADD CONSTRAINT "ctr_obligations_done_check" CHECK (
        (("status" = 'done') = ("done_at" IS NOT NULL))
        AND ("done_note" IS NULL OR char_length(btrim("done_note")) BETWEEN 3 AND 1000)),
    ADD CONSTRAINT "ctr_obligations_version_check" CHECK ("version" > 0);

ALTER TABLE "ctr_amendments"
    ADD CONSTRAINT "ctr_amendments_code_check"
        CHECK ("code" ~ '^(CTR|OS)-[0-9]{4}-[0-9]{4,8}-OT[0-9]{2}$'),
    ADD CONSTRAINT "ctr_amendments_sequence_check" CHECK ("sequence" BETWEEN 1 AND 99),
    ADD CONSTRAINT "ctr_amendments_kind_check" CHECK ("kind" IN ('amendment', 'extension')),
    ADD CONSTRAINT "ctr_amendments_status_check"
        CHECK ("status" IN ('in_review', 'approved', 'returned', 'signed')),
    ADD CONSTRAINT "ctr_amendments_text_check" CHECK (
        char_length(btrim("summary")) BETWEEN 3 AND 500
        AND char_length(btrim("body")) BETWEEN 10 AND 10000),
    -- Una prórroga siempre dice hasta cuándo.
    ADD CONSTRAINT "ctr_amendments_extension_check"
        CHECK ("kind" <> 'extension' OR "new_ends_on" IS NOT NULL),
    ADD CONSTRAINT "ctr_amendments_value_check" CHECK ("new_value" IS NULL OR "new_value" >= 0),
    ADD CONSTRAINT "ctr_amendments_decided_check" CHECK (
        "status" = 'in_review' OR ("decided_at" IS NOT NULL)),
    ADD CONSTRAINT "ctr_amendments_pdf_check" CHECK (
        "pdf_status" IN ('none', 'pending', 'ready')
        AND (("pdf_status" = 'ready') = ("pdf_file_id" IS NOT NULL))
        AND (("pdf_status" = 'ready') = ("pdf_sha256" IS NOT NULL))
        AND ("status" NOT IN ('approved', 'signed') OR "pdf_status" <> 'none')),
    ADD CONSTRAINT "ctr_amendments_signed_check" CHECK (
        (("status" = 'signed') = ("signed_file_id" IS NOT NULL))
        AND (("signed_file_id" IS NULL) = ("signed_on" IS NULL))),
    ADD CONSTRAINT "ctr_amendments_version_check" CHECK ("version" > 0);

-- Un contrato aprobado no se edita (ficha 17.7: el documento enviado es inmutable). Fuera de
-- borrador, su contenido no cambia; solo la fecha de fin y el valor, cuando un otrosí o una
-- prórroga firmados rigen sobre un contrato vigente. Uno terminado no cambia nada más. Las
-- cláusulas solo se escriben mientras su contrato es borrador. Lo revisa la base aunque alguien
-- intente el cambio directo en ella.
CREATE FUNCTION "ctr_keep_contracts"() RETURNS TRIGGER
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF OLD.status <> 'draft'
        AND (NEW.code, NEW.kind, NEW.template_id, NEW.party_id, NEW.quote_id, NEW.title,
             NEW.object, NEW.payment_terms, NEW.starts_on, NEW.renewal, NEW.client_signer_name,
             NEW.client_signer_document, NEW.variable_values, NEW.has_modified_clauses)
            IS DISTINCT FROM
            (OLD.code, OLD.kind, OLD.template_id, OLD.party_id, OLD.quote_id, OLD.title,
             OLD.object, OLD.payment_terms, OLD.starts_on, OLD.renewal, OLD.client_signer_name,
             OLD.client_signer_document, OLD.variable_values, OLD.has_modified_clauses) THEN
        RAISE EXCEPTION 'Un contrato fuera de borrador no se edita: use un otrosí.'
            USING ERRCODE = 'check_violation', CONSTRAINT = 'ctr_contracts_content_keep';
    END IF;
    IF OLD.status <> 'draft' AND OLD.status NOT IN ('active', 'expiring')
        AND (NEW.ends_on, NEW.value) IS DISTINCT FROM (OLD.ends_on, OLD.value) THEN
        RAISE EXCEPTION 'La fecha de fin y el valor solo cambian por un otrosí sobre un contrato vigente.'
            USING ERRCODE = 'check_violation', CONSTRAINT = 'ctr_contracts_terms_keep';
    END IF;
    IF OLD.status <> 'draft' AND OLD.pdf_status = 'ready'
        AND (NEW.pdf_file_id, NEW.pdf_sha256) IS DISTINCT FROM (OLD.pdf_file_id, OLD.pdf_sha256) THEN
        RAISE EXCEPTION 'El PDF aprobado de un contrato no se reemplaza.'
            USING ERRCODE = 'check_violation', CONSTRAINT = 'ctr_contracts_pdf_keep';
    END IF;
    IF OLD.status = 'terminated'
        AND (NEW.status, NEW.terminated_on, NEW.termination_reason, NEW.signed_file_id,
             NEW.signed_on, NEW.ends_on, NEW.value, NEW.last_alert_days, NEW.deleted_at)
            IS DISTINCT FROM
            (OLD.status, OLD.terminated_on, OLD.termination_reason, OLD.signed_file_id,
             OLD.signed_on, OLD.ends_on, OLD.value, OLD.last_alert_days, OLD.deleted_at) THEN
        RAISE EXCEPTION 'Un contrato terminado no cambia.'
            USING ERRCODE = 'check_violation', CONSTRAINT = 'ctr_contracts_closed_keep';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "ctr_contracts_keep"
    BEFORE UPDATE ON "ctr_contracts"
    FOR EACH ROW EXECUTE FUNCTION "ctr_keep_contracts"();

CREATE FUNCTION "ctr_keep_contract_clauses"() RETURNS TRIGGER
    LANGUAGE plpgsql
    AS $$
DECLARE
    contract_status TEXT;
BEGIN
    SELECT status INTO contract_status FROM ctr_contracts
     WHERE id = COALESCE(NEW.contract_id, OLD.contract_id)
       AND tenant_id = COALESCE(NEW.tenant_id, OLD.tenant_id);
    IF contract_status IS DISTINCT FROM 'draft' THEN
        RAISE EXCEPTION 'Las cláusulas de un contrato fuera de borrador no cambian.'
            USING ERRCODE = 'check_violation', CONSTRAINT = 'ctr_contract_clauses_keep';
    END IF;
    RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER "ctr_contract_clauses_keep"
    BEFORE INSERT OR UPDATE ON "ctr_contract_clauses"
    FOR EACH ROW EXECUTE FUNCTION "ctr_keep_contract_clauses"();

-- El texto de una cláusula aprobada no se cambia: se crea su versión siguiente.
CREATE FUNCTION "ctr_keep_clause_library"() RETURNS TRIGGER
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF (NEW.key, NEW.clause_version, NEW.title, NEW.body, NEW.numbered, NEW.approved_by,
        NEW.approved_at)
        IS DISTINCT FROM
        (OLD.key, OLD.clause_version, OLD.title, OLD.body, OLD.numbered, OLD.approved_by,
         OLD.approved_at) THEN
        RAISE EXCEPTION 'Una cláusula aprobada no se edita: cree su versión siguiente.'
            USING ERRCODE = 'check_violation', CONSTRAINT = 'ctr_clause_library_keep';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "ctr_clause_library_keep"
    BEFORE UPDATE ON "ctr_clause_library"
    FOR EACH ROW EXECUTE FUNCTION "ctr_keep_clause_library"();

-- El texto de un otrosí no cambia después de creado; uno firmado no cambia nada más.
CREATE FUNCTION "ctr_keep_amendments"() RETURNS TRIGGER
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF (NEW.contract_id, NEW.code, NEW.sequence, NEW.kind, NEW.summary, NEW.body,
        NEW.effective_on, NEW.new_ends_on, NEW.new_value)
        IS DISTINCT FROM
        (OLD.contract_id, OLD.code, OLD.sequence, OLD.kind, OLD.summary, OLD.body,
         OLD.effective_on, OLD.new_ends_on, OLD.new_value) THEN
        RAISE EXCEPTION 'El texto de un otrosí no se edita: cree uno nuevo.'
            USING ERRCODE = 'check_violation', CONSTRAINT = 'ctr_amendments_content_keep';
    END IF;
    IF OLD.status = 'signed'
        AND (NEW.status, NEW.signed_file_id, NEW.signed_on, NEW.pdf_file_id, NEW.deleted_at)
            IS DISTINCT FROM
            (OLD.status, OLD.signed_file_id, OLD.signed_on, OLD.pdf_file_id, OLD.deleted_at) THEN
        RAISE EXCEPTION 'Un otrosí firmado no cambia.'
            USING ERRCODE = 'check_violation', CONSTRAINT = 'ctr_amendments_closed_keep';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "ctr_amendments_keep"
    BEFORE UPDATE ON "ctr_amendments"
    FOR EACH ROW EXECUTE FUNCTION "ctr_keep_amendments"();

-- Aviso nuevo y adjuntos del expediente contractual.
ALTER TABLE "ntf_templates" DROP CONSTRAINT "ntf_templates_key_check";
ALTER TABLE "ntf_notifications" DROP CONSTRAINT "ntf_notifications_kind_check";
ALTER TABLE "ntf_preferences" DROP CONSTRAINT "ntf_preferences_event_key_check";

ALTER TABLE "ntf_templates"
    ADD CONSTRAINT "ntf_templates_key_check" CHECK ("key" IN ('task_assigned', 'task_escalated',
        'comment_mention', 'security_alert', 'doc_read_requested', 'doc_request_decided',
        'crm_activity_due', 'crm_quote_update', 'ctr_contract_update'));
ALTER TABLE "ntf_notifications"
    ADD CONSTRAINT "ntf_notifications_kind_check" CHECK ("kind" IN ('task_assigned', 'task_escalated',
        'comment_mention', 'security_alert', 'doc_read_requested', 'doc_request_decided',
        'crm_activity_due', 'crm_quote_update', 'ctr_contract_update'));
ALTER TABLE "ntf_preferences"
    ADD CONSTRAINT "ntf_preferences_event_key_check" CHECK ("event_key" IN ('task_assigned',
        'task_escalated', 'comment_mention', 'security_alert', 'doc_read_requested',
        'doc_request_decided', 'crm_activity_due', 'crm_quote_update', 'ctr_contract_update'));

ALTER TABLE "core_comments" DROP CONSTRAINT "core_comments_entity_type_check";
ALTER TABLE "core_attachments" DROP CONSTRAINT "core_attachments_entity_type_check";
ALTER TABLE "core_comments"
    ADD CONSTRAINT "core_comments_entity_type_check"
        CHECK ("entity_type" IN ('party', 'wf_instance', 'ctr_contract'));
ALTER TABLE "core_attachments"
    ADD CONSTRAINT "core_attachments_entity_type_check"
        CHECK ("entity_type" IN ('party', 'wf_instance', 'ctr_contract'));

-- Columnas de control --------------------------------------------------------------------------

CREATE TRIGGER "ctr_clause_library_control_columns"
    BEFORE INSERT OR UPDATE ON "ctr_clause_library"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();
CREATE TRIGGER "ctr_templates_control_columns"
    BEFORE INSERT OR UPDATE ON "ctr_templates"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();
CREATE TRIGGER "ctr_template_clauses_control_columns"
    BEFORE INSERT OR UPDATE ON "ctr_template_clauses"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();
CREATE TRIGGER "ctr_contracts_control_columns"
    BEFORE INSERT OR UPDATE ON "ctr_contracts"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();
CREATE TRIGGER "ctr_contract_clauses_control_columns"
    BEFORE INSERT OR UPDATE ON "ctr_contract_clauses"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();
CREATE TRIGGER "ctr_obligations_control_columns"
    BEFORE INSERT OR UPDATE ON "ctr_obligations"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();
CREATE TRIGGER "ctr_amendments_control_columns"
    BEFORE INSERT OR UPDATE ON "ctr_amendments"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();

-- Seguridad por fila (ADR-007) -----------------------------------------------------------------

ALTER TABLE "ctr_clause_library" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ctr_clause_library" FORCE ROW LEVEL SECURITY;
CREATE POLICY "ctr_clause_library_tenant_isolation" ON "ctr_clause_library"
    USING ("tenant_id" = core_current_tenant_id())
    WITH CHECK ("tenant_id" = core_current_tenant_id());

ALTER TABLE "ctr_templates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ctr_templates" FORCE ROW LEVEL SECURITY;
CREATE POLICY "ctr_templates_tenant_isolation" ON "ctr_templates"
    USING ("tenant_id" = core_current_tenant_id())
    WITH CHECK ("tenant_id" = core_current_tenant_id());

ALTER TABLE "ctr_template_clauses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ctr_template_clauses" FORCE ROW LEVEL SECURITY;
CREATE POLICY "ctr_template_clauses_tenant_isolation" ON "ctr_template_clauses"
    USING ("tenant_id" = core_current_tenant_id())
    WITH CHECK ("tenant_id" = core_current_tenant_id());

ALTER TABLE "ctr_contracts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ctr_contracts" FORCE ROW LEVEL SECURITY;
CREATE POLICY "ctr_contracts_tenant_isolation" ON "ctr_contracts"
    USING ("tenant_id" = core_current_tenant_id())
    WITH CHECK ("tenant_id" = core_current_tenant_id());

ALTER TABLE "ctr_contract_clauses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ctr_contract_clauses" FORCE ROW LEVEL SECURITY;
CREATE POLICY "ctr_contract_clauses_tenant_isolation" ON "ctr_contract_clauses"
    USING ("tenant_id" = core_current_tenant_id())
    WITH CHECK ("tenant_id" = core_current_tenant_id());

ALTER TABLE "ctr_obligations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ctr_obligations" FORCE ROW LEVEL SECURITY;
CREATE POLICY "ctr_obligations_tenant_isolation" ON "ctr_obligations"
    USING ("tenant_id" = core_current_tenant_id())
    WITH CHECK ("tenant_id" = core_current_tenant_id());

ALTER TABLE "ctr_amendments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ctr_amendments" FORCE ROW LEVEL SECURITY;
CREATE POLICY "ctr_amendments_tenant_isolation" ON "ctr_amendments"
    USING ("tenant_id" = core_current_tenant_id())
    WITH CHECK ("tenant_id" = core_current_tenant_id());

-- Permisos de la API ---------------------------------------------------------------------------
-- Sin DELETE: el borrado es lógico (las cláusulas de un borrador que se reemplazan quedan
-- borradas lógicamente).

GRANT SELECT, INSERT, UPDATE ON "ctr_clause_library" TO app_user;
GRANT SELECT, INSERT, UPDATE ON "ctr_templates" TO app_user;
GRANT SELECT, INSERT, UPDATE ON "ctr_template_clauses" TO app_user;
GRANT SELECT, INSERT, UPDATE ON "ctr_contracts" TO app_user;
GRANT SELECT, INSERT, UPDATE ON "ctr_contract_clauses" TO app_user;
GRANT SELECT, INSERT, UPDATE ON "ctr_obligations" TO app_user;
GRANT SELECT, INSERT, UPDATE ON "ctr_amendments" TO app_user;

-- Trabajos del worker --------------------------------------------------------------------------
-- El worker genera cada pocos segundos los PDF de los contratos y otrosíes aprobados y, cada día,
-- revisa los vencimientos y las obligaciones. Solo obtiene los identificadores de las empresas con
-- algo pendiente, como crm_tenants_with_quote_work (B23).

-- Las funciones son de migration_user y la seguridad por fila es forzada: estas políticas le dejan
-- leer las filas de todas las empresas, solo dentro de las funciones, como en crm_quotes (B23).
CREATE POLICY "ctr_contracts_system_lookup" ON "ctr_contracts"
    FOR SELECT TO migration_user USING (true);
CREATE POLICY "ctr_amendments_system_lookup" ON "ctr_amendments"
    FOR SELECT TO migration_user USING (true);
CREATE POLICY "ctr_obligations_system_lookup" ON "ctr_obligations"
    FOR SELECT TO migration_user USING (true);

CREATE FUNCTION "ctr_tenants_with_pdf_work"() RETURNS SETOF UUID
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
    AS $$ SELECT tenant_id FROM ctr_contracts WHERE pdf_status = 'pending' AND deleted_at IS NULL
          UNION
          SELECT tenant_id FROM ctr_amendments WHERE pdf_status = 'pending' AND deleted_at IS NULL
          ORDER BY 1 $$;

CREATE FUNCTION "ctr_tenants_with_follow_up"() RETURNS SETOF UUID
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
    AS $$ SELECT tenant_id FROM ctr_contracts
          WHERE status IN ('active', 'expiring') AND deleted_at IS NULL
          UNION
          SELECT tenant_id FROM ctr_obligations WHERE status = 'pending' AND deleted_at IS NULL
          ORDER BY 1 $$;

REVOKE EXECUTE ON FUNCTION "ctr_tenants_with_pdf_work"() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION "ctr_tenants_with_follow_up"() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "ctr_tenants_with_pdf_work"() TO app_user;
GRANT EXECUTE ON FUNCTION "ctr_tenants_with_follow_up"() TO app_user;
