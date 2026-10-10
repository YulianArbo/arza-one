-- B11: auditoría particionada por mes, encadenada por hash y verificable; exportaciones.
-- Ficha 17.20 (M19), capítulo 12.1, numeral 15.5 y ADR-012.

-- La tabla de B08 se reemplaza por una particionada. Se renombra la anterior (y sus índices, cuyos
-- nombres son únicos en el esquema) para copiar sus filas a la nueva y luego eliminarla.
ALTER TABLE "aud_events" RENAME TO "aud_events_b08";
ALTER INDEX "aud_events_pkey" RENAME TO "aud_events_b08_pkey";
ALTER INDEX "aud_events_tenant_id_occurred_at_idx" RENAME TO "aud_events_b08_tenant_id_occurred_at_idx";
ALTER INDEX "aud_events_tenant_id_entity_type_entity_id_idx" RENAME TO "aud_events_b08_tenant_id_entity_type_entity_id_idx";
-- FORCE impediría al dueño leer las filas sin contexto de empresa durante la copia.
ALTER TABLE "aud_events_b08" NO FORCE ROW LEVEL SECURITY;

-- CreateTable
CREATE TABLE "aud_events" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "seq" BIGINT NOT NULL DEFAULT 0,
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
    "prev_hash" TEXT NOT NULL DEFAULT '',
    "hash" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "aud_events_pkey" PRIMARY KEY ("id", "occurred_at"),
    CONSTRAINT "aud_events_actor_kind_check" CHECK ("actor_kind" IN ('user', 'system', 'anonymous')),
    CONSTRAINT "aud_events_actor_check" CHECK (("actor_kind" = 'user') = ("actor_id" IS NOT NULL)),
    -- Acciones con el formato de los permisos del anexo G: «iam.session.create».
    CONSTRAINT "aud_events_action_check" CHECK ("action" ~ '^[a-z]+(\.[a-z_]+)+$'),
    CONSTRAINT "aud_events_result_check" CHECK ("result" IN ('success', 'failure')),
    CONSTRAINT "aud_events_changes_check" CHECK (jsonb_typeof("changes") = 'object'),
    CONSTRAINT "aud_events_seq_check" CHECK ("seq" > 0),
    CONSTRAINT "aud_events_prev_hash_check" CHECK ("prev_hash" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "aud_events_hash_check" CHECK ("hash" ~ '^[0-9a-f]{64}$')
) PARTITION BY RANGE ("occurred_at");

-- Recibe lo que no cae en un mes creado, para que nunca se pierda un evento.
CREATE TABLE "aud_events_default" PARTITION OF "aud_events" DEFAULT;

-- CreateTable
CREATE TABLE "aud_chain_heads" (
    "tenant_id" UUID NOT NULL,
    "seq" BIGINT NOT NULL,
    "hash" TEXT NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "aud_chain_heads_pkey" PRIMARY KEY ("tenant_id"),
    CONSTRAINT "aud_chain_heads_seq_check" CHECK ("seq" >= 0),
    CONSTRAINT "aud_chain_heads_hash_check" CHECK ("hash" ~ '^[0-9a-f]{64}$')
);

-- CreateTable
CREATE TABLE "aud_exports" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "requested_by" UUID NOT NULL,
    "scope" JSONB NOT NULL,
    "row_count" INTEGER NOT NULL,
    "file_id" UUID,
    "exported_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "aud_exports_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "aud_exports_scope_check" CHECK (jsonb_typeof("scope") = 'object'),
    CONSTRAINT "aud_exports_row_count_check" CHECK ("row_count" >= 0)
);

-- CreateIndex
CREATE INDEX "aud_events_tenant_id_seq_idx" ON "aud_events"("tenant_id", "seq");

-- CreateIndex
CREATE INDEX "aud_events_tenant_id_occurred_at_idx" ON "aud_events"("tenant_id", "occurred_at");

