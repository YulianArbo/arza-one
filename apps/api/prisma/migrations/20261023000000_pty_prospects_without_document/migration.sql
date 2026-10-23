-- B22: un prospecto puede registrarse sin documento de identidad (decisión del dueño del producto,
-- 22/10/2026). A quien apenas pregunta no se le pide la cédula: la ley de datos pide recoger solo lo
-- necesario (Ley 1581, principio de finalidad). El documento se exige para dejar de ser prospecto.
-- Solo expande: la versión anterior sigue escribiendo terceros con documento.

ALTER TABLE "pty_parties" ALTER COLUMN "id_type" DROP NOT NULL;
ALTER TABLE "pty_parties" ALTER COLUMN "id_number" DROP NOT NULL;

ALTER TABLE "pty_parties"
    -- El tipo y el número van juntos; sin documento tampoco hay dígito de verificación.
    ADD CONSTRAINT "pty_parties_document_pair_check" CHECK (
        ("id_type" IS NULL) = ("id_number" IS NULL)
        AND ("id_type" IS NOT NULL OR "check_digit" IS NULL)),
    -- Solo un prospecto queda sin documento.
    ADD CONSTRAINT "pty_parties_document_required_check" CHECK (
        "id_type" IS NOT NULL OR "status" = 'prospect');
