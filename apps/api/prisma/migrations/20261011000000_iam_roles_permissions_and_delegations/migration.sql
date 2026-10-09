-- B10: roles, permisos, asignaciones con vigencia y delegación temporal de aprobaciones.
-- Capítulos 12.1 y 15.2 a 15.4, anexo G, ADR-007 y ADR-009.

-- CreateTable
CREATE TABLE "iam_permissions" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "group_key" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "ownable" BOOLEAN NOT NULL,
    "description" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "iam_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "iam_roles" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_system" BOOLEAN NOT NULL,
    "audience" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "iam_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "iam_role_permissions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "permission_id" UUID NOT NULL,
    "conditions" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "iam_role_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "iam_user_roles" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "scope_type" TEXT,
    "scope_id" UUID,
    "valid_from" TIMESTAMPTZ(6) NOT NULL,
    "valid_until" TIMESTAMPTZ(6),
    "assigned_by" UUID,
    "revoked_at" TIMESTAMPTZ(6),
    "revoked_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "iam_user_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "iam_delegations" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "from_user_id" UUID NOT NULL,
    "to_user_id" UUID NOT NULL,
    "starts_at" TIMESTAMPTZ(6) NOT NULL,
    "ends_at" TIMESTAMPTZ(6) NOT NULL,
    "scope" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "revoked_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "iam_delegations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "iam_permissions_code_key" ON "iam_permissions"("code");

-- CreateIndex
CREATE UNIQUE INDEX "iam_roles_tenant_id_id_key" ON "iam_roles"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "iam_roles_tenant_id_code_key" ON "iam_roles"("tenant_id", "code");

-- CreateIndex
CREATE INDEX "iam_role_permissions_tenant_id_role_id_idx" ON "iam_role_permissions"("tenant_id", "role_id");

-- CreateIndex
CREATE UNIQUE INDEX "iam_role_permissions_role_id_permission_id_key" ON "iam_role_permissions"("role_id", "permission_id");

-- CreateIndex
CREATE INDEX "iam_user_roles_tenant_id_user_id_idx" ON "iam_user_roles"("tenant_id", "user_id");

-- CreateIndex
CREATE INDEX "iam_user_roles_tenant_id_role_id_idx" ON "iam_user_roles"("tenant_id", "role_id");

-- CreateIndex
CREATE INDEX "iam_delegations_tenant_id_from_user_id_idx" ON "iam_delegations"("tenant_id", "from_user_id");

-- CreateIndex
CREATE INDEX "iam_delegations_tenant_id_to_user_id_idx" ON "iam_delegations"("tenant_id", "to_user_id");

-- AddForeignKey
ALTER TABLE "iam_roles" ADD CONSTRAINT "iam_roles_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "iam_role_permissions" ADD CONSTRAINT "iam_role_permissions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "iam_role_permissions" ADD CONSTRAINT "iam_role_permissions_tenant_id_role_id_fkey" FOREIGN KEY ("tenant_id", "role_id") REFERENCES "iam_roles"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "iam_role_permissions" ADD CONSTRAINT "iam_role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "iam_permissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "iam_user_roles" ADD CONSTRAINT "iam_user_roles_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "iam_user_roles" ADD CONSTRAINT "iam_user_roles_tenant_id_user_id_fkey" FOREIGN KEY ("tenant_id", "user_id") REFERENCES "iam_users"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "iam_user_roles" ADD CONSTRAINT "iam_user_roles_tenant_id_role_id_fkey" FOREIGN KEY ("tenant_id", "role_id") REFERENCES "iam_roles"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "iam_delegations" ADD CONSTRAINT "iam_delegations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "iam_delegations" ADD CONSTRAINT "iam_delegations_tenant_id_from_user_id_fkey" FOREIGN KEY ("tenant_id", "from_user_id") REFERENCES "iam_users"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "iam_delegations" ADD CONSTRAINT "iam_delegations_tenant_id_to_user_id_fkey" FOREIGN KEY ("tenant_id", "to_user_id") REFERENCES "iam_users"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Reglas de los datos -------------------------------------------------------------------------