-- CreateIndex
CREATE INDEX "aud_events_tenant_id_entity_type_entity_id_idx" ON "aud_events"("tenant_id", "entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "aud_exports_tenant_id_exported_at_idx" ON "aud_exports"("tenant_id", "exported_at");

-- AddForeignKey
ALTER TABLE "aud_events" ADD CONSTRAINT "aud_events_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aud_chain_heads" ADD CONSTRAINT "aud_chain_heads_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aud_exports" ADD CONSTRAINT "aud_exports_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Particiones por mes ---------------------------------------------------------------------------
-- Crea aud_events_AAAA_MM para cada mes entre las dos fechas. Corre como su dueño porque app_user
-- no puede crear tablas; el worker la llama a diario. Si la partición por defecto ya tiene filas
-- de ese mes, no la crea (PostgreSQL lo rechazaría) y las filas siguen a salvo donde están.

CREATE FUNCTION "aud_ensure_partitions"("p_from" DATE, "p_until" DATE) RETURNS INTEGER
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
    AS $$
DECLARE
    month_start DATE := date_trunc('month', p_from)::date;
    month_end DATE;
    partition_name TEXT;
    created INTEGER := 0;
BEGIN
    WHILE month_start <= p_until LOOP
        month_end := (month_start + INTERVAL '1 month')::date;
        partition_name := format('aud_events_%s', to_char(month_start, 'YYYY_MM'));
        IF to_regclass(partition_name) IS NULL AND NOT EXISTS (
            SELECT 1 FROM aud_events_default
             WHERE occurred_at >= month_start AND occurred_at < month_end
        ) THEN
            EXECUTE format(
                'CREATE TABLE %I PARTITION OF aud_events FOR VALUES FROM (%L) TO (%L)',
                partition_name, month_start::timestamptz, month_end::timestamptz
            );
            created := created + 1;
        END IF;
        month_start := month_end;
    END LOOP;
    RETURN created;
END;
$$;

-- Cadena de hash (ADR-012) ------------------------------------------------------------------------
-- El hash de cada evento cubre todas sus columnas y el hash del anterior de la misma empresa. Se
-- arma como un arreglo JSON, cuya forma de texto es única, y la hora va en UTC fija.

CREATE FUNCTION "aud_event_hash"("e" "aud_events") RETURNS TEXT
    LANGUAGE sql IMMUTABLE
    AS $$
    SELECT encode(sha256(convert_to(jsonb_build_array(
        e.prev_hash, e.id, e.tenant_id, e.seq,
        to_char(e.occurred_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
        e.actor_kind, e.actor_id, e.action, e.entity_type, e.entity_id, e.result, e.changes,
        e.ip, e.correlation_id
    )::text, 'UTF8')), 'hex')
$$;

-- Fija seq, prev_hash y hash: lo que envíe la API se ignora. Bloquea el último eslabón de la
-- empresa hasta el fin de la transacción, así dos eventos nunca toman el mismo lugar. Marca la
-- transacción como auditada (la API lo exige antes de confirmar una escritura).
CREATE FUNCTION "aud_chain_event"() RETURNS TRIGGER
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
    AS $$
DECLARE
    head RECORD;
BEGIN
    INSERT INTO aud_chain_heads (tenant_id, seq, hash)
         VALUES (NEW.tenant_id, 0, repeat('0', 64))
    ON CONFLICT (tenant_id) DO NOTHING;
    SELECT seq, hash INTO head FROM aud_chain_heads WHERE tenant_id = NEW.tenant_id FOR UPDATE;
    NEW.seq := head.seq + 1;
    NEW.prev_hash := head.hash;
    NEW.hash := aud_event_hash(NEW);
    UPDATE aud_chain_heads SET seq = NEW.seq, hash = NEW.hash, updated_at = now()
     WHERE tenant_id = NEW.tenant_id;
    PERFORM set_config('app.audited', 'on', true);
    RETURN NEW;
END;
$$;

CREATE TRIGGER "aud_events_chain"
    BEFORE INSERT ON "aud_events"
    FOR EACH ROW EXECUTE FUNCTION "aud_chain_event"();

-- Un evento de seguridad también es evidencia de la transacción.
CREATE FUNCTION "aud_mark_audited"() RETURNS TRIGGER
    LANGUAGE plpgsql
    AS $$
BEGIN
    PERFORM set_config('app.audited', 'on', true);
    RETURN NULL;
END;
$$;

CREATE TRIGGER "aud_security_events_mark_audited"
    AFTER INSERT ON "aud_security_events"
    FOR EACH STATEMENT EXECUTE FUNCTION "aud_mark_audited"();

-- Verificación de la cadena de la empresa del contexto. Devuelve cuántos eventos revisó y, si hay
-- un daño, el primer lugar dañado y qué encontró: missing (falta o sobra un evento), altered (la
-- fila no coincide con su hash), broken_link (no apunta al anterior) o truncated (se borraron los
-- últimos: el eslabón guardado no coincide con la última fila).
CREATE FUNCTION "aud_verify_chain"()
    RETURNS TABLE ("checked" BIGINT, "broken_seq" BIGINT, "problem" TEXT)
    LANGUAGE sql STABLE
    AS $$
    WITH ordered AS (
        SELECT e.seq, e.prev_hash, e.hash, aud_event_hash(e) AS expected,
               lag(e.seq) OVER w AS prior_seq, lag(e.hash) OVER w AS prior_hash
          FROM aud_events e
         WHERE e.tenant_id = core_current_tenant_id()
        WINDOW w AS (ORDER BY e.seq, e.id)
    ), damaged AS (
        SELECT seq, CASE
                   WHEN seq <> coalesce(prior_seq, 0) + 1 THEN 'missing'
                   WHEN hash <> expected THEN 'altered'
                   WHEN prev_hash <> coalesce(prior_hash, repeat('0', 64)) THEN 'broken_link'
               END AS problem
          FROM ordered
    ), first_damage AS (
        SELECT seq, problem FROM damaged WHERE problem IS NOT NULL ORDER BY seq LIMIT 1
    ), last_event AS (
        SELECT seq, hash FROM ordered ORDER BY seq DESC LIMIT 1
    ), head_damage AS (
        SELECT coalesce(l.seq, 0) + 1 AS seq, 'truncated' AS problem
          FROM aud_chain_heads h
          LEFT JOIN last_event l ON true
         WHERE h.tenant_id = core_current_tenant_id()
           AND (h.seq <> coalesce(l.seq, 0) OR h.hash <> coalesce(l.hash, repeat('0', 64)))
    )
    SELECT (SELECT count(*) FROM ordered),
           coalesce((SELECT seq FROM first_damage), (SELECT seq FROM head_damage)),
           coalesce((SELECT problem FROM first_damage), (SELECT problem FROM head_damage))
$$;

-- Copia de los eventos de B08 ------------------------------------------------------------------
-- Se insertan en orden para que el disparador los encadene igual que a los nuevos.

SELECT aud_ensure_partitions(
    coalesce((SELECT min(occurred_at) FROM aud_events_b08), now())::date,
    (now() + INTERVAL '3 months')::date
);

INSERT INTO "aud_events" (
    "id", "tenant_id", "occurred_at", "actor_id", "actor_kind", "action", "entity_type",
    "entity_id", "result", "changes", "ip", "correlation_id"
)
SELECT "id", "tenant_id", "occurred_at", "actor_id", "actor_kind", "action", "entity_type",
       "entity_id", "result", "changes", "ip", "correlation_id"
  FROM "aud_events_b08"
 ORDER BY "tenant_id", "occurred_at", "id";

DROP TABLE "aud_events_b08";

-- Seguridad por fila (ADR-007) -----------------------------------------------------------------
-- Se activa después de la copia, que corre sin contexto de empresa. Las políticas de la tabla
-- particionada se aplican al consultar por ella; app_user no tiene acceso directo a las particiones.

ALTER TABLE "aud_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "aud_events" FORCE ROW LEVEL SECURITY;
CREATE POLICY "aud_events_tenant_isolation" ON "aud_events"
    USING ("tenant_id" = core_current_tenant_id())
    WITH CHECK ("tenant_id" = core_current_tenant_id());

ALTER TABLE "aud_chain_heads" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "aud_chain_heads" FORCE ROW LEVEL SECURITY;
CREATE POLICY "aud_chain_heads_tenant_isolation" ON "aud_chain_heads"
    USING ("tenant_id" = core_current_tenant_id())
    WITH CHECK ("tenant_id" = core_current_tenant_id());

ALTER TABLE "aud_exports" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "aud_exports" FORCE ROW LEVEL SECURITY;
CREATE POLICY "aud_exports_tenant_isolation" ON "aud_exports"
    USING ("tenant_id" = core_current_tenant_id())
    WITH CHECK ("tenant_id" = core_current_tenant_id());

-- Permisos de la API ---------------------------------------------------------------------------
-- Solo lectura e inserción: ningún evento ni exportación se modifica ni se borra (ficha 17.20).
-- El último eslabón solo lo escribe el disparador.

GRANT SELECT, INSERT ON "aud_events" TO app_user;
GRANT SELECT ON "aud_chain_heads" TO app_user;
GRANT SELECT, INSERT ON "aud_exports" TO app_user;

REVOKE EXECUTE ON FUNCTION "aud_ensure_partitions"(DATE, DATE) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION "aud_chain_event"() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "aud_ensure_partitions"(DATE, DATE) TO app_user;
