-- B23: portafolio y cotizaciones (M05, ficha 17.6, numeral 12.4). Servicios del portafolio
-- (crm_services), cotizaciones con sus versiones (crm_quotes) y sus ítems (crm_quote_items), y los
-- parámetros tributarios vigentes (fin_tax_parameters), que llegan antes que Finanzas (B31) porque
-- las cotizaciones calculan el impuesto con ellos. La cotización guarda el cliente (pty_parties) y su
-- PDF (doc_files) por identificador, sin llaves hacia tablas de otros módulos (numeral 8.3). Solo
-- expande: la versión anterior no lee ni escribe estas tablas.
-- CreateTable
CREATE TABLE "crm_services" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "unit" TEXT NOT NULL,
    "base_price" DECIMAL(18,2) NOT NULL,
    "tax_key" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "crm_services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_quotes" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "version_number" INTEGER NOT NULL,
    "previous_id" UUID,
    "opportunity_id" UUID NOT NULL,
    "party_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "valid_until" DATE NOT NULL,
    "payment_terms" TEXT NOT NULL,
    "delivery_terms" TEXT NOT NULL,
    "warranty" TEXT,
    "notes" TEXT,
    "subtotal" DECIMAL(18,2) NOT NULL,
    "discount_total" DECIMAL(18,2) NOT NULL,
    "tax_total" DECIMAL(18,2) NOT NULL,
    "total" DECIMAL(18,2) NOT NULL,
    "largest_discount" DECIMAL(5,2) NOT NULL,
    "discount_cap" DECIMAL(5,2),
    "requires_approval" BOOLEAN NOT NULL DEFAULT false,
    "workflow_instance_id" UUID,
    "submitted_at" TIMESTAMPTZ(6),
    "decided_by" UUID,
    "decided_at" TIMESTAMPTZ(6),
    "decision_note" TEXT,
    "pdf_status" TEXT NOT NULL DEFAULT 'none',
    "pdf_file_id" UUID,
    "pdf_sha256" TEXT,
    "recipient_name" TEXT,
    "recipient_email" TEXT,
    "sent_by" UUID,
    "sent_at" TIMESTAMPTZ(6),
    "email_sent_at" TIMESTAMPTZ(6),
    "link_token_hash" TEXT,
    "link_expires_at" TIMESTAMPTZ(6),
    "response" TEXT,
    "responded_at" TIMESTAMPTZ(6),
    "responded_by_name" TEXT,
    "response_reason" TEXT,
    "response_ip" TEXT,
    "response_user_agent" TEXT,
    "response_pdf_sha256" TEXT,
    "closed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "crm_quotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_quote_items" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "quote_id" UUID NOT NULL,
    "position" SMALLINT NOT NULL,
    "service_id" UUID,
    "description" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "quantity" DECIMAL(9,2) NOT NULL,
    "unit_price" DECIMAL(18,2) NOT NULL,
    "discount_percent" DECIMAL(5,2) NOT NULL,
    "tax_key" TEXT NOT NULL,
    "tax_rate" DECIMAL(5,2) NOT NULL,
    "line_subtotal" DECIMAL(18,2) NOT NULL,
    "line_discount" DECIMAL(18,2) NOT NULL,
    "line_tax" DECIMAL(18,2) NOT NULL,
    "line_total" DECIMAL(18,2) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "crm_quote_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fin_tax_parameters" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "rate" DECIMAL(5,2) NOT NULL,
    "valid_from" DATE NOT NULL,
    "valid_to" DATE,
    "legal_basis" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "fin_tax_parameters_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "crm_services_tenant_id_id_key" ON "crm_services"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "crm_services_tenant_id_code_key" ON "crm_services"("tenant_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "crm_services_tenant_id_name_key" ON "crm_services"("tenant_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "crm_quotes_link_token_hash_key" ON "crm_quotes"("link_token_hash");

-- CreateIndex
CREATE INDEX "crm_quotes_tenant_id_opportunity_id_idx" ON "crm_quotes"("tenant_id", "opportunity_id");

-- CreateIndex
CREATE INDEX "crm_quotes_tenant_id_status_idx" ON "crm_quotes"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "crm_quotes_tenant_id_created_at_idx" ON "crm_quotes"("tenant_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "crm_quotes_tenant_id_id_key" ON "crm_quotes"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "crm_quotes_tenant_id_code_version_number_key" ON "crm_quotes"("tenant_id", "code", "version_number");

-- CreateIndex
CREATE INDEX "crm_quote_items_tenant_id_quote_id_idx" ON "crm_quote_items"("tenant_id", "quote_id");

-- CreateIndex
CREATE INDEX "crm_quote_items_tenant_id_service_id_idx" ON "crm_quote_items"("tenant_id", "service_id");

-- CreateIndex
CREATE UNIQUE INDEX "crm_quote_items_tenant_id_id_key" ON "crm_quote_items"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "fin_tax_parameters_tenant_id_id_key" ON "fin_tax_parameters"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "fin_tax_parameters_tenant_id_key_valid_from_key" ON "fin_tax_parameters"("tenant_id", "key", "valid_from");

-- AddForeignKey
ALTER TABLE "crm_services" ADD CONSTRAINT "crm_services_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_quotes" ADD CONSTRAINT "crm_quotes_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_quotes" ADD CONSTRAINT "crm_quotes_tenant_id_opportunity_id_fkey" FOREIGN KEY ("tenant_id", "opportunity_id") REFERENCES "crm_opportunities"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_quotes" ADD CONSTRAINT "crm_quotes_tenant_id_previous_id_fkey" FOREIGN KEY ("tenant_id", "previous_id") REFERENCES "crm_quotes"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_quote_items" ADD CONSTRAINT "crm_quote_items_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_quote_items" ADD CONSTRAINT "crm_quote_items_tenant_id_quote_id_fkey" FOREIGN KEY ("tenant_id", "quote_id") REFERENCES "crm_quotes"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_quote_items" ADD CONSTRAINT "crm_quote_items_tenant_id_service_id_fkey" FOREIGN KEY ("tenant_id", "service_id") REFERENCES "crm_services"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fin_tax_parameters" ADD CONSTRAINT "fin_tax_parameters_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Reglas de los datos -------------------------------------------------------------------------
-- Los valores permitidos son los de packages/contracts/src/crm y src/finance.

ALTER TABLE "fin_tax_parameters"
    ADD CONSTRAINT "fin_tax_parameters_key_check" CHECK ("key" ~ '^[A-Z][A-Z0-9_]{1,39}$'),
    ADD CONSTRAINT "fin_tax_parameters_label_check" CHECK (char_length(btrim("label")) BETWEEN 3 AND 120),
    ADD CONSTRAINT "fin_tax_parameters_rate_check" CHECK ("rate" BETWEEN 0 AND 100),
    ADD CONSTRAINT "fin_tax_parameters_dates_check" CHECK ("valid_to" IS NULL OR "valid_to" >= "valid_from"),
    ADD CONSTRAINT "fin_tax_parameters_legal_basis_check"
        CHECK (char_length(btrim("legal_basis")) BETWEEN 5 AND 500),
    ADD CONSTRAINT "fin_tax_parameters_version_check" CHECK ("version" > 0);

ALTER TABLE "crm_services"
    ADD CONSTRAINT "crm_services_code_check" CHECK ("code" ~ '^SRV-[0-9]{4,8}$'),
    ADD CONSTRAINT "crm_services_name_check" CHECK (char_length(btrim("name")) BETWEEN 3 AND 160),
    ADD CONSTRAINT "crm_services_description_check"
        CHECK ("description" IS NULL OR char_length("description") <= 2000),
    ADD CONSTRAINT "crm_services_unit_check"
        CHECK ("unit" IN ('hour', 'day', 'month', 'project', 'unit', 'license')),
    ADD CONSTRAINT "crm_services_price_check" CHECK ("base_price" >= 0),
    ADD CONSTRAINT "crm_services_tax_key_check" CHECK ("tax_key" ~ '^[A-Z][A-Z0-9_]{1,39}$'),
    ADD CONSTRAINT "crm_services_version_check" CHECK ("version" > 0);

ALTER TABLE "crm_quotes"
    ADD CONSTRAINT "crm_quotes_code_check" CHECK ("code" ~ '^COT-[0-9]{4}-[0-9]{4,8}$'),
    ADD CONSTRAINT "crm_quotes_version_number_check" CHECK ("version_number" > 0),
    -- La primera versión no tiene anterior; las demás, sí.
    ADD CONSTRAINT "crm_quotes_previous_check"
        CHECK (("version_number" = 1) = ("previous_id" IS NULL)),
    ADD CONSTRAINT "crm_quotes_status_check" CHECK ("status" IN ('draft', 'in_approval', 'approved',
        'sent', 'accepted', 'rejected', 'expired', 'superseded')),
    ADD CONSTRAINT "crm_quotes_terms_check" CHECK (
        char_length(btrim("payment_terms")) BETWEEN 3 AND 500
        AND char_length(btrim("delivery_terms")) BETWEEN 3 AND 500
        AND ("warranty" IS NULL OR char_length(btrim("warranty")) BETWEEN 3 AND 500)
        AND ("notes" IS NULL OR char_length(btrim("notes")) BETWEEN 3 AND 2000)),
    -- El total es el subtotal menos los descuentos más los impuestos.
    ADD CONSTRAINT "crm_quotes_totals_check" CHECK (
        "subtotal" >= 0 AND "discount_total" >= 0 AND "tax_total" >= 0
        AND "discount_total" <= "subtotal"
        AND "total" = "subtotal" - "discount_total" + "tax_total"),
    ADD CONSTRAINT "crm_quotes_discount_check" CHECK (
        "largest_discount" BETWEEN 0 AND 100
        AND ("discount_cap" IS NULL OR "discount_cap" BETWEEN 0 AND 100)),
    -- Fuera de borrador ya se pidió el envío, con el tope vigente de ese momento.
    ADD CONSTRAINT "crm_quotes_submitted_check" CHECK (("status" = 'draft') = ("submitted_at" IS NULL)),
    ADD CONSTRAINT "crm_quotes_pdf_check" CHECK (
        "pdf_status" IN ('none', 'pending', 'ready')
        AND (("pdf_status" = 'ready') = ("pdf_file_id" IS NOT NULL))
        AND (("pdf_status" = 'ready') = ("pdf_sha256" IS NOT NULL))),
    -- Enviada, aceptada, rechazada o vencida: se envió a alguien, con su PDF.
    ADD CONSTRAINT "crm_quotes_sent_check" CHECK (
        "status" NOT IN ('sent', 'accepted', 'rejected', 'expired')
        OR ("sent_at" IS NOT NULL AND "recipient_email" IS NOT NULL AND "pdf_status" = 'ready')),
    ADD CONSTRAINT "crm_quotes_recipient_check" CHECK (
        ("recipient_name" IS NULL) = ("recipient_email" IS NULL)
        AND ("recipient_email" IS NULL OR char_length("recipient_email") <= 254)),
    -- Aceptada o rechazada, con la evidencia; aceptada, con el nombre de quien aceptó.
    ADD CONSTRAINT "crm_quotes_response_check" CHECK (
        (("status" IN ('accepted', 'rejected')) = ("response" IS NOT NULL))
        AND ("response" IS NULL OR "response" = "status")
        AND (("response" IS NULL) = ("responded_at" IS NULL))
        AND ("status" <> 'accepted' OR "responded_by_name" IS NOT NULL)
        AND ("response_reason" IS NULL OR char_length(btrim("response_reason")) BETWEEN 3 AND 1000)),
    -- Aceptada, rechazada, vencida o reemplazada es cerrada.
    ADD CONSTRAINT "crm_quotes_closed_check" CHECK (
        ("status" IN ('accepted', 'rejected', 'expired', 'superseded')) = ("closed_at" IS NOT NULL)),
    ADD CONSTRAINT "crm_quotes_version_check" CHECK ("version" > 0);

ALTER TABLE "crm_quote_items"
    ADD CONSTRAINT "crm_quote_items_position_check" CHECK ("position" BETWEEN 1 AND 100),
    ADD CONSTRAINT "crm_quote_items_description_check"
        CHECK (char_length(btrim("description")) BETWEEN 3 AND 500),
    ADD CONSTRAINT "crm_quote_items_unit_check"
        CHECK ("unit" IN ('hour', 'day', 'month', 'project', 'unit', 'license')),
    ADD CONSTRAINT "crm_quote_items_amounts_check" CHECK (
        "quantity" > 0 AND "unit_price" >= 0
        AND "discount_percent" BETWEEN 0 AND 100 AND "tax_rate" BETWEEN 0 AND 100
        AND "line_subtotal" >= 0 AND "line_discount" BETWEEN 0 AND "line_subtotal"
        AND "line_tax" >= 0
        AND "line_total" = "line_subtotal" - "line_discount" + "line_tax"),
    ADD CONSTRAINT "crm_quote_items_tax_key_check" CHECK ("tax_key" ~ '^[A-Z][A-Z0-9_]{1,39}$'),
    ADD CONSTRAINT "crm_quote_items_version_check" CHECK ("version" > 0);

-- Una cotización enviada no se edita (ficha 17.6): fuera de borrador, su contenido no cambia, y
-- una cerrada no cambia nada más. Los ítems solo se escriben mientras su cotización es borrador. Lo
-- revisa la base aunque alguien intente el cambio directo en ella.
CREATE FUNCTION "crm_keep_quotes"() RETURNS TRIGGER
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF OLD.status <> 'draft'
        AND (NEW.code, NEW.version_number, NEW.previous_id, NEW.opportunity_id, NEW.party_id,
             NEW.valid_until, NEW.payment_terms, NEW.delivery_terms, NEW.warranty, NEW.notes,
             NEW.subtotal, NEW.discount_total, NEW.tax_total, NEW.total, NEW.largest_discount)
            IS DISTINCT FROM
            (OLD.code, OLD.version_number, OLD.previous_id, OLD.opportunity_id, OLD.party_id,
             OLD.valid_until, OLD.payment_terms, OLD.delivery_terms, OLD.warranty, OLD.notes,
             OLD.subtotal, OLD.discount_total, OLD.tax_total, OLD.total, OLD.largest_discount) THEN
        RAISE EXCEPTION 'Una cotización fuera de borrador no se edita: cree una versión nueva.'
            USING ERRCODE = 'check_violation', CONSTRAINT = 'crm_quotes_content_keep';
    END IF;
    IF OLD.status IN ('accepted', 'rejected', 'expired', 'superseded')
        AND (NEW.status, NEW.response, NEW.responded_at, NEW.responded_by_name, NEW.response_reason,
             NEW.response_ip, NEW.response_user_agent, NEW.response_pdf_sha256, NEW.closed_at,
             NEW.link_token_hash, NEW.pdf_file_id, NEW.recipient_email, NEW.sent_at)
            IS DISTINCT FROM
            (OLD.status, OLD.response, OLD.responded_at, OLD.responded_by_name, OLD.response_reason,
             OLD.response_ip, OLD.response_user_agent, OLD.response_pdf_sha256, OLD.closed_at,
             OLD.link_token_hash, OLD.pdf_file_id, OLD.recipient_email, OLD.sent_at) THEN
        RAISE EXCEPTION 'Una cotización aceptada, rechazada, vencida o reemplazada no cambia.'
            USING ERRCODE = 'check_violation', CONSTRAINT = 'crm_quotes_closed_keep';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "crm_quotes_keep"
    BEFORE UPDATE ON "crm_quotes"
    FOR EACH ROW EXECUTE FUNCTION "crm_keep_quotes"();

CREATE FUNCTION "crm_keep_quote_items"() RETURNS TRIGGER
    LANGUAGE plpgsql
    AS $$
DECLARE
    quote_status TEXT;
BEGIN
    SELECT status INTO quote_status FROM crm_quotes
     WHERE id = COALESCE(NEW.quote_id, OLD.quote_id) AND tenant_id = COALESCE(NEW.tenant_id, OLD.tenant_id);
    IF quote_status IS DISTINCT FROM 'draft' THEN
        RAISE EXCEPTION 'Los ítems de una cotización fuera de borrador no cambian.'
            USING ERRCODE = 'check_violation', CONSTRAINT = 'crm_quote_items_keep';
    END IF;
    RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER "crm_quote_items_keep"
    BEFORE INSERT OR UPDATE ON "crm_quote_items"
    FOR EACH ROW EXECUTE FUNCTION "crm_keep_quote_items"();

-- Aviso nuevo: la novedad de una cotización para quien la elaboró.
ALTER TABLE "ntf_templates" DROP CONSTRAINT "ntf_templates_key_check";
ALTER TABLE "ntf_notifications" DROP CONSTRAINT "ntf_notifications_kind_check";
ALTER TABLE "ntf_preferences" DROP CONSTRAINT "ntf_preferences_event_key_check";
ALTER TABLE "ntf_templates"
    ADD CONSTRAINT "ntf_templates_key_check" CHECK ("key" IN ('task_assigned', 'task_escalated',
        'comment_mention', 'security_alert', 'doc_read_requested', 'doc_request_decided',
        'crm_activity_due', 'crm_quote_update'));
ALTER TABLE "ntf_notifications"
    ADD CONSTRAINT "ntf_notifications_kind_check" CHECK ("kind" IN ('task_assigned', 'task_escalated',
        'comment_mention', 'security_alert', 'doc_read_requested', 'doc_request_decided',
        'crm_activity_due', 'crm_quote_update'));
ALTER TABLE "ntf_preferences"
    ADD CONSTRAINT "ntf_preferences_event_key_check" CHECK ("event_key" IN ('task_assigned',
        'task_escalated', 'comment_mention', 'security_alert', 'doc_read_requested',
        'doc_request_decided', 'crm_activity_due', 'crm_quote_update'));

-- Columnas de control --------------------------------------------------------------------------

CREATE TRIGGER "fin_tax_parameters_control_columns"
    BEFORE INSERT OR UPDATE ON "fin_tax_parameters"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();
CREATE TRIGGER "crm_services_control_columns"
    BEFORE INSERT OR UPDATE ON "crm_services"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();
CREATE TRIGGER "crm_quotes_control_columns"
    BEFORE INSERT OR UPDATE ON "crm_quotes"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();
CREATE TRIGGER "crm_quote_items_control_columns"
    BEFORE INSERT OR UPDATE ON "crm_quote_items"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();

-- Seguridad por fila (ADR-007) -----------------------------------------------------------------

ALTER TABLE "fin_tax_parameters" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "fin_tax_parameters" FORCE ROW LEVEL SECURITY;
CREATE POLICY "fin_tax_parameters_tenant_isolation" ON "fin_tax_parameters"
    USING ("tenant_id" = core_current_tenant_id())
    WITH CHECK ("tenant_id" = core_current_tenant_id());

ALTER TABLE "crm_services" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "crm_services" FORCE ROW LEVEL SECURITY;
CREATE POLICY "crm_services_tenant_isolation" ON "crm_services"
    USING ("tenant_id" = core_current_tenant_id())
    WITH CHECK ("tenant_id" = core_current_tenant_id());

ALTER TABLE "crm_quotes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "crm_quotes" FORCE ROW LEVEL SECURITY;
CREATE POLICY "crm_quotes_tenant_isolation" ON "crm_quotes"
    USING ("tenant_id" = core_current_tenant_id())
    WITH CHECK ("tenant_id" = core_current_tenant_id());

ALTER TABLE "crm_quote_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "crm_quote_items" FORCE ROW LEVEL SECURITY;
CREATE POLICY "crm_quote_items_tenant_isolation" ON "crm_quote_items"
    USING ("tenant_id" = core_current_tenant_id())
    WITH CHECK ("tenant_id" = core_current_tenant_id());

-- Permisos de la API ---------------------------------------------------------------------------
-- Sin DELETE: el borrado es lógico (los ítems de un borrador que se reemplazan quedan borrados
-- lógicamente).

GRANT SELECT, INSERT, UPDATE ON "fin_tax_parameters" TO app_user;
GRANT SELECT, INSERT, UPDATE ON "crm_services" TO app_user;
GRANT SELECT, INSERT, UPDATE ON "crm_quotes" TO app_user;
GRANT SELECT, INSERT, UPDATE ON "crm_quote_items" TO app_user;

-- Enlace del cliente y trabajos del worker -----------------------------------------------------
-- El cliente abre la cotización sin sesión: la API solo conoce la huella de la llave del enlace.
-- Esta función le dice a qué empresa y a qué cotización corresponde, sin leer nada más fuera de la
-- seguridad por fila; lo demás se lee ya dentro de esa empresa. Igual que iam_find_token (B08).

CREATE POLICY "crm_quotes_system_lookup" ON "crm_quotes"
    FOR SELECT TO migration_user USING (true);

CREATE FUNCTION "crm_find_quote_link"(p_token_hash TEXT)
    RETURNS TABLE (quote_id UUID, tenant_id UUID)
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
    AS $$ SELECT q.id, q.tenant_id FROM crm_quotes q
          WHERE q.link_token_hash = p_token_hash AND q.deleted_at IS NULL $$;

-- El worker genera los PDF de las cotizaciones aprobadas y envía los correos de las enviadas cada
-- pocos segundos, y vence cada día las enviadas cuya vigencia pasó. Solo obtiene los identificadores
-- de las empresas con algo pendiente, como crm_tenants_with_due_reminders (B22).

CREATE FUNCTION "crm_tenants_with_quote_work"() RETURNS SETOF UUID
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
    AS $$ SELECT DISTINCT tenant_id FROM crm_quotes
          WHERE deleted_at IS NULL
              AND ((status = 'approved' AND pdf_status = 'pending')
                   OR (status = 'sent' AND email_sent_at IS NULL))
          ORDER BY tenant_id $$;

CREATE FUNCTION "crm_tenants_with_expired_quotes"(p_today DATE) RETURNS SETOF UUID
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
    AS $$ SELECT DISTINCT tenant_id FROM crm_quotes
          WHERE status = 'sent' AND valid_until < p_today AND deleted_at IS NULL
          ORDER BY tenant_id $$;

REVOKE EXECUTE ON FUNCTION "crm_find_quote_link"(TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION "crm_tenants_with_quote_work"() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION "crm_tenants_with_expired_quotes"(DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "crm_find_quote_link"(TEXT) TO app_user;
GRANT EXECUTE ON FUNCTION "crm_tenants_with_quote_work"() TO app_user;
GRANT EXECUTE ON FUNCTION "crm_tenants_with_expired_quotes"(DATE) TO app_user;