ALTER TABLE "iam_permissions"
    ADD CONSTRAINT "iam_permissions_code_check" CHECK ("code" ~ '^[a-z]+(\.[a-z_]+){1,2}$'),
    ADD CONSTRAINT "iam_permissions_parts_check" CHECK ("code" = "resource" || '.' || "action"),
    ADD CONSTRAINT "iam_permissions_level_check" CHECK ("level" IN ('read', 'write', 'approve', 'manage', 'restricted')),
    ADD CONSTRAINT "iam_permissions_version_check" CHECK ("version" > 0);

ALTER TABLE "iam_roles"
    ADD CONSTRAINT "iam_roles_code_check" CHECK ("code" ~ '^[A-Z][A-Z0-9_]{1,59}$'),
    ADD CONSTRAINT "iam_roles_name_check" CHECK (char_length("name") BETWEEN 3 AND 80),
    ADD CONSTRAINT "iam_roles_description_check" CHECK ("description" IS NULL OR char_length("description") <= 300),
    ADD CONSTRAINT "iam_roles_audience_check" CHECK ("audience" IN ('internal', 'portal')),
    ADD CONSTRAINT "iam_roles_version_check" CHECK ("version" > 0);

-- Sin condición, el permiso vale para todo; la única condición es «solo lo propio» (letra P). La
-- API la traduce al campo de propiedad de cada permiso; nadie escribe condiciones arbitrarias.
ALTER TABLE "iam_role_permissions"
    ADD CONSTRAINT "iam_role_permissions_conditions_check" CHECK ("conditions" IS NULL OR "conditions" = '{"scope": "own"}'::jsonb),
    ADD CONSTRAINT "iam_role_permissions_version_check" CHECK ("version" > 0);

-- Nadie se asigna ni se retira un rol a sí mismo (ficha 17.2): ni quien figura como responsable
-- ni quien, según la base de datos, hizo el cambio.
ALTER TABLE "iam_user_roles"
    ADD CONSTRAINT "iam_user_roles_scope_check" CHECK (("scope_type" IS NULL) = ("scope_id" IS NULL)),
    ADD CONSTRAINT "iam_user_roles_validity_check" CHECK ("valid_until" IS NULL OR "valid_until" > "valid_from"),
    ADD CONSTRAINT "iam_user_roles_revoked_check" CHECK ("revoked_by" IS NULL OR "revoked_at" IS NOT NULL),
    ADD CONSTRAINT "iam_user_roles_not_self_check" CHECK (
        ("assigned_by" IS NULL OR "assigned_by" <> "user_id")
        AND ("revoked_by" IS NULL OR "revoked_by" <> "user_id")
        AND ("created_by" IS NULL OR "created_by" <> "user_id")
        AND ("updated_by" IS NULL OR "updated_by" <> "user_id")
    ),
    ADD CONSTRAINT "iam_user_roles_version_check" CHECK ("version" > 0);

-- Una delegación dura 60 días como máximo, va a otra persona y nadie se la hace a sí mismo.
ALTER TABLE "iam_delegations"
    ADD CONSTRAINT "iam_delegations_people_check" CHECK ("from_user_id" <> "to_user_id"),
    ADD CONSTRAINT "iam_delegations_not_self_check" CHECK ("created_by" IS NULL OR "created_by" <> "to_user_id"),
    ADD CONSTRAINT "iam_delegations_period_check" CHECK ("ends_at" > "starts_at" AND "ends_at" <= "starts_at" + interval '60 days'),
    ADD CONSTRAINT "iam_delegations_scope_check" CHECK (jsonb_typeof("scope") = 'array' AND jsonb_array_length("scope") > 0),
    ADD CONSTRAINT "iam_delegations_reason_check" CHECK (char_length("reason") BETWEEN 5 AND 300),
    ADD CONSTRAINT "iam_delegations_revoked_check" CHECK ("revoked_by" IS NULL OR "revoked_at" IS NOT NULL),
    ADD CONSTRAINT "iam_delegations_version_check" CHECK ("version" > 0);

