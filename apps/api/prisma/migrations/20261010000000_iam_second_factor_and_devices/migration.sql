-- B09: segundo factor TOTP con códigos de recuperación, dispositivos conocidos y estado de la
-- sesión (contraseña verificada, segundo factor completo y última confirmación de identidad).
-- Capítulos 12.1 y 15.1, numeral 15.5, ADR-007 y ADR-008.

-- AlterTable
ALTER TABLE "iam_sessions" ADD COLUMN     "authenticated_at" TIMESTAMPTZ(6),
ADD COLUMN     "device_id" UUID,
ADD COLUMN     "reauthenticated_at" TIMESTAMPTZ(6);

-- CreateTable
CREATE TABLE "iam_mfa_factors" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'totp',
    "secret_encrypted" TEXT,
    "confirmed_at" TIMESTAMPTZ(6),
    "last_used_step" INTEGER,
    "pending_secret_encrypted" TEXT,
    "pending_expires_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "iam_mfa_factors_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "iam_mfa_factors_type_check" CHECK ("type" IN ('totp')),
    -- Un factor activo siempre tiene secreto y fecha de confirmación; uno en configuración, su
    -- secreto pendiente y su vencimiento.
    CONSTRAINT "iam_mfa_factors_confirmed_check" CHECK (("secret_encrypted" IS NULL) = ("confirmed_at" IS NULL)),
    CONSTRAINT "iam_mfa_factors_pending_check" CHECK (("pending_secret_encrypted" IS NULL) = ("pending_expires_at" IS NULL)),
    -- Los secretos solo se guardan cifrados (formato «v1.iv.etiqueta.cifrado» de FieldCipher).
    CONSTRAINT "iam_mfa_factors_encrypted_check" CHECK (
        ("secret_encrypted" IS NULL OR "secret_encrypted" ~ '^v[0-9]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$')
        AND ("pending_secret_encrypted" IS NULL OR "pending_secret_encrypted" ~ '^v[0-9]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$')
    ),
    CONSTRAINT "iam_mfa_factors_last_used_step_check" CHECK ("last_used_step" IS NULL OR "last_used_step" >= 0),
    CONSTRAINT "iam_mfa_factors_version_check" CHECK ("version" > 0)
);

-- CreateTable
CREATE TABLE "iam_recovery_codes" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "code_hash" TEXT NOT NULL,
    "used_at" TIMESTAMPTZ(6),
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "iam_recovery_codes_pkey" PRIMARY KEY ("id"),
    -- Huella SHA-256 en hexadecimal: nunca el código.
    CONSTRAINT "iam_recovery_codes_code_hash_check" CHECK ("code_hash" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "iam_recovery_codes_version_check" CHECK ("version" > 0)
);

-- CreateTable
CREATE TABLE "iam_known_devices" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "device_hash" TEXT NOT NULL,
    "user_agent" TEXT,
    "first_seen_at" TIMESTAMPTZ(6) NOT NULL,
    "last_seen_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "iam_known_devices_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "iam_known_devices_device_hash_check" CHECK ("device_hash" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "iam_known_devices_seen_check" CHECK ("last_seen_at" >= "first_seen_at"),
    CONSTRAINT "iam_known_devices_version_check" CHECK ("version" > 0)
);

-- Reglas nuevas de las sesiones ----------------------------------------------------------------

-- Una confirmación de identidad solo existe en una sesión completa.
ALTER TABLE "iam_sessions" ADD CONSTRAINT "iam_sessions_reauthenticated_check"
    CHECK ("reauthenticated_at" IS NULL OR "authenticated_at" IS NOT NULL);

-- Motivos nuevos de cierre: desde otro dispositivo, por códigos equivocados y por cambio o
-- reinicio del segundo factor.
ALTER TABLE "iam_sessions" DROP CONSTRAINT "iam_sessions_revoked_reason_check";
ALTER TABLE "iam_sessions" ADD CONSTRAINT "iam_sessions_revoked_reason_check" CHECK (
    "revoked_reason" IS NULL
    OR "revoked_reason" IN (
        'logout', 'idle', 'password_changed', 'password_reset',
        'remote_revoke', 'mfa_failures', 'mfa_changed', 'mfa_reset'
    )
);

