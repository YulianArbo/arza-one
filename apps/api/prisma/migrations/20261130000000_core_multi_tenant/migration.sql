-- B48: multiempresa. Plan y límites, marca, suspensión, exportación completa y eliminación de
-- empresas. Ficha 17.1, capítulos 12, 13 y 15, ADR-007 y ADR-028.
--
-- Principio: la base de datos protege aunque el código falle. Solo el contexto de la empresa que
-- opera la plataforma cambia el plan o el estado de otra empresa; una empresa nunca se cambia a sí
-- misma el plan ni el estado; los límites del plan los hacen cumplir disparadores.

-- Empresa que opera la plataforma ----------------------------------------------------------------
-- Es la empresa semilla de todos los ambientes (seed-data.ts, PLATFORM_TENANT). Su identificador
-- es fijo; por eso no hace falta una columna que alguien pudiera cambiar.

CREATE FUNCTION "core_operator_tenant_id"() RETURNS UUID
    LANGUAGE sql IMMUTABLE
    AS $$ SELECT '01999a00-0000-7000-8000-000000000001'::uuid $$;

-- Plan, límites, marca, suspensión y eliminación -------------------------------------------------
-- Los límites guardados son los que rigen (los del plan con sus ajustes); null en usuarios es «sin
-- tope». Los valores por defecto son los del plan Profesional (contracts: TENANT_PLANS).

ALTER TABLE "core_tenants"
    ADD COLUMN "plan" TEXT NOT NULL DEFAULT 'professional',
    ADD COLUMN "limit_internal_users" INTEGER DEFAULT 50,
    ADD COLUMN "limit_portal_users" INTEGER DEFAULT 200,
    ADD COLUMN "limit_storage_mb" INTEGER NOT NULL DEFAULT 51200,
    ADD COLUMN "limit_ai_assistant" BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN "brand_display_name" TEXT,
    ADD COLUMN "brand_color" TEXT,
    ADD COLUMN "brand_logo_file_id" UUID,
    ADD COLUMN "suspended_at" TIMESTAMPTZ(6),
    ADD COLUMN "suspension_reason" TEXT,
    ADD COLUMN "deletion_requested_at" TIMESTAMPTZ(6),
    ADD COLUMN "deletion_due_on" DATE,
    ADD COLUMN "deletion_reason" TEXT,
    ADD COLUMN "deletion_export_id" UUID,
    ADD COLUMN "closed_at" TIMESTAMPTZ(6),
    ADD COLUMN "files_purged_at" TIMESTAMPTZ(6),
    ADD COLUMN "closing_manifest_sha256" TEXT;

ALTER TABLE "core_tenants"
    ADD CONSTRAINT "core_tenants_plan_check"
        CHECK ("plan" IN ('basic', 'professional', 'enterprise')),
    ADD CONSTRAINT "core_tenants_limits_check" CHECK (
        ("limit_internal_users" IS NULL OR "limit_internal_users" > 0)
        AND ("limit_portal_users" IS NULL OR "limit_portal_users" > 0)
        AND "limit_storage_mb" > 0),
    ADD CONSTRAINT "core_tenants_brand_color_check"
        CHECK ("brand_color" IS NULL OR "brand_color" ~ '^#[0-9A-F]{6}$'),
    ADD CONSTRAINT "core_tenants_brand_display_name_check"
        CHECK ("brand_display_name" IS NULL OR length(btrim("brand_display_name")) BETWEEN 2 AND 60),
    -- Suspendida o cerrada: con fecha y motivo de la suspensión.
    ADD CONSTRAINT "core_tenants_suspension_check" CHECK (
        ("status" = 'active') = ("suspended_at" IS NULL)
        AND ("suspended_at" IS NULL) = ("suspension_reason" IS NULL)),
    -- La eliminación solo se pide sobre una empresa suspendida, con exportación y fecha de borrado.
    ADD CONSTRAINT "core_tenants_deletion_check" CHECK (
        ("deletion_requested_at" IS NULL) = ("deletion_due_on" IS NULL)
        AND ("deletion_requested_at" IS NULL) = ("deletion_reason" IS NULL)
        AND ("deletion_requested_at" IS NULL) = ("deletion_export_id" IS NULL)
        AND ("deletion_requested_at" IS NULL OR "status" IN ('suspended', 'closed'))),
    ADD CONSTRAINT "core_tenants_closed_check" CHECK (
        ("status" = 'closed') = ("closed_at" IS NOT NULL)
        AND ("closed_at" IS NULL OR "deletion_requested_at" IS NOT NULL)),
    -- La empresa que opera la plataforma nunca se suspende ni se elimina (decisión 7).
    ADD CONSTRAINT "core_tenants_operator_active_check"
        CHECK ("id" <> core_operator_tenant_id() OR "status" = 'active');

