-- B41 — Sitio público, formularios, textos legales y cookies (M17, ficha 17.18; numerales 20.2 y
-- 20.4). Páginas administrables (web_pages), textos legales versionados (web_legal_texts) con sus
-- aceptaciones (web_legal_acceptances), envíos de los formularios de contacto y cotización
-- (web_form_submissions), bajas de comunicaciones comerciales (web_unsubscribes) y elección de
-- cookies de los visitantes (prv_cookie_consents, decisión 4). Las sesiones registran si al
-- ingresar faltaba aceptar los términos de la plataforma (decisión 3). Solo expande: la versión
-- anterior sigue funcionando.

CREATE TABLE "web_pages" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "published_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),
    CONSTRAINT "web_pages_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "web_pages_slug_check" CHECK ("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    CONSTRAINT "web_pages_status_check" CHECK ("status" IN ('draft', 'published', 'withdrawn')),
    CONSTRAINT "web_pages_published_check" CHECK ("status" <> 'published' OR "published_at" IS NOT NULL)
);

CREATE TABLE "web_legal_texts" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "version_number" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "drafted_by" UUID,
    "approved_by" UUID,
    "approved_at" TIMESTAMPTZ(6),
    "concept_file_id" UUID,
    "effective_from" TIMESTAMPTZ(6),
    "replaced_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),
    CONSTRAINT "web_legal_texts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "web_legal_texts_key_check" CHECK ("key" IN (
        'site_terms', 'platform_terms', 'cookie_policy', 'data_subject_rights',
        'security_disclosure', 'third_party_notices'
    )),
    CONSTRAINT "web_legal_texts_version_check" CHECK ("version_number" >= 1),
    CONSTRAINT "web_legal_texts_status_check" CHECK (
        "status" IN ('draft', 'approved', 'published', 'replaced')
    ),
    -- Decisión 2: nadie aprueba lo que redactó; publicar exige la aprobación.
    CONSTRAINT "web_legal_texts_independence_check" CHECK (
        "approved_by" IS NULL OR "drafted_by" IS NULL OR "approved_by" <> "drafted_by"
    ),
    CONSTRAINT "web_legal_texts_approved_check" CHECK (
        "status" = 'draft' OR ("approved_by" IS NOT NULL AND "approved_at" IS NOT NULL)
    ),
    CONSTRAINT "web_legal_texts_published_check" CHECK (
        "status" IN ('draft', 'approved') OR "effective_from" IS NOT NULL
    ),
    CONSTRAINT "web_legal_texts_replaced_check" CHECK (("status" = 'replaced') = ("replaced_at" IS NOT NULL))
);

CREATE TABLE "web_legal_acceptances" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "text_id" UUID NOT NULL,
    "user_id" UUID,
    "party_id" UUID,
    "accepted_at" TIMESTAMPTZ(6) NOT NULL,
    "ip" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),
    CONSTRAINT "web_legal_acceptances_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "web_legal_acceptances_who_check" CHECK ("user_id" IS NOT NULL OR "party_id" IS NOT NULL)
);

CREATE TABLE "web_form_submissions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "form_key" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "notice_id" UUID NOT NULL,
    "notice_version" INTEGER NOT NULL,
    "consent_id" UUID NOT NULL,
    "ip" TEXT,
    "user_agent" TEXT,
    "created_lead_id" UUID,
    "created_lead_code" TEXT,
    "received_at" TIMESTAMPTZ(6) NOT NULL,
    "mail_pending" BOOLEAN NOT NULL DEFAULT true,
    "ack_sent_at" TIMESTAMPTZ(6),
    "unsubscribe_token_hash" TEXT,
    "unsubscribe_used_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),
    CONSTRAINT "web_form_submissions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "web_form_submissions_code_check" CHECK ("code" ~ '^FRM-[0-9]{4}-[0-9]{4,8}$'),
    CONSTRAINT "web_form_submissions_form_key_check" CHECK ("form_key" IN ('contact', 'quote')),
    CONSTRAINT "web_form_submissions_data_check" CHECK (jsonb_typeof("data") = 'object')
);

CREATE TABLE "web_unsubscribes" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "submission_id" UUID,
    "unsubscribed_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),
    CONSTRAINT "web_unsubscribes_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "web_unsubscribes_email_check" CHECK ("email" = lower("email")),
    CONSTRAINT "web_unsubscribes_source_check" CHECK ("source" IN ('ack_link'))
);

