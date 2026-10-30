-- Firma electrónica (B25, capítulo 19, ficha 17.7): procesos de firma, firmantes, cadena de eventos
-- y consultas a la verificación pública.

-- CreateTable
CREATE TABLE "sig_envelopes" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "contract_id" UUID NOT NULL,
    "amendment_id" UUID,
    "document_file_id" UUID NOT NULL,
    "document_sha256" TEXT NOT NULL,
    "document_code" TEXT NOT NULL,
    "document_title" TEXT NOT NULL,
    "level" SMALLINT NOT NULL DEFAULT 2,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "message" TEXT,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "sent_at" TIMESTAMPTZ(6),
    "sent_by" UUID,
    "send_key" TEXT,
    "completed_at" TIMESTAMPTZ(6),
    "closed_at" TIMESTAMPTZ(6),
    "closed_reason" TEXT,
    "last_event_hash" TEXT NOT NULL,
    "event_count" INTEGER NOT NULL DEFAULT 0,
    "workflow_instance_id" UUID,
    "seal_status" TEXT NOT NULL DEFAULT 'none',
    "signed_file_id" UUID,
    "signed_sha256" TEXT,
    "evidence_file_id" UUID,
    "verification_code" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "sig_envelopes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sig_signers" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "envelope_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "party_id" UUID,
    "user_id" UUID,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "id_number" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "sign_order" SMALLINT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'waiting',
    "link_token_hash" TEXT,
    "link_expires_at" TIMESTAMPTZ(6),
    "mail_pending" TEXT,
    "code_requested_at" TIMESTAMPTZ(6),
    "code_hash" TEXT,
    "code_expires_at" TIMESTAMPTZ(6),
    "code_sent_at" TIMESTAMPTZ(6),
    "code_attempts" SMALLINT NOT NULL DEFAULT 0,
    "code_locked" BOOLEAN NOT NULL DEFAULT false,
    "ticket_hash" TEXT,
    "ticket_expires_at" TIMESTAMPTZ(6),
    "opened_at" TIMESTAMPTZ(6),
    "reminders" SMALLINT NOT NULL DEFAULT 0,
    "last_notified_at" TIMESTAMPTZ(6),
    "method" TEXT,
    "signed_at" TIMESTAMPTZ(6),
    "sign_ip" TEXT,
    "sign_user_agent" TEXT,
    "acceptance_text" TEXT,
    "rejected_at" TIMESTAMPTZ(6),
    "reject_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "sig_signers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sig_events" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "envelope_id" UUID NOT NULL,
    "signer_id" UUID,
    "sequence" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "ip" TEXT,
    "user_agent" TEXT,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,
    "details" JSONB NOT NULL DEFAULT '{}',
    "prev_hash" TEXT NOT NULL,
    "hash" TEXT NOT NULL,

    CONSTRAINT "sig_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sig_verifications" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "envelope_id" UUID NOT NULL,
    "method" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "ip" TEXT,
    "verified_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "sig_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sig_envelopes_tenant_id_contract_id_idx" ON "sig_envelopes"("tenant_id", "contract_id");

-- CreateIndex
CREATE INDEX "sig_envelopes_tenant_id_status_idx" ON "sig_envelopes"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "sig_envelopes_signed_sha256_idx" ON "sig_envelopes"("signed_sha256");