-- Un administrador que bloquea una cuenta cierra también sus sesiones.
ALTER TABLE "iam_sessions" DROP CONSTRAINT "iam_sessions_revoked_reason_check";
ALTER TABLE "iam_sessions" ADD CONSTRAINT "iam_sessions_revoked_reason_check" CHECK (
    "revoked_reason" IS NULL
    OR "revoked_reason" IN (
        'logout', 'idle', 'password_changed', 'password_reset',
        'remote_revoke', 'mfa_failures', 'mfa_changed', 'mfa_reset', 'account_locked'
    )
);

-- Columnas de control --------------------------------------------------------------------------

CREATE TRIGGER "iam_permissions_control_columns"
    BEFORE INSERT OR UPDATE ON "iam_permissions"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();

CREATE TRIGGER "iam_roles_control_columns"
    BEFORE INSERT OR UPDATE ON "iam_roles"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();

CREATE TRIGGER "iam_role_permissions_control_columns"
    BEFORE INSERT OR UPDATE ON "iam_role_permissions"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();

CREATE TRIGGER "iam_user_roles_control_columns"
    BEFORE INSERT OR UPDATE ON "iam_user_roles"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();

CREATE TRIGGER "iam_delegations_control_columns"
    BEFORE INSERT OR UPDATE ON "iam_delegations"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();

-- Seguridad por fila (ADR-007) -----------------------------------------------------------------
-- iam_permissions es el catálogo común a todas las empresas: no tiene datos de ninguna.

ALTER TABLE "iam_roles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "iam_roles" FORCE ROW LEVEL SECURITY;
CREATE POLICY "iam_roles_tenant_isolation" ON "iam_roles"
    USING ("tenant_id" = core_current_tenant_id())
    WITH CHECK ("tenant_id" = core_current_tenant_id());

ALTER TABLE "iam_role_permissions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "iam_role_permissions" FORCE ROW LEVEL SECURITY;
CREATE POLICY "iam_role_permissions_tenant_isolation" ON "iam_role_permissions"
    USING ("tenant_id" = core_current_tenant_id())
    WITH CHECK ("tenant_id" = core_current_tenant_id());

ALTER TABLE "iam_user_roles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "iam_user_roles" FORCE ROW LEVEL SECURITY;
CREATE POLICY "iam_user_roles_tenant_isolation" ON "iam_user_roles"
    USING ("tenant_id" = core_current_tenant_id())
    WITH CHECK ("tenant_id" = core_current_tenant_id());

ALTER TABLE "iam_delegations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "iam_delegations" FORCE ROW LEVEL SECURITY;
CREATE POLICY "iam_delegations_tenant_isolation" ON "iam_delegations"
    USING ("tenant_id" = core_current_tenant_id())
    WITH CHECK ("tenant_id" = core_current_tenant_id());

-- Permisos de la API ---------------------------------------------------------------------------
-- Sin DELETE: un rol retirado, un permiso quitado o una delegación terminada quedan marcados.
-- La semilla, que también corre como app_user, mantiene el catálogo al día.

GRANT SELECT, INSERT, UPDATE ON "iam_permissions" TO app_user;
GRANT SELECT, INSERT, UPDATE ON "iam_roles" TO app_user;
GRANT SELECT, INSERT, UPDATE ON "iam_role_permissions" TO app_user;
GRANT SELECT, INSERT, UPDATE ON "iam_user_roles" TO app_user;
GRANT SELECT, INSERT, UPDATE ON "iam_delegations" TO app_user;