CREATE TABLE "prv_cookie_consents" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "visitor_id" UUID NOT NULL,
    "policy_version" INTEGER NOT NULL,
    "categories" TEXT[] NOT NULL,
    "decided_at" TIMESTAMPTZ(6) NOT NULL,
    "ip_truncated" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),
    CONSTRAINT "prv_cookie_consents_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "prv_cookie_consents_categories_check" CHECK (
        'necessary' = ANY ("categories")
        AND "categories" <@ ARRAY['necessary', 'preferences', 'analytics', 'advertising']::TEXT[]
    )
);

ALTER TABLE "iam_sessions" ADD COLUMN "terms_pending" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX "web_pages_tenant_id_id_key" ON "web_pages"("tenant_id", "id");
CREATE UNIQUE INDEX "web_pages_tenant_id_slug_key" ON "web_pages"("tenant_id", "slug");
CREATE UNIQUE INDEX "web_legal_texts_tenant_id_id_key" ON "web_legal_texts"("tenant_id", "id");
CREATE UNIQUE INDEX "web_legal_texts_tenant_id_key_version_number_key"
    ON "web_legal_texts"("tenant_id", "key", "version_number");
CREATE INDEX "web_legal_texts_tenant_id_key_status_idx" ON "web_legal_texts"("tenant_id", "key", "status");
-- Una sola versión publicada y un solo borrador o aprobado en curso por clase de texto.
CREATE UNIQUE INDEX "web_legal_texts_one_published" ON "web_legal_texts"("tenant_id", "key")
    WHERE "status" = 'published' AND "deleted_at" IS NULL;
CREATE UNIQUE INDEX "web_legal_texts_one_open" ON "web_legal_texts"("tenant_id", "key")
    WHERE "status" IN ('draft', 'approved') AND "deleted_at" IS NULL;
CREATE UNIQUE INDEX "web_legal_acceptances_tenant_id_id_key" ON "web_legal_acceptances"("tenant_id", "id");
CREATE UNIQUE INDEX "web_legal_acceptances_tenant_id_text_id_user_id_key"
    ON "web_legal_acceptances"("tenant_id", "text_id", "user_id");
CREATE INDEX "web_legal_acceptances_tenant_id_user_id_idx" ON "web_legal_acceptances"("tenant_id", "user_id");
CREATE UNIQUE INDEX "web_form_submissions_tenant_id_id_key" ON "web_form_submissions"("tenant_id", "id");
CREATE UNIQUE INDEX "web_form_submissions_tenant_id_code_key" ON "web_form_submissions"("tenant_id", "code");
CREATE UNIQUE INDEX "web_form_submissions_unsubscribe_token_hash_key"
    ON "web_form_submissions"("unsubscribe_token_hash");
CREATE INDEX "web_form_submissions_tenant_id_received_at_idx"
    ON "web_form_submissions"("tenant_id", "received_at");
CREATE UNIQUE INDEX "web_unsubscribes_tenant_id_id_key" ON "web_unsubscribes"("tenant_id", "id");
CREATE UNIQUE INDEX "web_unsubscribes_tenant_id_email_key" ON "web_unsubscribes"("tenant_id", "email");
CREATE UNIQUE INDEX "prv_cookie_consents_tenant_id_id_key" ON "prv_cookie_consents"("tenant_id", "id");
CREATE INDEX "prv_cookie_consents_tenant_id_visitor_id_idx" ON "prv_cookie_consents"("tenant_id", "visitor_id");
CREATE INDEX "prv_cookie_consents_tenant_id_decided_at_idx" ON "prv_cookie_consents"("tenant_id", "decided_at");

ALTER TABLE "web_pages" ADD CONSTRAINT "web_pages_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "web_legal_texts" ADD CONSTRAINT "web_legal_texts_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "web_legal_acceptances" ADD CONSTRAINT "web_legal_acceptances_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "web_legal_acceptances" ADD CONSTRAINT "web_legal_acceptances_tenant_id_text_id_fkey"
    FOREIGN KEY ("tenant_id", "text_id") REFERENCES "web_legal_texts"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "web_form_submissions" ADD CONSTRAINT "web_form_submissions_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "web_unsubscribes" ADD CONSTRAINT "web_unsubscribes_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "prv_cookie_consents" ADD CONSTRAINT "prv_cookie_consents_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TRIGGER "web_pages_control_columns" BEFORE INSERT OR UPDATE ON "web_pages"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();