-- La empresa que opera la plataforma nace con el plan Empresarial.
CREATE FUNCTION "core_tenants_operator_plan"() RETURNS TRIGGER
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF NEW.id = core_operator_tenant_id() THEN
        NEW.plan := 'enterprise';
        NEW.limit_internal_users := NULL;
        NEW.limit_portal_users := NULL;
        NEW.limit_storage_mb := 512000;
        NEW.limit_ai_assistant := true;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "core_tenants_operator_plan"
    BEFORE INSERT ON "core_tenants"
    FOR EACH ROW EXECUTE FUNCTION "core_tenants_operator_plan"();

-- Si la empresa operadora ya existe (bases anteriores a B48), pasa al plan Empresarial dentro de
-- su propio contexto, como lo haría la API.
SELECT set_config('app.tenant_id', core_operator_tenant_id()::text, false);
UPDATE "core_tenants"
    SET "plan" = 'enterprise', "limit_internal_users" = NULL, "limit_portal_users" = NULL,
        "limit_storage_mb" = 512000, "limit_ai_assistant" = true
    WHERE "id" = core_operator_tenant_id();
SELECT set_config('app.tenant_id', '', false);

-- Lo que la propia empresa puede cambiar: sus datos legales y su marca. El plan, los límites, el
-- estado y la eliminación solo los cambian las funciones de la plataforma (más abajo).
REVOKE INSERT, UPDATE ON "core_tenants" FROM app_user;
GRANT INSERT ("id", "legal_name", "trade_name", "tax_id", "settings", "created_at", "created_by",
              "updated_at", "updated_by", "version") ON "core_tenants" TO app_user;
GRANT UPDATE ("legal_name", "trade_name", "tax_id", "brand_display_name", "brand_color",
              "brand_logo_file_id") ON "core_tenants" TO app_user;

-- Políticas del dueño para las funciones de la plataforma: solo valen cuando la transacción corre
-- en el contexto de la empresa operadora.
CREATE POLICY "core_tenants_platform_insert" ON "core_tenants"
    FOR INSERT TO migration_user
    WITH CHECK (core_current_tenant_id() = core_operator_tenant_id());
CREATE POLICY "core_tenants_platform_update" ON "core_tenants"
    FOR UPDATE TO migration_user
    USING (core_current_tenant_id() = core_operator_tenant_id())
    WITH CHECK (core_current_tenant_id() = core_operator_tenant_id());

-- Exportaciones completas (decisiones 3 a 5) ----------------------------------------------------

CREATE TABLE "core_tenant_exports" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "requested_by" UUID NOT NULL,
    "requested_at" TIMESTAMPTZ(6) NOT NULL,
    "started_at" TIMESTAMPTZ(6),
    "ready_at" TIMESTAMPTZ(6),
    "expires_at" TIMESTAMPTZ(6),
    "storage_key" TEXT,
    "size_bytes" BIGINT,
    "tables_count" INTEGER,
    "rows_count" BIGINT,
    "files_count" INTEGER,
    "manifest_sha256" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "core_tenant_exports_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "core_tenant_exports_status_check"
        CHECK ("status" IN ('queued', 'running', 'ready', 'failed', 'expired')),
    CONSTRAINT "core_tenant_exports_ready_check" CHECK (
        ("status" IN ('ready', 'expired')) = ("ready_at" IS NOT NULL)
        AND ("ready_at" IS NULL) = ("expires_at" IS NULL)
        AND ("ready_at" IS NULL) = ("manifest_sha256" IS NULL)
        AND ("status" <> 'ready' OR "storage_key" IS NOT NULL)),
    CONSTRAINT "core_tenant_exports_counts_check" CHECK (
        ("size_bytes" IS NULL OR "size_bytes" >= 0)
        AND ("tables_count" IS NULL OR "tables_count" >= 0)
        AND ("rows_count" IS NULL OR "rows_count" >= 0)
        AND ("files_count" IS NULL OR "files_count" >= 0)
        AND "attempts" >= 0),
    CONSTRAINT "core_tenant_exports_version_check" CHECK ("version" > 0)
);