-- Las sesiones abiertas antes de B09 quedan sin authenticated_at: la API las trata como sesiones
-- a medias, que solo atienden el segundo paso, así que nadie sigue dentro sin segundo factor.

-- CreateIndex
CREATE UNIQUE INDEX "iam_mfa_factors_tenant_id_user_id_type_key" ON "iam_mfa_factors"("tenant_id", "user_id", "type");

-- CreateIndex
CREATE UNIQUE INDEX "iam_recovery_codes_code_hash_key" ON "iam_recovery_codes"("code_hash");

-- CreateIndex
CREATE INDEX "iam_recovery_codes_tenant_id_user_id_idx" ON "iam_recovery_codes"("tenant_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "iam_known_devices_tenant_id_id_key" ON "iam_known_devices"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "iam_known_devices_tenant_id_user_id_device_hash_key" ON "iam_known_devices"("tenant_id", "user_id", "device_hash");

-- CreateIndex
CREATE INDEX "iam_sessions_tenant_id_device_id_idx" ON "iam_sessions"("tenant_id", "device_id");

-- AddForeignKey
ALTER TABLE "iam_sessions" ADD CONSTRAINT "iam_sessions_tenant_id_device_id_fkey" FOREIGN KEY ("tenant_id", "device_id") REFERENCES "iam_known_devices"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "iam_mfa_factors" ADD CONSTRAINT "iam_mfa_factors_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "iam_mfa_factors" ADD CONSTRAINT "iam_mfa_factors_tenant_id_user_id_fkey" FOREIGN KEY ("tenant_id", "user_id") REFERENCES "iam_users"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "iam_recovery_codes" ADD CONSTRAINT "iam_recovery_codes_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "iam_recovery_codes" ADD CONSTRAINT "iam_recovery_codes_tenant_id_user_id_fkey" FOREIGN KEY ("tenant_id", "user_id") REFERENCES "iam_users"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "iam_known_devices" ADD CONSTRAINT "iam_known_devices_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "iam_known_devices" ADD CONSTRAINT "iam_known_devices_tenant_id_user_id_fkey" FOREIGN KEY ("tenant_id", "user_id") REFERENCES "iam_users"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Columnas de control --------------------------------------------------------------------------

CREATE TRIGGER "iam_mfa_factors_control_columns"
    BEFORE INSERT OR UPDATE ON "iam_mfa_factors"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();

CREATE TRIGGER "iam_recovery_codes_control_columns"
    BEFORE INSERT OR UPDATE ON "iam_recovery_codes"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();

CREATE TRIGGER "iam_known_devices_control_columns"
    BEFORE INSERT OR UPDATE ON "iam_known_devices"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();

-- Seguridad por fila (ADR-007) -----------------------------------------------------------------
-- Ninguna búsqueda sin empresa necesita estas tablas: no llevan política para migration_user.

ALTER TABLE "iam_mfa_factors" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "iam_mfa_factors" FORCE ROW LEVEL SECURITY;
CREATE POLICY "iam_mfa_factors_tenant_isolation" ON "iam_mfa_factors"
    USING ("tenant_id" = core_current_tenant_id())
    WITH CHECK ("tenant_id" = core_current_tenant_id());

ALTER TABLE "iam_recovery_codes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "iam_recovery_codes" FORCE ROW LEVEL SECURITY;
CREATE POLICY "iam_recovery_codes_tenant_isolation" ON "iam_recovery_codes"
    USING ("tenant_id" = core_current_tenant_id())
    WITH CHECK ("tenant_id" = core_current_tenant_id());

ALTER TABLE "iam_known_devices" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "iam_known_devices" FORCE ROW LEVEL SECURITY;
CREATE POLICY "iam_known_devices_tenant_isolation" ON "iam_known_devices"
    USING ("tenant_id" = core_current_tenant_id())
    WITH CHECK ("tenant_id" = core_current_tenant_id());

-- Permisos de la API ---------------------------------------------------------------------------
-- Sin DELETE: un factor desactivado o un código reemplazado quedan marcados, no se borran.

GRANT SELECT, INSERT, UPDATE ON "iam_mfa_factors" TO app_user;
GRANT SELECT, INSERT, UPDATE ON "iam_recovery_codes" TO app_user;
GRANT SELECT, INSERT, UPDATE ON "iam_known_devices" TO app_user;