CREATE TRIGGER "web_legal_texts_control_columns" BEFORE INSERT OR UPDATE ON "web_legal_texts"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();
CREATE TRIGGER "web_legal_acceptances_control_columns" BEFORE INSERT OR UPDATE ON "web_legal_acceptances"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();
CREATE TRIGGER "web_form_submissions_control_columns" BEFORE INSERT OR UPDATE ON "web_form_submissions"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();
CREATE TRIGGER "web_unsubscribes_control_columns" BEFORE INSERT OR UPDATE ON "web_unsubscribes"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();
CREATE TRIGGER "prv_cookie_consents_control_columns" BEFORE INSERT OR UPDATE ON "prv_cookie_consents"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();

ALTER TABLE "web_pages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "web_pages" FORCE ROW LEVEL SECURITY;
CREATE POLICY "web_pages_tenant_isolation" ON "web_pages"
    USING ("tenant_id" = core_current_tenant_id()) WITH CHECK ("tenant_id" = core_current_tenant_id());
ALTER TABLE "web_legal_texts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "web_legal_texts" FORCE ROW LEVEL SECURITY;
CREATE POLICY "web_legal_texts_tenant_isolation" ON "web_legal_texts"
    USING ("tenant_id" = core_current_tenant_id()) WITH CHECK ("tenant_id" = core_current_tenant_id());
ALTER TABLE "web_legal_acceptances" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "web_legal_acceptances" FORCE ROW LEVEL SECURITY;
CREATE POLICY "web_legal_acceptances_tenant_isolation" ON "web_legal_acceptances"
    USING ("tenant_id" = core_current_tenant_id()) WITH CHECK ("tenant_id" = core_current_tenant_id());
ALTER TABLE "web_form_submissions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "web_form_submissions" FORCE ROW LEVEL SECURITY;
CREATE POLICY "web_form_submissions_tenant_isolation" ON "web_form_submissions"
    USING ("tenant_id" = core_current_tenant_id()) WITH CHECK ("tenant_id" = core_current_tenant_id());
ALTER TABLE "web_unsubscribes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "web_unsubscribes" FORCE ROW LEVEL SECURITY;
CREATE POLICY "web_unsubscribes_tenant_isolation" ON "web_unsubscribes"
    USING ("tenant_id" = core_current_tenant_id()) WITH CHECK ("tenant_id" = core_current_tenant_id());
ALTER TABLE "prv_cookie_consents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "prv_cookie_consents" FORCE ROW LEVEL SECURITY;
CREATE POLICY "prv_cookie_consents_tenant_isolation" ON "prv_cookie_consents"
    USING ("tenant_id" = core_current_tenant_id()) WITH CHECK ("tenant_id" = core_current_tenant_id());

-- Las aceptaciones, las bajas y las elecciones de cookies solo se agregan (evidencia).
GRANT SELECT, INSERT, UPDATE ON "web_pages" TO app_user;
GRANT SELECT, INSERT, UPDATE ON "web_legal_texts" TO app_user;
GRANT SELECT, INSERT ON "web_legal_acceptances" TO app_user;
GRANT SELECT, INSERT, UPDATE ON "web_form_submissions" TO app_user;
GRANT SELECT, INSERT ON "web_unsubscribes" TO app_user;
GRANT SELECT, INSERT ON "prv_cookie_consents" TO app_user;

-- El worker recorre solo las empresas con acuses por enviar. La función corre como dueña del
-- esquema: lee todas las empresas solo para saber cuáles.
CREATE POLICY "web_form_submissions_worker_lookup" ON "web_form_submissions"
    FOR SELECT TO migration_user USING (true);
CREATE FUNCTION "web_tenants_with_mail_work"() RETURNS SETOF UUID
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
    AS $$ SELECT DISTINCT tenant_id FROM web_form_submissions
          WHERE mail_pending AND deleted_at IS NULL
          ORDER BY 1 $$;
REVOKE EXECUTE ON FUNCTION "web_tenants_with_mail_work"() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "web_tenants_with_mail_work"() TO app_user;