CREATE INDEX "core_tenant_exports_tenant_id_requested_at_idx"
    ON "core_tenant_exports"("tenant_id", "requested_at");

-- Una sola exportación en curso por empresa.
CREATE UNIQUE INDEX "core_tenant_exports_one_in_progress"
    ON "core_tenant_exports"("tenant_id") WHERE "status" IN ('queued', 'running');

ALTER TABLE "core_tenant_exports" ADD CONSTRAINT "core_tenant_exports_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TRIGGER "core_tenant_exports_control_columns"
    BEFORE INSERT OR UPDATE ON "core_tenant_exports"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();

ALTER TABLE "core_tenant_exports" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "core_tenant_exports" FORCE ROW LEVEL SECURITY;
CREATE POLICY "core_tenant_exports_tenant_isolation" ON "core_tenant_exports"
    USING ("tenant_id" = core_current_tenant_id())
    WITH CHECK ("tenant_id" = core_current_tenant_id());
CREATE POLICY "core_tenant_exports_platform_lookup" ON "core_tenant_exports"
    FOR SELECT TO migration_user USING (true);

GRANT SELECT, INSERT, UPDATE ON "core_tenant_exports" TO app_user;

-- Funciones de la plataforma --------------------------------------------------------------------
-- Corren como dueñas del esquema y exigen el contexto de la empresa operadora. La API exige además
-- el permiso platform.tenant.* y el segundo factor; esto es la última barrera.

CREATE FUNCTION "core_require_operator"() RETURNS VOID
    LANGUAGE plpgsql STABLE
    AS $$
BEGIN
    IF core_current_tenant_id() IS DISTINCT FROM core_operator_tenant_id() THEN
        RAISE EXCEPTION 'TENANCY_OPERATOR_ONLY'
            USING ERRCODE = 'insufficient_privilege',
                  DETAIL = 'Solo la empresa que opera la plataforma administra empresas.';
    END IF;
END;
$$;

-- La ficha de todas las empresas. Nunca su contenido (decisión 2).
CREATE FUNCTION "core_platform_tenants"() RETURNS SETOF "core_tenants"
    LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
    AS $$
BEGIN
    PERFORM core_require_operator();
    RETURN QUERY SELECT * FROM core_tenants ORDER BY legal_name, id;
END;
$$;

-- Última exportación lista de cada empresa (solo fechas e identificadores).
CREATE FUNCTION "core_platform_last_exports"()
    RETURNS TABLE (tenant_id UUID, export_id UUID, ready_at TIMESTAMPTZ)
    LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
    AS $$
BEGIN
    PERFORM core_require_operator();
    RETURN QUERY
        SELECT DISTINCT ON (e.tenant_id) e.tenant_id, e.id, e.ready_at
        FROM core_tenant_exports e
        WHERE e.ready_at IS NOT NULL
        ORDER BY e.tenant_id, e.ready_at DESC;
END;
$$;

CREATE FUNCTION "core_platform_register_tenant"(
    p_id UUID, p_legal_name TEXT, p_trade_name TEXT, p_tax_id TEXT, p_plan TEXT,
    p_internal INTEGER, p_portal INTEGER, p_storage INTEGER, p_ai BOOLEAN)
    RETURNS VOID
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
    AS $$
BEGIN
    PERFORM core_require_operator();
    INSERT INTO core_tenants (id, legal_name, trade_name, tax_id, plan, limit_internal_users,
                              limit_portal_users, limit_storage_mb, limit_ai_assistant)
    VALUES (p_id, p_legal_name, p_trade_name, p_tax_id, p_plan, p_internal, p_portal, p_storage,
            p_ai);
END;
$$;

