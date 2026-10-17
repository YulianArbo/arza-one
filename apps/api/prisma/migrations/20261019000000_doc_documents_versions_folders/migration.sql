-- B18: documentos, versiones y expedientes (M03, ficha 17.4). Carpetas y expedientes, el documento
-- lógico con su código PR-SGC-001, sus versiones con archivo fuente y PDF, los vínculos con
-- registros de otros módulos y el registro de accesos a lo confidencial y restringido.
-- core_sequences admite consecutivos sin año para la codificación TIPO-PROCESO-NNN.

-- AlterTable
ALTER TABLE "core_sequences" ADD COLUMN     "yearly" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "doc_folders" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "parent_id" UUID,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'folder',
    "entity_type" TEXT,
    "entity_id" UUID,
    "classification" TEXT NOT NULL DEFAULT 'internal',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "doc_folders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "doc_documents" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "folder_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "doc_type" TEXT NOT NULL,
    "process_id" UUID,
    "classification" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "current_version_id" UUID,
    "owner_position_id" UUID,
    "is_controlled" BOOLEAN NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "doc_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "doc_versions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "version_label" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "source_file_id" UUID NOT NULL,
    "pdf_file_id" UUID,
    "render_status" TEXT NOT NULL DEFAULT 'pending',
    "title" TEXT NOT NULL,
    "classification" TEXT NOT NULL,
    "owner_position_id" UUID,
    "change_summary" TEXT NOT NULL,
    "review_note" TEXT,
    "submitted_at" TIMESTAMPTZ(6),
    "approved_by" UUID,
    "approved_at" TIMESTAMPTZ(6),
    "effective_date" DATE,
    "published_at" TIMESTAMPTZ(6),
    "obsoleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "doc_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "doc_links" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" UUID NOT NULL,
    "relation" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "doc_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "doc_access_log" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "version_id" UUID,
    "user_id" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "doc_access_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "doc_folders_tenant_id_parent_id_idx" ON "doc_folders"("tenant_id", "parent_id");

