-- B36A: comunicados del acceso (M00). Administración los carga con vigencia de una fecha a otra,
-- para el personal, los clientes o ambos; la pantalla de acceso, sin sesión, muestra los vigentes
-- de la empresa del sitio. Solo expande: la versión anterior sigue funcionando sin esta tabla.

CREATE TABLE "core_announcements" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "link_url" TEXT,
    "audience" TEXT NOT NULL,
    "starts_on" DATE NOT NULL,
    "ends_on" DATE NOT NULL,
    "image_file_id" UUID,
    "ended_at" TIMESTAMPTZ(6),
    "ended_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),
    CONSTRAINT "core_announcements_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "core_announcements_audience_check" CHECK ("audience" IN ('staff', 'clients', 'both')),
    CONSTRAINT "core_announcements_dates_check" CHECK ("ends_on" >= "starts_on"),
    CONSTRAINT "core_announcements_text_check" CHECK (
        char_length("title") BETWEEN 3 AND 80 AND char_length("body") BETWEEN 3 AND 400
    ),
    CONSTRAINT "core_announcements_link_check" CHECK ("link_url" IS NULL OR "link_url" LIKE 'https://%'),
    CONSTRAINT "core_announcements_ended_check" CHECK (("ended_at" IS NULL) = ("ended_by" IS NULL))
);

CREATE UNIQUE INDEX "core_announcements_tenant_id_id_key" ON "core_announcements"("tenant_id", "id");
CREATE INDEX "core_announcements_tenant_id_starts_on_ends_on_idx"
    ON "core_announcements"("tenant_id", "starts_on", "ends_on");

ALTER TABLE "core_announcements" ADD CONSTRAINT "core_announcements_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TRIGGER "core_announcements_control_columns" BEFORE INSERT OR UPDATE ON "core_announcements"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();

ALTER TABLE "core_announcements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "core_announcements" FORCE ROW LEVEL SECURITY;
CREATE POLICY "core_announcements_tenant_isolation" ON "core_announcements"
    USING ("tenant_id" = core_current_tenant_id()) WITH CHECK ("tenant_id" = core_current_tenant_id());

GRANT SELECT, INSERT, UPDATE ON "core_announcements" TO app_user;