CREATE FUNCTION "core_platform_set_plan"(
    p_id UUID, p_version INTEGER, p_plan TEXT, p_internal INTEGER, p_portal INTEGER,
    p_storage INTEGER, p_ai BOOLEAN)
    RETURNS INTEGER
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
    AS $$
DECLARE
    changed INTEGER;
BEGIN
    PERFORM core_require_operator();
    UPDATE core_tenants
        SET plan = p_plan, limit_internal_users = p_internal, limit_portal_users = p_portal,
            limit_storage_mb = p_storage, limit_ai_assistant = p_ai
        WHERE id = p_id AND version = p_version AND status <> 'closed';
    GET DIAGNOSTICS changed = ROW_COUNT;
    RETURN changed;
END;
$$;

-- Cambios de estado: suspend, reactivate, request_deletion y cancel_deletion. Devuelve las filas
-- cambiadas (0 si la versión no coincide). Un estado de partida inválido es un error.
CREATE FUNCTION "core_platform_change_status"(
    p_id UUID, p_version INTEGER, p_action TEXT, p_reason TEXT, p_due_on DATE, p_export_id UUID)
    RETURNS INTEGER
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
    AS $$
DECLARE
    current core_tenants;
    changed INTEGER;
BEGIN
    PERFORM core_require_operator();
    IF p_id = core_operator_tenant_id() THEN
        RAISE EXCEPTION 'TENANCY_OPERATOR_PROTECTED' USING ERRCODE = 'check_violation';
    END IF;
    SELECT * INTO current FROM core_tenants WHERE id = p_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'TENANCY_TENANT_NOT_FOUND' USING ERRCODE = 'no_data_found';
    END IF;
    IF current.version <> p_version THEN
        RETURN 0;
    END IF;
    IF p_action = 'suspend' AND current.status = 'active' THEN
        UPDATE core_tenants SET status = 'suspended', suspended_at = now(),
                                suspension_reason = p_reason
            WHERE id = p_id;
    ELSIF p_action = 'reactivate' AND current.status = 'suspended'
          AND current.deletion_requested_at IS NULL THEN
        UPDATE core_tenants SET status = 'active', suspended_at = NULL, suspension_reason = NULL
            WHERE id = p_id;
    ELSIF p_action = 'request_deletion' AND current.status = 'suspended'
          AND current.deletion_requested_at IS NULL THEN
        -- La exportación debe ser de esta empresa, estar lista y ser reciente (30 días).
        IF NOT EXISTS (
            SELECT 1 FROM core_tenant_exports e
            WHERE e.id = p_export_id AND e.tenant_id = p_id AND e.ready_at IS NOT NULL
              AND e.ready_at >= now() - interval '30 days') THEN
            RAISE EXCEPTION 'TENANCY_EXPORT_REQUIRED' USING ERRCODE = 'check_violation';
        END IF;
        UPDATE core_tenants SET deletion_requested_at = now(), deletion_due_on = p_due_on,
                                deletion_reason = p_reason, deletion_export_id = p_export_id
            WHERE id = p_id;
    ELSIF p_action = 'cancel_deletion' AND current.status = 'suspended'
          AND current.deletion_requested_at IS NOT NULL THEN
        UPDATE core_tenants SET deletion_requested_at = NULL, deletion_due_on = NULL,
                                deletion_reason = NULL, deletion_export_id = NULL
            WHERE id = p_id;
    ELSE
        RAISE EXCEPTION 'TENANCY_STATUS_INVALID' USING ERRCODE = 'check_violation';
    END IF;
    GET DIAGNOSTICS changed = ROW_COUNT;
    RETURN changed;
END;
$$;

-- Tareas automáticas solo para empresas activas ---------------------------------------------------
-- Cada trabajo del worker pregunta a una función «*_tenants_with_*» qué empresas atender. Aquí se
-- envuelven todas para que una empresa suspendida o cerrada deje de recibir trabajos (envío de
-- correos, recordatorios, PDF, índice del asistente...). La verificación diaria de la cadena de
-- auditoría (aud_tenant_ids) no se envuelve: sigue para todas. Una función de este tipo creada en
-- un bloque posterior debe filtrar con core_tenant_runs_jobs.

CREATE POLICY "core_tenants_jobs_lookup" ON "core_tenants"
    FOR SELECT TO migration_user USING (true);

