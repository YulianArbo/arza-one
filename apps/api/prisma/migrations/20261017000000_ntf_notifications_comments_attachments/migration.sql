-- B16: avisos, correo, comentarios y adjuntos (M04, ficha 17.5). Plantillas versionadas, avisos en
-- la aplicación con entrega diferida fuera de jornada, envíos por correo con reintentos,
-- preferencias por persona, y comentarios con menciones y adjuntos en cualquier registro.

-- CreateTable
CREATE TABLE "ntf_templates" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "version_number" INTEGER NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'email',
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "urgent" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "ntf_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ntf_notifications" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "link" TEXT,
    "deliver_at" TIMESTAMPTZ(6) NOT NULL,
    "read_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "ntf_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ntf_deliveries" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "notification_id" UUID NOT NULL,
    "template_key" TEXT NOT NULL,
    "template_version" INTEGER NOT NULL,
    "recipient" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "link" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "deliver_at" TIMESTAMPTZ(6) NOT NULL,
    "next_attempt_at" TIMESTAMPTZ(6) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "provider_message_id" TEXT,
    "sent_at" TIMESTAMPTZ(6),
    "error" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "ntf_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ntf_preferences" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "event_key" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'email',
    "enabled" BOOLEAN NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "ntf_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core_comments" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "visibility" TEXT NOT NULL DEFAULT 'internal',
    "mention_ids" UUID[],
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "core_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core_attachments" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" UUID NOT NULL,
    "file_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "core_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ntf_templates_tenant_id_id_key" ON "ntf_templates"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ntf_templates_tenant_id_key_version_number_key" ON "ntf_templates"("tenant_id", "key", "version_number");

-- CreateIndex
CREATE INDEX "ntf_notifications_tenant_id_user_id_deliver_at_idx" ON "ntf_notifications"("tenant_id", "user_id", "deliver_at");

-- CreateIndex
CREATE UNIQUE INDEX "ntf_notifications_tenant_id_id_key" ON "ntf_notifications"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ntf_notifications_tenant_id_event_id_user_id_key" ON "ntf_notifications"("tenant_id", "event_id", "user_id");

-- CreateIndex
CREATE INDEX "ntf_deliveries_tenant_id_notification_id_idx" ON "ntf_deliveries"("tenant_id", "notification_id");

-- CreateIndex
CREATE INDEX "ntf_deliveries_status_next_attempt_at_idx" ON "ntf_deliveries"("status", "next_attempt_at");

-- CreateIndex
CREATE UNIQUE INDEX "ntf_deliveries_tenant_id_id_key" ON "ntf_deliveries"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ntf_preferences_tenant_id_id_key" ON "ntf_preferences"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ntf_preferences_tenant_id_user_id_event_key_channel_key" ON "ntf_preferences"("tenant_id", "user_id", "event_key", "channel");

