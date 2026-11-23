-- B42 · Privacidad completa (M18, ficha 17.19). Solicitudes de los titulares con su historia y los
-- plazos legales en días hábiles (prv_requests, prv_request_events), entrega de los datos de un
-- titular (prv_data_exports), incidentes con datos personales y su bitácora de medidas
-- (prv_incidents, prv_incident_measures). Terceros marca los datos bloqueados o suprimidos de un
-- titular y los formularios del sitio pueden volverse anónimos (decisiones 8 y 10). Solo expande:
-- la versión anterior sigue funcionando.
-- arza:contract no borra datos al aplicarse: el DELETE está dentro de prv_purge_cookie_consents, la retención de cookies de tres años (decisión 10) que el trabajo diario ejecuta; no borra ni cambia objetos que la versión anterior use

CREATE TABLE "prv_requests" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "right" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'received',
    "requester_name" TEXT NOT NULL,
    "requester_email" TEXT,
    "requester_phone" TEXT,
    "document_number" TEXT,
    "description" TEXT NOT NULL,
    "party_id" UUID,
    "portal_user_id" UUID,
    "source_code" TEXT,
    "privacy_notice_id" UUID,
    "received_at" TIMESTAMPTZ(6) NOT NULL,
    "due_on" DATE,
    "extended_at" TIMESTAMPTZ(6),
    "extension_reason" TEXT,
    "requirement_text" TEXT,
    "requirement_sent_at" TIMESTAMPTZ(6),
    "requirement_answered_at" TIMESTAMPTZ(6),
    "verification_method" TEXT,
    "verification_note" TEXT,
    "verified_at" TIMESTAMPTZ(6),
    "verified_by" UUID,
    "response" TEXT,
    "responded_at" TIMESTAMPTZ(6),
    "responded_by" UUID,
    "closure" TEXT,
    "closed_at" TIMESTAMPTZ(6),
    "erasure" JSONB,
    "erased_at" TIMESTAMPTZ(6),
    "workflow_instance_id" UUID,
    "warned_for" DATE,
    "breached_for" DATE,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),
    CONSTRAINT "prv_requests_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "prv_requests_right_check" CHECK (
        "right" IN ('know', 'proof', 'usage', 'update', 'rectify', 'erase', 'revoke', 'complaint')
    ),
    CONSTRAINT "prv_requests_kind_check" CHECK ("kind" IN ('inquiry', 'claim')),
    CONSTRAINT "prv_requests_kind_right_check" CHECK (
        ("kind" = 'inquiry') = ("right" IN ('know', 'proof', 'usage'))
    ),
    CONSTRAINT "prv_requests_channel_check" CHECK (
        "channel" IN ('web', 'portal', 'email', 'phone', 'in_person', 'written', 'pqrsf')
    ),
    CONSTRAINT "prv_requests_status_check" CHECK (
        "status" IN ('received', 'verifying', 'in_progress', 'responded', 'closed')
    ),
    CONSTRAINT "prv_requests_closure_check" CHECK (
        ("status" = 'closed') = ("closure" IS NOT NULL)
        AND ("closure" IS NULL OR "closure" IN ('answered', 'desisted'))
    ),
    CONSTRAINT "prv_requests_verification_check" CHECK (
        ("verified_at" IS NULL) = ("verification_method" IS NULL)
        AND ("verification_method" IS NULL OR "verification_method" IN
            ('document', 'email_match', 'in_person', 'portal_session'))
        AND ("verified_at" IS NULL OR "party_id" IS NOT NULL)
    ),
    CONSTRAINT "prv_requests_progress_check" CHECK (
        "status" NOT IN ('in_progress', 'responded') OR "verified_at" IS NOT NULL
    ),
    CONSTRAINT "prv_requests_response_check" CHECK (
        "status" NOT IN ('responded') OR "response" IS NOT NULL
    ),
    CONSTRAINT "prv_requests_extension_check" CHECK (
        ("extended_at" IS NULL) = ("extension_reason" IS NULL)
    ),
    CONSTRAINT "prv_requests_requirement_check" CHECK (
        ("requirement_sent_at" IS NULL) = ("requirement_text" IS NULL)
        AND ("requirement_answered_at" IS NULL OR "requirement_sent_at" IS NOT NULL)
        AND ("requirement_sent_at" IS NULL OR "kind" = 'claim')
    ),
    CONSTRAINT "prv_requests_due_check" CHECK (
        "due_on" IS NOT NULL
        OR ("requirement_sent_at" IS NOT NULL AND "requirement_answered_at" IS NULL)
    )
);