CREATE FUNCTION "core_tenant_runs_jobs"(p_tenant UUID) RETURNS BOOLEAN
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
    AS $$ SELECT EXISTS (SELECT 1 FROM core_tenants WHERE id = p_tenant AND status = 'active') $$;

REVOKE EXECUTE ON FUNCTION "core_tenant_runs_jobs"(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "core_tenant_runs_jobs"(UUID) TO app_user;

DO $$
DECLARE
    fn RECORD;
    call_args TEXT;
BEGIN
    FOR fn IN
        SELECT p.oid, p.proname, p.pronargs,
               pg_get_function_arguments(p.oid) AS args
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname ~ '^[a-z]+_tenants_with_[a-z_]+$'
          AND p.proname !~ '_any$'
          AND p.proretset
          AND p.prorettype = 'uuid'::regtype
    LOOP
        SELECT coalesce(string_agg('$' || i, ', ' ORDER BY i), '')
            INTO call_args FROM generate_series(1, fn.pronargs) AS i;
        EXECUTE format('ALTER FUNCTION %s RENAME TO %I', fn.oid::regprocedure,
                       fn.proname || '_any');
        EXECUTE format(
            'CREATE FUNCTION %I(%s) RETURNS SETOF UUID LANGUAGE sql STABLE '
            || 'SET search_path = public, pg_temp AS '
            || '$f$ SELECT t FROM %I(%s) AS t WHERE core_tenant_runs_jobs(t) $f$',
            fn.proname, fn.args, fn.proname || '_any', call_args);
        EXECUTE format('REVOKE EXECUTE ON FUNCTION %I(%s) FROM PUBLIC', fn.proname, fn.args);
        EXECUTE format('GRANT EXECUTE ON FUNCTION %I(%s) TO app_user', fn.proname, fn.args);
    END LOOP;
END;
$$;

-- Límites del plan ----------------------------------------------------------------------------
-- Disparadores en las tablas de cuentas y de archivos. Corren con los permisos de quien escribe y
-- dentro de su contexto: cuentan solo las filas de esa empresa. El error lleva «PLAN_LIMIT:<tipo>»
-- y la API lo traduce al mensaje del contrato (PLAN_LIMIT_MESSAGES).

CREATE FUNCTION "core_enforce_user_limit"() RETURNS TRIGGER
    LANGUAGE plpgsql
    AS $$
DECLARE
    allowed INTEGER;
    used INTEGER;
BEGIN
    IF NEW.status = 'inactive' OR NEW.kind NOT IN ('internal', 'portal')
       OR NEW.deleted_at IS NOT NULL THEN
        RETURN NEW;
    END IF;
    IF TG_OP = 'UPDATE' AND OLD.status <> 'inactive' AND OLD.kind = NEW.kind
       AND OLD.deleted_at IS NULL THEN
        RETURN NEW;
    END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended('core_user_limit:' || NEW.tenant_id, 0));
    SELECT CASE NEW.kind WHEN 'internal' THEN limit_internal_users ELSE limit_portal_users END
        INTO allowed FROM core_tenants WHERE id = NEW.tenant_id;
    IF allowed IS NULL THEN
        RETURN NEW;
    END IF;
    SELECT count(*) INTO used FROM iam_users
        WHERE tenant_id = NEW.tenant_id AND kind = NEW.kind AND status <> 'inactive'
          AND deleted_at IS NULL AND id <> NEW.id;
    IF used >= allowed THEN
        RAISE EXCEPTION 'PLAN_LIMIT:%',
            CASE NEW.kind WHEN 'internal' THEN 'internal_users' ELSE 'portal_users' END
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "iam_users_plan_limit"
    BEFORE INSERT OR UPDATE OF "status", "kind", "deleted_at" ON "iam_users"
    FOR EACH ROW EXECUTE FUNCTION "core_enforce_user_limit"();

CREATE FUNCTION "core_enforce_storage_limit"() RETURNS TRIGGER
    LANGUAGE plpgsql
    AS $$
DECLARE
    allowed_mb INTEGER;
    used BIGINT;
