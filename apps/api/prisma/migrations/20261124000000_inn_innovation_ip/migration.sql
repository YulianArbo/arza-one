-- B40 — Innovación y propiedad intelectual (M15, ficha 17.16). Banco de ideas con su evaluación
-- de viabilidad FT-INN-003 (inn_ideas), hoja de ruta de productos propios (inn_roadmap_items),
-- portafolio de marcas, registros de software y dominios (inn_ip_assets) con su cadena de
-- titularidad (inn_ip_authors), vigilancia tecnológica (inn_tech_watch) y análisis de competencia
-- (inn_competitors). Solo expande: la versión anterior sigue funcionando.

CREATE TABLE "inn_ideas" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "expected_benefit" TEXT,
    "proposer_id" UUID NOT NULL,
    "proposed_on" DATE NOT NULL,
    "stage" TEXT NOT NULL DEFAULT 'registered',
    "evaluator_id" UUID,
    "viability_scores" JSONB,
    "viability_total" INTEGER,
    "viability_concept" TEXT,
    "viability_note" TEXT,
    "evaluated_by" UUID,
    "evaluated_on" DATE,
    "viability_record_id" UUID,
    "viability_record_code" TEXT,
    "decision_note" TEXT,
    "decided_by" UUID,
    "decided_on" DATE,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),
    CONSTRAINT "inn_ideas_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "inn_ideas_code_check" CHECK ("code" ~ '^IDE-[0-9]{4}-[0-9]{4,8}$'),
    CONSTRAINT "inn_ideas_stage_check" CHECK (
        "stage" IN ('registered', 'evaluating', 'approved', 'in_development', 'implemented', 'archived')
    ),
    -- Decisión 4: cinco criterios de 1 a 5; el total va de 5 a 25.
    CONSTRAINT "inn_ideas_viability_check" CHECK (
        ("viability_total" IS NULL) = ("viability_concept" IS NULL)
        AND ("viability_total" IS NULL) = ("viability_scores" IS NULL)
        AND ("viability_total" IS NULL) = ("evaluated_by" IS NULL)
        AND ("viability_total" IS NULL) = ("evaluated_on" IS NULL)
        AND ("viability_total" IS NULL OR "viability_total" BETWEEN 5 AND 25)
        AND ("viability_concept" IS NULL
            OR "viability_concept" IN ('viable', 'viable_with_adjustments', 'not_viable'))
    ),
    -- Decisión 3: nadie evalúa ni decide sobre su propia idea; aprobar exige la evaluación.
    CONSTRAINT "inn_ideas_independence_check" CHECK (
        ("evaluator_id" IS NULL OR "evaluator_id" <> "proposer_id")
        AND ("evaluated_by" IS NULL OR "evaluated_by" <> "proposer_id")
        AND ("decided_by" IS NULL OR "decided_by" <> "proposer_id")
    ),
    CONSTRAINT "inn_ideas_approved_check" CHECK (
        "stage" NOT IN ('approved', 'in_development', 'implemented')
        OR ("viability_total" IS NOT NULL AND "viability_concept" <> 'not_viable'
            AND "decided_by" IS NOT NULL)
    )
);

CREATE TABLE "inn_roadmap_items" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "product" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "quarter" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'planned',
    "owner_id" UUID NOT NULL,
    "idea_id" UUID,
    "version_label" TEXT,
    "released_on" DATE,
    "ip_asset_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),
    CONSTRAINT "inn_roadmap_items_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "inn_roadmap_items_quarter_check" CHECK ("quarter" ~ '^20[2-9][0-9]-T[1-4]$'),
    CONSTRAINT "inn_roadmap_items_status_check" CHECK (
        "status" IN ('planned', 'in_progress', 'released', 'cancelled')
    ),
    -- Solo lo liberado tiene versión y fecha de liberación.
    CONSTRAINT "inn_roadmap_items_release_check" CHECK (
        ("status" = 'released') = ("version_label" IS NOT NULL)
        AND ("status" = 'released') = ("released_on" IS NOT NULL)
    )
);