CREATE TABLE "prv_request_events" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "note" TEXT,
    "actor_id" UUID,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,
    "mail_pending" BOOLEAN NOT NULL DEFAULT false,
    "mailed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),
    CONSTRAINT "prv_request_events_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "prv_request_events_kind_check" CHECK ("kind" IN (
        'received', 'verification_started', 'verified', 'requirement', 'requirement_answered',
        'extended', 'exported', 'erased', 'responded', 'closed', 'desisted'
    )),
    CONSTRAINT "prv_request_events_mail_check" CHECK (NOT ("mail_pending" AND "mailed_at" IS NOT NULL))
);

CREATE TABLE "prv_data_exports" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "party_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "content" JSONB NOT NULL,
    "requested_at" TIMESTAMPTZ(6) NOT NULL,
    "requested_by" UUID,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "pdf_file_id" UUID,
    "ready_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),
    CONSTRAINT "prv_data_exports_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "prv_data_exports_status_check" CHECK ("status" IN ('pending', 'ready', 'failed')),
    CONSTRAINT "prv_data_exports_ready_check" CHECK (
        ("status" = 'ready') = ("pdf_file_id" IS NOT NULL AND "ready_at" IS NOT NULL)
    )
);

CREATE TABLE "prv_incidents" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "detected_at" TIMESTAMPTZ(6) NOT NULL,
    "affected_count" INTEGER NOT NULL,
    "data_categories" TEXT[] NOT NULL,
    "project_incident_ref" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "sic_due_on" DATE NOT NULL,
    "contained_at" TIMESTAMPTZ(6),
    "containment_note" TEXT,
    "reported_on" DATE,
    "sic_reference" TEXT,
    "holders_notified_on" DATE,
    "holders_notice" TEXT,
    "not_reportable_reason" TEXT,
    "closed_at" TIMESTAMPTZ(6),
    "warned_for" DATE,
    "breached_for" DATE,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),
    CONSTRAINT "prv_incidents_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "prv_incidents_status_check" CHECK ("status" IN ('open', 'contained', 'reported', 'closed')),
    CONSTRAINT "prv_incidents_affected_check" CHECK ("affected_count" >= 0),
    CONSTRAINT "prv_incidents_categories_check" CHECK (
        cardinality("data_categories") BETWEEN 1 AND 10
        AND "data_categories" <@ ARRAY['identification', 'contact', 'demographic', 'financial',
            'employment', 'education', 'images', 'location', 'health', 'biometric']::TEXT[]
    ),
    CONSTRAINT "prv_incidents_report_check" CHECK (
        ("reported_on" IS NULL) = ("sic_reference" IS NULL)
        AND ("status" <> 'reported' OR "reported_on" IS NOT NULL)
    ),
    CONSTRAINT "prv_incidents_holders_check" CHECK (
        ("holders_notified_on" IS NULL) = ("holders_notice" IS NULL)
    ),
    CONSTRAINT "prv_incidents_close_check" CHECK (
        ("status" = 'closed') = ("closed_at" IS NOT NULL)
        AND ("status" <> 'closed' OR "reported_on" IS NOT NULL OR "not_reportable_reason" IS NOT NULL)
    )
);

CREATE TABLE "prv_incident_measures" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "incident_id" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "taken_on" DATE NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),
    CONSTRAINT "prv_incident_measures_pkey" PRIMARY KEY ("id")
);

-- Terceros: datos bloqueados por deber legal o suprimidos a pedido del titular (decisión 8).
ALTER TABLE "pty_parties" ADD COLUMN "data_blocked_at" TIMESTAMPTZ(6);
ALTER TABLE "pty_parties" ADD COLUMN "data_block_reason" TEXT;
ALTER TABLE "pty_parties" ADD COLUMN "data_erased_at" TIMESTAMPTZ(6);
ALTER TABLE "pty_parties" ADD CONSTRAINT "pty_parties_data_block_check"
    CHECK (("data_blocked_at" IS NULL) = ("data_block_reason" IS NULL));

-- Formularios del sitio: se vuelven anónimos a los dos años o a pedido del titular (decisión 10).
ALTER TABLE "web_form_submissions" ALTER COLUMN "email" DROP NOT NULL;
ALTER TABLE "web_form_submissions" ADD COLUMN "anonymized_at" TIMESTAMPTZ(6);
ALTER TABLE "web_form_submissions" ADD CONSTRAINT "web_form_submissions_email_check"
    CHECK ("email" IS NOT NULL OR "anonymized_at" IS NOT NULL);

