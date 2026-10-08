-- B08: cuentas, sesiones, enlaces de un solo uso, intentos de inicio de sesión y auditoría mínima.
-- Capítulos 12.3 y 15.1, numeral 13.1, ADR-007, ADR-008 y ADR-012.

-- CreateTable
CREATE TABLE "iam_users" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "display_name" TEXT,
    "password_hash" TEXT,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'invited',
    "party_id" UUID,
    "position_id" UUID,
    "mfa_required" BOOLEAN NOT NULL DEFAULT true,
    "last_login_at" TIMESTAMPTZ(6),
    "locked_until" TIMESTAMPTZ(6),
    "password_changed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "iam_users_pkey" PRIMARY KEY ("id"),
    -- El correo se guarda normalizado: sin espacios y en minúsculas.
    CONSTRAINT "iam_users_email_check" CHECK ("email" = lower(btrim("email")) AND "email" LIKE '_%@_%'),
    CONSTRAINT "iam_users_kind_check" CHECK ("kind" IN ('internal', 'portal', 'service')),
    -- Flujo de la ficha 17.2: invitado → activo → bloqueado → inactivo.
    CONSTRAINT "iam_users_status_check" CHECK ("status" IN ('invited', 'active', 'locked', 'inactive')),
    -- Una cuenta activa siempre tiene contraseña; las cuentas de servicio nunca (numeral 15.1).
    CONSTRAINT "iam_users_password_check" CHECK (
        ("status" <> 'active' OR "kind" = 'service' OR "password_hash" IS NOT NULL)
        AND ("kind" <> 'service' OR "password_hash" IS NULL)
    ),
    CONSTRAINT "iam_users_password_hash_check" CHECK ("password_hash" IS NULL OR "password_hash" LIKE '$argon2id$%'),
    CONSTRAINT "iam_users_version_check" CHECK ("version" > 0)
);

-- CreateTable
CREATE TABLE "iam_sessions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "ip" TEXT,
    "user_agent" TEXT,
    "last_seen_at" TIMESTAMPTZ(6) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "revoked_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "iam_sessions_pkey" PRIMARY KEY ("id"),
    -- Huella SHA-256 en hexadecimal: nunca la llave de la cookie.
    CONSTRAINT "iam_sessions_token_hash_check" CHECK ("token_hash" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "iam_sessions_revoked_check" CHECK (("revoked_at" IS NULL) = ("revoked_reason" IS NULL)),
    CONSTRAINT "iam_sessions_revoked_reason_check" CHECK (
        "revoked_reason" IS NULL
        OR "revoked_reason" IN ('logout', 'idle', 'password_changed', 'password_reset')
    ),
    CONSTRAINT "iam_sessions_version_check" CHECK ("version" > 0)
);

-- CreateTable
CREATE TABLE "iam_tokens" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "purpose" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "used_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "iam_tokens_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "iam_tokens_purpose_check" CHECK ("purpose" IN ('invitation', 'password_reset')),
    CONSTRAINT "iam_tokens_token_hash_check" CHECK ("token_hash" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "iam_tokens_version_check" CHECK ("version" > 0)
);

-- CreateTable
CREATE TABLE "iam_login_attempts" (
    "id" UUID NOT NULL,
    "tenant_id" UUID,
    "user_id" UUID,
    "email" TEXT NOT NULL,
    "ip" TEXT,
    "succeeded" BOOLEAN NOT NULL,
    "reason" TEXT NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "iam_login_attempts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "iam_login_attempts_user_check" CHECK ("user_id" IS NULL OR "tenant_id" IS NOT NULL),
    CONSTRAINT "iam_login_attempts_reason_check" CHECK (
        ("succeeded" AND "reason" IN ('ok', 'password_reset'))
        OR (NOT "succeeded" AND "reason" IN ('bad_credentials', 'delayed', 'locked'))
    ),
    CONSTRAINT "iam_login_attempts_version_check" CHECK ("version" > 0)
);