CREATE TABLE "inn_ip_assets" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "holder" TEXT NOT NULL,
    "registry_number" TEXT,
    "nice_classes" TEXT,
    "office" TEXT NOT NULL,
    "filed_on" DATE,
    "granted_on" DATE,
    "expires_on" DATE,
    "status" TEXT NOT NULL DEFAULT 'proposed',
    "responsible_id" UUID NOT NULL,
    "product" TEXT,
    "version_label" TEXT,
    "document_id" UUID,
    "notes" TEXT,
    "renewal_alerted_for" DATE,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),
    CONSTRAINT "inn_ip_assets_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "inn_ip_assets_code_check" CHECK ("code" ~ '^PI-[0-9]{4}-[0-9]{4,8}$'),
    CONSTRAINT "inn_ip_assets_kind_check" CHECK ("kind" IN ('trademark', 'software', 'domain')),
    CONSTRAINT "inn_ip_assets_status_check" CHECK (
        "status" IN ('proposed', 'filed', 'registered', 'expired', 'abandoned')
    ),
    -- El software no vence; las clases de Niza son de las marcas.
    CONSTRAINT "inn_ip_assets_kind_fields_check" CHECK (
        ("kind" <> 'software' OR "expires_on" IS NULL)
        AND ("kind" = 'trademark' OR "nice_classes" IS NULL)
    ),
    CONSTRAINT "inn_ip_assets_registered_check" CHECK (
        "status" <> 'registered'
        OR (("kind" = 'software' OR "expires_on" IS NOT NULL)
            AND ("kind" = 'domain' OR "registry_number" IS NOT NULL))
    ),
    CONSTRAINT "inn_ip_assets_dates_check" CHECK (
        ("status" = 'proposed' OR "filed_on" IS NOT NULL)
        AND ("filed_on" IS NULL OR "expires_on" IS NULL OR "expires_on" > "filed_on")
    )
);

CREATE TABLE "inn_ip_authors" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "asset_id" UUID NOT NULL,
    "user_id" UUID,
    "name" TEXT NOT NULL,
    "contribution" TEXT,
    "support_kind" TEXT NOT NULL,
    "hr_contract_id" UUID,
    "contract_id" UUID,
    "support_file_id" UUID,
    "support_label" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),
    CONSTRAINT "inn_ip_authors_pkey" PRIMARY KEY ("id"),
    -- Decisión 8: cada autor con exactamente un soporte escrito de su cesión.
    CONSTRAINT "inn_ip_authors_support_check" CHECK (
        ("support_kind" = 'employment_contract') = ("hr_contract_id" IS NOT NULL)
        AND ("support_kind" = 'contract') = ("contract_id" IS NOT NULL)
        AND ("support_kind" = 'document') = ("support_file_id" IS NOT NULL)
        AND ("support_kind" <> 'employment_contract' OR "user_id" IS NOT NULL)
        AND "support_kind" IN ('employment_contract', 'contract', 'document')
    )
);

CREATE TABLE "inn_tech_watch" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "topic" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "finding" TEXT NOT NULL,
    "relevance" TEXT NOT NULL,
    "observed_on" DATE NOT NULL,
    "recorded_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),
    CONSTRAINT "inn_tech_watch_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "inn_tech_watch_relevance_check" CHECK ("relevance" IN ('high', 'medium', 'low'))
);

CREATE TABLE "inn_competitors" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "segment" TEXT NOT NULL,
    "website" TEXT,
    "strengths" TEXT NOT NULL,
    "weaknesses" TEXT NOT NULL,
    "updated_on" DATE NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),
    CONSTRAINT "inn_competitors_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "inn_ideas_tenant_id_id_key" ON "inn_ideas"("tenant_id", "id");
