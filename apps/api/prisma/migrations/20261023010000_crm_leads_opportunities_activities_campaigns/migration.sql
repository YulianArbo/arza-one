-- B22: CRM (M05, ficha 17.6, numeral 12.4). Campañas (crm_campaigns), prospectos (crm_leads),
-- oportunidades del embudo (crm_opportunities) y actividades con recordatorio (crm_activities). La
-- persona de un prospecto es un tercero (pty_parties) y su autorización vive en prv_consents: el CRM
-- guarda sus identificadores, sin llaves hacia tablas de otros módulos (numeral 8.3).
-- CreateTable
CREATE TABLE "crm_campaigns" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "starts_on" DATE NOT NULL,
    "ends_on" DATE,
    "budget" DECIMAL(18,2),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "crm_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_leads" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "campaign_id" UUID,
    "party_id" UUID NOT NULL,
    "company_name" TEXT,
    "need" TEXT NOT NULL,
    "consent_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'new',
    "owner_id" UUID,
    "discard_reason" TEXT,
    "discard_note" TEXT,
    "workflow_instance_id" UUID,
    "qualified_at" TIMESTAMPTZ(6),
    "closed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "crm_leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_opportunities" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "party_id" UUID NOT NULL,
    "lead_id" UUID,
    "title" TEXT NOT NULL,
    "stage" TEXT NOT NULL DEFAULT 'prospecting',
    "estimated_value" DECIMAL(18,2) NOT NULL,
    "probability" SMALLINT NOT NULL,
    "expected_close" DATE NOT NULL,
    "owner_id" UUID,
    "lost_reason" TEXT,
    "lost_note" TEXT,
    "closed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "crm_opportunities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_activities" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "lead_id" UUID,
    "opportunity_id" UUID,
    "type" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "notes" TEXT,
    "due_at" TIMESTAMPTZ(6) NOT NULL,
    "done_at" TIMESTAMPTZ(6),
    "outcome" TEXT,
    "assignee_id" UUID,
    "reminded_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "crm_activities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "crm_campaigns_tenant_id_id_key" ON "crm_campaigns"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "crm_campaigns_tenant_id_name_key" ON "crm_campaigns"("tenant_id", "name");

-- CreateIndex
CREATE INDEX "crm_leads_tenant_id_status_idx" ON "crm_leads"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "crm_leads_tenant_id_party_id_idx" ON "crm_leads"("tenant_id", "party_id");

-- CreateIndex
CREATE INDEX "crm_leads_tenant_id_campaign_id_idx" ON "crm_leads"("tenant_id", "campaign_id");

-- CreateIndex
CREATE INDEX "crm_leads_tenant_id_owner_id_idx" ON "crm_leads"("tenant_id", "owner_id");

-- CreateIndex
CREATE UNIQUE INDEX "crm_leads_tenant_id_id_key" ON "crm_leads"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "crm_leads_tenant_id_code_key" ON "crm_leads"("tenant_id", "code");

-- CreateIndex
CREATE INDEX "crm_opportunities_tenant_id_stage_idx" ON "crm_opportunities"("tenant_id", "stage");

-- CreateIndex
CREATE INDEX "crm_opportunities_tenant_id_party_id_idx" ON "crm_opportunities"("tenant_id", "party_id");

-- CreateIndex
CREATE INDEX "crm_opportunities_tenant_id_owner_id_idx" ON "crm_opportunities"("tenant_id", "owner_id");