-- CreateIndex
CREATE UNIQUE INDEX "sig_envelopes_tenant_id_id_key" ON "sig_envelopes"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "sig_envelopes_tenant_id_code_key" ON "sig_envelopes"("tenant_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "sig_envelopes_verification_code_key" ON "sig_envelopes"("verification_code");

-- CreateIndex
CREATE INDEX "sig_signers_tenant_id_envelope_id_idx" ON "sig_signers"("tenant_id", "envelope_id");

-- CreateIndex
CREATE UNIQUE INDEX "sig_signers_tenant_id_id_key" ON "sig_signers"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "sig_signers_tenant_id_envelope_id_sign_order_key" ON "sig_signers"("tenant_id", "envelope_id", "sign_order");

-- CreateIndex
CREATE UNIQUE INDEX "sig_signers_link_token_hash_key" ON "sig_signers"("link_token_hash");

-- CreateIndex
CREATE INDEX "sig_events_tenant_id_envelope_id_idx" ON "sig_events"("tenant_id", "envelope_id");

-- CreateIndex
CREATE UNIQUE INDEX "sig_events_tenant_id_envelope_id_sequence_key" ON "sig_events"("tenant_id", "envelope_id", "sequence");

-- CreateIndex
CREATE INDEX "sig_verifications_tenant_id_envelope_id_idx" ON "sig_verifications"("tenant_id", "envelope_id");

-- AddForeignKey
ALTER TABLE "sig_envelopes" ADD CONSTRAINT "sig_envelopes_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sig_envelopes" ADD CONSTRAINT "sig_envelopes_tenant_id_contract_id_fkey" FOREIGN KEY ("tenant_id", "contract_id") REFERENCES "ctr_contracts"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sig_signers" ADD CONSTRAINT "sig_signers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sig_signers" ADD CONSTRAINT "sig_signers_tenant_id_envelope_id_fkey" FOREIGN KEY ("tenant_id", "envelope_id") REFERENCES "sig_envelopes"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sig_events" ADD CONSTRAINT "sig_events_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sig_events" ADD CONSTRAINT "sig_events_tenant_id_envelope_id_fkey" FOREIGN KEY ("tenant_id", "envelope_id") REFERENCES "sig_envelopes"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sig_verifications" ADD CONSTRAINT "sig_verifications_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sig_verifications" ADD CONSTRAINT "sig_verifications_tenant_id_envelope_id_fkey" FOREIGN KEY ("tenant_id", "envelope_id") REFERENCES "sig_envelopes"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Reglas de los datos -------------------------------------------------------------------------
-- Los valores permitidos son los de packages/contracts/src/contract/signatures.ts.

ALTER TABLE "sig_envelopes"
    ADD CONSTRAINT "sig_envelopes_code_check" CHECK ("code" ~ '^FE-[0-9]{4}-[0-9]{4,8}$'),
    ADD CONSTRAINT "sig_envelopes_source_check" CHECK (
        ("source" = 'contract' AND "amendment_id" IS NULL)
        OR ("source" = 'amendment' AND "amendment_id" IS NOT NULL)),
    ADD CONSTRAINT "sig_envelopes_sha256_check" CHECK (
        "document_sha256" ~ '^[0-9a-f]{64}$' AND "last_event_hash" ~ '^[0-9a-f]{64}$'
        AND ("signed_sha256" IS NULL OR "signed_sha256" ~ '^[0-9a-f]{64}$')),
    -- Solo el nivel 2 (enlace y código); el 3, firma digital certificada, llega en la fase F8.
    ADD CONSTRAINT "sig_envelopes_level_check" CHECK ("level" = 2),
    ADD CONSTRAINT "sig_envelopes_status_check" CHECK ("status" IN ('draft', 'sent', 'completed',
        'rejected', 'expired', 'cancelled')),
    ADD CONSTRAINT "sig_envelopes_message_check"
        CHECK ("message" IS NULL OR char_length(btrim("message")) BETWEEN 1 AND 1000),
    ADD CONSTRAINT "sig_envelopes_sent_check" CHECK (
        ("status" = 'draft') = ("sent_at" IS NULL)
        AND ("sent_at" IS NULL OR "sent_by" IS NOT NULL)
        AND (("sent_at" IS NULL) = ("send_key" IS NULL))),
    ADD CONSTRAINT "sig_envelopes_completed_check"
        CHECK (("status" = 'completed') = ("completed_at" IS NOT NULL)),
    -- Cerrado sin firmar (rechazado, vencido o anulado): dice por qué.
    ADD CONSTRAINT "sig_envelopes_closed_check" CHECK (
        (("status" IN ('completed', 'rejected', 'expired', 'cancelled')) = ("closed_at" IS NOT NULL))
        AND (("status" IN ('rejected', 'expired', 'cancelled')) = ("closed_reason" IS NOT NULL))),
    -- Firmado por todos: el worker arma el documento firmado y su certificado, con su código.
    ADD CONSTRAINT "sig_envelopes_seal_check" CHECK (
        "seal_status" IN ('none', 'pending', 'ready')
        AND (("status" = 'completed') = ("seal_status" <> 'none'))
        AND (("seal_status" = 'ready') = ("signed_file_id" IS NOT NULL))
        AND (("seal_status" = 'ready') = ("signed_sha256" IS NOT NULL))
        AND (("seal_status" = 'ready') = ("evidence_file_id" IS NOT NULL))
        AND (("status" = 'completed') = ("verification_code" IS NOT NULL))),
    ADD CONSTRAINT "sig_envelopes_verification_code_check"
        CHECK ("verification_code" IS NULL
               OR "verification_code" ~ '^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$'),
    ADD CONSTRAINT "sig_envelopes_event_count_check" CHECK ("event_count" >= 0),
    ADD CONSTRAINT "sig_envelopes_version_check" CHECK ("version" > 0);

-- Un solo proceso abierto por documento.
CREATE UNIQUE INDEX "sig_envelopes_open_contract_key" ON "sig_envelopes"("tenant_id", "contract_id")
    WHERE "status" IN ('draft', 'sent') AND "source" = 'contract' AND "deleted_at" IS NULL;
CREATE UNIQUE INDEX "sig_envelopes_open_amendment_key" ON "sig_envelopes"("tenant_id", "amendment_id")
    WHERE "status" IN ('draft', 'sent') AND "source" = 'amendment' AND "deleted_at" IS NULL;

ALTER TABLE "sig_signers"
    ADD CONSTRAINT "sig_signers_kind_check" CHECK (
        ("kind" = 'client' AND "party_id" IS NOT NULL AND "user_id" IS NULL)
        OR ("kind" = 'company' AND "user_id" IS NOT NULL)),
    ADD CONSTRAINT "sig_signers_text_check" CHECK (
        char_length(btrim("name")) BETWEEN 3 AND 160
        AND char_length(btrim("email")) BETWEEN 3 AND 254
        AND char_length(btrim("id_number")) BETWEEN 3 AND 40
        AND char_length(btrim("role")) BETWEEN 3 AND 200),
    ADD CONSTRAINT "sig_signers_order_check" CHECK ("sign_order" BETWEEN 1 AND 6),
    ADD CONSTRAINT "sig_signers_status_check"
        CHECK ("status" IN ('waiting', 'pending', 'signed', 'rejected')),
    ADD CONSTRAINT "sig_signers_mail_check"
        CHECK ("mail_pending" IS NULL OR "mail_pending" IN ('invitation', 'reminder', 'copy')),
    ADD CONSTRAINT "sig_signers_link_check" CHECK (
        ("link_token_hash" IS NULL) = ("link_expires_at" IS NULL)
        AND ("link_token_hash" IS NULL OR "link_token_hash" ~ '^[0-9a-f]{64}$')),
    ADD CONSTRAINT "sig_signers_code_check" CHECK (
        ("code_hash" IS NULL) = ("code_expires_at" IS NULL)
        AND "code_attempts" BETWEEN 0 AND 5),
    ADD CONSTRAINT "sig_signers_ticket_check"
        CHECK (("ticket_hash" IS NULL) = ("ticket_expires_at" IS NULL)),
    ADD CONSTRAINT "sig_signers_reminders_check" CHECK ("reminders" BETWEEN 0 AND 3),
    -- Firmó: con su método, su fecha, el texto que aceptó y, si firmó por el enlace, su IP.
    ADD CONSTRAINT "sig_signers_signed_check" CHECK (
        (("status" = 'signed') = ("signed_at" IS NOT NULL))
        AND (("status" = 'signed') = ("method" IS NOT NULL))
        AND (("status" = 'signed') = ("acceptance_text" IS NOT NULL))
        AND ("method" IS NULL OR "method" IN ('email_code', 'session_mfa'))),
    ADD CONSTRAINT "sig_signers_rejected_check" CHECK (
        (("status" = 'rejected') = ("rejected_at" IS NOT NULL))
        AND (("status" = 'rejected') = ("reject_reason" IS NOT NULL))),
    ADD CONSTRAINT "sig_signers_version_check" CHECK ("version" > 0);

ALTER TABLE "sig_events"
    ADD CONSTRAINT "sig_events_type_check" CHECK ("type" IN ('created', 'sent', 'invited',
        'reminded', 'opened', 'code_sent', 'code_verified', 'code_failed', 'code_locked', 'viewed',
        'downloaded', 'signed', 'rejected', 'cancelled', 'expired', 'completed', 'sealed',
        'copy_sent')),
    ADD CONSTRAINT "sig_events_sequence_check" CHECK ("sequence" > 0),
    ADD CONSTRAINT "sig_events_hash_check"
        CHECK ("prev_hash" ~ '^[0-9a-f]{64}$' AND "hash" ~ '^[0-9a-f]{64}$'),
    ADD CONSTRAINT "sig_events_details_check" CHECK (jsonb_typeof("details") = 'object');

ALTER TABLE "sig_verifications"
    ADD CONSTRAINT "sig_verifications_method_check" CHECK ("method" IN ('code', 'file')),
    ADD CONSTRAINT "sig_verifications_result_check" CHECK ("result" IN ('valid', 'mismatch'));

-- El documento que se firma no cambia, ni el texto que aceptó quien firmó (numeral 19.2). Un
-- proceso cerrado no cambia nada más que su documento firmado, mientras el worker lo arma.
CREATE FUNCTION "sig_keep_envelopes"() RETURNS TRIGGER
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF (NEW.code, NEW.source, NEW.contract_id, NEW.amendment_id, NEW.document_file_id,
        NEW.document_sha256, NEW.document_code, NEW.level)
        IS DISTINCT FROM
        (OLD.code, OLD.source, OLD.contract_id, OLD.amendment_id, OLD.document_file_id,
         OLD.document_sha256, OLD.document_code, OLD.level) THEN
        RAISE EXCEPTION 'El documento de un proceso de firma no cambia.'
            USING ERRCODE = 'check_violation', CONSTRAINT = 'sig_envelopes_document_keep';
    END IF;
    IF OLD.status IN ('rejected', 'expired', 'cancelled')
        AND (NEW.status, NEW.message, NEW.expires_at, NEW.sent_at, NEW.closed_at, NEW.closed_reason,
             NEW.seal_status, NEW.deleted_at)
            IS DISTINCT FROM
            (OLD.status, OLD.message, OLD.expires_at, OLD.sent_at, OLD.closed_at, OLD.closed_reason,
             OLD.seal_status, OLD.deleted_at) THEN
        RAISE EXCEPTION 'Un proceso de firma cerrado no cambia.'
            USING ERRCODE = 'check_violation', CONSTRAINT = 'sig_envelopes_closed_keep';
    END IF;
    IF OLD.status = 'completed'
        AND (NEW.status, NEW.completed_at, NEW.verification_code, NEW.deleted_at)
            IS DISTINCT FROM (OLD.status, OLD.completed_at, OLD.verification_code, OLD.deleted_at) THEN
        RAISE EXCEPTION 'Un proceso de firma terminado no cambia.'
            USING ERRCODE = 'check_violation', CONSTRAINT = 'sig_envelopes_completed_keep';
    END IF;
    IF OLD.seal_status = 'ready'
        AND (NEW.signed_file_id, NEW.signed_sha256, NEW.evidence_file_id, NEW.seal_status)
            IS DISTINCT FROM
            (OLD.signed_file_id, OLD.signed_sha256, OLD.evidence_file_id, OLD.seal_status) THEN
        RAISE EXCEPTION 'El documento firmado y su certificado no se reemplazan.'
            USING ERRCODE = 'check_violation', CONSTRAINT = 'sig_envelopes_seal_keep';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "sig_envelopes_keep"
    BEFORE UPDATE ON "sig_envelopes"
    FOR EACH ROW EXECUTE FUNCTION "sig_keep_envelopes"();

CREATE FUNCTION "sig_keep_signers"() RETURNS TRIGGER
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF (NEW.envelope_id, NEW.kind, NEW.party_id, NEW.user_id, NEW.sign_order)
        IS DISTINCT FROM (OLD.envelope_id, OLD.kind, OLD.party_id, OLD.user_id, OLD.sign_order) THEN
        RAISE EXCEPTION 'Quien firma y su orden no cambian.'
            USING ERRCODE = 'check_violation', CONSTRAINT = 'sig_signers_identity_keep';
    END IF;
    IF OLD.status IN ('signed', 'rejected')
        AND (NEW.status, NEW.name, NEW.email, NEW.id_number, NEW.role, NEW.method, NEW.signed_at,
             NEW.sign_ip, NEW.sign_user_agent, NEW.acceptance_text, NEW.rejected_at,
             NEW.reject_reason, NEW.deleted_at)
            IS DISTINCT FROM
            (OLD.status, OLD.name, OLD.email, OLD.id_number, OLD.role, OLD.method, OLD.signed_at,
             OLD.sign_ip, OLD.sign_user_agent, OLD.acceptance_text, OLD.rejected_at,
             OLD.reject_reason, OLD.deleted_at) THEN
        RAISE EXCEPTION 'Una firma o un rechazo registrados no cambian.'
            USING ERRCODE = 'check_violation', CONSTRAINT = 'sig_signers_signature_keep';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "sig_signers_keep"
    BEFORE UPDATE ON "sig_signers"
    FOR EACH ROW EXECUTE FUNCTION "sig_keep_signers"();

-- La cadena de eventos y las consultas solo se agregan (numeral 19.3), aunque alguien intente el
-- cambio directo en la base.
CREATE FUNCTION "sig_append_only"() RETURNS TRIGGER
    LANGUAGE plpgsql
    AS $$
BEGIN
    RAISE EXCEPTION 'La evidencia de la firma solo se agrega: no se cambia ni se borra.'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'sig_evidence_append_only';
END;
$$;

CREATE TRIGGER "sig_events_append_only"
    BEFORE UPDATE OR DELETE ON "sig_events"
    FOR EACH ROW EXECUTE FUNCTION "sig_append_only"();
CREATE TRIGGER "sig_verifications_append_only"
    BEFORE UPDATE OR DELETE ON "sig_verifications"
    FOR EACH ROW EXECUTE FUNCTION "sig_append_only"();

-- Contratos y otrosíes en firma (ficha 17.7: aprobado → en firma → vigente).
ALTER TABLE "ctr_contracts" DROP CONSTRAINT "ctr_contracts_status_check";
ALTER TABLE "ctr_contracts"
    ADD CONSTRAINT "ctr_contracts_status_check" CHECK ("status" IN ('draft', 'in_review',
        'approved', 'in_signature', 'active', 'expiring', 'terminated'));
ALTER TABLE "ctr_amendments" DROP CONSTRAINT "ctr_amendments_status_check";
ALTER TABLE "ctr_amendments"
    ADD CONSTRAINT "ctr_amendments_status_check"
        CHECK ("status" IN ('in_review', 'approved', 'in_signature', 'returned', 'signed'));

-- Columnas de control --------------------------------------------------------------------------

CREATE TRIGGER "sig_envelopes_control_columns"
    BEFORE INSERT OR UPDATE ON "sig_envelopes"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();
CREATE TRIGGER "sig_signers_control_columns"
    BEFORE INSERT OR UPDATE ON "sig_signers"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();

-- Seguridad por fila (ADR-007) -----------------------------------------------------------------

ALTER TABLE "sig_envelopes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sig_envelopes" FORCE ROW LEVEL SECURITY;
CREATE POLICY "sig_envelopes_tenant_isolation" ON "sig_envelopes"
    USING ("tenant_id" = core_current_tenant_id())
    WITH CHECK ("tenant_id" = core_current_tenant_id());

ALTER TABLE "sig_signers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sig_signers" FORCE ROW LEVEL SECURITY;
CREATE POLICY "sig_signers_tenant_isolation" ON "sig_signers"
    USING ("tenant_id" = core_current_tenant_id())
    WITH CHECK ("tenant_id" = core_current_tenant_id());

ALTER TABLE "sig_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sig_events" FORCE ROW LEVEL SECURITY;
CREATE POLICY "sig_events_tenant_isolation" ON "sig_events"
    USING ("tenant_id" = core_current_tenant_id())
    WITH CHECK ("tenant_id" = core_current_tenant_id());

ALTER TABLE "sig_verifications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sig_verifications" FORCE ROW LEVEL SECURITY;
CREATE POLICY "sig_verifications_tenant_isolation" ON "sig_verifications"
    USING ("tenant_id" = core_current_tenant_id())
    WITH CHECK ("tenant_id" = core_current_tenant_id());

-- Permisos de la API ---------------------------------------------------------------------------
-- Sin DELETE en ninguna; la evidencia, ni siquiera UPDATE.

GRANT SELECT, INSERT, UPDATE ON "sig_envelopes" TO app_user;
GRANT SELECT, INSERT, UPDATE ON "sig_signers" TO app_user;
GRANT SELECT, INSERT ON "sig_events" TO app_user;
GRANT SELECT, INSERT ON "sig_verifications" TO app_user;

-- Enlaces, verificación y trabajos del worker ---------------------------------------------------
-- Quien firma abre su enlace sin sesión y quien verifica no tiene usuario: la API solo conoce la
-- huella de la llave, el código o la huella del archivo, y con ellos encuentra la empresa, como
-- crm_find_quote_link (B23). Lo demás se lee dentro de esa empresa, con su seguridad por fila.

CREATE POLICY "sig_envelopes_system_lookup" ON "sig_envelopes"
    FOR SELECT TO migration_user USING (true);
CREATE POLICY "sig_signers_system_lookup" ON "sig_signers"
    FOR SELECT TO migration_user USING (true);

CREATE FUNCTION "sig_find_signer_link"(p_token_hash TEXT)
    RETURNS TABLE (signer_id UUID, envelope_id UUID, tenant_id UUID)
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
    AS $$ SELECT s.id, s.envelope_id, s.tenant_id FROM sig_signers s
          WHERE s.link_token_hash = p_token_hash AND s.deleted_at IS NULL $$;

-- Un documento firmado por todos, por su código de verificación o por la huella del archivo.
CREATE FUNCTION "sig_find_signed_document"(p_code TEXT, p_sha256 TEXT)
    RETURNS TABLE (envelope_id UUID, tenant_id UUID)
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
    AS $$ SELECT e.id, e.tenant_id FROM sig_envelopes e
          WHERE e.status = 'completed' AND e.seal_status = 'ready' AND e.deleted_at IS NULL
              AND ((p_code IS NOT NULL AND e.verification_code = p_code)
                   OR (p_code IS NULL AND e.signed_sha256 = p_sha256))
          LIMIT 1 $$;

-- Correos por enviar, códigos pedidos y documentos firmados por armar: cada pocos segundos.
CREATE FUNCTION "sig_tenants_with_work"() RETURNS SETOF UUID
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
    AS $$ SELECT tenant_id FROM sig_signers
          WHERE deleted_at IS NULL
              AND (mail_pending IS NOT NULL
                   OR (code_requested_at IS NOT NULL
                       AND (code_sent_at IS NULL OR code_sent_at < code_requested_at)))
          UNION
          SELECT tenant_id FROM sig_envelopes WHERE seal_status = 'pending' AND deleted_at IS NULL
          ORDER BY 1 $$;

-- Recordatorios y vencimientos: cada día.
CREATE FUNCTION "sig_tenants_with_follow_up"() RETURNS SETOF UUID
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
    AS $$ SELECT DISTINCT tenant_id FROM sig_envelopes
          WHERE status = 'sent' AND deleted_at IS NULL ORDER BY 1 $$;

REVOKE EXECUTE ON FUNCTION "sig_find_signer_link"(TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION "sig_find_signed_document"(TEXT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION "sig_tenants_with_work"() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION "sig_tenants_with_follow_up"() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "sig_find_signer_link"(TEXT) TO app_user;
GRANT EXECUTE ON FUNCTION "sig_find_signed_document"(TEXT, TEXT) TO app_user;
GRANT EXECUTE ON FUNCTION "sig_tenants_with_work"() TO app_user;
GRANT EXECUTE ON FUNCTION "sig_tenants_with_follow_up"() TO app_user;