CREATE UNIQUE INDEX "inn_ideas_tenant_id_code_key" ON "inn_ideas"("tenant_id", "code");
CREATE INDEX "inn_ideas_tenant_id_proposer_id_idx" ON "inn_ideas"("tenant_id", "proposer_id");
CREATE INDEX "inn_ideas_tenant_id_stage_idx" ON "inn_ideas"("tenant_id", "stage");
CREATE UNIQUE INDEX "inn_roadmap_items_tenant_id_id_key" ON "inn_roadmap_items"("tenant_id", "id");
CREATE INDEX "inn_roadmap_items_tenant_id_quarter_idx" ON "inn_roadmap_items"("tenant_id", "quarter");
CREATE UNIQUE INDEX "inn_ip_assets_tenant_id_id_key" ON "inn_ip_assets"("tenant_id", "id");
CREATE UNIQUE INDEX "inn_ip_assets_tenant_id_code_key" ON "inn_ip_assets"("tenant_id", "code");
CREATE INDEX "inn_ip_assets_tenant_id_expires_on_idx" ON "inn_ip_assets"("tenant_id", "expires_on");
CREATE UNIQUE INDEX "inn_ip_authors_tenant_id_id_key" ON "inn_ip_authors"("tenant_id", "id");
CREATE INDEX "inn_ip_authors_tenant_id_asset_id_idx" ON "inn_ip_authors"("tenant_id", "asset_id");
CREATE UNIQUE INDEX "inn_tech_watch_tenant_id_id_key" ON "inn_tech_watch"("tenant_id", "id");
CREATE INDEX "inn_tech_watch_tenant_id_observed_on_idx" ON "inn_tech_watch"("tenant_id", "observed_on");
CREATE UNIQUE INDEX "inn_competitors_tenant_id_id_key" ON "inn_competitors"("tenant_id", "id");

ALTER TABLE "inn_ideas" ADD CONSTRAINT "inn_ideas_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inn_roadmap_items" ADD CONSTRAINT "inn_roadmap_items_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inn_ip_assets" ADD CONSTRAINT "inn_ip_assets_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inn_ip_authors" ADD CONSTRAINT "inn_ip_authors_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inn_tech_watch" ADD CONSTRAINT "inn_tech_watch_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inn_competitors" ADD CONSTRAINT "inn_competitors_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inn_roadmap_items" ADD CONSTRAINT "inn_roadmap_items_tenant_id_idea_id_fkey"
    FOREIGN KEY ("tenant_id", "idea_id") REFERENCES "inn_ideas"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inn_roadmap_items" ADD CONSTRAINT "inn_roadmap_items_tenant_id_ip_asset_id_fkey"
    FOREIGN KEY ("tenant_id", "ip_asset_id") REFERENCES "inn_ip_assets"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inn_ip_authors" ADD CONSTRAINT "inn_ip_authors_tenant_id_asset_id_fkey"
    FOREIGN KEY ("tenant_id", "asset_id") REFERENCES "inn_ip_assets"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TRIGGER "inn_ideas_control_columns" BEFORE INSERT OR UPDATE ON "inn_ideas"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();
CREATE TRIGGER "inn_roadmap_items_control_columns" BEFORE INSERT OR UPDATE ON "inn_roadmap_items"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();
CREATE TRIGGER "inn_ip_assets_control_columns" BEFORE INSERT OR UPDATE ON "inn_ip_assets"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();
CREATE TRIGGER "inn_ip_authors_control_columns" BEFORE INSERT OR UPDATE ON "inn_ip_authors"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();
CREATE TRIGGER "inn_tech_watch_control_columns" BEFORE INSERT OR UPDATE ON "inn_tech_watch"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();
CREATE TRIGGER "inn_competitors_control_columns" BEFORE INSERT OR UPDATE ON "inn_competitors"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();

ALTER TABLE "inn_ideas" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "inn_ideas" FORCE ROW LEVEL SECURITY;
CREATE POLICY "inn_ideas_tenant_isolation" ON "inn_ideas"
    USING ("tenant_id" = core_current_tenant_id()) WITH CHECK ("tenant_id" = core_current_tenant_id());