-- CreateIndex
CREATE INDEX "crm_opportunities_tenant_id_created_at_idx" ON "crm_opportunities"("tenant_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "crm_opportunities_tenant_id_id_key" ON "crm_opportunities"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "crm_opportunities_tenant_id_code_key" ON "crm_opportunities"("tenant_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "crm_opportunities_tenant_id_lead_id_key" ON "crm_opportunities"("tenant_id", "lead_id");

-- CreateIndex
CREATE INDEX "crm_activities_tenant_id_lead_id_idx" ON "crm_activities"("tenant_id", "lead_id");

-- CreateIndex
CREATE INDEX "crm_activities_tenant_id_opportunity_id_idx" ON "crm_activities"("tenant_id", "opportunity_id");

-- CreateIndex
CREATE INDEX "crm_activities_tenant_id_assignee_id_done_at_idx" ON "crm_activities"("tenant_id", "assignee_id", "done_at");

-- CreateIndex
CREATE INDEX "crm_activities_tenant_id_due_at_idx" ON "crm_activities"("tenant_id", "due_at");

-- CreateIndex
CREATE UNIQUE INDEX "crm_activities_tenant_id_id_key" ON "crm_activities"("tenant_id", "id");

-- AddForeignKey
ALTER TABLE "crm_campaigns" ADD CONSTRAINT "crm_campaigns_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_leads" ADD CONSTRAINT "crm_leads_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_leads" ADD CONSTRAINT "crm_leads_tenant_id_campaign_id_fkey" FOREIGN KEY ("tenant_id", "campaign_id") REFERENCES "crm_campaigns"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_opportunities" ADD CONSTRAINT "crm_opportunities_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_opportunities" ADD CONSTRAINT "crm_opportunities_tenant_id_lead_id_fkey" FOREIGN KEY ("tenant_id", "lead_id") REFERENCES "crm_leads"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_activities" ADD CONSTRAINT "crm_activities_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_activities" ADD CONSTRAINT "crm_activities_tenant_id_lead_id_fkey" FOREIGN KEY ("tenant_id", "lead_id") REFERENCES "crm_leads"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_activities" ADD CONSTRAINT "crm_activities_tenant_id_opportunity_id_fkey" FOREIGN KEY ("tenant_id", "opportunity_id") REFERENCES "crm_opportunities"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Reglas de los datos -------------------------------------------------------------------------
-- Los valores permitidos son los de packages/contracts/src/crm.

ALTER TABLE "crm_campaigns"
    ADD CONSTRAINT "crm_campaigns_name_check" CHECK (char_length(btrim("name")) BETWEEN 3 AND 160),
    ADD CONSTRAINT "crm_campaigns_channel_check"
        CHECK ("channel" IN ('email', 'social', 'event', 'website', 'ads', 'other')),
    ADD CONSTRAINT "crm_campaigns_dates_check" CHECK ("ends_on" IS NULL OR "ends_on" >= "starts_on"),
    ADD CONSTRAINT "crm_campaigns_budget_check" CHECK ("budget" IS NULL OR "budget" >= 0),
    ADD CONSTRAINT "crm_campaigns_version_check" CHECK ("version" > 0);

ALTER TABLE "crm_leads"
    ADD CONSTRAINT "crm_leads_code_check" CHECK ("code" ~ '^LEA-[0-9]{4}-[0-9]{4,8}$'),
    ADD CONSTRAINT "crm_leads_source_check" CHECK ("source" ~ '^[A-Z0-9][A-Z0-9_-]{0,19}$'),
    ADD CONSTRAINT "crm_leads_company_name_check"
        CHECK ("company_name" IS NULL OR char_length(btrim("company_name")) BETWEEN 2 AND 160),
    ADD CONSTRAINT "crm_leads_need_check" CHECK (char_length(btrim("need")) BETWEEN 3 AND 2000),
    ADD CONSTRAINT "crm_leads_status_check"
        CHECK ("status" IN ('new', 'qualified', 'converted', 'discarded')),
    -- Calificado o convertido, con la fecha en que se calificó; uno nuevo todavía no.
    ADD CONSTRAINT "crm_leads_qualified_check" CHECK (
        ("status" NOT IN ('qualified', 'converted') OR "qualified_at" IS NOT NULL)
        AND ("status" <> 'new' OR "qualified_at" IS NULL)),
    -- Convertido o descartado es cerrado; descartado lleva su motivo.
    ADD CONSTRAINT "crm_leads_closed_check"
        CHECK (("status" IN ('converted', 'discarded')) = ("closed_at" IS NOT NULL)),
    ADD CONSTRAINT "crm_leads_discard_check" CHECK (
        (("status" = 'discarded') = ("discard_reason" IS NOT NULL))
        AND ("discard_reason" IS NULL OR "discard_reason" ~ '^[A-Z0-9][A-Z0-9_-]{0,19}$')
        AND ("discard_note" IS NULL
            OR ("status" = 'discarded' AND char_length(btrim("discard_note")) BETWEEN 3 AND 2000))),
    ADD CONSTRAINT "crm_leads_version_check" CHECK ("version" > 0);

ALTER TABLE "crm_opportunities"
    ADD CONSTRAINT "crm_opportunities_code_check" CHECK ("code" ~ '^OPO-[0-9]{4}-[0-9]{4,8}$'),
    ADD CONSTRAINT "crm_opportunities_title_check" CHECK (char_length(btrim("title")) BETWEEN 3 AND 200),
    ADD CONSTRAINT "crm_opportunities_stage_check" CHECK ("stage" IN (
        'prospecting', 'diagnosis', 'proposal', 'negotiation', 'won', 'lost')),
    ADD CONSTRAINT "crm_opportunities_value_check" CHECK ("estimated_value" >= 0),
    ADD CONSTRAINT "crm_opportunities_probability_check" CHECK (
        "probability" BETWEEN 0 AND 100
        AND ("stage" <> 'won' OR "probability" = 100)
        AND ("stage" <> 'lost' OR "probability" = 0)),
    ADD CONSTRAINT "crm_opportunities_closed_check"
        CHECK (("stage" IN ('won', 'lost')) = ("closed_at" IS NOT NULL)),
    -- Una oportunidad perdida exige motivo (ficha 17.6).
    ADD CONSTRAINT "crm_opportunities_lost_check" CHECK (
        (("stage" = 'lost') = ("lost_reason" IS NOT NULL))
        AND ("lost_reason" IS NULL OR "lost_reason" ~ '^[A-Z0-9][A-Z0-9_-]{0,19}$')
        AND ("lost_note" IS NULL
            OR ("stage" = 'lost' AND char_length(btrim("lost_note")) BETWEEN 3 AND 2000))),
    ADD CONSTRAINT "crm_opportunities_version_check" CHECK ("version" > 0);

ALTER TABLE "crm_activities"
    ADD CONSTRAINT "crm_activities_type_check" CHECK ("type" IN ('call', 'meeting', 'task', 'email')),
    ADD CONSTRAINT "crm_activities_subject_check" CHECK (char_length(btrim("subject")) BETWEEN 3 AND 200),
    ADD CONSTRAINT "crm_activities_notes_check"
        CHECK ("notes" IS NULL OR char_length(btrim("notes")) BETWEEN 1 AND 2000),
    -- De un prospecto o de una oportunidad, nunca de los dos.
    ADD CONSTRAINT "crm_activities_record_check"
        CHECK (("lead_id" IS NULL) <> ("opportunity_id" IS NULL)),
    -- Hecha, con su resultado.
    ADD CONSTRAINT "crm_activities_done_check" CHECK (
        (("done_at" IS NULL) = ("outcome" IS NULL))
        AND ("outcome" IS NULL OR char_length(btrim("outcome")) BETWEEN 3 AND 2000)),
    ADD CONSTRAINT "crm_activities_version_check" CHECK ("version" > 0);

-- Un prospecto cerrado y una oportunidad ganada o perdida ya no cambian; solo se pueden borrar
-- lógicamente. Lo revisa la base aunque alguien intente el cambio directo en ella.
CREATE FUNCTION "crm_keep_closed_leads"() RETURNS TRIGGER
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF OLD.status IN ('converted', 'discarded')
        AND (NEW.status, NEW.party_id, NEW.need, NEW.source, NEW.campaign_id, NEW.company_name,
             NEW.owner_id, NEW.discard_reason, NEW.discard_note, NEW.closed_at)
            IS DISTINCT FROM
            (OLD.status, OLD.party_id, OLD.need, OLD.source, OLD.campaign_id, OLD.company_name,
             OLD.owner_id, OLD.discard_reason, OLD.discard_note, OLD.closed_at) THEN
        RAISE EXCEPTION 'Un prospecto convertido o descartado no cambia.'
            USING ERRCODE = 'check_violation', CONSTRAINT = 'crm_leads_closed_keep';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "crm_leads_keep"
    BEFORE UPDATE ON "crm_leads"
    FOR EACH ROW EXECUTE FUNCTION "crm_keep_closed_leads"();

CREATE FUNCTION "crm_keep_closed_opportunities"() RETURNS TRIGGER
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF OLD.stage IN ('won', 'lost')
        AND (NEW.stage, NEW.party_id, NEW.title, NEW.estimated_value, NEW.probability,
             NEW.expected_close, NEW.owner_id, NEW.lost_reason, NEW.lost_note, NEW.closed_at)
            IS DISTINCT FROM
            (OLD.stage, OLD.party_id, OLD.title, OLD.estimated_value, OLD.probability,
             OLD.expected_close, OLD.owner_id, OLD.lost_reason, OLD.lost_note, OLD.closed_at) THEN
        RAISE EXCEPTION 'Una oportunidad ganada o perdida no cambia.'
            USING ERRCODE = 'check_violation', CONSTRAINT = 'crm_opportunities_closed_keep';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "crm_opportunities_keep"
    BEFORE UPDATE ON "crm_opportunities"
    FOR EACH ROW EXECUTE FUNCTION "crm_keep_closed_opportunities"();

-- Las autorizaciones también llegan de los prospectos del CRM.
ALTER TABLE "prv_consents" DROP CONSTRAINT "prv_consents_source_check";
ALTER TABLE "prv_consents" ADD CONSTRAINT "prv_consents_source_check"
    CHECK ("source" IN ('party_create', 'party_consent', 'prior_record', 'crm_lead'));

-- Columnas de control --------------------------------------------------------------------------

CREATE TRIGGER "crm_campaigns_control_columns"
    BEFORE INSERT OR UPDATE ON "crm_campaigns"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();
CREATE TRIGGER "crm_leads_control_columns"
    BEFORE INSERT OR UPDATE ON "crm_leads"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();
CREATE TRIGGER "crm_opportunities_control_columns"
    BEFORE INSERT OR UPDATE ON "crm_opportunities"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();
CREATE TRIGGER "crm_activities_control_columns"
    BEFORE INSERT OR UPDATE ON "crm_activities"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();

-- Seguridad por fila (ADR-007) -----------------------------------------------------------------

ALTER TABLE "crm_campaigns" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "crm_campaigns" FORCE ROW LEVEL SECURITY;
CREATE POLICY "crm_campaigns_tenant_isolation" ON "crm_campaigns"
    USING ("tenant_id" = core_current_tenant_id())
    WITH CHECK ("tenant_id" = core_current_tenant_id());

ALTER TABLE "crm_leads" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "crm_leads" FORCE ROW LEVEL SECURITY;
CREATE POLICY "crm_leads_tenant_isolation" ON "crm_leads"
    USING ("tenant_id" = core_current_tenant_id())
    WITH CHECK ("tenant_id" = core_current_tenant_id());

ALTER TABLE "crm_opportunities" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "crm_opportunities" FORCE ROW LEVEL SECURITY;
CREATE POLICY "crm_opportunities_tenant_isolation" ON "crm_opportunities"
    USING ("tenant_id" = core_current_tenant_id())
    WITH CHECK ("tenant_id" = core_current_tenant_id());

ALTER TABLE "crm_activities" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "crm_activities" FORCE ROW LEVEL SECURITY;
CREATE POLICY "crm_activities_tenant_isolation" ON "crm_activities"
    USING ("tenant_id" = core_current_tenant_id())
    WITH CHECK ("tenant_id" = core_current_tenant_id());

-- Permisos de la API ---------------------------------------------------------------------------
-- Sin DELETE: el borrado es lógico.

GRANT SELECT, INSERT, UPDATE ON "crm_campaigns" TO app_user;
GRANT SELECT, INSERT, UPDATE ON "crm_leads" TO app_user;
GRANT SELECT, INSERT, UPDATE ON "crm_opportunities" TO app_user;
GRANT SELECT, INSERT, UPDATE ON "crm_activities" TO app_user;

-- Trabajos del worker --------------------------------------------------------------------------
-- El worker avisa cada minuto las actividades que empiezan en los próximos 30 minutos. Para saber
-- en qué empresas hay avisos pendientes, sin leer nada más fuera de la seguridad por fila, solo
-- obtiene los identificadores de esas empresas, igual que wf_tenants_with_overdue_tasks (B15).

CREATE POLICY "crm_activities_reminder_lookup" ON "crm_activities"
    FOR SELECT TO migration_user USING (true);

CREATE FUNCTION "crm_tenants_with_due_reminders"(until TIMESTAMPTZ) RETURNS SETOF UUID
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
    AS $$ SELECT DISTINCT tenant_id FROM crm_activities
          WHERE done_at IS NULL AND reminded_at IS NULL AND assignee_id IS NOT NULL
              AND due_at <= until AND deleted_at IS NULL
          ORDER BY tenant_id $$;

REVOKE EXECUTE ON FUNCTION "crm_tenants_with_due_reminders"(TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "crm_tenants_with_due_reminders"(TIMESTAMPTZ) TO app_user;