BEGIN
    PERFORM pg_advisory_xact_lock(hashtextextended('core_storage_limit:' || NEW.tenant_id, 0));
    SELECT limit_storage_mb INTO allowed_mb FROM core_tenants WHERE id = NEW.tenant_id;
    SELECT coalesce(sum(size_bytes), 0) INTO used FROM doc_files
        WHERE tenant_id = NEW.tenant_id AND deleted_at IS NULL;
    IF used + NEW.size_bytes > allowed_mb::bigint * 1048576 THEN
        RAISE EXCEPTION 'PLAN_LIMIT:storage' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "doc_files_plan_limit"
    BEFORE INSERT ON "doc_files"
    FOR EACH ROW EXECUTE FUNCTION "core_enforce_storage_limit"();

-- Exportación: catálogo y lectura de tablas -------------------------------------------------------
-- Toda tabla con tenant_id entra sola en la exportación: la lista sale del catálogo de la base, no
-- del código. Se dejan fuera los secretos (decisión 4) y lo que se puede volver a calcular.

CREATE FUNCTION "core_export_omissions"() RETURNS TABLE (table_name TEXT, reason TEXT)
    LANGUAGE sql IMMUTABLE
    AS $$
    VALUES
        ('iam_sessions', 'Sesiones abiertas: dan acceso a la cuenta'),
        ('iam_tokens', 'Enlaces de un solo uso: dan acceso a la cuenta'),
        ('iam_recovery_codes', 'Códigos de recuperación del segundo factor'),
        ('iam_mfa_factors', 'Llaves del segundo factor'),
        ('iam_known_devices', 'Huellas de los dispositivos conocidos'),
        ('core_tenant_exports', 'Registro de las propias exportaciones')
    $$;

-- Columnas que nunca salen: contraseñas cifradas, llaves cifradas y huellas de enlaces o códigos
-- de acceso. La cadena de la auditoría (prev_hash, event_hash) sí sale: prueba su integridad.
CREATE FUNCTION "core_export_omits_column"(p_column TEXT) RETURNS BOOLEAN
    LANGUAGE sql IMMUTABLE
    AS $$ SELECT p_column ~ '^(password_hash|code_hash|device_hash|([a-z_]*_)?token_hash|([a-z_]*_)?secret_encrypted)$' $$;

-- Columnas de una tabla exportable que se dejan fuera, para el índice de la exportación.
CREATE FUNCTION "core_export_omitted_columns"(p_table TEXT) RETURNS TEXT[]
    LANGUAGE sql STABLE SET search_path = public, pg_temp
    AS $$
    SELECT coalesce(array_agg(a.attname::text ORDER BY a.attnum), ARRAY[]::TEXT[])
    FROM pg_attribute a
    WHERE a.attrelid = format('public.%I', p_table)::regclass AND a.attnum > 0
      AND NOT a.attisdropped AND core_export_omits_column(a.attname)
    $$;

REVOKE EXECUTE ON FUNCTION "core_export_omitted_columns"(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "core_export_omitted_columns"(TEXT) TO app_user;

CREATE FUNCTION "core_export_tables"() RETURNS TABLE (table_name TEXT)
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
    AS $$
    SELECT c.relname::text
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND NOT c.relispartition
      AND EXISTS (SELECT 1 FROM pg_attribute a
                  WHERE a.attrelid = c.oid AND a.attname = 'tenant_id' AND NOT a.attisdropped)
      AND c.relname NOT IN (SELECT o.table_name FROM core_export_omissions() o)
    ORDER BY c.relname
    $$;

REVOKE EXECUTE ON FUNCTION "core_export_omissions"() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "core_export_omissions"() TO app_user;
REVOKE EXECUTE ON FUNCTION "core_export_tables"() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "core_export_tables"() TO app_user;

-- Filas de una tabla de la empresa del contexto, como JSON, por páginas en el orden de su llave
-- primaria. Corre como quien la llama: la seguridad por fila deja ver solo esa empresa.
CREATE FUNCTION "core_export_rows"(p_table TEXT, p_offset BIGINT, p_limit INTEGER)
    RETURNS SETOF JSONB
    LANGUAGE plpgsql STABLE SET search_path = public, pg_temp
    AS $$
DECLARE
    columns_sql TEXT;
    order_sql TEXT;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM core_export_tables() t WHERE t.table_name = p_table) THEN
        RAISE EXCEPTION 'La tabla % no se exporta', p_table USING ERRCODE = 'invalid_parameter_value';
    END IF;
    SELECT string_agg(format('%I', a.attname), ', ' ORDER BY a.attnum)
        INTO columns_sql
        FROM pg_attribute a
        WHERE a.attrelid = format('public.%I', p_table)::regclass AND a.attnum > 0
          AND NOT a.attisdropped
          AND NOT core_export_omits_column(a.attname);
    SELECT string_agg(format('%I', a.attname), ', ' ORDER BY k.ord)
        INTO order_sql
        FROM pg_index i
        CROSS JOIN LATERAL unnest(i.indkey) WITH ORDINALITY AS k(attnum, ord)
        JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k.attnum
        WHERE i.indrelid = format('public.%I', p_table)::regclass AND i.indisprimary;
    RETURN QUERY EXECUTE format(
        'SELECT to_jsonb(r) FROM (SELECT %s FROM %I ORDER BY %s OFFSET $1 LIMIT $2) AS r',
        columns_sql, p_table, coalesce(order_sql, 'tenant_id')) USING p_offset, p_limit;
