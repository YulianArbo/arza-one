-- B14: archivos físicos en el almacenamiento privado (M03, numeral 13.2, ADR-013). Cada archivo
-- se analiza con el antivirus y se le calcula su huella SHA-256 antes de quedar disponible.

-- CreateTable
CREATE TABLE "doc_files" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "storage_key" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "sha256" TEXT,
    "scan_status" TEXT NOT NULL DEFAULT 'pending_upload',
    "rejection" TEXT,
    "scanned_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "doc_files_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "doc_files_tenant_id_created_by_created_at_idx" ON "doc_files"("tenant_id", "created_by", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "doc_files_tenant_id_id_key" ON "doc_files"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "doc_files_storage_key_key" ON "doc_files"("storage_key");

-- AddForeignKey
ALTER TABLE "doc_files" ADD CONSTRAINT "doc_files_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Reglas de los datos -------------------------------------------------------------------------
-- La lista blanca y el límite de 20 MB son los de packages/contracts/src/doc/files.ts.

ALTER TABLE "doc_files"
    ADD CONSTRAINT "doc_files_mime_type_check" CHECK ("mime_type" IN (
        'application/pdf',
        'image/png',
        'image/jpeg',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')),
    ADD CONSTRAINT "doc_files_size_bytes_check" CHECK ("size_bytes" BETWEEN 1 AND 20971520),
    ADD CONSTRAINT "doc_files_scan_status_check"
        CHECK ("scan_status" IN ('pending_upload', 'scanning', 'available', 'rejected')),
    ADD CONSTRAINT "doc_files_rejection_check" CHECK (
        ("scan_status" = 'rejected') = ("rejection" IS NOT NULL)
        AND ("rejection" IS NULL OR "rejection" IN ('virus', 'type_mismatch', 'size_mismatch'))),
    ADD CONSTRAINT "doc_files_sha256_check" CHECK ("sha256" IS NULL OR "sha256" ~ '^[0-9a-f]{64}$'),
    ADD CONSTRAINT "doc_files_available_check"
        CHECK ("scan_status" <> 'available' OR ("sha256" IS NOT NULL AND "scanned_at" IS NOT NULL));

-- Un archivo ya analizado no cambia: su huella, su contenido y su resultado quedan fijos. Así la
-- huella siempre corresponde a lo que se analizó (ficha 17.4).
CREATE FUNCTION "doc_keep_analyzed_files"() RETURNS TRIGGER
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF OLD.scan_status IN ('available', 'rejected') AND (
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

CREATE TRIGGER "doc_files_keep_analyzed"
    BEFORE UPDATE ON "doc_files"
    FOR EACH ROW EXECUTE FUNCTION "doc_keep_analyzed_files"();

-- Columnas de control --------------------------------------------------------------------------

CREATE TRIGGER "doc_files_control_columns"
    BEFORE INSERT OR UPDATE ON "doc_files"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();

-- Seguridad por fila (ADR-007) -----------------------------------------------------------------

ALTER TABLE "doc_files" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "doc_files" FORCE ROW LEVEL SECURITY;
CREATE POLICY "doc_files_tenant_isolation" ON "doc_files"
    USING ("tenant_id" = core_current_tenant_id())
    WITH CHECK ("tenant_id" = core_current_tenant_id());

-- Permisos de la API ---------------------------------------------------------------------------
-- Sin DELETE: el borrado es lógico (deleted_at).

GRANT SELECT, INSERT, UPDATE ON "doc_files" TO app_user;
