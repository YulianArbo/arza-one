-- B20: formatos digitales y generación de documentos (M03, ficha 17.4, numeral 13.2 y capítulo 18).
-- Formatos con su esquema versionado (doc_form_templates), registros diligenciados que guardan la
-- versión del formato con que se crearon (doc_form_records), plantillas de salida HTML y Word
-- (doc_output_templates) y la copia de consulta de cada versión vigente con el pie de copia no
-- controlada (doc_versions.copy_file_id).

-- AlterTable
ALTER TABLE "doc_versions" ADD COLUMN     "copy_file_id" UUID;

-- CreateTable
CREATE TABLE "doc_output_templates" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "engine" TEXT NOT NULL,
    "output_version" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "body" TEXT,
    "file_id" UUID,
    "variables" JSONB NOT NULL DEFAULT '[]',
    "published_at" TIMESTAMPTZ(6),
    "published_by" UUID,
    "retired_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "doc_output_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "doc_form_templates" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "form_version" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "fill_mode" TEXT NOT NULL DEFAULT 'manual',
    "schema" JSONB NOT NULL,
    "layout" JSONB NOT NULL DEFAULT '{}',
    "document_id" UUID,
    "output_template_id" UUID,
    "workflow_key" TEXT,
    "classification" TEXT NOT NULL DEFAULT 'internal',
    "entity_type" TEXT,
    "published_at" TIMESTAMPTZ(6),
    "published_by" UUID,
    "retired_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "doc_form_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "doc_form_records" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "template_version" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "classification" TEXT NOT NULL DEFAULT 'internal',
    "entity_type" TEXT,
    "entity_id" UUID,
    "workflow_instance_id" UUID,
    "submitted_at" TIMESTAMPTZ(6),
    "approved_by" UUID,
    "approved_at" TIMESTAMPTZ(6),
    "return_note" TEXT,
    "completed_at" TIMESTAMPTZ(6),
    "render_status" TEXT NOT NULL DEFAULT 'none',
    "pdf_file_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "doc_form_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "doc_output_templates_tenant_id_status_idx" ON "doc_output_templates"("tenant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "doc_output_templates_tenant_id_id_key" ON "doc_output_templates"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "doc_output_templates_tenant_id_code_output_version_key" ON "doc_output_templates"("tenant_id", "code", "output_version");

-- CreateIndex
CREATE INDEX "doc_form_templates_tenant_id_status_idx" ON "doc_form_templates"("tenant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "doc_form_templates_tenant_id_id_key" ON "doc_form_templates"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "doc_form_templates_tenant_id_code_form_version_key" ON "doc_form_templates"("tenant_id", "code", "form_version");

-- CreateIndex
CREATE UNIQUE INDEX "doc_form_templates_tenant_id_id_form_version_key" ON "doc_form_templates"("tenant_id", "id", "form_version");

-- CreateIndex
CREATE INDEX "doc_form_records_tenant_id_template_id_idx" ON "doc_form_records"("tenant_id", "template_id");

-- CreateIndex
CREATE INDEX "doc_form_records_tenant_id_entity_type_entity_id_idx" ON "doc_form_records"("tenant_id", "entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "doc_form_records_tenant_id_created_by_idx" ON "doc_form_records"("tenant_id", "created_by");

-- CreateIndex
CREATE INDEX "doc_form_records_tenant_id_render_status_idx" ON "doc_form_records"("tenant_id", "render_status");

-- CreateIndex
CREATE UNIQUE INDEX "doc_form_records_tenant_id_id_key" ON "doc_form_records"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "doc_form_records_tenant_id_code_key" ON "doc_form_records"("tenant_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "doc_form_records_tenant_id_workflow_instance_id_key" ON "doc_form_records"("tenant_id", "workflow_instance_id");

-- AddForeignKey
ALTER TABLE "doc_versions" ADD CONSTRAINT "doc_versions_tenant_id_copy_file_id_fkey" FOREIGN KEY ("tenant_id", "copy_file_id") REFERENCES "doc_files"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doc_output_templates" ADD CONSTRAINT "doc_output_templates_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doc_output_templates" ADD CONSTRAINT "doc_output_templates_tenant_id_file_id_fkey" FOREIGN KEY ("tenant_id", "file_id") REFERENCES "doc_files"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doc_form_templates" ADD CONSTRAINT "doc_form_templates_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doc_form_templates" ADD CONSTRAINT "doc_form_templates_tenant_id_document_id_fkey" FOREIGN KEY ("tenant_id", "document_id") REFERENCES "doc_documents"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doc_form_templates" ADD CONSTRAINT "doc_form_templates_tenant_id_output_template_id_fkey" FOREIGN KEY ("tenant_id", "output_template_id") REFERENCES "doc_output_templates"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doc_form_records" ADD CONSTRAINT "doc_form_records_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doc_form_records" ADD CONSTRAINT "doc_form_records_tenant_id_template_id_template_version_fkey" FOREIGN KEY ("tenant_id", "template_id", "template_version") REFERENCES "doc_form_templates"("tenant_id", "id", "form_version") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doc_form_records" ADD CONSTRAINT "doc_form_records_tenant_id_pdf_file_id_fkey" FOREIGN KEY ("tenant_id", "pdf_file_id") REFERENCES "doc_files"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;





-- Reglas de los datos -------------------------------------------------------------------------
-- Los valores permitidos son los de packages/contracts/src/doc.

-- Las versiones que publica la semilla (los formatos piloto) no tienen quien las publicó.

-- Un solo borrador y una sola versión publicada por código.
CREATE UNIQUE INDEX "doc_output_templates_one_draft_key" ON "doc_output_templates"("tenant_id", "code")
    WHERE "status" = 'draft' AND "deleted_at" IS NULL;
CREATE UNIQUE INDEX "doc_output_templates_one_published_key" ON "doc_output_templates"("tenant_id", "code")
    WHERE "status" = 'published' AND "deleted_at" IS NULL;
CREATE UNIQUE INDEX "doc_form_templates_one_draft_key" ON "doc_form_templates"("tenant_id", "code")
    WHERE "status" = 'draft' AND "deleted_at" IS NULL;
CREATE UNIQUE INDEX "doc_form_templates_one_published_key" ON "doc_form_templates"("tenant_id", "code")
    WHERE "status" = 'published' AND "deleted_at" IS NULL;
-- Un registro de la plataforma por cada registro de origen (FT-SGC-001 de cada solicitud).
CREATE UNIQUE INDEX "doc_form_records_entity_template_key"
    ON "doc_form_records"("tenant_id", "template_id", "entity_type", "entity_id")
    WHERE "entity_type" = 'doc_change_request' AND "deleted_at" IS NULL;

ALTER TABLE "doc_output_templates"
    ADD CONSTRAINT "doc_output_templates_code_check" CHECK ("code" ~ '^[A-Z][A-Z0-9-]{2,39}$'),
    ADD CONSTRAINT "doc_output_templates_name_check" CHECK (char_length(btrim("name")) BETWEEN 3 AND 200),
    ADD CONSTRAINT "doc_output_templates_engine_check" CHECK ("engine" IN ('html', 'docx')),
    ADD CONSTRAINT "doc_output_templates_content_check" CHECK (
        CASE WHEN "engine" = 'html'
             THEN "body" IS NOT NULL AND char_length("body") BETWEEN 1 AND 200000 AND "file_id" IS NULL
             ELSE "file_id" IS NOT NULL AND "body" IS NULL
        END),
    ADD CONSTRAINT "doc_output_templates_output_version_check" CHECK ("output_version" > 0),
    ADD CONSTRAINT "doc_output_templates_status_check" CHECK ("status" IN ('draft', 'published', 'retired')),
    ADD CONSTRAINT "doc_output_templates_published_check" CHECK (
        ("status" = 'draft') = ("published_at" IS NULL)
        AND ("published_at" IS NOT NULL OR "published_by" IS NULL)
        AND ("status" = 'retired') = ("retired_at" IS NOT NULL)),
    ADD CONSTRAINT "doc_output_templates_variables_check" CHECK (jsonb_typeof("variables") = 'array'),
    ADD CONSTRAINT "doc_output_templates_version_check" CHECK ("version" > 0);

ALTER TABLE "doc_form_templates"
    ADD CONSTRAINT "doc_form_templates_code_check" CHECK ("code" ~ '^[A-Z]{2,3}-[A-Z]{2,3}-[0-9]{3,8}$'),
    ADD CONSTRAINT "doc_form_templates_name_check" CHECK (char_length(btrim("name")) BETWEEN 3 AND 200),
    ADD CONSTRAINT "doc_form_templates_form_version_check" CHECK ("form_version" > 0),
    ADD CONSTRAINT "doc_form_templates_status_check" CHECK ("status" IN ('draft', 'published', 'retired')),
    ADD CONSTRAINT "doc_form_templates_fill_mode_check" CHECK ("fill_mode" IN ('manual', 'system')),
    ADD CONSTRAINT "doc_form_templates_schema_check" CHECK (
        jsonb_typeof("schema") = 'object' AND jsonb_typeof("schema" -> 'sections') = 'array'),
    ADD CONSTRAINT "doc_form_templates_layout_check" CHECK (jsonb_typeof("layout") = 'object'),
    ADD CONSTRAINT "doc_form_templates_workflow_key_check" CHECK (
        "workflow_key" IS NULL OR "workflow_key" IN ('doc.form_record.direction', 'doc.form_record.quality')),
    ADD CONSTRAINT "doc_form_templates_classification_check"
        CHECK ("classification" IN ('internal', 'confidential')),
    ADD CONSTRAINT "doc_form_templates_entity_type_check" CHECK (
        "entity_type" IS NULL OR "entity_type" IN ('doc_version', 'party', 'doc_change_request')),
    -- La plataforma llena un formato desde otro registro y sin aprobación aparte.
    ADD CONSTRAINT "doc_form_templates_system_check" CHECK (
        "fill_mode" = 'manual' OR ("entity_type" IS NOT NULL AND "workflow_key" IS NULL)),
    ADD CONSTRAINT "doc_form_templates_published_check" CHECK (
        ("status" = 'draft') = ("published_at" IS NULL)
        AND ("published_at" IS NOT NULL OR "published_by" IS NULL)
        AND ("status" = 'retired') = ("retired_at" IS NOT NULL)),
    ADD CONSTRAINT "doc_form_templates_version_check" CHECK ("version" > 0);

ALTER TABLE "doc_form_records"
    ADD CONSTRAINT "doc_form_records_code_check"
        CHECK ("code" ~ '^[A-Z]{2,3}-[A-Z]{2,3}-[0-9]{3,8}-[0-9]{4}-[0-9]{4,8}$'),
    ADD CONSTRAINT "doc_form_records_data_check" CHECK (jsonb_typeof("data") = 'object'),
    ADD CONSTRAINT "doc_form_records_status_check" CHECK ("status" IN ('draft', 'in_approval', 'completed')),
    ADD CONSTRAINT "doc_form_records_classification_check"
        CHECK ("classification" IN ('internal', 'confidential')),
    ADD CONSTRAINT "doc_form_records_entity_check" CHECK (
        ("entity_type" IS NULL) = ("entity_id" IS NULL)
        AND ("entity_type" IS NULL OR "entity_type" IN ('doc_version', 'party', 'doc_change_request'))),
    ADD CONSTRAINT "doc_form_records_submitted_check"
        CHECK (("status" = 'draft') OR "submitted_at" IS NOT NULL),
    ADD CONSTRAINT "doc_form_records_completed_check" CHECK (
        ("status" = 'completed') = ("completed_at" IS NOT NULL)
        AND ("approved_by" IS NULL) = ("approved_at" IS NULL)
        AND ("approved_at" IS NULL OR "status" = 'completed')),
    -- Quien diligencia un registro no lo aprueba (ficha 17.4: quien elabora no aprueba).
    ADD CONSTRAINT "doc_form_records_approver_check"
        CHECK ("approved_by" IS NULL OR "approved_by" IS DISTINCT FROM "created_by"),
    ADD CONSTRAINT "doc_form_records_return_note_check"
        CHECK ("return_note" IS NULL OR char_length(btrim("return_note")) BETWEEN 5 AND 2000),
    ADD CONSTRAINT "doc_form_records_render_check" CHECK (
        "render_status" IN ('none', 'pending', 'ready', 'failed')
        AND (("status" = 'completed') = ("render_status" <> 'none'))
        AND (("render_status" = 'ready') = ("pdf_file_id" IS NOT NULL))),
    ADD CONSTRAINT "doc_form_records_version_check" CHECK ("version" > 0);

-- Los registros de un formato llevan su propio consecutivo anual con el código del formato como
-- prefijo: FT-COM-002-2026-0001.
ALTER TABLE "core_sequences" DROP CONSTRAINT "core_sequences_prefix_check";

ALTER TABLE "core_sequences"
    ADD CONSTRAINT "core_sequences_prefix_check" CHECK (
        ("yearly" AND "prefix" ~ '^([A-Z]{2,6}|[A-Z]{2,3}-[A-Z]{2,3}-[0-9]{3,8})$')
        OR (NOT "yearly" AND "prefix" ~ '^[A-Z]{2,6}(-[A-Z]{2,6})?$'));

-- Una versión publicada de una plantilla no cambia; solo pasa a retirada.
CREATE FUNCTION "doc_keep_output_templates"() RETURNS TRIGGER
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF NEW.code IS DISTINCT FROM OLD.code
        OR NEW.engine IS DISTINCT FROM OLD.engine
        OR NEW.output_version IS DISTINCT FROM OLD.output_version
        OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
        OR (OLD.status <> 'draft' AND (NEW.name IS DISTINCT FROM OLD.name
            OR NEW.body IS DISTINCT FROM OLD.body
            OR NEW.file_id IS DISTINCT FROM OLD.file_id
            OR NEW.variables IS DISTINCT FROM OLD.variables
            OR NEW.published_at IS DISTINCT FROM OLD.published_at
            OR NEW.published_by IS DISTINCT FROM OLD.published_by))
        OR NOT ((OLD.status = NEW.status)
            OR (OLD.status = 'draft' AND NEW.status = 'published')
            OR (OLD.status = 'published' AND NEW.status = 'retired')) THEN
        RAISE EXCEPTION 'Una plantilla de salida publicada no se puede cambiar'
            USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "doc_output_templates_keep"
    BEFORE UPDATE ON "doc_output_templates"
    FOR EACH ROW EXECUTE FUNCTION "doc_keep_output_templates"();

-- Una versión publicada de un formato no cambia; solo pasa a retirada.
CREATE FUNCTION "doc_keep_form_templates"() RETURNS TRIGGER
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF NEW.code IS DISTINCT FROM OLD.code
        OR NEW.form_version IS DISTINCT FROM OLD.form_version
        OR NEW.fill_mode IS DISTINCT FROM OLD.fill_mode
        OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
        OR (OLD.status <> 'draft' AND (NEW.name IS DISTINCT FROM OLD.name
            OR NEW.schema IS DISTINCT FROM OLD.schema
            OR NEW.layout IS DISTINCT FROM OLD.layout
            OR NEW.document_id IS DISTINCT FROM OLD.document_id
            OR NEW.output_template_id IS DISTINCT FROM OLD.output_template_id
            OR NEW.workflow_key IS DISTINCT FROM OLD.workflow_key
            OR NEW.classification IS DISTINCT FROM OLD.classification
            OR NEW.entity_type IS DISTINCT FROM OLD.entity_type
            OR NEW.published_at IS DISTINCT FROM OLD.published_at
            OR NEW.published_by IS DISTINCT FROM OLD.published_by))
        OR NOT ((OLD.status = NEW.status)
            OR (OLD.status = 'draft' AND NEW.status = 'published')
            OR (OLD.status = 'published' AND NEW.status = 'retired')) THEN
        RAISE EXCEPTION 'Un formato publicado no se puede cambiar'
            USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "doc_form_templates_keep"
    BEFORE UPDATE ON "doc_form_templates"
    FOR EACH ROW EXECUTE FUNCTION "doc_keep_form_templates"();

-- Un registro conserva su formato, su versión, su código y quién lo diligenció. Sus datos solo
-- cambian en el borrador; terminado, solo se le agrega el PDF.
CREATE FUNCTION "doc_keep_form_records"() RETURNS TRIGGER
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF NEW.template_id IS DISTINCT FROM OLD.template_id
        OR NEW.template_version IS DISTINCT FROM OLD.template_version
        OR NEW.code IS DISTINCT FROM OLD.code
        OR NEW.classification IS DISTINCT FROM OLD.classification
        OR NEW.entity_type IS DISTINCT FROM OLD.entity_type
        OR NEW.entity_id IS DISTINCT FROM OLD.entity_id
        OR NEW.created_by IS DISTINCT FROM OLD.created_by
        OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
        OR (OLD.status <> 'draft' AND NEW.data IS DISTINCT FROM OLD.data)
        OR (OLD.workflow_instance_id IS NOT NULL
            AND NEW.workflow_instance_id IS DISTINCT FROM OLD.workflow_instance_id)
        OR (OLD.status = 'completed' AND (NEW.approved_by IS DISTINCT FROM OLD.approved_by
            OR NEW.approved_at IS DISTINCT FROM OLD.approved_at
            OR NEW.completed_at IS DISTINCT FROM OLD.completed_at
            OR NEW.submitted_at IS DISTINCT FROM OLD.submitted_at
            OR (OLD.pdf_file_id IS NOT NULL AND NEW.pdf_file_id IS DISTINCT FROM OLD.pdf_file_id)))
        OR NOT ((OLD.status = NEW.status)
            OR (OLD.status = 'draft' AND NEW.status IN ('in_approval', 'completed'))
            OR (OLD.status = 'in_approval' AND NEW.status IN ('draft', 'completed'))) THEN
        RAISE EXCEPTION 'Un registro enviado o terminado no se puede cambiar'
            USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "doc_form_records_keep"
    BEFORE UPDATE ON "doc_form_records"
    FOR EACH ROW EXECUTE FUNCTION "doc_keep_form_records"();

-- La copia de consulta de una versión se fija una sola vez, cuando ya está vigente. Lo demás de
-- B19 se conserva igual.
CREATE OR REPLACE FUNCTION "doc_keep_versions"() RETURNS TRIGGER
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF TG_OP = 'UPDATE' AND (
        NEW.document_id IS DISTINCT FROM OLD.document_id
        OR NEW.number IS DISTINCT FROM OLD.number
        OR NEW.version_label IS DISTINCT FROM OLD.version_label
        OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
        OR NEW.origin IS DISTINCT FROM OLD.origin
        OR NEW.change_request_id IS DISTINCT FROM OLD.change_request_id
        OR (OLD.copy_file_id IS NOT NULL AND NEW.copy_file_id IS DISTINCT FROM OLD.copy_file_id)
        OR (NEW.copy_file_id IS NOT NULL AND NEW.status NOT IN ('current', 'obsolete'))
        OR (OLD.status <> 'draft'
            AND NEW.workflow_instance_id IS DISTINCT FROM OLD.workflow_instance_id)
        OR (OLD.status <> 'draft' AND (NEW.source_file_id IS DISTINCT FROM OLD.source_file_id
            OR NEW.pdf_file_id IS DISTINCT FROM OLD.pdf_file_id
            OR NEW.render_status IS DISTINCT FROM OLD.render_status
            OR NEW.title IS DISTINCT FROM OLD.title
            OR NEW.classification IS DISTINCT FROM OLD.classification
            OR NEW.owner_position_id IS DISTINCT FROM OLD.owner_position_id
            OR NEW.change_summary IS DISTINCT FROM OLD.change_summary))
        OR NOT ((OLD.status = NEW.status)
            OR (OLD.status = 'draft' AND NEW.status = 'in_review' AND NEW.origin = 'platform')
            OR (OLD.status = 'draft' AND NEW.status = 'current' AND NEW.origin = 'import')
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

-- Columnas de control --------------------------------------------------------------------------

CREATE TRIGGER "doc_output_templates_control_columns"
    BEFORE INSERT OR UPDATE ON "doc_output_templates"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();
CREATE TRIGGER "doc_form_templates_control_columns"
    BEFORE INSERT OR UPDATE ON "doc_form_templates"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();
CREATE TRIGGER "doc_form_records_control_columns"
    BEFORE INSERT OR UPDATE ON "doc_form_records"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();

-- Seguridad por fila (ADR-007) -----------------------------------------------------------------

ALTER TABLE "doc_output_templates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "doc_output_templates" FORCE ROW LEVEL SECURITY;
CREATE POLICY "doc_output_templates_tenant_isolation" ON "doc_output_templates"
    USING ("tenant_id" = core_current_tenant_id())
    WITH CHECK ("tenant_id" = core_current_tenant_id());

ALTER TABLE "doc_form_templates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "doc_form_templates" FORCE ROW LEVEL SECURITY;
CREATE POLICY "doc_form_templates_tenant_isolation" ON "doc_form_templates"
    USING ("tenant_id" = core_current_tenant_id())
    WITH CHECK ("tenant_id" = core_current_tenant_id());

ALTER TABLE "doc_form_records" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "doc_form_records" FORCE ROW LEVEL SECURITY;
CREATE POLICY "doc_form_records_tenant_isolation" ON "doc_form_records"
    USING ("tenant_id" = core_current_tenant_id())
    WITH CHECK ("tenant_id" = core_current_tenant_id());

-- Permisos de la API ---------------------------------------------------------------------------
-- Sin DELETE: el borrado es lógico (deleted_at).

GRANT SELECT, INSERT, UPDATE ON "doc_output_templates" TO app_user;
GRANT SELECT, INSERT, UPDATE ON "doc_form_templates" TO app_user;
GRANT SELECT, INSERT, UPDATE ON "doc_form_records" TO app_user;

-- Generación de PDF en segundo plano -----------------------------------------------------------
-- El worker genera el PDF de los registros terminados y la copia de consulta de las versiones
-- vigentes de todas las empresas. Para saber en cuáles hay trabajo, sin leer nada más fuera de la
-- seguridad por fila, solo obtiene los identificadores de esas empresas, igual que
-- wf_tenants_with_overdue_tasks (B15).

CREATE POLICY "doc_form_records_pending_lookup" ON "doc_form_records"
    FOR SELECT TO migration_user USING (true);
CREATE POLICY "doc_versions_copy_lookup" ON "doc_versions"
    FOR SELECT TO migration_user USING (true);

CREATE FUNCTION "doc_tenants_with_pending_pdfs"() RETURNS SETOF UUID
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
    AS $$ SELECT tenant_id FROM doc_form_records
          WHERE render_status = 'pending' AND deleted_at IS NULL
          UNION
          SELECT tenant_id FROM doc_versions
          WHERE status = 'current' AND copy_file_id IS NULL AND pdf_file_id IS NOT NULL
              AND deleted_at IS NULL
          ORDER BY 1 $$;

REVOKE EXECUTE ON FUNCTION "doc_tenants_with_pending_pdfs"() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "doc_tenants_with_pending_pdfs"() TO app_user;
