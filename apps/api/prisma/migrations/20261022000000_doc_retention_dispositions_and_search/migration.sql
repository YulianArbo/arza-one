-- B21: retención, disposición y búsqueda (M03, ficha 17.4, numerales 12.4 y 13.2). Tabla de
-- retención RE-SGC-005 (doc_retention_rules), propuesta mensual de disposición con su acta
-- (doc_disposition_proposals y doc_dispositions) y texto de las versiones para la búsqueda de texto
-- completo en español y sin tildes (doc_version_texts). Nada se elimina sin regla vencida y
-- aprobación: lo revisa también la base de datos.
-- AlterTable
ALTER TABLE "doc_documents" ADD COLUMN     "disposed_at" TIMESTAMPTZ(6),
ADD COLUMN     "retention_rule_id" UUID;

-- Búsqueda en español sin tildes (numeral 13.2): «gestion» encuentra «gestión». unaccent es una
-- extensión de confianza de PostgreSQL: la instala el dueño de la base sin ser superusuario.
CREATE EXTENSION IF NOT EXISTS "unaccent";

CREATE TEXT SEARCH CONFIGURATION "doc_spanish" (COPY = pg_catalog.spanish);
ALTER TEXT SEARCH CONFIGURATION "doc_spanish"
    ALTER MAPPING FOR hword, hword_part, word WITH unaccent, spanish_stem;

-- CreateTable
CREATE TABLE "doc_retention_rules" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "doc_type" TEXT,
    "process_id" UUID,
    "active_years" INTEGER NOT NULL,
    "archive_years" INTEGER NOT NULL,
    "disposition" TEXT NOT NULL,
    "legal_basis" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "doc_retention_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "doc_disposition_proposals" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "period" DATE NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'review',
    "workflow_instance_id" UUID,
    "sent_by" UUID,
    "sent_at" TIMESTAMPTZ(6),
    "decided_by" UUID,
    "decided_at" TIMESTAMPTZ(6),
    "decision_note" TEXT,
    "executed_at" TIMESTAMPTZ(6),
    "certificate_file_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "doc_disposition_proposals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "doc_dispositions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "proposal_id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "retention_rule_id" UUID NOT NULL,
    "due_on" DATE NOT NULL,
    "action" TEXT NOT NULL DEFAULT 'destroy',
    "keep_reason" TEXT,
    "executed_by" UUID,
    "executed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "doc_dispositions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "doc_version_texts" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "version_id" UUID NOT NULL,
    "status" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "doc_version_texts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "doc_retention_rules_tenant_id_doc_type_idx" ON "doc_retention_rules"("tenant_id", "doc_type");

-- CreateIndex
CREATE INDEX "doc_retention_rules_tenant_id_process_id_idx" ON "doc_retention_rules"("tenant_id", "process_id");

-- CreateIndex
CREATE UNIQUE INDEX "doc_retention_rules_tenant_id_id_key" ON "doc_retention_rules"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "doc_retention_rules_tenant_id_code_key" ON "doc_retention_rules"("tenant_id", "code");

