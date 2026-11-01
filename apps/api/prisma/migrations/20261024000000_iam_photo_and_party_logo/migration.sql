-- B22A, etapa 9: foto de perfil de cada persona y logo de las empresas en Terceros. Cada una apunta
-- a un archivo propio ya revisado por el antivirus (doc_files); lo valida la API, como los demás
-- archivos que usan otros módulos. Solo expande: la versión anterior no lee ni escribe estas
-- columnas. iam_users.party_id ya existía (capítulo 12): desde ahora liga a la persona del portal
-- con su empresa cliente.

ALTER TABLE "iam_users" ADD COLUMN "photo_file_id" UUID;
ALTER TABLE "pty_parties" ADD COLUMN "logo_file_id" UUID;

CREATE INDEX "iam_users_tenant_id_party_id_idx" ON "iam_users"("tenant_id", "party_id");