-- CreateTable
CREATE TABLE "aud_events" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,
    "actor_id" UUID,
    "actor_kind" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" UUID,
    "result" TEXT NOT NULL,
    "changes" JSONB NOT NULL DEFAULT '{}',
    "ip" TEXT,
    "correlation_id" TEXT,

    CONSTRAINT "aud_events_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "aud_events_actor_kind_check" CHECK ("actor_kind" IN ('user', 'system', 'anonymous')),
    CONSTRAINT "aud_events_actor_check" CHECK (("actor_kind" = 'user') = ("actor_id" IS NOT NULL)),
    -- Acciones con el formato de los permisos del anexo G: «iam.session.create».
    CONSTRAINT "aud_events_action_check" CHECK ("action" ~ '^[a-z]+(\.[a-z_]+)+$'),
    CONSTRAINT "aud_events_result_check" CHECK ("result" IN ('success', 'failure')),
    CONSTRAINT "aud_events_changes_check" CHECK (jsonb_typeof("changes") = 'object')
);

-- CreateTable
CREATE TABLE "aud_security_events" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,
    "type" TEXT NOT NULL,
    "user_id" UUID,
    "ip" TEXT,
    "detail" JSONB NOT NULL DEFAULT '{}',
    "severity" TEXT NOT NULL,

    CONSTRAINT "aud_security_events_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "aud_security_events_type_check" CHECK ("type" ~ '^[a-z]+(\.[a-z_]+)+$'),
    CONSTRAINT "aud_security_events_severity_check" CHECK ("severity" IN ('low', 'medium', 'high', 'critical')),
    CONSTRAINT "aud_security_events_detail_check" CHECK (jsonb_typeof("detail") = 'object')
);

-- CreateIndex
CREATE UNIQUE INDEX "iam_users_email_key" ON "iam_users"("email");

