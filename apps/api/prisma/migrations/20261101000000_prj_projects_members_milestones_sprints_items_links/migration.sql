-- B26: proyectos (M07, ficha 17.8, numeral 12.4). Proyectos creados desde un contrato vigente o con
-- la autorización expresa de la Dirección (prj_projects), su equipo (prj_members), hitos
-- (prj_milestones), iteraciones (prj_sprints), lista de pendientes y tablero (prj_items) y enlaces
-- al repositorio, los entornos y el diseño (prj_external_links). El contrato (ctr_contracts), el
-- cliente (pty_parties) y las personas (iam_users) se guardan por identificador, sin llaves hacia
-- tablas de otros módulos (numeral 8.3). Solo expande: la versión anterior no usa estas tablas.

-- CreateTable
CREATE TABLE "prj_projects" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "contract_id" UUID,
    "party_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "methodology" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'planning',
    "status_reason" TEXT,
    "starts_on" DATE NOT NULL,
    "ends_on" DATE NOT NULL,
    "budget_hours" DECIMAL(7,1) NOT NULL,
    "budget_amount" DECIMAL(18,2),
    "manager_id" UUID NOT NULL,
    "authorization_status" TEXT NOT NULL DEFAULT 'none',
    "authorization_reason" TEXT,
    "authorization_note" TEXT,
    "authorization_decided_by" UUID,
    "authorization_decided_at" TIMESTAMPTZ(6),
    "workflow_instance_id" UUID,
    "started_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "prj_projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prj_members" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" TEXT NOT NULL,
    "allocation_pct" SMALLINT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "prj_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prj_milestones" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "due_on" DATE NOT NULL,
    "billing_pct" DECIMAL(5,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "done_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "prj_milestones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prj_sprints" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "starts_on" DATE NOT NULL,
    "ends_on" DATE NOT NULL,
    "goal" TEXT,
    "status" TEXT NOT NULL DEFAULT 'planned',
    "closed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "prj_sprints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prj_items" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "parent_id" UUID,
    "type" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "acceptance_criteria" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "estimate_hours" DECIMAL(4,1),
    "assignee_id" UUID,
    "sprint_id" UUID,
    "review_url" TEXT,
    "test_note" TEXT,
    "done_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "prj_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prj_external_links" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "prj_external_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "prj_projects_tenant_id_status_idx" ON "prj_projects"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "prj_projects_tenant_id_contract_id_idx" ON "prj_projects"("tenant_id", "contract_id");

-- CreateIndex
CREATE UNIQUE INDEX "prj_projects_tenant_id_id_key" ON "prj_projects"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "prj_projects_tenant_id_code_key" ON "prj_projects"("tenant_id", "code");

-- CreateIndex
CREATE INDEX "prj_members_tenant_id_project_id_idx" ON "prj_members"("tenant_id", "project_id");

-- CreateIndex
CREATE INDEX "prj_members_tenant_id_user_id_idx" ON "prj_members"("tenant_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "prj_members_tenant_id_id_key" ON "prj_members"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "prj_milestones_tenant_id_project_id_idx" ON "prj_milestones"("tenant_id", "project_id");

-- CreateIndex
CREATE UNIQUE INDEX "prj_milestones_tenant_id_id_key" ON "prj_milestones"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "prj_sprints_tenant_id_project_id_idx" ON "prj_sprints"("tenant_id", "project_id");

-- CreateIndex
CREATE UNIQUE INDEX "prj_sprints_tenant_id_id_key" ON "prj_sprints"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "prj_items_tenant_id_project_id_status_idx" ON "prj_items"("tenant_id", "project_id", "status");

-- CreateIndex
CREATE INDEX "prj_items_tenant_id_sprint_id_idx" ON "prj_items"("tenant_id", "sprint_id");

-- CreateIndex
CREATE UNIQUE INDEX "prj_items_tenant_id_id_key" ON "prj_items"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "prj_items_tenant_id_project_id_number_key" ON "prj_items"("tenant_id", "project_id", "number");

-- CreateIndex
CREATE INDEX "prj_external_links_tenant_id_project_id_idx" ON "prj_external_links"("tenant_id", "project_id");

-- CreateIndex
CREATE UNIQUE INDEX "prj_external_links_tenant_id_id_key" ON "prj_external_links"("tenant_id", "id");

-- AddForeignKey
ALTER TABLE "prj_projects" ADD CONSTRAINT "prj_projects_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prj_members" ADD CONSTRAINT "prj_members_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prj_members" ADD CONSTRAINT "prj_members_tenant_id_project_id_fkey" FOREIGN KEY ("tenant_id", "project_id") REFERENCES "prj_projects"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prj_milestones" ADD CONSTRAINT "prj_milestones_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prj_milestones" ADD CONSTRAINT "prj_milestones_tenant_id_project_id_fkey" FOREIGN KEY ("tenant_id", "project_id") REFERENCES "prj_projects"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prj_sprints" ADD CONSTRAINT "prj_sprints_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prj_sprints" ADD CONSTRAINT "prj_sprints_tenant_id_project_id_fkey" FOREIGN KEY ("tenant_id", "project_id") REFERENCES "prj_projects"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prj_items" ADD CONSTRAINT "prj_items_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prj_items" ADD CONSTRAINT "prj_items_tenant_id_project_id_fkey" FOREIGN KEY ("tenant_id", "project_id") REFERENCES "prj_projects"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prj_items" ADD CONSTRAINT "prj_items_tenant_id_parent_id_fkey" FOREIGN KEY ("tenant_id", "parent_id") REFERENCES "prj_items"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prj_items" ADD CONSTRAINT "prj_items_tenant_id_sprint_id_fkey" FOREIGN KEY ("tenant_id", "sprint_id") REFERENCES "prj_sprints"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prj_external_links" ADD CONSTRAINT "prj_external_links_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prj_external_links" ADD CONSTRAINT "prj_external_links_tenant_id_project_id_fkey" FOREIGN KEY ("tenant_id", "project_id") REFERENCES "prj_projects"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Reglas de los datos -------------------------------------------------------------------------
-- Los valores permitidos son los de packages/contracts/src/project.

ALTER TABLE "prj_projects"
    ADD CONSTRAINT "prj_projects_code_check" CHECK ("code" ~ '^PRY-[0-9]{4}-[0-9]{4,8}$'),
    ADD CONSTRAINT "prj_projects_type_check"
        CHECK ("type" IN ('development', 'support', 'integration', 'other')),
    ADD CONSTRAINT "prj_projects_methodology_check"
        CHECK ("methodology" IN ('scrum', 'kanban', 'phases')),
    ADD CONSTRAINT "prj_projects_status_check"
        CHECK ("status" IN ('planning', 'in_progress', 'at_risk', 'paused')),
    ADD CONSTRAINT "prj_projects_text_check" CHECK (
        char_length(btrim("name")) BETWEEN 3 AND 160
        AND ("description" IS NULL OR char_length(btrim("description")) BETWEEN 3 AND 4000)),
    ADD CONSTRAINT "prj_projects_dates_check" CHECK ("ends_on" >= "starts_on"),
    ADD CONSTRAINT "prj_projects_budget_check" CHECK (
        "budget_hours" >= 0 AND ("budget_amount" IS NULL OR "budget_amount" >= 0)),
    -- En riesgo o pausado, siempre con su motivo; en los demás estados, sin motivo.
    ADD CONSTRAINT "prj_projects_reason_check" CHECK (
        ("status" IN ('at_risk', 'paused')) = ("status_reason" IS NOT NULL)
        AND ("status_reason" IS NULL OR char_length(btrim("status_reason")) BETWEEN 3 AND 1000)),
    -- Fuera de planeación, el proyecto ya se inició.
    ADD CONSTRAINT "prj_projects_started_check"
        CHECK (("status" = 'planning') = ("started_at" IS NULL)),
    ADD CONSTRAINT "prj_projects_authorization_check" CHECK (
        "authorization_status" IN ('none', 'requested', 'granted', 'denied')
        AND (("authorization_status" = 'none') = ("authorization_reason" IS NULL))
        AND (("authorization_status" IN ('granted', 'denied'))
             = ("authorization_decided_at" IS NOT NULL))
        AND ("authorization_reason" IS NULL
             OR char_length(btrim("authorization_reason")) BETWEEN 3 AND 1000)),
    ADD CONSTRAINT "prj_projects_version_check" CHECK ("version" > 0);

-- Un contrato tiene a lo sumo un proyecto.
CREATE UNIQUE INDEX "prj_projects_contract_once" ON "prj_projects"("tenant_id", "contract_id")
    WHERE "contract_id" IS NOT NULL AND "deleted_at" IS NULL;

ALTER TABLE "prj_members"
    ADD CONSTRAINT "prj_members_role_check"
        CHECK ("role" IN ('leader', 'analysis', 'development', 'design', 'testing')),
    ADD CONSTRAINT "prj_members_allocation_check" CHECK ("allocation_pct" BETWEEN 1 AND 100),
    ADD CONSTRAINT "prj_members_version_check" CHECK ("version" > 0);

-- Una persona está una sola vez en el equipo; al retirarla puede volver a entrar.
CREATE UNIQUE INDEX "prj_members_once" ON "prj_members"("tenant_id", "project_id", "user_id")
    WHERE "deleted_at" IS NULL;

ALTER TABLE "prj_milestones"
    ADD CONSTRAINT "prj_milestones_name_check" CHECK (char_length(btrim("name")) BETWEEN 3 AND 160),
    ADD CONSTRAINT "prj_milestones_billing_check" CHECK ("billing_pct" BETWEEN 0 AND 100),
    ADD CONSTRAINT "prj_milestones_status_check" CHECK (
        "status" IN ('pending', 'done') AND (("status" = 'done') = ("done_at" IS NOT NULL))),
    ADD CONSTRAINT "prj_milestones_version_check" CHECK ("version" > 0);

ALTER TABLE "prj_sprints"
    ADD CONSTRAINT "prj_sprints_text_check" CHECK (
        char_length(btrim("name")) BETWEEN 3 AND 80
        AND ("goal" IS NULL OR char_length(btrim("goal")) BETWEEN 3 AND 1000)),
    ADD CONSTRAINT "prj_sprints_dates_check" CHECK ("ends_on" >= "starts_on"),
    ADD CONSTRAINT "prj_sprints_status_check" CHECK (
        "status" IN ('planned', 'active', 'closed')
        AND (("status" = 'closed') = ("closed_at" IS NOT NULL))),
    ADD CONSTRAINT "prj_sprints_version_check" CHECK ("version" > 0);

-- Solo una iteración en curso por proyecto.
CREATE UNIQUE INDEX "prj_sprints_one_active" ON "prj_sprints"("tenant_id", "project_id")
    WHERE "status" = 'active' AND "deleted_at" IS NULL;

ALTER TABLE "prj_items"
    ADD CONSTRAINT "prj_items_type_check" CHECK ("type" IN ('epic', 'story', 'task', 'defect')),
    ADD CONSTRAINT "prj_items_status_check" CHECK (
        "status" IN ('pending', 'in_progress', 'in_review', 'in_testing', 'done')),
    ADD CONSTRAINT "prj_items_priority_check"
        CHECK ("priority" IN ('low', 'normal', 'high', 'urgent')),
    ADD CONSTRAINT "prj_items_code_check" CHECK (
        "number" > 0 AND "code" ~ '^PRY-[0-9]{4}-[0-9]{4,8}-[0-9]+$'
        AND "code" LIKE '%-' || "number"::text),
    ADD CONSTRAINT "prj_items_text_check" CHECK (
        char_length(btrim("title")) BETWEEN 3 AND 200
        AND ("description" IS NULL OR char_length(btrim("description")) BETWEEN 3 AND 8000)
        AND ("acceptance_criteria" IS NULL
             OR char_length(btrim("acceptance_criteria")) BETWEEN 3 AND 4000)),
    ADD CONSTRAINT "prj_items_estimate_check"
        CHECK ("estimate_hours" IS NULL OR "estimate_hours" BETWEEN 0.5 AND 999),
    ADD CONSTRAINT "prj_items_parent_check" CHECK ("parent_id" IS NULL OR "parent_id" <> "id"),
    -- Las épicas no entran a iteraciones; un ítem sin criterios de aceptación, tampoco (ficha 17.8).
    ADD CONSTRAINT "prj_items_sprint_check" CHECK (
        "sprint_id" IS NULL OR ("type" <> 'epic' AND "acceptance_criteria" IS NOT NULL)),
    -- Terminado: con la fecha, el enlace a la revisión de código y la nota de pruebas.
    ADD CONSTRAINT "prj_items_done_check" CHECK (
        (("status" = 'done') = ("done_at" IS NOT NULL))
        AND ("status" <> 'done' OR ("review_url" IS NOT NULL AND "test_note" IS NOT NULL))),
    ADD CONSTRAINT "prj_items_evidence_check" CHECK (
        ("review_url" IS NULL OR ("review_url" ~ '^https://' AND char_length("review_url") <= 500))
        AND ("test_note" IS NULL OR char_length(btrim("test_note")) BETWEEN 3 AND 2000)),
    ADD CONSTRAINT "prj_items_version_check" CHECK ("version" > 0);

ALTER TABLE "prj_external_links"
    ADD CONSTRAINT "prj_external_links_kind_check" CHECK ("kind" IN ('repository',
        'test_environment', 'production', 'design', 'documentation', 'other')),
    ADD CONSTRAINT "prj_external_links_url_check"
        CHECK ("url" ~ '^https://' AND char_length("url") <= 500),
    ADD CONSTRAINT "prj_external_links_label_check"
        CHECK (char_length(btrim("label")) BETWEEN 3 AND 120),
    ADD CONSTRAINT "prj_external_links_version_check" CHECK ("version" > 0);

-- El código, el contrato y el cliente de un proyecto no cambian después de creado; tampoco el
-- código, el número, el tipo ni el proyecto de un ítem. Lo revisa la base aunque alguien intente el
-- cambio directo en ella.
CREATE FUNCTION "prj_keep_projects"() RETURNS TRIGGER
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF (NEW.code, NEW.contract_id, NEW.party_id)
        IS DISTINCT FROM (OLD.code, OLD.contract_id, OLD.party_id) THEN
        RAISE EXCEPTION 'El código, el contrato y el cliente de un proyecto no cambian.'
            USING ERRCODE = 'check_violation', CONSTRAINT = 'prj_projects_identity_keep';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "prj_projects_keep"
    BEFORE UPDATE ON "prj_projects"
    FOR EACH ROW EXECUTE FUNCTION "prj_keep_projects"();

CREATE FUNCTION "prj_keep_items"() RETURNS TRIGGER
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF (NEW.project_id, NEW.number, NEW.code, NEW.type)
        IS DISTINCT FROM (OLD.project_id, OLD.number, OLD.code, OLD.type) THEN
        RAISE EXCEPTION 'El proyecto, el código y el tipo de un ítem no cambian.'
            USING ERRCODE = 'check_violation', CONSTRAINT = 'prj_items_identity_keep';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "prj_items_keep"
    BEFORE UPDATE ON "prj_items"
    FOR EACH ROW EXECUTE FUNCTION "prj_keep_items"();

-- Columnas de control --------------------------------------------------------------------------

CREATE TRIGGER "prj_projects_control_columns"
    BEFORE INSERT OR UPDATE ON "prj_projects"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();
CREATE TRIGGER "prj_members_control_columns"
    BEFORE INSERT OR UPDATE ON "prj_members"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();
CREATE TRIGGER "prj_milestones_control_columns"
    BEFORE INSERT OR UPDATE ON "prj_milestones"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();
CREATE TRIGGER "prj_sprints_control_columns"
    BEFORE INSERT OR UPDATE ON "prj_sprints"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();
CREATE TRIGGER "prj_items_control_columns"
    BEFORE INSERT OR UPDATE ON "prj_items"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();
CREATE TRIGGER "prj_external_links_control_columns"
    BEFORE INSERT OR UPDATE ON "prj_external_links"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();

-- Seguridad por fila (ADR-007) -----------------------------------------------------------------

ALTER TABLE "prj_projects" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "prj_projects" FORCE ROW LEVEL SECURITY;
CREATE POLICY "prj_projects_tenant_isolation" ON "prj_projects"
    USING ("tenant_id" = core_current_tenant_id())
    WITH CHECK ("tenant_id" = core_current_tenant_id());

ALTER TABLE "prj_members" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "prj_members" FORCE ROW LEVEL SECURITY;
CREATE POLICY "prj_members_tenant_isolation" ON "prj_members"
    USING ("tenant_id" = core_current_tenant_id())
    WITH CHECK ("tenant_id" = core_current_tenant_id());

ALTER TABLE "prj_milestones" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "prj_milestones" FORCE ROW LEVEL SECURITY;
CREATE POLICY "prj_milestones_tenant_isolation" ON "prj_milestones"
    USING ("tenant_id" = core_current_tenant_id())
    WITH CHECK ("tenant_id" = core_current_tenant_id());

ALTER TABLE "prj_sprints" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "prj_sprints" FORCE ROW LEVEL SECURITY;
CREATE POLICY "prj_sprints_tenant_isolation" ON "prj_sprints"
    USING ("tenant_id" = core_current_tenant_id())
    WITH CHECK ("tenant_id" = core_current_tenant_id());

ALTER TABLE "prj_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "prj_items" FORCE ROW LEVEL SECURITY;
CREATE POLICY "prj_items_tenant_isolation" ON "prj_items"
    USING ("tenant_id" = core_current_tenant_id())
    WITH CHECK ("tenant_id" = core_current_tenant_id());

ALTER TABLE "prj_external_links" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "prj_external_links" FORCE ROW LEVEL SECURITY;
CREATE POLICY "prj_external_links_tenant_isolation" ON "prj_external_links"
    USING ("tenant_id" = core_current_tenant_id())
    WITH CHECK ("tenant_id" = core_current_tenant_id());

-- Permisos de la API ---------------------------------------------------------------------------
-- Sin DELETE: retirar un miembro, un hito o un enlace marca deleted_at y queda en la auditoría.

GRANT SELECT, INSERT, UPDATE ON "prj_projects" TO app_user;
GRANT SELECT, INSERT, UPDATE ON "prj_members" TO app_user;
GRANT SELECT, INSERT, UPDATE ON "prj_milestones" TO app_user;
GRANT SELECT, INSERT, UPDATE ON "prj_sprints" TO app_user;
GRANT SELECT, INSERT, UPDATE ON "prj_items" TO app_user;
GRANT SELECT, INSERT, UPDATE ON "prj_external_links" TO app_user;
