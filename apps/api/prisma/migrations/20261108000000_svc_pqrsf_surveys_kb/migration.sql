-- B29: PQRSF, encuestas y base de conocimiento (M08, ficha 17.9, numeral 12.4). PQRSF FT-SAC-002
-- con radicado, acuse, plazo en días hábiles (PR-SAC-002 y Ley 1581), respuesta aprobada por otra
-- persona y traslado a Privacidad o a Calidad (svc_pqrsf); encuestas de satisfacción y NPS
-- FT-SAC-003 (svc_surveys, svc_survey_responses); base de conocimiento (svc_kb_articles). El
-- tiquete guarda el correo de quien reporta, para la encuesta. Solo expande: la versión anterior
-- sigue funcionando.


-- AlterTable
ALTER TABLE "svc_tickets" ADD COLUMN     "requester_email" TEXT;

-- CreateTable
CREATE TABLE "svc_pqrsf" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "privacy_kind" TEXT,
    "channel" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'filed',
    "approval" TEXT NOT NULL DEFAULT 'none',
    "party_id" UUID,
    "requester_name" TEXT NOT NULL,
    "requester_email" TEXT,
    "requester_phone" TEXT,
    "subject" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "received_at" TIMESTAMPTZ(6) NOT NULL,
    "term_days" SMALLINT NOT NULL,
    "due_on" DATE NOT NULL,
    "warn_on" DATE NOT NULL,
    "assignee_id" UUID,
    "classified_at" TIMESTAMPTZ(6),
    "response_draft" TEXT,
    "well_founded" BOOLEAN,
    "drafted_by" UUID,
    "submitted_at" TIMESTAMPTZ(6),
    "return_reason" TEXT,
    "response" TEXT,
    "approved_by" UUID,
    "responded_at" TIMESTAMPTZ(6),
    "transferred_at" TIMESTAMPTZ(6),
    "nonconformity_at" TIMESTAMPTZ(6),
    "privacy_notice_id" UUID,
    "privacy_accepted_at" TIMESTAMPTZ(6),
    "mail_pending" TEXT,
    "ack_sent_at" TIMESTAMPTZ(6),
    "response_sent_at" TIMESTAMPTZ(6),
    "warned_at" TIMESTAMPTZ(6),
    "breached_at" TIMESTAMPTZ(6),
    "closed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "svc_pqrsf_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "svc_surveys" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "recommend_question" TEXT NOT NULL,
    "satisfaction_question" TEXT NOT NULL,
    "comment_question" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "svc_surveys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "svc_survey_responses" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "survey_id" UUID NOT NULL,
    "party_id" UUID,
    "entity_type" TEXT NOT NULL,
    "entity_id" UUID NOT NULL,
    "recipient_email" TEXT,
    "token_hash" TEXT,
    "expires_at" TIMESTAMPTZ(6),
    "mail_pending" BOOLEAN NOT NULL DEFAULT false,
    "sent_at" TIMESTAMPTZ(6),
    "superseded_at" TIMESTAMPTZ(6),
    "score" SMALLINT,
    "satisfaction" SMALLINT,
    "comment" TEXT,
    "answered_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "svc_survey_responses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "svc_kb_articles" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "audience" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "published_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "svc_kb_articles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "svc_pqrsf_tenant_id_status_idx" ON "svc_pqrsf"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "svc_pqrsf_tenant_id_assignee_id_idx" ON "svc_pqrsf"("tenant_id", "assignee_id");

-- CreateIndex
CREATE INDEX "svc_pqrsf_tenant_id_due_on_idx" ON "svc_pqrsf"("tenant_id", "due_on");

