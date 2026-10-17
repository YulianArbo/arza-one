-- B19: control documental del SGC y carga inicial (M03, ficha 17.4 y capítulo 18). Solicitud de
-- Acción Documental (FT-SGC-001), constancia de lectura por cargo, versiones con su trámite en el
-- motor de flujos y versiones de la carga inicial del Listado Maestro (RE-SGC-001). El Reglamento
-- Interno de Trabajo (RIT-001) es un documento controlado sin proceso.

-- AlterTable
ALTER TABLE "doc_versions" ADD COLUMN     "change_request_id" UUID,
ADD COLUMN     "origin" TEXT NOT NULL DEFAULT 'platform',
ADD COLUMN     "workflow_instance_id" UUID;

-- CreateTable
CREATE TABLE "doc_change_requests" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "document_id" UUID,
    "doc_type" TEXT,
    "process_id" UUID,
    "title" TEXT NOT NULL,
    "justification" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'filed',
    "requested_by" UUID NOT NULL,
    "workflow_instance_id" UUID,
    "decided_by" UUID,
    "decided_at" TIMESTAMPTZ(6),
    "decision_note" TEXT,
    "executed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "doc_change_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "doc_acknowledgements" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "version_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "position_id" UUID,
    "requested_at" TIMESTAMPTZ(6),
    "acknowledged_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "doc_acknowledgements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "doc_change_requests_tenant_id_status_idx" ON "doc_change_requests"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "doc_change_requests_tenant_id_document_id_idx" ON "doc_change_requests"("tenant_id", "document_id");

-- CreateIndex
CREATE INDEX "doc_change_requests_tenant_id_requested_by_idx" ON "doc_change_requests"("tenant_id", "requested_by");

