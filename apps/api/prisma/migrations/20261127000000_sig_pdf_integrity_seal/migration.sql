-- B43 · Sello de integridad de la empresa en el PDF firmado (numeral 19.3, fase F8). Cada proceso
-- sellado guarda la huella del certificado con que se selló. Los procesos ya firmados no se vuelven
-- a sellar (decisión 5): su columna queda vacía. La versión anterior de la API sigue funcionando,
-- porque la columna admite vacío.

ALTER TABLE "sig_envelopes" ADD COLUMN "seal_certificate_sha256" TEXT;

ALTER TABLE "sig_envelopes"
    ADD CONSTRAINT "sig_envelopes_seal_certificate_check" CHECK (
        "seal_certificate_sha256" IS NULL
        OR ("seal_certificate_sha256" ~ '^[0-9a-f]{64}$' AND "seal_status" = 'ready'));

-- Una vez sellado, el certificado que selló no cambia ni se borra.
CREATE FUNCTION "sig_keep_seal_certificate"() RETURNS TRIGGER
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF OLD.seal_certificate_sha256 IS NOT NULL
        AND NEW.seal_certificate_sha256 IS DISTINCT FROM OLD.seal_certificate_sha256 THEN
        RAISE EXCEPTION 'El certificado que selló el documento firmado no cambia.'
            USING ERRCODE = 'check_violation', CONSTRAINT = 'sig_envelopes_seal_certificate_keep';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "sig_envelopes_keep_seal_certificate"
    BEFORE UPDATE ON "sig_envelopes"
    FOR EACH ROW EXECUTE FUNCTION "sig_keep_seal_certificate"();