END;
$$;

REVOKE EXECUTE ON FUNCTION "core_export_rows"(TEXT, BIGINT, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "core_export_rows"(TEXT, BIGINT, INTEGER) TO app_user;

-- Empresas con exportaciones por generar o por vencer. Incluye las suspendidas: sus archivos
-- vencidos también se borran.
CREATE FUNCTION "core_export_work_tenants"(p_at TIMESTAMPTZ) RETURNS SETOF UUID
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
    AS $$ SELECT DISTINCT tenant_id FROM core_tenant_exports
          WHERE status IN ('queued', 'running') OR (status = 'ready' AND expires_at <= p_at)
          ORDER BY tenant_id $$;

REVOKE EXECUTE ON FUNCTION "core_export_work_tenants"(TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "core_export_work_tenants"(TIMESTAMPTZ) TO app_user;

-- Eliminación definitiva (decisión 6, ADR-028) -----------------------------------------------------

CREATE FUNCTION "core_tenants_due_for_purge"(p_today DATE) RETURNS SETOF UUID
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
    AS $$ SELECT id FROM core_tenants
          WHERE status = 'suspended' AND deletion_due_on <= p_today
             OR (status = 'closed' AND files_purged_at IS NULL)
          ORDER BY id $$;

REVOKE EXECUTE ON FUNCTION "core_tenants_due_for_purge"(DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "core_tenants_due_for_purge"(DATE) TO app_user;

-- Borra todos los datos de una empresa cuya eliminación venció. Exige el contexto de la empresa
-- operadora (el worker la usa así y deja la auditoría allí). Por cada tabla con tenant_id, en
-- varias pasadas para respetar las llaves foráneas, quita por un momento sus disparadores (que
-- impiden borrar registros que solo se agregan) y la seguridad por fila forzada, y borra solo las
-- filas de esa empresa. Todo ocurre en una transacción: si algo falla, no se borra nada.
-- Queda la constancia mínima en core_tenants: razón social, NIT, fechas y huella de la exportación.
CREATE FUNCTION "core_purge_tenant"(p_tenant UUID, p_today DATE) RETURNS JSONB
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
    AS $$
DECLARE
    target core_tenants;
    manifest TEXT;
    tables TEXT[];
    pending TEXT[];
    remaining TEXT[];
    tbl TEXT;
    deleted BIGINT;
    counts JSONB := '{}'::jsonb;
    pass INTEGER := 0;
BEGIN
    PERFORM core_require_operator();
    SELECT * INTO target FROM core_tenants WHERE id = p_tenant FOR UPDATE;
    IF NOT FOUND OR target.status <> 'suspended' OR target.deletion_due_on IS NULL
       OR target.deletion_due_on > p_today OR p_tenant = core_operator_tenant_id() THEN
        RAISE EXCEPTION 'TENANCY_STATUS_INVALID' USING ERRCODE = 'check_violation';
    END IF;
    SELECT manifest_sha256 INTO manifest FROM core_tenant_exports
        WHERE id = target.deletion_export_id;

    SELECT array_agg(c.relname::text ORDER BY c.relname) INTO tables
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND c.relname <> 'core_tenants'
      AND EXISTS (SELECT 1 FROM pg_attribute a
                  WHERE a.attrelid = c.oid AND a.attname = 'tenant_id' AND NOT a.attisdropped);

    FOREACH tbl IN ARRAY tables LOOP
        EXECUTE format('ALTER TABLE %I DISABLE TRIGGER USER', tbl);
        EXECUTE format('ALTER TABLE %I NO FORCE ROW LEVEL SECURITY', tbl);
    END LOOP;

    -- Solo las tablas raíz: borrar en la tabla particionada borra en sus particiones.
    SELECT array_agg(t ORDER BY t) INTO pending
        FROM unnest(tables) AS t
        WHERE NOT (SELECT c.relispartition FROM pg_class c
                   JOIN pg_namespace n ON n.oid = c.relnamespace
                   WHERE n.nspname = 'public' AND c.relname = t);
    WHILE coalesce(array_length(pending, 1), 0) > 0 LOOP
        pass := pass + 1;
        IF pass > 50 THEN
            RAISE EXCEPTION 'No se pudieron borrar las tablas: %', pending;
        END IF;
        remaining := ARRAY[]::TEXT[];
        FOREACH tbl IN ARRAY pending LOOP
            BEGIN
                EXECUTE format('DELETE FROM %I WHERE tenant_id = $1', tbl) USING p_tenant;
                GET DIAGNOSTICS deleted = ROW_COUNT;
                counts := counts || jsonb_build_object(
                    tbl, coalesce((counts ->> tbl)::bigint, 0) + deleted);
            EXCEPTION WHEN foreign_key_violation THEN
                remaining := remaining || tbl;
            END;
        END LOOP;
        pending := remaining;
    END LOOP;

    FOREACH tbl IN ARRAY tables LOOP
        EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tbl);
        EXECUTE format('ALTER TABLE %I ENABLE TRIGGER USER', tbl);
    END LOOP;

    UPDATE core_tenants
        SET status = 'closed', closed_at = now(), closing_manifest_sha256 = manifest,
            settings = '{}'::jsonb, brand_display_name = NULL, brand_color = NULL,
            brand_logo_file_id = NULL
        WHERE id = p_tenant;
    RETURN counts;
END;
$$;

REVOKE EXECUTE ON FUNCTION "core_purge_tenant"(UUID, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "core_purge_tenant"(UUID, DATE) TO app_user;

-- Los archivos de una empresa cerrada se borran después, fuera de la base; queda la fecha.
CREATE FUNCTION "core_mark_files_purged"(p_tenant UUID) RETURNS VOID
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
    AS $$
BEGIN
    PERFORM core_require_operator();
    UPDATE core_tenants SET files_purged_at = now()
        WHERE id = p_tenant AND status = 'closed' AND files_purged_at IS NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION "core_mark_files_purged"(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "core_mark_files_purged"(UUID) TO app_user;

-- Permisos de las funciones de la plataforma.
REVOKE EXECUTE ON FUNCTION "core_require_operator"() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "core_require_operator"() TO app_user;
REVOKE EXECUTE ON FUNCTION "core_platform_tenants"() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "core_platform_tenants"() TO app_user;
REVOKE EXECUTE ON FUNCTION "core_platform_last_exports"() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "core_platform_last_exports"() TO app_user;
REVOKE EXECUTE ON FUNCTION "core_platform_register_tenant"(UUID, TEXT, TEXT, TEXT, TEXT, INTEGER, INTEGER, INTEGER, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "core_platform_register_tenant"(UUID, TEXT, TEXT, TEXT, TEXT, INTEGER, INTEGER, INTEGER, BOOLEAN) TO app_user;
REVOKE EXECUTE ON FUNCTION "core_platform_set_plan"(UUID, INTEGER, TEXT, INTEGER, INTEGER, INTEGER, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "core_platform_set_plan"(UUID, INTEGER, TEXT, INTEGER, INTEGER, INTEGER, BOOLEAN) TO app_user;
REVOKE EXECUTE ON FUNCTION "core_platform_change_status"(UUID, INTEGER, TEXT, TEXT, DATE, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "core_platform_change_status"(UUID, INTEGER, TEXT, TEXT, DATE, UUID) TO app_user;