-- CreateIndex
CREATE INDEX "iam_users_tenant_id_status_idx" ON "iam_users"("tenant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "iam_users_tenant_id_id_key" ON "iam_users"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "iam_sessions_token_hash_key" ON "iam_sessions"("token_hash");

-- CreateIndex
CREATE INDEX "iam_sessions_tenant_id_user_id_idx" ON "iam_sessions"("tenant_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "iam_tokens_token_hash_key" ON "iam_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "iam_tokens_tenant_id_user_id_purpose_idx" ON "iam_tokens"("tenant_id", "user_id", "purpose");

-- CreateIndex
CREATE INDEX "iam_login_attempts_email_occurred_at_idx" ON "iam_login_attempts"("email", "occurred_at");

-- CreateIndex
CREATE INDEX "iam_login_attempts_tenant_id_user_id_idx" ON "iam_login_attempts"("tenant_id", "user_id");

-- CreateIndex
CREATE INDEX "aud_events_tenant_id_occurred_at_idx" ON "aud_events"("tenant_id", "occurred_at");

-- CreateIndex
CREATE INDEX "aud_events_tenant_id_entity_type_entity_id_idx" ON "aud_events"("tenant_id", "entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "aud_security_events_tenant_id_occurred_at_idx" ON "aud_security_events"("tenant_id", "occurred_at");

-- AddForeignKey
ALTER TABLE "iam_users" ADD CONSTRAINT "iam_users_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "iam_sessions" ADD CONSTRAINT "iam_sessions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "iam_sessions" ADD CONSTRAINT "iam_sessions_tenant_id_user_id_fkey" FOREIGN KEY ("tenant_id", "user_id") REFERENCES "iam_users"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "iam_tokens" ADD CONSTRAINT "iam_tokens_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "iam_tokens" ADD CONSTRAINT "iam_tokens_tenant_id_user_id_fkey" FOREIGN KEY ("tenant_id", "user_id") REFERENCES "iam_users"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "iam_login_attempts" ADD CONSTRAINT "iam_login_attempts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "iam_login_attempts" ADD CONSTRAINT "iam_login_attempts_tenant_id_user_id_fkey" FOREIGN KEY ("tenant_id", "user_id") REFERENCES "iam_users"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aud_events" ADD CONSTRAINT "aud_events_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aud_security_events" ADD CONSTRAINT "aud_security_events_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Columnas de control --------------------------------------------------------------------------
-- La auditoría no las lleva: sus filas nunca se modifican.

CREATE TRIGGER "iam_users_control_columns"
    BEFORE INSERT OR UPDATE ON "iam_users"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();

CREATE TRIGGER "iam_sessions_control_columns"
    BEFORE INSERT OR UPDATE ON "iam_sessions"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();

CREATE TRIGGER "iam_tokens_control_columns"
    BEFORE INSERT OR UPDATE ON "iam_tokens"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();

CREATE TRIGGER "iam_login_attempts_control_columns"
    BEFORE INSERT OR UPDATE ON "iam_login_attempts"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();

-- Seguridad por fila (ADR-007) -----------------------------------------------------------------

ALTER TABLE "iam_users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "iam_users" FORCE ROW LEVEL SECURITY;
CREATE POLICY "iam_users_tenant_isolation" ON "iam_users"
    USING ("tenant_id" = core_current_tenant_id())
    WITH CHECK ("tenant_id" = core_current_tenant_id());

ALTER TABLE "iam_sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "iam_sessions" FORCE ROW LEVEL SECURITY;
CREATE POLICY "iam_sessions_tenant_isolation" ON "iam_sessions"
    USING ("tenant_id" = core_current_tenant_id())
    WITH CHECK ("tenant_id" = core_current_tenant_id());

ALTER TABLE "iam_tokens" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "iam_tokens" FORCE ROW LEVEL SECURITY;
CREATE POLICY "iam_tokens_tenant_isolation" ON "iam_tokens"
    USING ("tenant_id" = core_current_tenant_id())
    WITH CHECK ("tenant_id" = core_current_tenant_id());

-- Las filas sin empresa (correos sin cuenta) no las ve nadie con esta política.
ALTER TABLE "iam_login_attempts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "iam_login_attempts" FORCE ROW LEVEL SECURITY;
CREATE POLICY "iam_login_attempts_tenant_isolation" ON "iam_login_attempts"
    USING ("tenant_id" = core_current_tenant_id())
    WITH CHECK ("tenant_id" = core_current_tenant_id());

ALTER TABLE "aud_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "aud_events" FORCE ROW LEVEL SECURITY;
CREATE POLICY "aud_events_tenant_isolation" ON "aud_events"
    USING ("tenant_id" = core_current_tenant_id())
    WITH CHECK ("tenant_id" = core_current_tenant_id());

ALTER TABLE "aud_security_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "aud_security_events" FORCE ROW LEVEL SECURITY;
CREATE POLICY "aud_security_events_tenant_isolation" ON "aud_security_events"
    USING ("tenant_id" = core_current_tenant_id())
    WITH CHECK ("tenant_id" = core_current_tenant_id());

-- Búsquedas antes de conocer la empresa --------------------------------------------------------
-- Al iniciar sesión, al llegar una cookie o al abrir un enlace del correo todavía no se sabe la
-- empresa. Estas funciones corren como su dueño (migration_user), que tiene una política de solo
-- lectura, y devuelven lo mínimo: a qué usuario y empresa pertenece el dato. Todo lo demás
-- ocurre después, dentro del contexto de esa empresa. app_user solo puede ejecutarlas.

CREATE POLICY "iam_users_identity_lookup" ON "iam_users"
    FOR SELECT TO migration_user USING (true);
CREATE POLICY "iam_sessions_identity_lookup" ON "iam_sessions"
    FOR SELECT TO migration_user USING (true);
CREATE POLICY "iam_tokens_identity_lookup" ON "iam_tokens"
    FOR SELECT TO migration_user USING (true);
CREATE POLICY "iam_login_attempts_identity_lookup" ON "iam_login_attempts"
    FOR SELECT TO migration_user USING (true);
CREATE POLICY "iam_login_attempts_record" ON "iam_login_attempts"
    FOR INSERT TO migration_user WITH CHECK (true);

-- Cuenta de un correo (ya normalizado), sin importar su estado: el caso de uso decide.
CREATE FUNCTION "iam_find_login_user"(p_email TEXT)
    RETURNS TABLE (user_id UUID, tenant_id UUID)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path = public, pg_temp
    AS $$
        SELECT u.id, u.tenant_id FROM iam_users u
         WHERE u.email = p_email AND u.deleted_at IS NULL
    $$;

-- Sesión vigente por la huella de su llave. El vencimiento por inactividad lo revisa la API.
CREATE FUNCTION "iam_find_session"(p_token_hash TEXT, p_now TIMESTAMPTZ)
    RETURNS TABLE (session_id UUID, user_id UUID, tenant_id UUID)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path = public, pg_temp
    AS $$
        SELECT s.id, s.user_id, s.tenant_id FROM iam_sessions s
         WHERE s.token_hash = p_token_hash AND s.revoked_at IS NULL AND s.expires_at > p_now
    $$;

-- Enlace sin usar y sin vencer, por la huella de su llave y su propósito.
CREATE FUNCTION "iam_find_token"(p_token_hash TEXT, p_purpose TEXT, p_now TIMESTAMPTZ)
    RETURNS TABLE (token_id UUID, user_id UUID, tenant_id UUID)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path = public, pg_temp
    AS $$
        SELECT t.id, t.user_id, t.tenant_id FROM iam_tokens t
         WHERE t.token_hash = p_token_hash AND t.purpose = p_purpose
           AND t.used_at IS NULL AND t.expires_at > p_now
    $$;

-- Registra un intento. La empresa y el usuario los deduce la función del correo: quien llama no
-- puede atribuir el intento a otra empresa.
CREATE FUNCTION "iam_record_login_attempt"(
    p_email TEXT, p_ip TEXT, p_succeeded BOOLEAN, p_reason TEXT, p_occurred_at TIMESTAMPTZ, p_id UUID
)
    RETURNS VOID
    LANGUAGE sql VOLATILE SECURITY DEFINER
    SET search_path = public, pg_temp
    AS $$
        INSERT INTO iam_login_attempts (id, tenant_id, user_id, email, ip, succeeded, reason, occurred_at)
        SELECT p_id, u.tenant_id, u.id, p_email, p_ip, p_succeeded, p_reason, p_occurred_at
          FROM (SELECT 1) AS one
          LEFT JOIN iam_users u ON u.email = p_email AND u.deleted_at IS NULL
    $$;

-- Intentos fallidos de un correo desde p_since y posteriores al último acierto. Cuentan solo los
-- de contraseña equivocada: los rechazados por espera o bloqueo no alargan el castigo.
CREATE FUNCTION "iam_recent_login_failures"(p_email TEXT, p_since TIMESTAMPTZ)
    RETURNS TABLE (failures INTEGER, last_failure_at TIMESTAMPTZ)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path = public, pg_temp
    AS $$
        SELECT count(*)::integer, max(a.occurred_at) FROM iam_login_attempts a
         WHERE a.email = p_email AND a.reason = 'bad_credentials' AND a.occurred_at >= p_since
           AND a.occurred_at > COALESCE(
               (SELECT max(s.occurred_at) FROM iam_login_attempts s
                 WHERE s.email = p_email AND s.succeeded),
               '-infinity'::timestamptz)
    $$;

REVOKE ALL ON FUNCTION "iam_find_login_user"(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION "iam_find_session"(TEXT, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION "iam_find_token"(TEXT, TEXT, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION "iam_record_login_attempt"(TEXT, TEXT, BOOLEAN, TEXT, TIMESTAMPTZ, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION "iam_recent_login_failures"(TEXT, TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "iam_find_login_user"(TEXT) TO app_user;
GRANT EXECUTE ON FUNCTION "iam_find_session"(TEXT, TIMESTAMPTZ) TO app_user;
GRANT EXECUTE ON FUNCTION "iam_find_token"(TEXT, TEXT, TIMESTAMPTZ) TO app_user;
GRANT EXECUTE ON FUNCTION "iam_record_login_attempt"(TEXT, TEXT, BOOLEAN, TEXT, TIMESTAMPTZ, UUID) TO app_user;
GRANT EXECUTE ON FUNCTION "iam_recent_login_failures"(TEXT, TIMESTAMPTZ) TO app_user;

-- Permisos de la API ---------------------------------------------------------------------------
-- Sin DELETE en ninguna tabla. Los intentos solo se escriben por su función. La auditoría es de
-- solo inserción: app_user no puede modificar ni borrar sus filas (capítulo 12.1).

GRANT SELECT, INSERT, UPDATE ON "iam_users" TO app_user;
GRANT SELECT, INSERT, UPDATE ON "iam_sessions" TO app_user;
GRANT SELECT, INSERT, UPDATE ON "iam_tokens" TO app_user;
GRANT SELECT ON "iam_login_attempts" TO app_user;
GRANT SELECT, INSERT ON "aud_events" TO app_user;
GRANT SELECT, INSERT ON "aud_security_events" TO app_user;