-- CreateIndex
CREATE INDEX "core_comments_tenant_id_entity_type_entity_id_created_at_idx" ON "core_comments"("tenant_id", "entity_type", "entity_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "core_comments_tenant_id_id_key" ON "core_comments"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "core_attachments_tenant_id_entity_type_entity_id_created_at_idx" ON "core_attachments"("tenant_id", "entity_type", "entity_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "core_attachments_tenant_id_id_key" ON "core_attachments"("tenant_id", "id");

-- AddForeignKey
ALTER TABLE "ntf_templates" ADD CONSTRAINT "ntf_templates_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ntf_notifications" ADD CONSTRAINT "ntf_notifications_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ntf_deliveries" ADD CONSTRAINT "ntf_deliveries_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ntf_deliveries" ADD CONSTRAINT "ntf_deliveries_tenant_id_notification_id_fkey" FOREIGN KEY ("tenant_id", "notification_id") REFERENCES "ntf_notifications"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ntf_preferences" ADD CONSTRAINT "ntf_preferences_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core_comments" ADD CONSTRAINT "core_comments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core_attachments" ADD CONSTRAINT "core_attachments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;



-- Reglas de los datos -------------------------------------------------------------------------
-- Los valores permitidos son los de packages/contracts/src/ntf.

ALTER TABLE "ntf_templates"
    ADD CONSTRAINT "ntf_templates_key_check"
        CHECK ("key" IN ('task_assigned', 'task_escalated', 'comment_mention', 'security_alert')),
    ADD CONSTRAINT "ntf_templates_channel_check" CHECK ("channel" = 'email'),
    ADD CONSTRAINT "ntf_templates_version_number_check" CHECK ("version_number" >= 1),
    ADD CONSTRAINT "ntf_templates_subject_check" CHECK (char_length("subject") BETWEEN 3 AND 150),
    ADD CONSTRAINT "ntf_templates_body_check" CHECK (char_length("body") BETWEEN 10 AND 2000);

ALTER TABLE "ntf_notifications"
    ADD CONSTRAINT "ntf_notifications_kind_check"
        CHECK ("kind" IN ('task_assigned', 'task_escalated', 'comment_mention', 'security_alert'));

ALTER TABLE "ntf_deliveries"
    ADD CONSTRAINT "ntf_deliveries_status_check" CHECK ("status" IN ('pending', 'sent', 'failed')),
    ADD CONSTRAINT "ntf_deliveries_attempts_check" CHECK ("attempts" >= 0),
    ADD CONSTRAINT "ntf_deliveries_sent_check" CHECK (("status" = 'sent') = ("sent_at" IS NOT NULL));

ALTER TABLE "ntf_preferences"
    ADD CONSTRAINT "ntf_preferences_event_key_check"
        CHECK ("event_key" IN ('task_assigned', 'task_escalated', 'comment_mention', 'security_alert')),
    ADD CONSTRAINT "ntf_preferences_channel_check" CHECK ("channel" = 'email');

ALTER TABLE "core_comments"
    ADD CONSTRAINT "core_comments_entity_type_check" CHECK ("entity_type" IN ('party', 'wf_instance')),
    ADD CONSTRAINT "core_comments_visibility_check" CHECK ("visibility" IN ('internal', 'public')),
    ADD CONSTRAINT "core_comments_body_check" CHECK (char_length("body") BETWEEN 1 AND 4000),
    ADD CONSTRAINT "core_comments_mentions_check" CHECK (cardinality("mention_ids") <= 10);

ALTER TABLE "core_attachments"
    ADD CONSTRAINT "core_attachments_entity_type_check" CHECK ("entity_type" IN ('party', 'wf_instance')),
    ADD CONSTRAINT "core_attachments_label_check" CHECK (char_length("label") BETWEEN 1 AND 120);

-- Un comentario no se edita: solo se retira (deleted_at), y una vez retirado no vuelve.
CREATE FUNCTION "core_keep_comments"() RETURNS TRIGGER
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF NEW.body IS DISTINCT FROM OLD.body
        OR NEW.entity_type IS DISTINCT FROM OLD.entity_type
        OR NEW.entity_id IS DISTINCT FROM OLD.entity_id
        OR NEW.mention_ids IS DISTINCT FROM OLD.mention_ids
        OR NEW.visibility IS DISTINCT FROM OLD.visibility
        OR (OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS DISTINCT FROM OLD.deleted_at) THEN
        RAISE EXCEPTION 'Un comentario no se puede editar; solo retirar'
            USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "core_comments_keep"
    BEFORE UPDATE ON "core_comments"
    FOR EACH ROW EXECUTE FUNCTION "core_keep_comments"();

-- Columnas de control --------------------------------------------------------------------------

CREATE TRIGGER "ntf_templates_control_columns"
    BEFORE INSERT OR UPDATE ON "ntf_templates"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();
CREATE TRIGGER "ntf_notifications_control_columns"
    BEFORE INSERT OR UPDATE ON "ntf_notifications"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();
CREATE TRIGGER "ntf_deliveries_control_columns"
    BEFORE INSERT OR UPDATE ON "ntf_deliveries"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();
CREATE TRIGGER "ntf_preferences_control_columns"
    BEFORE INSERT OR UPDATE ON "ntf_preferences"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();
CREATE TRIGGER "core_comments_control_columns"
    BEFORE INSERT OR UPDATE ON "core_comments"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();
CREATE TRIGGER "core_attachments_control_columns"
    BEFORE INSERT OR UPDATE ON "core_attachments"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();

-- Seguridad por fila (ADR-007) -----------------------------------------------------------------

ALTER TABLE "ntf_templates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ntf_templates" FORCE ROW LEVEL SECURITY;
CREATE POLICY "ntf_templates_tenant_isolation" ON "ntf_templates"
    USING ("tenant_id" = core_current_tenant_id())
    WITH CHECK ("tenant_id" = core_current_tenant_id());

ALTER TABLE "ntf_notifications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ntf_notifications" FORCE ROW LEVEL SECURITY;
CREATE POLICY "ntf_notifications_tenant_isolation" ON "ntf_notifications"
    USING ("tenant_id" = core_current_tenant_id())
    WITH CHECK ("tenant_id" = core_current_tenant_id());

ALTER TABLE "ntf_deliveries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ntf_deliveries" FORCE ROW LEVEL SECURITY;
CREATE POLICY "ntf_deliveries_tenant_isolation" ON "ntf_deliveries"
    USING ("tenant_id" = core_current_tenant_id())
    WITH CHECK ("tenant_id" = core_current_tenant_id());

ALTER TABLE "ntf_preferences" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ntf_preferences" FORCE ROW LEVEL SECURITY;
CREATE POLICY "ntf_preferences_tenant_isolation" ON "ntf_preferences"
    USING ("tenant_id" = core_current_tenant_id())
    WITH CHECK ("tenant_id" = core_current_tenant_id());

ALTER TABLE "core_comments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "core_comments" FORCE ROW LEVEL SECURITY;
CREATE POLICY "core_comments_tenant_isolation" ON "core_comments"
    USING ("tenant_id" = core_current_tenant_id())
    WITH CHECK ("tenant_id" = core_current_tenant_id());

ALTER TABLE "core_attachments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "core_attachments" FORCE ROW LEVEL SECURITY;
CREATE POLICY "core_attachments_tenant_isolation" ON "core_attachments"
    USING ("tenant_id" = core_current_tenant_id())
    WITH CHECK ("tenant_id" = core_current_tenant_id());

-- Permisos de la API ---------------------------------------------------------------------------
-- Sin DELETE: el borrado es lógico. Las versiones de las plantillas solo se agregan.

GRANT SELECT, INSERT ON "ntf_templates" TO app_user;
GRANT SELECT, INSERT, UPDATE ON "ntf_notifications" TO app_user;
GRANT SELECT, INSERT, UPDATE ON "ntf_deliveries" TO app_user;
GRANT SELECT, INSERT, UPDATE ON "ntf_preferences" TO app_user;
GRANT SELECT, INSERT, UPDATE ON "core_comments" TO app_user;
GRANT SELECT, INSERT, UPDATE ON "core_attachments" TO app_user;

-- Publicación de la bandeja de salida y envío de correos ------------------------------------------
-- El worker publica los eventos y envía los correos de todas las empresas. Para saber en cuáles
-- hay trabajo, sin leer nada más fuera de la seguridad por fila, solo obtiene los identificadores
-- de esas empresas; luego trabaja en cada una con su contexto fijado, igual que
-- wf_tenants_with_overdue_tasks (B15). Cinco intentos es el máximo del módulo ntf.

CREATE POLICY "core_outbox_events_pending_lookup" ON "core_outbox_events"
    FOR SELECT TO migration_user USING (true);

CREATE FUNCTION "ntf_tenants_with_pending_events"() RETURNS SETOF UUID
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
    AS $$ SELECT DISTINCT tenant_id FROM core_outbox_events
          WHERE published_at IS NULL AND attempts < 5 AND deleted_at IS NULL
          ORDER BY tenant_id $$;

REVOKE EXECUTE ON FUNCTION "ntf_tenants_with_pending_events"() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "ntf_tenants_with_pending_events"() TO app_user;

CREATE POLICY "ntf_deliveries_due_lookup" ON "ntf_deliveries"
    FOR SELECT TO migration_user USING (true);

CREATE FUNCTION "ntf_tenants_with_due_deliveries"(at TIMESTAMPTZ) RETURNS SETOF UUID
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
    AS $$ SELECT DISTINCT tenant_id FROM ntf_deliveries
          WHERE status = 'pending' AND next_attempt_at <= at AND deleted_at IS NULL
          ORDER BY tenant_id $$;

REVOKE EXECUTE ON FUNCTION "ntf_tenants_with_due_deliveries"(TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "ntf_tenants_with_due_deliveries"(TIMESTAMPTZ) TO app_user;