-- CreateIndex
CREATE UNIQUE INDEX "doc_folders_tenant_id_id_key" ON "doc_folders"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "doc_folders_tenant_id_code_key" ON "doc_folders"("tenant_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "doc_folders_tenant_id_entity_type_entity_id_key" ON "doc_folders"("tenant_id", "entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "doc_documents_tenant_id_folder_id_idx" ON "doc_documents"("tenant_id", "folder_id");

-- CreateIndex
CREATE INDEX "doc_documents_tenant_id_process_id_idx" ON "doc_documents"("tenant_id", "process_id");

-- CreateIndex
CREATE UNIQUE INDEX "doc_documents_tenant_id_id_key" ON "doc_documents"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "doc_documents_tenant_id_code_key" ON "doc_documents"("tenant_id", "code");

-- CreateIndex
CREATE INDEX "doc_versions_tenant_id_document_id_status_idx" ON "doc_versions"("tenant_id", "document_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "doc_versions_tenant_id_id_key" ON "doc_versions"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "doc_versions_tenant_id_document_id_number_key" ON "doc_versions"("tenant_id", "document_id", "number");

-- CreateIndex
CREATE INDEX "doc_links_tenant_id_entity_type_entity_id_idx" ON "doc_links"("tenant_id", "entity_type", "entity_id");

-- CreateIndex
CREATE UNIQUE INDEX "doc_links_tenant_id_id_key" ON "doc_links"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "doc_links_tenant_id_document_id_entity_type_entity_id_key" ON "doc_links"("tenant_id", "document_id", "entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "doc_access_log_tenant_id_document_id_occurred_at_idx" ON "doc_access_log"("tenant_id", "document_id", "occurred_at");

-- AddForeignKey
ALTER TABLE "doc_folders" ADD CONSTRAINT "doc_folders_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doc_folders" ADD CONSTRAINT "doc_folders_tenant_id_parent_id_fkey" FOREIGN KEY ("tenant_id", "parent_id") REFERENCES "doc_folders"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doc_documents" ADD CONSTRAINT "doc_documents_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doc_documents" ADD CONSTRAINT "doc_documents_tenant_id_folder_id_fkey" FOREIGN KEY ("tenant_id", "folder_id") REFERENCES "doc_folders"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doc_versions" ADD CONSTRAINT "doc_versions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doc_versions" ADD CONSTRAINT "doc_versions_tenant_id_document_id_fkey" FOREIGN KEY ("tenant_id", "document_id") REFERENCES "doc_documents"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doc_versions" ADD CONSTRAINT "doc_versions_tenant_id_source_file_id_fkey" FOREIGN KEY ("tenant_id", "source_file_id") REFERENCES "doc_files"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doc_versions" ADD CONSTRAINT "doc_versions_tenant_id_pdf_file_id_fkey" FOREIGN KEY ("tenant_id", "pdf_file_id") REFERENCES "doc_files"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doc_links" ADD CONSTRAINT "doc_links_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doc_links" ADD CONSTRAINT "doc_links_tenant_id_document_id_fkey" FOREIGN KEY ("tenant_id", "document_id") REFERENCES "doc_documents"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doc_access_log" ADD CONSTRAINT "doc_access_log_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doc_access_log" ADD CONSTRAINT "doc_access_log_tenant_id_document_id_fkey" FOREIGN KEY ("tenant_id", "document_id") REFERENCES "doc_documents"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doc_access_log" ADD CONSTRAINT "doc_access_log_tenant_id_version_id_fkey" FOREIGN KEY ("tenant_id", "version_id") REFERENCES "doc_versions"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;




-- Consecutivos sin año (B18) ---------------------------------------------------------------------
-- Un consecutivo sin año usa el año 0 y su prefijo puede llevar dos partes (PR-SGC). Los anuales
-- quedan igual que en B12.

ALTER TABLE "core_sequences"
    DROP CONSTRAINT "core_sequences_prefix_check",
    DROP CONSTRAINT "core_sequences_year_check";

ALTER TABLE "core_sequences"
    ADD CONSTRAINT "core_sequences_prefix_check" CHECK (
        ("yearly" AND "prefix" ~ '^[A-Z]{2,6}$')
        OR (NOT "yearly" AND "prefix" ~ '^[A-Z]{2,6}(-[A-Z]{2,6})?$')),
    ADD CONSTRAINT "core_sequences_year_check" CHECK (
        ("yearly" AND "year" BETWEEN 2000 AND 2100) OR (NOT "yearly" AND "year" = 0));

-- Reglas de los datos -------------------------------------------------------------------------
-- Los valores permitidos son los de packages/contracts/src/doc.

ALTER TABLE "doc_folders"
    ADD CONSTRAINT "doc_folders_code_check" CHECK ("code" IS NULL OR "code" ~ '^[A-Z0-9][A-Z0-9-]{1,29}$'),
    ADD CONSTRAINT "doc_folders_name_check" CHECK (char_length(btrim("name")) BETWEEN 2 AND 120),
    ADD CONSTRAINT "doc_folders_kind_check" CHECK ("kind" IN ('folder', 'case_file')),
    ADD CONSTRAINT "doc_folders_entity_check" CHECK (
        ("entity_type" IS NULL) = ("entity_id" IS NULL)
        AND ("kind" = 'case_file') = ("entity_id" IS NOT NULL)
        AND ("entity_type" IS NULL OR "entity_type" IN ('party'))),
    ADD CONSTRAINT "doc_folders_classification_check"
        CHECK ("classification" IN ('public', 'internal', 'confidential', 'restricted')),
    ADD CONSTRAINT "doc_folders_parent_check" CHECK ("parent_id" IS NULL OR "parent_id" <> "id"),
    ADD CONSTRAINT "doc_folders_version_check" CHECK ("version" > 0);

ALTER TABLE "doc_documents"
    ADD CONSTRAINT "doc_documents_code_check" CHECK (
        ("is_controlled" AND "code" ~ '^[A-Z]{2,3}-[A-Z]{2,3}-[0-9]{3,8}$')
        OR (NOT "is_controlled" AND "code" ~ '^DOC-[0-9]{4}-[0-9]{4,8}$')),
    ADD CONSTRAINT "doc_documents_title_check" CHECK (char_length(btrim("title")) BETWEEN 3 AND 200),
    ADD CONSTRAINT "doc_documents_doc_type_check" CHECK ("doc_type" ~ '^[A-Z]{2,3}$'),
    ADD CONSTRAINT "doc_documents_process_check" CHECK (NOT "is_controlled" OR "process_id" IS NOT NULL),
    ADD CONSTRAINT "doc_documents_classification_check"
        CHECK ("classification" IN ('public', 'internal', 'confidential', 'restricted')),
    ADD CONSTRAINT "doc_documents_status_check" CHECK ("status" IN ('draft', 'current', 'obsolete')),
    ADD CONSTRAINT "doc_documents_current_check" CHECK (("status" = 'draft') = ("current_version_id" IS NULL)),
    ADD CONSTRAINT "doc_documents_version_check" CHECK ("version" > 0);

ALTER TABLE "doc_versions"
    ADD CONSTRAINT "doc_versions_number_check" CHECK ("number" BETWEEN 0 AND 99),
    ADD CONSTRAINT "doc_versions_label_check" CHECK ("version_label" = lpad("number"::text, 2, '0')),
    ADD CONSTRAINT "doc_versions_status_check"
        CHECK ("status" IN ('draft', 'in_review', 'approved', 'current', 'obsolete')),
    ADD CONSTRAINT "doc_versions_render_status_check"
        CHECK ("render_status" IN ('pending', 'ready', 'failed')),
    ADD CONSTRAINT "doc_versions_render_check" CHECK (
        ("render_status" = 'ready') = ("pdf_file_id" IS NOT NULL)
        AND ("status" = 'draft' OR "render_status" = 'ready')),
    ADD CONSTRAINT "doc_versions_title_check" CHECK (char_length(btrim("title")) BETWEEN 3 AND 200),
    ADD CONSTRAINT "doc_versions_classification_check"
        CHECK ("classification" IN ('public', 'internal', 'confidential', 'restricted')),
    ADD CONSTRAINT "doc_versions_change_summary_check"
        CHECK (char_length(btrim("change_summary")) BETWEEN 3 AND 1000),
    ADD CONSTRAINT "doc_versions_review_note_check"
        CHECK ("review_note" IS NULL OR char_length(btrim("review_note")) BETWEEN 5 AND 1000),
    ADD CONSTRAINT "doc_versions_submitted_check"
        CHECK (("status" = 'draft') = ("submitted_at" IS NULL)),
    ADD CONSTRAINT "doc_versions_approved_check" CHECK (
        ("status" IN ('approved', 'current', 'obsolete'))
            = ("approved_by" IS NOT NULL AND "approved_at" IS NOT NULL)),
    -- Quien elabora no aprueba (ficha 17.4).
    ADD CONSTRAINT "doc_versions_approver_check"
        CHECK ("approved_by" IS NULL OR "created_by" IS NULL OR "approved_by" <> "created_by"),
    ADD CONSTRAINT "doc_versions_published_check" CHECK (
        ("status" IN ('current', 'obsolete'))
            = ("published_at" IS NOT NULL AND "effective_date" IS NOT NULL)),
    ADD CONSTRAINT "doc_versions_obsoleted_check"
        CHECK (("status" = 'obsolete') = ("obsoleted_at" IS NOT NULL)),
    ADD CONSTRAINT "doc_versions_version_check" CHECK ("version" > 0);

ALTER TABLE "doc_links"
    ADD CONSTRAINT "doc_links_entity_type_check" CHECK ("entity_type" IN ('position', 'process', 'party')),
    ADD CONSTRAINT "doc_links_relation_check" CHECK ("relation" IN ('applies_to', 'supports', 'related')),
    ADD CONSTRAINT "doc_links_version_check" CHECK ("version" > 0);

ALTER TABLE "doc_access_log"
    ADD CONSTRAINT "doc_access_log_action_check" CHECK ("action" IN ('view', 'download'));

-- Una carpeta no cambia de lugar ni de clase: solo de nombre y de clasificación por defecto.
CREATE FUNCTION "doc_keep_folders"() RETURNS TRIGGER
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF NEW.parent_id IS DISTINCT FROM OLD.parent_id
        OR NEW.code IS DISTINCT FROM OLD.code
        OR NEW.kind IS DISTINCT FROM OLD.kind
        OR NEW.entity_type IS DISTINCT FROM OLD.entity_type
        OR NEW.entity_id IS DISTINCT FROM OLD.entity_id THEN
        RAISE EXCEPTION 'Una carpeta no cambia de lugar, de código ni de registro'
            USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "doc_folders_keep"
    BEFORE UPDATE ON "doc_folders"
    FOR EACH ROW EXECUTE FUNCTION "doc_keep_folders"();

-- Un documento conserva su código, tipo, proceso y carpeta. Con una versión publicada, sus datos
-- solo cambian al publicar otra versión (ficha 17.4: un documento vigente es inmutable).
CREATE FUNCTION "doc_keep_documents"() RETURNS TRIGGER
    LANGUAGE plpgsql
    AS $$
BEGIN
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
    RETURN NEW;
END;
$$;

CREATE TRIGGER "doc_documents_keep"
    BEFORE UPDATE ON "doc_documents"
    FOR EACH ROW EXECUTE FUNCTION "doc_keep_documents"();

-- Una versión solo avanza por los pasos de su ciclo y, fuera del borrador, su contenido queda fijo.
-- Por documento hay a lo más una versión vigente y una abierta (borrador, en revisión o aprobada);
-- el caso de uso además toma un bloqueo por documento para que dos personas no choquen.
CREATE FUNCTION "doc_keep_versions"() RETURNS TRIGGER
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF TG_OP = 'UPDATE' AND (
        NEW.document_id IS DISTINCT FROM OLD.document_id
        OR NEW.number IS DISTINCT FROM OLD.number
        OR NEW.version_label IS DISTINCT FROM OLD.version_label
        OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
        OR (OLD.status <> 'draft' AND (NEW.source_file_id IS DISTINCT FROM OLD.source_file_id
            OR NEW.pdf_file_id IS DISTINCT FROM OLD.pdf_file_id
            OR NEW.render_status IS DISTINCT FROM OLD.render_status
            OR NEW.title IS DISTINCT FROM OLD.title
            OR NEW.classification IS DISTINCT FROM OLD.classification
            OR NEW.owner_position_id IS DISTINCT FROM OLD.owner_position_id
            OR NEW.change_summary IS DISTINCT FROM OLD.change_summary))
        OR NOT ((OLD.status = NEW.status)
            OR (OLD.status = 'draft' AND NEW.status = 'in_review')
            OR (OLD.status = 'in_review' AND NEW.status IN ('draft', 'approved'))
            OR (OLD.status = 'approved' AND NEW.status = 'current')
            OR (OLD.status = 'current' AND NEW.status = 'obsolete'))) THEN
        RAISE EXCEPTION 'Una versión revisada, vigente u obsoleta no se puede cambiar'
            USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    IF NEW.status = 'current' AND EXISTS (
        SELECT 1 FROM "doc_versions"
        WHERE tenant_id = NEW.tenant_id AND document_id = NEW.document_id
            AND status = 'current' AND id <> NEW.id AND deleted_at IS NULL) THEN
        RAISE EXCEPTION 'El documento ya tiene una versión vigente'
            USING ERRCODE = 'unique_violation';
    END IF;
    IF NEW.status IN ('draft', 'in_review', 'approved') AND EXISTS (
        SELECT 1 FROM "doc_versions"
        WHERE tenant_id = NEW.tenant_id AND document_id = NEW.document_id
            AND status IN ('draft', 'in_review', 'approved') AND id <> NEW.id
            AND deleted_at IS NULL) THEN
        RAISE EXCEPTION 'El documento ya tiene una versión en trámite'
            USING ERRCODE = 'unique_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "doc_versions_keep"
    BEFORE INSERT OR UPDATE ON "doc_versions"
    FOR EACH ROW EXECUTE FUNCTION "doc_keep_versions"();

-- Columnas de control --------------------------------------------------------------------------
-- El registro de accesos no las lleva: sus filas no cambian nunca.

CREATE TRIGGER "doc_folders_control_columns"
    BEFORE INSERT OR UPDATE ON "doc_folders"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();
CREATE TRIGGER "doc_documents_control_columns"
    BEFORE INSERT OR UPDATE ON "doc_documents"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();
CREATE TRIGGER "doc_versions_control_columns"
    BEFORE INSERT OR UPDATE ON "doc_versions"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();
CREATE TRIGGER "doc_links_control_columns"
    BEFORE INSERT OR UPDATE ON "doc_links"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();

-- Seguridad por fila (ADR-007) -----------------------------------------------------------------

ALTER TABLE "doc_folders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "doc_folders" FORCE ROW LEVEL SECURITY;
CREATE POLICY "doc_folders_tenant_isolation" ON "doc_folders"
    USING ("tenant_id" = core_current_tenant_id())
    WITH CHECK ("tenant_id" = core_current_tenant_id());

ALTER TABLE "doc_documents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "doc_documents" FORCE ROW LEVEL SECURITY;
CREATE POLICY "doc_documents_tenant_isolation" ON "doc_documents"
    USING ("tenant_id" = core_current_tenant_id())
    WITH CHECK ("tenant_id" = core_current_tenant_id());

ALTER TABLE "doc_versions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "doc_versions" FORCE ROW LEVEL SECURITY;
CREATE POLICY "doc_versions_tenant_isolation" ON "doc_versions"
    USING ("tenant_id" = core_current_tenant_id())
    WITH CHECK ("tenant_id" = core_current_tenant_id());

ALTER TABLE "doc_links" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "doc_links" FORCE ROW LEVEL SECURITY;
CREATE POLICY "doc_links_tenant_isolation" ON "doc_links"
    USING ("tenant_id" = core_current_tenant_id())
    WITH CHECK ("tenant_id" = core_current_tenant_id());

ALTER TABLE "doc_access_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "doc_access_log" FORCE ROW LEVEL SECURITY;
CREATE POLICY "doc_access_log_tenant_isolation" ON "doc_access_log"
    USING ("tenant_id" = core_current_tenant_id())
    WITH CHECK ("tenant_id" = core_current_tenant_id());

-- Permisos de la API ---------------------------------------------------------------------------
-- Sin DELETE: el borrado es lógico (deleted_at). El registro de accesos solo admite agregar filas.

GRANT SELECT, INSERT, UPDATE ON "doc_folders" TO app_user;
GRANT SELECT, INSERT, UPDATE ON "doc_documents" TO app_user;
GRANT SELECT, INSERT, UPDATE ON "doc_versions" TO app_user;
GRANT SELECT, INSERT, UPDATE ON "doc_links" TO app_user;
GRANT SELECT, INSERT ON "doc_access_log" TO app_user;