-- CreateIndex
CREATE UNIQUE INDEX "svc_pqrsf_tenant_id_id_key" ON "svc_pqrsf"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "svc_pqrsf_tenant_id_code_key" ON "svc_pqrsf"("tenant_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "svc_surveys_tenant_id_id_key" ON "svc_surveys"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "svc_surveys_tenant_id_key_key" ON "svc_surveys"("tenant_id", "key");

-- CreateIndex
CREATE UNIQUE INDEX "svc_survey_responses_token_hash_key" ON "svc_survey_responses"("token_hash");

-- CreateIndex
CREATE INDEX "svc_survey_responses_tenant_id_entity_type_entity_id_idx" ON "svc_survey_responses"("tenant_id", "entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "svc_survey_responses_tenant_id_answered_at_idx" ON "svc_survey_responses"("tenant_id", "answered_at");

-- CreateIndex
CREATE INDEX "svc_survey_responses_tenant_id_created_at_idx" ON "svc_survey_responses"("tenant_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "svc_survey_responses_tenant_id_id_key" ON "svc_survey_responses"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "svc_kb_articles_tenant_id_status_audience_idx" ON "svc_kb_articles"("tenant_id", "status", "audience");

-- CreateIndex
CREATE UNIQUE INDEX "svc_kb_articles_tenant_id_id_key" ON "svc_kb_articles"("tenant_id", "id");

-- AddForeignKey
ALTER TABLE "svc_pqrsf" ADD CONSTRAINT "svc_pqrsf_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "svc_surveys" ADD CONSTRAINT "svc_surveys_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "svc_survey_responses" ADD CONSTRAINT "svc_survey_responses_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "svc_survey_responses" ADD CONSTRAINT "svc_survey_responses_tenant_id_survey_id_fkey" FOREIGN KEY ("tenant_id", "survey_id") REFERENCES "svc_surveys"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "svc_kb_articles" ADD CONSTRAINT "svc_kb_articles_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;



-- Reglas de los datos ----------------------------------------------------------------------------

ALTER TABLE "svc_tickets"
    ADD CONSTRAINT "svc_tickets_requester_email_check"
        CHECK ("requester_email" IS NULL OR char_length("requester_email") BETWEEN 3 AND 254);

ALTER TABLE "svc_pqrsf"
    ADD CONSTRAINT "svc_pqrsf_code_check" CHECK ("code" ~ '^PQRSF-[0-9]{4}-[0-9]{4,8}$'),
    ADD CONSTRAINT "svc_pqrsf_type_check"
        CHECK ("type" IN ('petition', 'complaint', 'claim', 'suggestion', 'compliment')),
    ADD CONSTRAINT "svc_pqrsf_privacy_kind_check"
        CHECK ("privacy_kind" IS NULL OR "privacy_kind" IN ('inquiry', 'claim')),
    ADD CONSTRAINT "svc_pqrsf_channel_check"
        CHECK ("channel" IN ('web', 'email', 'phone', 'in_person', 'portal')),
    ADD CONSTRAINT "svc_pqrsf_text_check" CHECK (
        char_length(btrim("requester_name")) BETWEEN 3 AND 160
        AND char_length(btrim("subject")) BETWEEN 3 AND 160
        AND char_length(btrim("description")) BETWEEN 10 AND 8000
        AND ("requester_email" IS NULL OR char_length("requester_email") BETWEEN 3 AND 254)
        AND ("requester_phone" IS NULL OR char_length("requester_phone") BETWEEN 7 AND 20)),
    -- Se le responde por correo o por teléfono; lo que llega por el sitio trae correo.
    ADD CONSTRAINT "svc_pqrsf_contact_check" CHECK (
        ("requester_email" IS NOT NULL OR "requester_phone" IS NOT NULL)
        AND ("channel" <> 'web' OR "requester_email" IS NOT NULL)),
    ADD CONSTRAINT "svc_pqrsf_term_check" CHECK (
        "term_days" BETWEEN 1 AND 60 AND "warn_on" <= "due_on"
        AND "due_on" > ("received_at" AT TIME ZONE 'America/Bogota')::date),
    -- La aceptación del aviso de privacidad acompaña a la que llegó por el sitio (decisión 12).
    ADD CONSTRAINT "svc_pqrsf_privacy_check"
        CHECK ("channel" <> 'web' OR "privacy_accepted_at" IS NOT NULL),
    -- Clasificada o más adelante: con responsable. En aprobación o devuelta: en trámite. Respondida
    -- o cerrada: con la respuesta aprobada por alguien distinto de quien la redactó (decisión 7).
    ADD CONSTRAINT "svc_pqrsf_status_check" CHECK (
        "status" IN ('filed', 'classified', 'in_progress', 'responded', 'closed')
        AND "approval" IN ('none', 'pending', 'returned')
        AND (("status" = 'filed') = ("assignee_id" IS NULL))
        AND (("status" = 'filed') = ("classified_at" IS NULL))
        AND ("approval" = 'none' OR "status" = 'in_progress')
        AND (("approval" = 'pending') = ("submitted_at" IS NOT NULL))
        AND (("approval" = 'returned') = ("return_reason" IS NOT NULL))
        AND ("status" <> 'in_progress' OR "response_draft" IS NOT NULL)
        AND (("status" IN ('responded', 'closed')) = ("response" IS NOT NULL))
        AND (("status" IN ('responded', 'closed')) = ("responded_at" IS NOT NULL))
        AND (("status" IN ('responded', 'closed')) = ("approved_by" IS NOT NULL))
        AND ("approved_by" IS NULL OR "approved_by" <> "drafted_by")
        AND (("status" = 'closed') = ("closed_at" IS NOT NULL))),
    ADD CONSTRAINT "svc_pqrsf_mail_check" CHECK (
        "mail_pending" IS NULL
        OR ("mail_pending" = 'ack' AND "requester_email" IS NOT NULL)
        OR ("mail_pending" = 'response' AND "requester_email" IS NOT NULL
            AND "response" IS NOT NULL)),
    ADD CONSTRAINT "svc_pqrsf_texts_check" CHECK (
        ("response_draft" IS NULL OR char_length(btrim("response_draft")) BETWEEN 10 AND 8000)
        AND ("return_reason" IS NULL OR char_length(btrim("return_reason")) BETWEEN 3 AND 1000)),
    ADD CONSTRAINT "svc_pqrsf_version_check" CHECK ("version" > 0);

ALTER TABLE "svc_surveys"
    ADD CONSTRAINT "svc_surveys_trigger_check" CHECK ("trigger" IN ('ticket_resolved')),
    ADD CONSTRAINT "svc_surveys_text_check" CHECK (
        char_length(btrim("name")) BETWEEN 3 AND 120
        AND char_length(btrim("recommend_question")) BETWEEN 5 AND 300
        AND char_length(btrim("satisfaction_question")) BETWEEN 5 AND 300
        AND char_length(btrim("comment_question")) BETWEEN 5 AND 300),
    ADD CONSTRAINT "svc_surveys_version_check" CHECK ("version" > 0);

-- Una invitación sin correo no se envía («sin correo», decisión 8). El enlace se crea al enviarla:
-- la llave nunca se guarda, solo su huella. Respondida: con las dos calificaciones.
ALTER TABLE "svc_survey_responses"
    ADD CONSTRAINT "svc_survey_responses_entity_check" CHECK ("entity_type" IN ('svc_ticket')),
    ADD CONSTRAINT "svc_survey_responses_mail_check" CHECK (
        (NOT "mail_pending" OR "recipient_email" IS NOT NULL)
        AND (("token_hash" IS NULL) = ("sent_at" IS NULL))
        AND (("token_hash" IS NULL) = ("expires_at" IS NULL))),
    ADD CONSTRAINT "svc_survey_responses_answer_check" CHECK (
        ("score" IS NULL OR "score" BETWEEN 0 AND 10)
        AND ("satisfaction" IS NULL OR "satisfaction" BETWEEN 1 AND 5)
        AND (("answered_at" IS NULL) = ("score" IS NULL))
        AND (("answered_at" IS NULL) = ("satisfaction" IS NULL))
        AND ("answered_at" IS NULL OR "sent_at" IS NOT NULL)
        AND ("comment" IS NULL OR char_length(btrim("comment")) BETWEEN 3 AND 2000)),
    ADD CONSTRAINT "svc_survey_responses_version_check" CHECK ("version" > 0);

ALTER TABLE "svc_kb_articles"
    ADD CONSTRAINT "svc_kb_articles_category_check"
        CHECK ("category" IN ('platform', 'support', 'projects', 'billing', 'general')),
    ADD CONSTRAINT "svc_kb_articles_audience_check" CHECK ("audience" IN ('internal', 'client')),
    ADD CONSTRAINT "svc_kb_articles_status_check" CHECK (
        "status" IN ('draft', 'published', 'archived')
        AND ("status" <> 'published' OR "published_at" IS NOT NULL)),
    ADD CONSTRAINT "svc_kb_articles_text_check" CHECK (
        char_length(btrim("title")) BETWEEN 3 AND 160
        AND char_length(btrim("summary")) BETWEEN 10 AND 300
        AND char_length(btrim("body")) BETWEEN 10 AND 30000),
    ADD CONSTRAINT "svc_kb_articles_version_check" CHECK ("version" > 0);

-- Avisos de las PQRSF: novedades y plazos (no urgentes, decisión 11).
ALTER TABLE "ntf_templates" DROP CONSTRAINT "ntf_templates_key_check";
ALTER TABLE "ntf_notifications" DROP CONSTRAINT "ntf_notifications_kind_check";
ALTER TABLE "ntf_preferences" DROP CONSTRAINT "ntf_preferences_event_key_check";

ALTER TABLE "ntf_templates"
    ADD CONSTRAINT "ntf_templates_key_check" CHECK ("key" IN ('task_assigned', 'task_escalated',
        'comment_mention', 'security_alert', 'doc_read_requested', 'doc_request_decided',
        'crm_activity_due', 'crm_quote_update', 'ctr_contract_update', 'prj_project_update',
        'svc_ticket_update', 'svc_ticket_alert', 'svc_pqrsf_update'));
ALTER TABLE "ntf_notifications"
    ADD CONSTRAINT "ntf_notifications_kind_check" CHECK ("kind" IN ('task_assigned', 'task_escalated',
        'comment_mention', 'security_alert', 'doc_read_requested', 'doc_request_decided',
        'crm_activity_due', 'crm_quote_update', 'ctr_contract_update', 'prj_project_update',
        'svc_ticket_update', 'svc_ticket_alert', 'svc_pqrsf_update'));
ALTER TABLE "ntf_preferences"
    ADD CONSTRAINT "ntf_preferences_event_key_check" CHECK ("event_key" IN ('task_assigned',
        'task_escalated', 'comment_mention', 'security_alert', 'doc_read_requested',
        'doc_request_decided', 'crm_activity_due', 'crm_quote_update', 'ctr_contract_update',
        'prj_project_update', 'svc_ticket_update', 'svc_ticket_alert', 'svc_pqrsf_update'));

-- Columnas de control --------------------------------------------------------------------------

CREATE TRIGGER "svc_pqrsf_control_columns"
    BEFORE INSERT OR UPDATE ON "svc_pqrsf"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();
CREATE TRIGGER "svc_surveys_control_columns"
    BEFORE INSERT OR UPDATE ON "svc_surveys"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();
CREATE TRIGGER "svc_survey_responses_control_columns"
    BEFORE INSERT OR UPDATE ON "svc_survey_responses"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();
CREATE TRIGGER "svc_kb_articles_control_columns"
    BEFORE INSERT OR UPDATE ON "svc_kb_articles"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();

-- Seguridad por fila (ADR-007) -----------------------------------------------------------------

ALTER TABLE "svc_pqrsf" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "svc_pqrsf" FORCE ROW LEVEL SECURITY;
CREATE POLICY "svc_pqrsf_tenant_isolation" ON "svc_pqrsf"
    USING ("tenant_id" = core_current_tenant_id())
    WITH CHECK ("tenant_id" = core_current_tenant_id());

ALTER TABLE "svc_surveys" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "svc_surveys" FORCE ROW LEVEL SECURITY;
CREATE POLICY "svc_surveys_tenant_isolation" ON "svc_surveys"
    USING ("tenant_id" = core_current_tenant_id())
    WITH CHECK ("tenant_id" = core_current_tenant_id());

ALTER TABLE "svc_survey_responses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "svc_survey_responses" FORCE ROW LEVEL SECURITY;
CREATE POLICY "svc_survey_responses_tenant_isolation" ON "svc_survey_responses"
    USING ("tenant_id" = core_current_tenant_id())
    WITH CHECK ("tenant_id" = core_current_tenant_id());

ALTER TABLE "svc_kb_articles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "svc_kb_articles" FORCE ROW LEVEL SECURITY;
CREATE POLICY "svc_kb_articles_tenant_isolation" ON "svc_kb_articles"
    USING ("tenant_id" = core_current_tenant_id())
    WITH CHECK ("tenant_id" = core_current_tenant_id());

-- Permisos de la API ---------------------------------------------------------------------------
-- Sin DELETE en ninguna: una PQRSF, una respuesta de encuesta o un artículo no se borran.

GRANT SELECT, INSERT, UPDATE ON "svc_pqrsf" TO app_user;
GRANT SELECT, INSERT, UPDATE ON "svc_surveys" TO app_user;
GRANT SELECT, INSERT, UPDATE ON "svc_survey_responses" TO app_user;
GRANT SELECT, INSERT, UPDATE ON "svc_kb_articles" TO app_user;

-- Búsquedas sin empresa ------------------------------------------------------------------------
-- El sitio público no tiene sesión: la empresa del formulario se busca por su NIT (decisión 3) y la
-- encuesta, por la huella de la llave de su enlace. Las funciones corren como dueñas del esquema
-- con políticas de solo lectura y devuelven solo identificadores.

CREATE FUNCTION "core_tenant_by_tax_id"(p_tax_id TEXT) RETURNS UUID
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
    AS $$ SELECT id FROM core_tenants
          WHERE tax_id = p_tax_id AND status = 'active' AND deleted_at IS NULL
          LIMIT 1 $$;

CREATE POLICY "svc_survey_responses_link_lookup" ON "svc_survey_responses"
    FOR SELECT TO migration_user USING (true);

CREATE FUNCTION "svc_find_survey_link"(p_token_hash TEXT)
    RETURNS TABLE (response_id UUID, tenant_id UUID)
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
    AS $$ SELECT r.id, r.tenant_id FROM svc_survey_responses r
          WHERE r.token_hash = p_token_hash AND r.deleted_at IS NULL
          LIMIT 1 $$;

-- Trabajo del worker ---------------------------------------------------------------------------
-- Las empresas con correos por enviar (acuse, respuesta, encuesta) o con PQRSF abiertas que
-- llegaron al aviso de «por vencer» o vencieron. p_today es el día de hoy en Bogotá.
CREATE POLICY "svc_pqrsf_worker_lookup" ON "svc_pqrsf"
    FOR SELECT TO migration_user USING (true);

CREATE FUNCTION "svc_tenants_with_care_work"(p_today DATE) RETURNS SETOF UUID
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
    AS $$ SELECT tenant_id FROM svc_pqrsf
          WHERE deleted_at IS NULL AND (
              mail_pending IS NOT NULL
              OR (status IN ('filed', 'classified', 'in_progress') AND warned_at IS NULL
                  AND warn_on <= p_today)
              OR (status IN ('filed', 'classified', 'in_progress') AND breached_at IS NULL
                  AND due_on < p_today))
          UNION
          SELECT tenant_id FROM svc_survey_responses
          WHERE deleted_at IS NULL AND mail_pending
          ORDER BY 1 $$;

REVOKE EXECUTE ON FUNCTION "core_tenant_by_tax_id"(TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION "svc_find_survey_link"(TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION "svc_tenants_with_care_work"(DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "core_tenant_by_tax_id"(TEXT) TO app_user;
GRANT EXECUTE ON FUNCTION "svc_find_survey_link"(TEXT) TO app_user;
GRANT EXECUTE ON FUNCTION "svc_tenants_with_care_work"(DATE) TO app_user;
