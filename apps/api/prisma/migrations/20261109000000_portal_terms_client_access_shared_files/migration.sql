-- B30: portal del cliente (M09, ficha 17.10). El portal no tiene tablas propias: muestra lo de
-- Proyectos, Contratos, Servicio e Identidad limitado a la empresa cliente de cada persona. Esta
-- migración agrega lo que esos módulos necesitan para él: la aceptación de los términos de uso y de
-- la política de privacidad (iam_terms_acceptances, decisión 8), si el proyecto se ve en el portal
-- (prj_projects.portal_visible, decisión 2), qué proyectos ve cada usuario del cliente
-- (prj_client_access, decisión 3) y los archivos compartidos con el cliente (prj_shared_files,
-- decisión 5). Agrega la clase de texto «portal_terms». Solo expande: la versión anterior sigue
-- funcionando.

-- AlterTable
ALTER TABLE "prj_projects" ADD COLUMN     "portal_visible" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "iam_terms_acceptances" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "notice_id" UUID NOT NULL,
    "notice_key" TEXT NOT NULL,
    "version_number" INTEGER NOT NULL,
    "accepted_at" TIMESTAMPTZ(6) NOT NULL,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "iam_terms_acceptances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prj_client_access" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "prj_client_access_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prj_shared_files" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "file_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "shared_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "prj_shared_files_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "iam_terms_acceptances_tenant_id_user_id_idx" ON "iam_terms_acceptances"("tenant_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "iam_terms_acceptances_tenant_id_id_key" ON "iam_terms_acceptances"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "iam_terms_acceptances_tenant_id_user_id_notice_id_key" ON "iam_terms_acceptances"("tenant_id", "user_id", "notice_id");

-- CreateIndex
CREATE INDEX "prj_client_access_tenant_id_project_id_idx" ON "prj_client_access"("tenant_id", "project_id");

-- CreateIndex
CREATE INDEX "prj_client_access_tenant_id_user_id_idx" ON "prj_client_access"("tenant_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "prj_client_access_tenant_id_id_key" ON "prj_client_access"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "prj_shared_files_tenant_id_project_id_idx" ON "prj_shared_files"("tenant_id", "project_id");

-- CreateIndex
CREATE UNIQUE INDEX "prj_shared_files_tenant_id_id_key" ON "prj_shared_files"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "prj_projects_tenant_id_party_id_idx" ON "prj_projects"("tenant_id", "party_id");

-- AddForeignKey
ALTER TABLE "iam_terms_acceptances" ADD CONSTRAINT "iam_terms_acceptances_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prj_client_access" ADD CONSTRAINT "prj_client_access_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prj_client_access" ADD CONSTRAINT "prj_client_access_tenant_id_project_id_fkey" FOREIGN KEY ("tenant_id", "project_id") REFERENCES "prj_projects"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prj_shared_files" ADD CONSTRAINT "prj_shared_files_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prj_shared_files" ADD CONSTRAINT "prj_shared_files_tenant_id_project_id_fkey" FOREIGN KEY ("tenant_id", "project_id") REFERENCES "prj_projects"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Reglas de los datos -------------------------------------------------------------------------

ALTER TABLE "iam_terms_acceptances"
    ADD CONSTRAINT "iam_terms_acceptances_notice_key_check"
        CHECK ("notice_key" IN ('portal_terms', 'privacy_policy')),
    ADD CONSTRAINT "iam_terms_acceptances_version_number_check" CHECK ("version_number" >= 1),
    ADD CONSTRAINT "iam_terms_acceptances_version_check" CHECK ("version" > 0);

ALTER TABLE "prj_client_access"
    ADD CONSTRAINT "prj_client_access_version_check" CHECK ("version" > 0);

-- Un usuario tiene a lo sumo una asignación vigente por proyecto.
CREATE UNIQUE INDEX "prj_client_access_live_key" ON "prj_client_access"("tenant_id", "project_id", "user_id")
    WHERE "deleted_at" IS NULL;

ALTER TABLE "prj_shared_files"
    ADD CONSTRAINT "prj_shared_files_title_check" CHECK (char_length(btrim("title")) BETWEEN 3 AND 160),
    ADD CONSTRAINT "prj_shared_files_version_check" CHECK ("version" > 0);

-- Un archivo se comparte una sola vez por proyecto mientras siga compartido.
CREATE UNIQUE INDEX "prj_shared_files_live_key" ON "prj_shared_files"("tenant_id", "project_id", "file_id")
    WHERE "deleted_at" IS NULL;

-- Términos de uso del portal: un texto más que el Oficial de Protección de Datos publica.
ALTER TABLE "prv_notices" DROP CONSTRAINT "prv_notices_key_check";
ALTER TABLE "prv_notices"
    ADD CONSTRAINT "prv_notices_key_check" CHECK ("key" IN (
        'privacy_policy', 'privacy_notice', 'portal_terms', 'authorization_customer',
        'authorization_supplier', 'authorization_employee', 'authorization_candidate',
        'authorization_contact', 'authorization_prior'));

-- Columnas de control --------------------------------------------------------------------------

CREATE TRIGGER "iam_terms_acceptances_control_columns"
    BEFORE INSERT OR UPDATE ON "iam_terms_acceptances"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();
CREATE TRIGGER "prj_client_access_control_columns"
    BEFORE INSERT OR UPDATE ON "prj_client_access"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();
CREATE TRIGGER "prj_shared_files_control_columns"
    BEFORE INSERT OR UPDATE ON "prj_shared_files"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();

-- Seguridad por fila (ADR-007) -----------------------------------------------------------------

ALTER TABLE "iam_terms_acceptances" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "iam_terms_acceptances" FORCE ROW LEVEL SECURITY;
CREATE POLICY "iam_terms_acceptances_tenant_isolation" ON "iam_terms_acceptances"
    USING ("tenant_id" = core_current_tenant_id())
    WITH CHECK ("tenant_id" = core_current_tenant_id());
ALTER TABLE "prj_client_access" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "prj_client_access" FORCE ROW LEVEL SECURITY;
CREATE POLICY "prj_client_access_tenant_isolation" ON "prj_client_access"
    USING ("tenant_id" = core_current_tenant_id())
    WITH CHECK ("tenant_id" = core_current_tenant_id());
ALTER TABLE "prj_shared_files" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "prj_shared_files" FORCE ROW LEVEL SECURITY;
CREATE POLICY "prj_shared_files_tenant_isolation" ON "prj_shared_files"
    USING ("tenant_id" = core_current_tenant_id())
    WITH CHECK ("tenant_id" = core_current_tenant_id());

-- Permisos de la API ---------------------------------------------------------------------------
-- La aceptación de los términos solo se agrega. Las asignaciones y lo compartido se retiran con
-- deleted_at: nunca se borran.
GRANT SELECT, INSERT ON "iam_terms_acceptances" TO app_user;
GRANT SELECT, INSERT, UPDATE ON "prj_client_access" TO app_user;
GRANT SELECT, INSERT, UPDATE ON "prj_shared_files" TO app_user;