CREATE UNIQUE INDEX "prv_requests_tenant_id_id_key" ON "prv_requests"("tenant_id", "id");
CREATE UNIQUE INDEX "prv_requests_tenant_id_code_key" ON "prv_requests"("tenant_id", "code");
CREATE INDEX "prv_requests_tenant_id_status_idx" ON "prv_requests"("tenant_id", "status");
CREATE INDEX "prv_requests_tenant_id_party_id_idx" ON "prv_requests"("tenant_id", "party_id");
CREATE UNIQUE INDEX "prv_request_events_tenant_id_id_key" ON "prv_request_events"("tenant_id", "id");
CREATE INDEX "prv_request_events_tenant_id_request_id_idx" ON "prv_request_events"("tenant_id", "request_id");
CREATE INDEX "prv_request_events_mail_pending_idx" ON "prv_request_events"("tenant_id")
    WHERE "mail_pending";
CREATE UNIQUE INDEX "prv_data_exports_tenant_id_id_key" ON "prv_data_exports"("tenant_id", "id");
CREATE INDEX "prv_data_exports_tenant_id_request_id_idx" ON "prv_data_exports"("tenant_id", "request_id");
CREATE INDEX "prv_data_exports_pending_idx" ON "prv_data_exports"("tenant_id") WHERE "status" = 'pending';
CREATE UNIQUE INDEX "prv_incidents_tenant_id_id_key" ON "prv_incidents"("tenant_id", "id");
CREATE UNIQUE INDEX "prv_incidents_tenant_id_code_key" ON "prv_incidents"("tenant_id", "code");
CREATE INDEX "prv_incidents_tenant_id_status_idx" ON "prv_incidents"("tenant_id", "status");
CREATE UNIQUE INDEX "prv_incident_measures_tenant_id_id_key" ON "prv_incident_measures"("tenant_id", "id");
CREATE INDEX "prv_incident_measures_tenant_id_incident_id_idx"
    ON "prv_incident_measures"("tenant_id", "incident_id");

ALTER TABLE "prv_requests" ADD CONSTRAINT "prv_requests_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "prv_request_events" ADD CONSTRAINT "prv_request_events_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "prv_request_events" ADD CONSTRAINT "prv_request_events_tenant_id_request_id_fkey"
    FOREIGN KEY ("tenant_id", "request_id") REFERENCES "prv_requests"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "prv_data_exports" ADD CONSTRAINT "prv_data_exports_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "prv_data_exports" ADD CONSTRAINT "prv_data_exports_tenant_id_request_id_fkey"
    FOREIGN KEY ("tenant_id", "request_id") REFERENCES "prv_requests"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "prv_incidents" ADD CONSTRAINT "prv_incidents_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "prv_incident_measures" ADD CONSTRAINT "prv_incident_measures_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "prv_incident_measures" ADD CONSTRAINT "prv_incident_measures_tenant_id_incident_id_fkey"
    FOREIGN KEY ("tenant_id", "incident_id") REFERENCES "prv_incidents"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TRIGGER "prv_requests_control_columns" BEFORE INSERT OR UPDATE ON "prv_requests"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();
CREATE TRIGGER "prv_request_events_control_columns" BEFORE INSERT OR UPDATE ON "prv_request_events"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();
CREATE TRIGGER "prv_data_exports_control_columns" BEFORE INSERT OR UPDATE ON "prv_data_exports"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();
CREATE TRIGGER "prv_incidents_control_columns" BEFORE INSERT OR UPDATE ON "prv_incidents"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();
CREATE TRIGGER "prv_incident_measures_control_columns" BEFORE INSERT OR UPDATE ON "prv_incident_measures"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();

ALTER TABLE "prv_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "prv_requests" FORCE ROW LEVEL SECURITY;
CREATE POLICY "prv_requests_tenant_isolation" ON "prv_requests"
    USING ("tenant_id" = core_current_tenant_id()) WITH CHECK ("tenant_id" = core_current_tenant_id());
ALTER TABLE "prv_request_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "prv_request_events" FORCE ROW LEVEL SECURITY;
CREATE POLICY "prv_request_events_tenant_isolation" ON "prv_request_events"
    USING ("tenant_id" = core_current_tenant_id()) WITH CHECK ("tenant_id" = core_current_tenant_id());
ALTER TABLE "prv_data_exports" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "prv_data_exports" FORCE ROW LEVEL SECURITY;
CREATE POLICY "prv_data_exports_tenant_isolation" ON "prv_data_exports"
    USING ("tenant_id" = core_current_tenant_id()) WITH CHECK ("tenant_id" = core_current_tenant_id());