-- CreateIndex
CREATE INDEX "doc_disposition_proposals_tenant_id_status_idx" ON "doc_disposition_proposals"("tenant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "doc_disposition_proposals_tenant_id_id_key" ON "doc_disposition_proposals"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "doc_disposition_proposals_tenant_id_code_key" ON "doc_disposition_proposals"("tenant_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "doc_disposition_proposals_tenant_id_period_key" ON "doc_disposition_proposals"("tenant_id", "period");

-- CreateIndex
CREATE UNIQUE INDEX "doc_disposition_proposals_tenant_id_workflow_instance_id_key" ON "doc_disposition_proposals"("tenant_id", "workflow_instance_id");

-- CreateIndex
CREATE INDEX "doc_dispositions_tenant_id_document_id_idx" ON "doc_dispositions"("tenant_id", "document_id");

-- CreateIndex
CREATE UNIQUE INDEX "doc_dispositions_tenant_id_id_key" ON "doc_dispositions"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "doc_dispositions_tenant_id_proposal_id_document_id_key" ON "doc_dispositions"("tenant_id", "proposal_id", "document_id");

-- CreateIndex
CREATE INDEX "doc_version_texts_tenant_id_document_id_idx" ON "doc_version_texts"("tenant_id", "document_id");

-- CreateIndex
CREATE UNIQUE INDEX "doc_version_texts_tenant_id_id_key" ON "doc_version_texts"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "doc_version_texts_tenant_id_version_id_key" ON "doc_version_texts"("tenant_id", "version_id");

-- CreateIndex
CREATE INDEX "doc_documents_tenant_id_retention_rule_id_idx" ON "doc_documents"("tenant_id", "retention_rule_id");

-- AddForeignKey
ALTER TABLE "doc_documents" ADD CONSTRAINT "doc_documents_tenant_id_retention_rule_id_fkey" FOREIGN KEY ("tenant_id", "retention_rule_id") REFERENCES "doc_retention_rules"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doc_retention_rules" ADD CONSTRAINT "doc_retention_rules_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doc_disposition_proposals" ADD CONSTRAINT "doc_disposition_proposals_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doc_disposition_proposals" ADD CONSTRAINT "doc_disposition_proposals_tenant_id_certificate_file_id_fkey" FOREIGN KEY ("tenant_id", "certificate_file_id") REFERENCES "doc_files"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doc_dispositions" ADD CONSTRAINT "doc_dispositions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doc_dispositions" ADD CONSTRAINT "doc_dispositions_tenant_id_proposal_id_fkey" FOREIGN KEY ("tenant_id", "proposal_id") REFERENCES "doc_disposition_proposals"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doc_dispositions" ADD CONSTRAINT "doc_dispositions_tenant_id_document_id_fkey" FOREIGN KEY ("tenant_id", "document_id") REFERENCES "doc_documents"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doc_dispositions" ADD CONSTRAINT "doc_dispositions_tenant_id_retention_rule_id_fkey" FOREIGN KEY ("tenant_id", "retention_rule_id") REFERENCES "doc_retention_rules"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doc_version_texts" ADD CONSTRAINT "doc_version_texts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doc_version_texts" ADD CONSTRAINT "doc_version_texts_tenant_id_document_id_fkey" FOREIGN KEY ("tenant_id", "document_id") REFERENCES "doc_documents"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doc_version_texts" ADD CONSTRAINT "doc_version_texts_tenant_id_version_id_fkey" FOREIGN KEY ("tenant_id", "version_id") REFERENCES "doc_versions"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;





-- Reglas de los datos -------------------------------------------------------------------------
-- Los valores permitidos son los de packages/contracts/src/doc.

-- Un documento eliminado por disposición final conserva su ficha (código y nombre, para el acta),
-- sin contenido.
ALTER TABLE "doc_documents" DROP CONSTRAINT "doc_documents_status_check";
ALTER TABLE "doc_documents"
    ADD CONSTRAINT "doc_documents_status_check"
        CHECK ("status" IN ('draft', 'current', 'obsolete', 'disposed')),
    ADD CONSTRAINT "doc_documents_disposed_check"
        CHECK (("status" = 'disposed') = ("disposed_at" IS NOT NULL));

-- El contenido de un archivo eliminado por disposición ya no está en el almacenamiento.
ALTER TABLE "doc_files" DROP CONSTRAINT "doc_files_scan_status_check";
ALTER TABLE "doc_files"
    ADD CONSTRAINT "doc_files_scan_status_check" CHECK ("scan_status" IN (
        'pending_upload', 'scanning', 'available', 'rejected', 'disposed'));

ALTER TABLE "doc_retention_rules"
    ADD CONSTRAINT "doc_retention_rules_code_check" CHECK ("code" ~ '^[A-Z0-9][A-Z0-9-]{0,19}$'),
    ADD CONSTRAINT "doc_retention_rules_name_check" CHECK (char_length(btrim("name")) BETWEEN 3 AND 200),
    ADD CONSTRAINT "doc_retention_rules_doc_type_check"
        CHECK ("doc_type" IS NULL OR "doc_type" ~ '^[A-Z]{2,3}$'),
    -- Una regla dice a qué se aplica: un tipo, un proceso o los dos.
    ADD CONSTRAINT "doc_retention_rules_target_check"
        CHECK ("doc_type" IS NOT NULL OR "process_id" IS NOT NULL),
    ADD CONSTRAINT "doc_retention_rules_years_check" CHECK (
        "active_years" BETWEEN 0 AND 100 AND "archive_years" BETWEEN 0 AND 100
        AND "active_years" + "archive_years" >= 1),
    ADD CONSTRAINT "doc_retention_rules_disposition_check" CHECK ("disposition" IN ('destroy', 'keep')),
    ADD CONSTRAINT "doc_retention_rules_legal_basis_check"
        CHECK (char_length(btrim("legal_basis")) BETWEEN 3 AND 500),
    ADD CONSTRAINT "doc_retention_rules_version_check" CHECK ("version" > 0);

-- Una sola regla activa por tipo y proceso: así siempre se sabe cuál se aplica.
CREATE UNIQUE INDEX "doc_retention_rules_active_target_key" ON "doc_retention_rules" (
    "tenant_id", COALESCE("doc_type", ''),
    COALESCE("process_id", '00000000-0000-0000-0000-000000000000'::uuid))
    WHERE "is_active" AND "deleted_at" IS NULL;

ALTER TABLE "doc_disposition_proposals"
    ADD CONSTRAINT "doc_disposition_proposals_code_check" CHECK ("code" ~ '^DIS-[0-9]{4}-[0-9]{4,8}$'),
    ADD CONSTRAINT "doc_disposition_proposals_period_check"
        CHECK ("period" = date_trunc('month', "period")::date),
    ADD CONSTRAINT "doc_disposition_proposals_status_check"
        CHECK ("status" IN ('review', 'in_approval', 'approved', 'rejected', 'executed')),
    ADD CONSTRAINT "doc_disposition_proposals_sent_check"
        CHECK (("status" = 'review') = ("sent_by" IS NULL AND "sent_at" IS NULL)),
    ADD CONSTRAINT "doc_disposition_proposals_decided_check" CHECK (
        ("status" IN ('approved', 'rejected', 'executed'))
            = ("decided_by" IS NOT NULL AND "decided_at" IS NOT NULL)),
    -- Quien envía la propuesta no la aprueba.
    ADD CONSTRAINT "doc_disposition_proposals_decider_check"
        CHECK ("decided_by" IS NULL OR "decided_by" <> "sent_by"),
    ADD CONSTRAINT "doc_disposition_proposals_note_check" CHECK (
        ("status" <> 'rejected' OR "decision_note" IS NOT NULL)
        AND ("decision_note" IS NULL OR char_length(btrim("decision_note")) BETWEEN 5 AND 2000)),
    ADD CONSTRAINT "doc_disposition_proposals_executed_check" CHECK (
        ("status" = 'executed') = ("executed_at" IS NOT NULL AND "certificate_file_id" IS NOT NULL)),
    ADD CONSTRAINT "doc_disposition_proposals_version_check" CHECK ("version" > 0);

ALTER TABLE "doc_dispositions"
    ADD CONSTRAINT "doc_dispositions_action_check" CHECK ("action" IN ('destroy', 'keep')),
    ADD CONSTRAINT "doc_dispositions_keep_reason_check" CHECK (
        ("action" = 'keep') = ("keep_reason" IS NOT NULL)
        AND ("keep_reason" IS NULL OR char_length(btrim("keep_reason")) BETWEEN 5 AND 500)),
    ADD CONSTRAINT "doc_dispositions_executed_check" CHECK (
        ("executed_at" IS NULL OR "action" = 'destroy')
        AND (("executed_at" IS NULL) = ("executed_by" IS NULL))),
    ADD CONSTRAINT "doc_dispositions_version_check" CHECK ("version" > 0);

ALTER TABLE "doc_version_texts"
    ADD CONSTRAINT "doc_version_texts_status_check"
        CHECK ("status" IN ('ready', 'empty', 'failed', 'disposed')),
    ADD CONSTRAINT "doc_version_texts_content_check" CHECK (
        char_length("content") <= 300000
        AND (("status" = 'ready') = (char_length("content") > 0))),
    ADD CONSTRAINT "doc_version_texts_version_check" CHECK ("version" > 0);

-- Búsqueda: el texto de las versiones, y el código y el título de los documentos.
CREATE INDEX "doc_version_texts_search_idx" ON "doc_version_texts"
    USING GIN (to_tsvector('doc_spanish'::regconfig, "content"));
CREATE INDEX "doc_documents_search_idx" ON "doc_documents"
    USING GIN (to_tsvector('doc_spanish'::regconfig, "code" || ' ' || "title"));

-- Retención (numeral 12.4) ---------------------------------------------------------------------
-- Una sola definición, que usan la API, el worker y los disparadores: la regla que se aplica a un
-- documento, desde cuándo corre su plazo y cuándo vence. Respetan la seguridad por fila.

-- La propia del documento si está activa; si no, la activa más específica de su tipo y su proceso.
CREATE FUNCTION "doc_retention_rule_of"("document" "doc_documents") RETURNS UUID
    LANGUAGE sql STABLE
    AS $$
    SELECT COALESCE(
        (SELECT r.id FROM doc_retention_rules r
         WHERE r.tenant_id = document.tenant_id AND r.id = document.retention_rule_id
             AND r.is_active AND r.deleted_at IS NULL),
        (SELECT r.id FROM doc_retention_rules r
         WHERE r.tenant_id = document.tenant_id AND r.is_active AND r.deleted_at IS NULL
             AND (r.doc_type IS NULL OR r.doc_type = document.doc_type)
             AND (r.process_id IS NULL OR r.process_id = document.process_id)
         ORDER BY (r.doc_type IS NOT NULL AND r.process_id IS NOT NULL) DESC,
             (r.doc_type IS NOT NULL) DESC
         LIMIT 1))
    $$;

-- Desde cuándo corre el plazo, en fecha de Bogotá: un documento del SGC, desde que quedó obsoleto
-- (uno vigente nunca vence); uno de expediente, desde su última publicación. Sin fecha si es un
-- borrador o ya se eliminó.
CREATE FUNCTION "doc_retention_base_on"("document" "doc_documents") RETURNS DATE
    LANGUAGE sql STABLE
    AS $$
    SELECT (CASE
        WHEN document.status NOT IN ('current', 'obsolete') THEN NULL
        WHEN document.is_controlled AND document.status <> 'obsolete' THEN NULL
        WHEN document.is_controlled THEN
            (SELECT max(v.obsoleted_at) FROM doc_versions v
             WHERE v.tenant_id = document.tenant_id AND v.document_id = document.id
                 AND v.deleted_at IS NULL)
        ELSE
            (SELECT max(v.published_at) FROM doc_versions v
             WHERE v.tenant_id = document.tenant_id AND v.document_id = document.id
                 AND v.status IN ('current', 'obsolete') AND v.deleted_at IS NULL)
        END AT TIME ZONE 'America/Bogota')::date
    $$;

-- Cuándo vence la retención: la fecha base más los años del archivo de gestión y del central.
CREATE FUNCTION "doc_retention_due_on"("document" "doc_documents") RETURNS DATE
    LANGUAGE sql STABLE
    AS $$
    SELECT (doc_retention_base_on(document)
            + make_interval(years => r.active_years + r.archive_years))::date
    FROM doc_retention_rules r
    WHERE r.tenant_id = document.tenant_id AND r.id = doc_retention_rule_of(document)
    $$;

-- Un documento se elimina solo si su regla dice eliminar, ya venció y una propuesta aprobada lo
-- incluye para eliminarlo (ficha 17.4). Eliminado, ya no cambia.
CREATE OR REPLACE FUNCTION "doc_keep_documents"() RETURNS TRIGGER
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF OLD.status = 'disposed' THEN
        RAISE EXCEPTION 'Un documento eliminado por disposición final no se puede cambiar'
            USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    IF NEW.code IS DISTINCT FROM OLD.code
        OR NEW.doc_type IS DISTINCT FROM OLD.doc_type
        OR NEW.process_id IS DISTINCT FROM OLD.process_id
        OR NEW.is_controlled IS DISTINCT FROM OLD.is_controlled
        OR NEW.folder_id IS DISTINCT FROM OLD.folder_id
        OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
        OR (OLD.status <> 'draft' AND NEW.status = 'draft') THEN
        RAISE EXCEPTION 'El código, el tipo, el proceso y la carpeta de un documento no cambian'
            USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    IF OLD.status <> 'draft'
        AND NEW.current_version_id IS NOT DISTINCT FROM OLD.current_version_id
        AND (NEW.title IS DISTINCT FROM OLD.title
            OR NEW.classification IS DISTINCT FROM OLD.classification
            OR NEW.owner_position_id IS DISTINCT FROM OLD.owner_position_id) THEN
        RAISE EXCEPTION 'Un documento publicado solo cambia con una versión nueva'
            USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    IF NEW.status = 'disposed' AND NOT (
        NEW.current_version_id IS NOT DISTINCT FROM OLD.current_version_id
        AND NEW.retention_rule_id IS NOT DISTINCT FROM OLD.retention_rule_id
        AND doc_retention_due_on(OLD) <= (now() AT TIME ZONE 'America/Bogota')::date
        AND EXISTS (
            SELECT 1 FROM doc_retention_rules r
            WHERE r.tenant_id = OLD.tenant_id AND r.id = doc_retention_rule_of(OLD)
                AND r.disposition = 'destroy')
        AND EXISTS (
            SELECT 1 FROM doc_dispositions d
            JOIN doc_disposition_proposals p ON p.tenant_id = d.tenant_id AND p.id = d.proposal_id
            WHERE d.tenant_id = OLD.tenant_id AND d.document_id = OLD.id AND d.action = 'destroy'
                AND d.deleted_at IS NULL AND p.status = 'approved' AND p.deleted_at IS NULL)) THEN
        RAISE EXCEPTION 'Nada se elimina sin regla de retención vencida y aprobación'
            USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    RETURN NEW;
END;
$$;

-- Un archivo analizado no cambia; solo puede quedar eliminado si es de un documento eliminado por
-- disposición final (su fuente, su PDF o su copia de consulta).
CREATE OR REPLACE FUNCTION "doc_keep_analyzed_files"() RETURNS TRIGGER
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF OLD.scan_status = 'available' AND NEW.scan_status = 'disposed'
        AND NEW.sha256 IS NOT DISTINCT FROM OLD.sha256
        AND NEW.storage_key IS NOT DISTINCT FROM OLD.storage_key
        AND NEW.size_bytes IS NOT DISTINCT FROM OLD.size_bytes
        AND NEW.mime_type IS NOT DISTINCT FROM OLD.mime_type
        AND NEW.rejection IS NOT DISTINCT FROM OLD.rejection
        AND EXISTS (
            SELECT 1 FROM doc_versions v
            JOIN doc_documents d ON d.tenant_id = v.tenant_id AND d.id = v.document_id
            WHERE v.tenant_id = OLD.tenant_id AND d.status = 'disposed'
                AND OLD.id IN (v.source_file_id, v.pdf_file_id, v.copy_file_id)) THEN
        RETURN NEW;
    END IF;
    IF OLD.scan_status IN ('available', 'rejected', 'disposed') AND (
        NEW.scan_status IS DISTINCT FROM OLD.scan_status
        OR NEW.sha256 IS DISTINCT FROM OLD.sha256
        OR NEW.storage_key IS DISTINCT FROM OLD.storage_key
        OR NEW.size_bytes IS DISTINCT FROM OLD.size_bytes
        OR NEW.mime_type IS DISTINCT FROM OLD.mime_type
        OR NEW.rejection IS DISTINCT FROM OLD.rejection) THEN
        RAISE EXCEPTION 'Un archivo ya analizado no se puede cambiar'
            USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    RETURN NEW;
END;
$$;

-- Una regla conserva su código.
CREATE FUNCTION "doc_keep_retention_rules"() RETURNS TRIGGER
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF NEW.code IS DISTINCT FROM OLD.code OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at THEN
        RAISE EXCEPTION 'El código de una regla de retención no cambia'
            USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "doc_retention_rules_keep"
    BEFORE UPDATE ON "doc_retention_rules"
    FOR EACH ROW EXECUTE FUNCTION "doc_keep_retention_rules"();

-- Una propuesta conserva su código y su mes, y solo avanza por los pasos de su ciclo.
CREATE FUNCTION "doc_keep_disposition_proposals"() RETURNS TRIGGER
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF NEW.code IS DISTINCT FROM OLD.code
        OR NEW.period IS DISTINCT FROM OLD.period
        OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
        OR (OLD.workflow_instance_id IS NOT NULL
            AND NEW.workflow_instance_id IS DISTINCT FROM OLD.workflow_instance_id)
        OR (OLD.status <> 'review' AND (NEW.sent_by IS DISTINCT FROM OLD.sent_by
            OR NEW.sent_at IS DISTINCT FROM OLD.sent_at))
        OR (OLD.status IN ('approved', 'rejected', 'executed')
            AND (NEW.decided_by IS DISTINCT FROM OLD.decided_by
                OR NEW.decided_at IS DISTINCT FROM OLD.decided_at
                OR NEW.decision_note IS DISTINCT FROM OLD.decision_note))
        OR (OLD.status = 'executed' AND (NEW.executed_at IS DISTINCT FROM OLD.executed_at
            OR NEW.certificate_file_id IS DISTINCT FROM OLD.certificate_file_id))
        OR NOT ((OLD.status = NEW.status)
            OR (OLD.status = 'review' AND NEW.status = 'in_approval')
            OR (OLD.status = 'in_approval' AND NEW.status IN ('approved', 'rejected'))
            OR (OLD.status = 'approved' AND NEW.status = 'executed')) THEN
        RAISE EXCEPTION 'Una propuesta de disposición solo avanza por los pasos de su ciclo'
            USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "doc_disposition_proposals_keep"
    BEFORE UPDATE ON "doc_disposition_proposals"
    FOR EACH ROW EXECUTE FUNCTION "doc_keep_disposition_proposals"();

-- Los documentos de una propuesta se agregan y se deciden (eliminar o conservar) solo mientras
-- Calidad la revisa; la eliminación se marca una sola vez, con la propuesta aprobada.
CREATE FUNCTION "doc_keep_dispositions"() RETURNS TRIGGER
    LANGUAGE plpgsql
    AS $$
DECLARE
    proposal_status TEXT;
BEGIN
    SELECT status INTO proposal_status FROM doc_disposition_proposals
    WHERE tenant_id = NEW.tenant_id AND id = NEW.proposal_id;
    IF TG_OP = 'INSERT' THEN
        IF proposal_status IS DISTINCT FROM 'review' OR NEW.executed_at IS NOT NULL THEN
            RAISE EXCEPTION 'Solo se agregan documentos a una propuesta en revisión'
                USING ERRCODE = 'integrity_constraint_violation';
        END IF;
        RETURN NEW;
    END IF;
    IF NEW.proposal_id IS DISTINCT FROM OLD.proposal_id
        OR NEW.document_id IS DISTINCT FROM OLD.document_id
        OR NEW.retention_rule_id IS DISTINCT FROM OLD.retention_rule_id
        OR NEW.due_on IS DISTINCT FROM OLD.due_on
        OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
        OR (proposal_status <> 'review' AND (NEW.action IS DISTINCT FROM OLD.action
            OR NEW.keep_reason IS DISTINCT FROM OLD.keep_reason))
        OR (OLD.executed_at IS NOT NULL AND (NEW.executed_at IS DISTINCT FROM OLD.executed_at
            OR NEW.executed_by IS DISTINCT FROM OLD.executed_by))
        OR (NEW.executed_at IS NOT NULL AND proposal_status <> 'approved'
            AND OLD.executed_at IS NULL) THEN
        RAISE EXCEPTION 'Un documento de una propuesta de disposición no se puede cambiar así'
            USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "doc_dispositions_keep"
    BEFORE INSERT OR UPDATE ON "doc_dispositions"
    FOR EACH ROW EXECUTE FUNCTION "doc_keep_dispositions"();

-- El texto de una versión no cambia; solo se borra cuando su documento se elimina.
CREATE FUNCTION "doc_keep_version_texts"() RETURNS TRIGGER
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF NEW.document_id IS DISTINCT FROM OLD.document_id
        OR NEW.version_id IS DISTINCT FROM OLD.version_id
        OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
        OR OLD.status = 'disposed'
        OR (NEW.status IS DISTINCT FROM OLD.status OR NEW.content IS DISTINCT FROM OLD.content)
            AND NOT (NEW.status = 'disposed' AND NEW.content = '' AND EXISTS (
                SELECT 1 FROM doc_documents d
                WHERE d.tenant_id = OLD.tenant_id AND d.id = OLD.document_id
                    AND d.status = 'disposed')) THEN
        RAISE EXCEPTION 'El texto de una versión no se puede cambiar'
            USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "doc_version_texts_keep"
    BEFORE UPDATE ON "doc_version_texts"
    FOR EACH ROW EXECUTE FUNCTION "doc_keep_version_texts"();

-- Columnas de control --------------------------------------------------------------------------

CREATE TRIGGER "doc_retention_rules_control_columns"
    BEFORE INSERT OR UPDATE ON "doc_retention_rules"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();
CREATE TRIGGER "doc_disposition_proposals_control_columns"
    BEFORE INSERT OR UPDATE ON "doc_disposition_proposals"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();
CREATE TRIGGER "doc_dispositions_control_columns"
    BEFORE INSERT OR UPDATE ON "doc_dispositions"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();
CREATE TRIGGER "doc_version_texts_control_columns"
    BEFORE INSERT OR UPDATE ON "doc_version_texts"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();

-- Seguridad por fila (ADR-007) -----------------------------------------------------------------

ALTER TABLE "doc_retention_rules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "doc_retention_rules" FORCE ROW LEVEL SECURITY;
CREATE POLICY "doc_retention_rules_tenant_isolation" ON "doc_retention_rules"
    USING ("tenant_id" = core_current_tenant_id())
    WITH CHECK ("tenant_id" = core_current_tenant_id());

ALTER TABLE "doc_disposition_proposals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "doc_disposition_proposals" FORCE ROW LEVEL SECURITY;
CREATE POLICY "doc_disposition_proposals_tenant_isolation" ON "doc_disposition_proposals"
    USING ("tenant_id" = core_current_tenant_id())
    WITH CHECK ("tenant_id" = core_current_tenant_id());

ALTER TABLE "doc_dispositions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "doc_dispositions" FORCE ROW LEVEL SECURITY;
CREATE POLICY "doc_dispositions_tenant_isolation" ON "doc_dispositions"
    USING ("tenant_id" = core_current_tenant_id())
    WITH CHECK ("tenant_id" = core_current_tenant_id());

ALTER TABLE "doc_version_texts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "doc_version_texts" FORCE ROW LEVEL SECURITY;
CREATE POLICY "doc_version_texts_tenant_isolation" ON "doc_version_texts"
    USING ("tenant_id" = core_current_tenant_id())
    WITH CHECK ("tenant_id" = core_current_tenant_id());

-- Permisos de la API ---------------------------------------------------------------------------
-- Sin DELETE: el borrado es lógico (deleted_at). La disposición final borra el contenido del
-- almacenamiento y deja la fila marcada.

GRANT SELECT, INSERT, UPDATE ON "doc_retention_rules" TO app_user;
GRANT SELECT, INSERT, UPDATE ON "doc_disposition_proposals" TO app_user;
GRANT SELECT, INSERT, UPDATE ON "doc_dispositions" TO app_user;
GRANT SELECT, INSERT, UPDATE ON "doc_version_texts" TO app_user;

-- Trabajos del worker --------------------------------------------------------------------------
-- El worker propone cada mes, ejecuta las propuestas aprobadas y extrae el texto de las versiones
-- vigentes de todas las empresas. Para saber en cuáles hay trabajo, sin leer nada más fuera de la
-- seguridad por fila, solo obtiene los identificadores de esas empresas, igual que
-- doc_tenants_with_pending_pdfs (B20).

CREATE POLICY "doc_documents_retention_lookup" ON "doc_documents"
    FOR SELECT TO migration_user USING (true);
CREATE POLICY "doc_disposition_proposals_lookup" ON "doc_disposition_proposals"
    FOR SELECT TO migration_user USING (true);
CREATE POLICY "doc_version_texts_lookup" ON "doc_version_texts"
    FOR SELECT TO migration_user USING (true);

-- Empresas con documentos publicados: pueden tener retenciones vencidas.
CREATE FUNCTION "doc_tenants_with_published_documents"() RETURNS SETOF UUID
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
    AS $$ SELECT DISTINCT tenant_id FROM doc_documents
          WHERE status IN ('current', 'obsolete') AND deleted_at IS NULL
          ORDER BY 1 $$;

-- Empresas con propuestas aprobadas que falta ejecutar.
CREATE FUNCTION "doc_tenants_with_approved_dispositions"() RETURNS SETOF UUID
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
    AS $$ SELECT DISTINCT tenant_id FROM doc_disposition_proposals
          WHERE status = 'approved' AND deleted_at IS NULL
          ORDER BY 1 $$;

-- Empresas con versiones vigentes, con su PDF, cuyo texto aún no se extrajo.
CREATE FUNCTION "doc_tenants_with_pending_texts"() RETURNS SETOF UUID
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
    AS $$ SELECT DISTINCT v.tenant_id FROM doc_versions v
          WHERE v.status = 'current' AND v.pdf_file_id IS NOT NULL AND v.deleted_at IS NULL
              AND NOT EXISTS (SELECT 1 FROM doc_version_texts t
                              WHERE t.tenant_id = v.tenant_id AND t.version_id = v.id)
          ORDER BY 1 $$;

-- La copia de consulta (B20) solo se genera de una versión vigente con su PDF disponible: el de un
-- documento eliminado por disposición final ya no existe.
CREATE POLICY "doc_files_pdf_lookup" ON "doc_files"
    FOR SELECT TO migration_user USING (true);

CREATE OR REPLACE FUNCTION "doc_tenants_with_pending_pdfs"() RETURNS SETOF UUID
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
    AS $$ SELECT tenant_id FROM doc_form_records
          WHERE render_status = 'pending' AND deleted_at IS NULL
          UNION
          SELECT v.tenant_id FROM doc_versions v
          JOIN doc_files f ON f.tenant_id = v.tenant_id AND f.id = v.pdf_file_id
          WHERE v.status = 'current' AND v.copy_file_id IS NULL AND v.deleted_at IS NULL
              AND f.scan_status = 'available'
          ORDER BY 1 $$;

REVOKE EXECUTE ON FUNCTION "doc_tenants_with_published_documents"() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "doc_tenants_with_published_documents"() TO app_user;
REVOKE EXECUTE ON FUNCTION "doc_tenants_with_approved_dispositions"() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "doc_tenants_with_approved_dispositions"() TO app_user;
REVOKE EXECUTE ON FUNCTION "doc_tenants_with_pending_texts"() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "doc_tenants_with_pending_texts"() TO app_user;