ALTER TABLE "inn_roadmap_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "inn_roadmap_items" FORCE ROW LEVEL SECURITY;
CREATE POLICY "inn_roadmap_items_tenant_isolation" ON "inn_roadmap_items"
    USING ("tenant_id" = core_current_tenant_id()) WITH CHECK ("tenant_id" = core_current_tenant_id());
ALTER TABLE "inn_ip_assets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "inn_ip_assets" FORCE ROW LEVEL SECURITY;
CREATE POLICY "inn_ip_assets_tenant_isolation" ON "inn_ip_assets"
    USING ("tenant_id" = core_current_tenant_id()) WITH CHECK ("tenant_id" = core_current_tenant_id());
ALTER TABLE "inn_ip_authors" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "inn_ip_authors" FORCE ROW LEVEL SECURITY;
CREATE POLICY "inn_ip_authors_tenant_isolation" ON "inn_ip_authors"
    USING ("tenant_id" = core_current_tenant_id()) WITH CHECK ("tenant_id" = core_current_tenant_id());
ALTER TABLE "inn_tech_watch" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "inn_tech_watch" FORCE ROW LEVEL SECURITY;
CREATE POLICY "inn_tech_watch_tenant_isolation" ON "inn_tech_watch"
    USING ("tenant_id" = core_current_tenant_id()) WITH CHECK ("tenant_id" = core_current_tenant_id());
ALTER TABLE "inn_competitors" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "inn_competitors" FORCE ROW LEVEL SECURITY;
CREATE POLICY "inn_competitors_tenant_isolation" ON "inn_competitors"
    USING ("tenant_id" = core_current_tenant_id()) WITH CHECK ("tenant_id" = core_current_tenant_id());

GRANT SELECT, INSERT, UPDATE ON "inn_ideas" TO app_user;
GRANT SELECT, INSERT, UPDATE ON "inn_roadmap_items" TO app_user;
GRANT SELECT, INSERT, UPDATE ON "inn_ip_assets" TO app_user;
GRANT SELECT, INSERT, UPDATE ON "inn_ip_authors" TO app_user;
GRANT SELECT, INSERT, UPDATE ON "inn_tech_watch" TO app_user;
GRANT SELECT, INSERT, UPDATE ON "inn_competitors" TO app_user;

-- El worker recorre solo las empresas con activos que vencen (decisión 6). La función corre como
-- dueña del esquema: lee todas las empresas solo para saber cuáles.
CREATE POLICY "inn_ip_assets_worker_lookup" ON "inn_ip_assets"
    FOR SELECT TO migration_user USING (true);
CREATE FUNCTION "inn_tenants_with_expiring_assets"() RETURNS SETOF UUID
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
    AS $$ SELECT DISTINCT tenant_id FROM inn_ip_assets
          WHERE expires_on IS NOT NULL AND status = 'registered' AND deleted_at IS NULL
          ORDER BY 1 $$;
REVOKE EXECUTE ON FUNCTION "inn_tenants_with_expiring_assets"() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "inn_tenants_with_expiring_assets"() TO app_user;

-- Formatos digitales: la evaluación de viabilidad FT-INN-003 se une a su idea (decisión 4).
ALTER TABLE "doc_form_templates" DROP CONSTRAINT "doc_form_templates_entity_type_check";
ALTER TABLE "doc_form_templates"
    ADD CONSTRAINT "doc_form_templates_entity_type_check" CHECK (
        "entity_type" IS NULL OR "entity_type" IN ('doc_version', 'party', 'doc_change_request',
            'prj_acceptance', 'prj_code_review', 'ast_assignment', 'hr_contract', 'inn_idea'));
ALTER TABLE "doc_form_records" DROP CONSTRAINT "doc_form_records_entity_check";
ALTER TABLE "doc_form_records"
    ADD CONSTRAINT "doc_form_records_entity_check" CHECK (
        ("entity_type" IS NULL) = ("entity_id" IS NULL)
        AND ("entity_type" IS NULL OR "entity_type" IN ('doc_version', 'party', 'doc_change_request',
            'prj_acceptance', 'prj_code_review', 'ast_assignment', 'hr_contract', 'inn_idea')));