ALTER TABLE "prv_incidents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "prv_incidents" FORCE ROW LEVEL SECURITY;
CREATE POLICY "prv_incidents_tenant_isolation" ON "prv_incidents"
    USING ("tenant_id" = core_current_tenant_id()) WITH CHECK ("tenant_id" = core_current_tenant_id());
ALTER TABLE "prv_incident_measures" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "prv_incident_measures" FORCE ROW LEVEL SECURITY;
CREATE POLICY "prv_incident_measures_tenant_isolation" ON "prv_incident_measures"
    USING ("tenant_id" = core_current_tenant_id()) WITH CHECK ("tenant_id" = core_current_tenant_id());

-- Sin DELETE: el borrado es lógico. La historia y las medidas solo se agregan.
GRANT SELECT, INSERT, UPDATE ON "prv_requests" TO app_user;
GRANT SELECT, INSERT, UPDATE ON "prv_request_events" TO app_user;
GRANT SELECT, INSERT, UPDATE ON "prv_data_exports" TO app_user;
GRANT SELECT, INSERT, UPDATE ON "prv_incidents" TO app_user;
GRANT SELECT, INSERT ON "prv_incident_measures" TO app_user;

-- El worker recorre solo las empresas con trabajo de privacidad. Las funciones corren como dueñas
-- del esquema: leen todas las empresas solo para saber cuáles.
CREATE POLICY "prv_requests_worker_lookup" ON "prv_requests"
    FOR SELECT TO migration_user USING (true);
CREATE POLICY "prv_request_events_worker_lookup" ON "prv_request_events"
    FOR SELECT TO migration_user USING (true);
CREATE POLICY "prv_data_exports_worker_lookup" ON "prv_data_exports"
    FOR SELECT TO migration_user USING (true);
CREATE POLICY "prv_incidents_worker_lookup" ON "prv_incidents"
    FOR SELECT TO migration_user USING (true);
CREATE POLICY "prv_cookie_consents_worker_lookup" ON "prv_cookie_consents"
    FOR SELECT TO migration_user USING (true);

-- Correos al titular y entregas por preparar (cada 30 segundos).
CREATE FUNCTION "prv_tenants_with_request_work"() RETURNS SETOF UUID
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
    AS $$ SELECT tenant_id FROM prv_request_events WHERE mail_pending AND deleted_at IS NULL
          UNION
          SELECT tenant_id FROM prv_data_exports WHERE status = 'pending' AND deleted_at IS NULL
          ORDER BY 1 $$;
REVOKE EXECUTE ON FUNCTION "prv_tenants_with_request_work"() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "prv_tenants_with_request_work"() TO app_user;

-- Trabajo diario: plazos abiertos y retención (decisiones 10 y 11).
CREATE FUNCTION "prv_tenants_with_daily_work"(cookie_cutoff TIMESTAMPTZ, form_cutoff TIMESTAMPTZ)
    RETURNS SETOF UUID
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
    AS $$ SELECT tenant_id FROM prv_requests
            WHERE status IN ('received', 'verifying', 'in_progress') AND deleted_at IS NULL
          UNION
          SELECT tenant_id FROM prv_incidents
            WHERE status IN ('open', 'contained') AND deleted_at IS NULL
          UNION
          SELECT tenant_id FROM prv_cookie_consents WHERE decided_at < cookie_cutoff
          UNION
          SELECT tenant_id FROM web_form_submissions
            WHERE received_at < form_cutoff AND anonymized_at IS NULL AND deleted_at IS NULL
          ORDER BY 1 $$;
REVOKE EXECUTE ON FUNCTION "prv_tenants_with_daily_work"(TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "prv_tenants_with_daily_work"(TIMESTAMPTZ, TIMESTAMPTZ) TO app_user;

-- Las elecciones de cookies se borran a los tres años (decisión 10). La aplicación no tiene
-- DELETE: borra esta función, solo en la empresa de la transacción y solo lo vencido.
CREATE FUNCTION "prv_purge_cookie_consents"(cutoff TIMESTAMPTZ) RETURNS INTEGER
    LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
    AS $$
DECLARE
    removed INTEGER;
BEGIN
    IF core_current_tenant_id() IS NULL THEN
        RAISE EXCEPTION 'prv_purge_cookie_consents requires a tenant';
    END IF;
    DELETE FROM prv_cookie_consents
        WHERE tenant_id = core_current_tenant_id() AND decided_at < cutoff;
    GET DIAGNOSTICS removed = ROW_COUNT;
    RETURN removed;
END $$;
REVOKE EXECUTE ON FUNCTION "prv_purge_cookie_consents"(TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "prv_purge_cookie_consents"(TIMESTAMPTZ) TO app_user;