-- CreateIndex
CREATE UNIQUE INDEX "doc_change_requests_tenant_id_id_key" ON "doc_change_requests"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "doc_change_requests_tenant_id_code_key" ON "doc_change_requests"("tenant_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "doc_change_requests_tenant_id_workflow_instance_id_key" ON "doc_change_requests"("tenant_id", "workflow_instance_id");

-- CreateIndex
CREATE INDEX "doc_acknowledgements_tenant_id_user_id_acknowledged_at_idx" ON "doc_acknowledgements"("tenant_id", "user_id", "acknowledged_at");

-- CreateIndex
CREATE UNIQUE INDEX "doc_acknowledgements_tenant_id_id_key" ON "doc_acknowledgements"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "doc_acknowledgements_tenant_id_version_id_user_id_key" ON "doc_acknowledgements"("tenant_id", "version_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "doc_versions_tenant_id_change_request_id_key" ON "doc_versions"("tenant_id", "change_request_id");

-- CreateIndex
CREATE UNIQUE INDEX "doc_versions_tenant_id_workflow_instance_id_key" ON "doc_versions"("tenant_id", "workflow_instance_id");

-- AddForeignKey
ALTER TABLE "doc_versions" ADD CONSTRAINT "doc_versions_tenant_id_change_request_id_fkey" FOREIGN KEY ("tenant_id", "change_request_id") REFERENCES "doc_change_requests"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doc_change_requests" ADD CONSTRAINT "doc_change_requests_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doc_change_requests" ADD CONSTRAINT "doc_change_requests_tenant_id_document_id_fkey" FOREIGN KEY ("tenant_id", "document_id") REFERENCES "doc_documents"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doc_acknowledgements" ADD CONSTRAINT "doc_acknowledgements_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doc_acknowledgements" ADD CONSTRAINT "doc_acknowledgements_tenant_id_document_id_fkey" FOREIGN KEY ("tenant_id", "document_id") REFERENCES "doc_documents"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doc_acknowledgements" ADD CONSTRAINT "doc_acknowledgements_tenant_id_version_id_fkey" FOREIGN KEY ("tenant_id", "version_id") REFERENCES "doc_versions"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;




-- Reglas de los datos -------------------------------------------------------------------------
-- Los valores permitidos son los de packages/contracts/src/doc.

-- El RIT-001 es controlado y no lleva proceso: su código es TIPO-NNN.
ALTER TABLE "doc_documents"
    DROP CONSTRAINT "doc_documents_code_check",
    DROP CONSTRAINT "doc_documents_process_check";

ALTER TABLE "doc_documents"
    ADD CONSTRAINT "doc_documents_code_check" CHECK (
        ("is_controlled" AND "process_id" IS NOT NULL AND "code" ~ '^[A-Z]{2,3}-[A-Z]{2,3}-[0-9]{3,8}$')
        OR ("is_controlled" AND "process_id" IS NULL AND "code" ~ '^[A-Z]{2,3}-[0-9]{3,8}$')
        OR (NOT "is_controlled" AND "code" ~ '^DOC-[0-9]{4}-[0-9]{4,8}$')),
    ADD CONSTRAINT "doc_documents_process_check"
        CHECK (NOT "is_controlled" OR "process_id" IS NOT NULL OR "doc_type" = 'RIT');

-- Una versión de la carga inicial ya se aprobó en papel: no lleva aprobador en la plataforma, pero
-- sí la fecha de su aprobación. No tiene solicitud ni trámite.
ALTER TABLE "doc_versions" DROP CONSTRAINT "doc_versions_approved_check";

ALTER TABLE "doc_versions"
    ADD CONSTRAINT "doc_versions_origin_check" CHECK ("origin" IN ('platform', 'import')),
    ADD CONSTRAINT "doc_versions_approved_check" CHECK (
        ("status" IN ('approved', 'current', 'obsolete')) = ("approved_at" IS NOT NULL)
        AND (CASE WHEN "origin" = 'import' THEN "approved_by" IS NULL
                  ELSE ("status" IN ('approved', 'current', 'obsolete')) = ("approved_by" IS NOT NULL)
             END)),
    ADD CONSTRAINT "doc_versions_import_check"
        CHECK ("origin" = 'platform' OR ("change_request_id" IS NULL AND "workflow_instance_id" IS NULL));

ALTER TABLE "doc_change_requests"
    ADD CONSTRAINT "doc_change_requests_code_check" CHECK ("code" ~ '^SAD-[0-9]{4}-[0-9]{4,8}$'),
    ADD CONSTRAINT "doc_change_requests_action_check" CHECK ("action" IN ('create', 'update', 'obsolete')),
    -- Crear trae el tipo y el proceso del documento nuevo; modificar y eliminar, el documento.
    ADD CONSTRAINT "doc_change_requests_target_check" CHECK (
        CASE WHEN "action" = 'create'
             THEN "doc_type" ~ '^[A-Z]{2,3}$' AND ("process_id" IS NOT NULL OR "doc_type" = 'RIT')
             ELSE "doc_type" IS NULL AND "process_id" IS NULL AND "document_id" IS NOT NULL
        END),
    ADD CONSTRAINT "doc_change_requests_title_check" CHECK (char_length(btrim("title")) BETWEEN 3 AND 200),
    ADD CONSTRAINT "doc_change_requests_justification_check"
        CHECK (char_length(btrim("justification")) BETWEEN 10 AND 2000),
    ADD CONSTRAINT "doc_change_requests_status_check"
        CHECK ("status" IN ('filed', 'in_analysis', 'approved', 'rejected', 'executed')),
    ADD CONSTRAINT "doc_change_requests_decided_check" CHECK (
        ("status" IN ('approved', 'rejected', 'executed'))
            = ("decided_by" IS NOT NULL AND "decided_at" IS NOT NULL)),
    -- Quien pide el cambio no lo decide (ficha 17.4).
    ADD CONSTRAINT "doc_change_requests_decider_check"
        CHECK ("decided_by" IS NULL OR "decided_by" <> "requested_by"),
    ADD CONSTRAINT "doc_change_requests_note_check" CHECK (
        ("status" <> 'rejected' OR "decision_note" IS NOT NULL)
        AND ("decision_note" IS NULL OR char_length(btrim("decision_note")) BETWEEN 5 AND 2000)),
    ADD CONSTRAINT "doc_change_requests_executed_check"
        CHECK (("status" = 'executed') = ("executed_at" IS NOT NULL)),
    ADD CONSTRAINT "doc_change_requests_version_check" CHECK ("version" > 0);

ALTER TABLE "doc_acknowledgements"
    ADD CONSTRAINT "doc_acknowledgements_requested_check"
        CHECK ("requested_at" IS NOT NULL OR "acknowledged_at" IS NOT NULL),
    ADD CONSTRAINT "doc_acknowledgements_version_check" CHECK ("version" > 0);

-- Avisos nuevos: lectura pedida y solicitud decidida.
ALTER TABLE "ntf_templates" DROP CONSTRAINT "ntf_templates_key_check";
ALTER TABLE "ntf_notifications" DROP CONSTRAINT "ntf_notifications_kind_check";
ALTER TABLE "ntf_preferences" DROP CONSTRAINT "ntf_preferences_event_key_check";

ALTER TABLE "ntf_templates"
    ADD CONSTRAINT "ntf_templates_key_check" CHECK ("key" IN ('task_assigned', 'task_escalated',
        'comment_mention', 'security_alert', 'doc_read_requested', 'doc_request_decided'));
ALTER TABLE "ntf_notifications"
    ADD CONSTRAINT "ntf_notifications_kind_check" CHECK ("kind" IN ('task_assigned', 'task_escalated',
        'comment_mention', 'security_alert', 'doc_read_requested', 'doc_request_decided'));
ALTER TABLE "ntf_preferences"
    ADD CONSTRAINT "ntf_preferences_event_key_check" CHECK ("event_key" IN ('task_assigned',
        'task_escalated', 'comment_mention', 'security_alert', 'doc_read_requested',
        'doc_request_decided'));

-- Una versión solo avanza por los pasos de su ciclo; la de la carga inicial pasa del borrador a
-- vigente cuando su PDF está listo. Su origen y su solicitud no cambian; su trámite solo cambia al
-- enviarla a revisión (una versión devuelta empieza otro trámite cuando se envía de nuevo).
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

-- Una solicitud conserva lo que pidió y quién; solo avanza por los pasos de su ciclo. El documento
-- de una solicitud de creación se fija una sola vez, cuando se crea.
CREATE FUNCTION "doc_keep_change_requests"() RETURNS TRIGGER
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF NEW.code IS DISTINCT FROM OLD.code
        OR NEW.action IS DISTINCT FROM OLD.action
        OR NEW.doc_type IS DISTINCT FROM OLD.doc_type
        OR NEW.process_id IS DISTINCT FROM OLD.process_id
        OR NEW.title IS DISTINCT FROM OLD.title
        OR NEW.justification IS DISTINCT FROM OLD.justification
        OR NEW.requested_by IS DISTINCT FROM OLD.requested_by
        OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
        OR (OLD.document_id IS NOT NULL AND NEW.document_id IS DISTINCT FROM OLD.document_id)
        OR (OLD.workflow_instance_id IS NOT NULL
            AND NEW.workflow_instance_id IS DISTINCT FROM OLD.workflow_instance_id)
        OR (OLD.status IN ('approved', 'rejected', 'executed')
            AND (NEW.decided_by IS DISTINCT FROM OLD.decided_by
                OR NEW.decided_at IS DISTINCT FROM OLD.decided_at
                OR NEW.decision_note IS DISTINCT FROM OLD.decision_note))
        OR NOT ((OLD.status = NEW.status)
            OR (OLD.status = 'filed' AND NEW.status = 'in_analysis')
            OR (OLD.status = 'in_analysis' AND NEW.status IN ('approved', 'rejected'))
            OR (OLD.status = 'approved' AND NEW.status = 'executed')) THEN
        RAISE EXCEPTION 'Una solicitud de acción documental solo avanza por los pasos de su ciclo'
            USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "doc_change_requests_keep"
    BEFORE UPDATE ON "doc_change_requests"
    FOR EACH ROW EXECUTE FUNCTION "doc_keep_change_requests"();

-- Una constancia es de una persona y una versión; confirmada, no cambia.
CREATE FUNCTION "doc_keep_acknowledgements"() RETURNS TRIGGER
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF NEW.document_id IS DISTINCT FROM OLD.document_id
        OR NEW.version_id IS DISTINCT FROM OLD.version_id
        OR NEW.user_id IS DISTINCT FROM OLD.user_id
        OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
        OR (OLD.acknowledged_at IS NOT NULL AND (
            NEW.acknowledged_at IS DISTINCT FROM OLD.acknowledged_at
            OR NEW.requested_at IS DISTINCT FROM OLD.requested_at
            OR NEW.position_id IS DISTINCT FROM OLD.position_id)) THEN
        RAISE EXCEPTION 'Una constancia de lectura confirmada no se puede cambiar'
            USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "doc_acknowledgements_keep"
    BEFORE UPDATE ON "doc_acknowledgements"
    FOR EACH ROW EXECUTE FUNCTION "doc_keep_acknowledgements"();

-- Columnas de control --------------------------------------------------------------------------

CREATE TRIGGER "doc_change_requests_control_columns"
    BEFORE INSERT OR UPDATE ON "doc_change_requests"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();
CREATE TRIGGER "doc_acknowledgements_control_columns"
    BEFORE INSERT OR UPDATE ON "doc_acknowledgements"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();

-- Seguridad por fila (ADR-007) -----------------------------------------------------------------

ALTER TABLE "doc_change_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "doc_change_requests" FORCE ROW LEVEL SECURITY;
CREATE POLICY "doc_change_requests_tenant_isolation" ON "doc_change_requests"
    USING ("tenant_id" = core_current_tenant_id())
    WITH CHECK ("tenant_id" = core_current_tenant_id());

ALTER TABLE "doc_acknowledgements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "doc_acknowledgements" FORCE ROW LEVEL SECURITY;
CREATE POLICY "doc_acknowledgements_tenant_isolation" ON "doc_acknowledgements"
    USING ("tenant_id" = core_current_tenant_id())
    WITH CHECK ("tenant_id" = core_current_tenant_id());

-- Permisos de la API ---------------------------------------------------------------------------
-- Sin DELETE: el borrado es lógico (deleted_at).

GRANT SELECT, INSERT, UPDATE ON "doc_change_requests" TO app_user;
GRANT SELECT, INSERT, UPDATE ON "doc_acknowledgements" TO app_user;
