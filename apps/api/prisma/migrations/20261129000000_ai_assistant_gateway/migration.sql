-- B47 · Asistente de inteligencia artificial (M20, ficha 17.21, ADR-022).
-- Pasarela con permisos, minimización y registro: activación de cada uso con su evaluación de
-- impacto (decisión 7), instrucciones con versiones, registro de usos sin el texto enviado ni la
-- respuesta (decisión 5) y fragmentos del texto de los documentos para buscar (decisión 3: sin
-- vectores, con la búsqueda en español de B21).

-- Activación de cada uso. Sin fila, el uso está apagado.
CREATE TABLE "ai_use_cases" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "use_case" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "assessment_reference" TEXT,
    "assessment_approved_on" DATE,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),
    CONSTRAINT "ai_use_cases_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ai_use_cases_use_case_check" CHECK ("use_case" IN ('doc_search', 'doc_summary',
        'ticket_summary', 'ticket_reply', 'ticket_classify', 'pqrsf_reply', 'pqrsf_classify')),
    -- Decisión 7: un uso activo tiene su evaluación de impacto aprobada.
    CONSTRAINT "ai_use_cases_assessment_check" CHECK (
        NOT "enabled" OR (length(btrim("assessment_reference")) >= 3
            AND "assessment_approved_on" IS NOT NULL)
    )
);

-- Instrucciones de cada uso. Rige la última aprobada; sin ninguna, la de fábrica del código.
CREATE TABLE "ai_prompts" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "use_case" TEXT NOT NULL,
    "prompt_version" INTEGER NOT NULL,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "approved_by" UUID,
    "approved_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),
    CONSTRAINT "ai_prompts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ai_prompts_use_case_check" CHECK ("use_case" IN ('doc_search', 'doc_summary',
        'ticket_summary', 'ticket_reply', 'ticket_classify', 'pqrsf_reply', 'pqrsf_classify')),
    CONSTRAINT "ai_prompts_status_check" CHECK ("status" IN ('draft', 'approved', 'retired')),
    CONSTRAINT "ai_prompts_version_check" CHECK ("prompt_version" >= 1),
    CONSTRAINT "ai_prompts_body_check" CHECK (length(btrim("body")) BETWEEN 20 AND 4000),
    -- Una instrucción aprobada dice quién y cuándo; nunca la aprueba quien la escribió.
    CONSTRAINT "ai_prompts_approval_check" CHECK (
        ("status" = 'draft') = ("approved_by" IS NULL)
        AND ("approved_by" IS NULL) = ("approved_at" IS NULL)
        AND ("approved_by" IS NULL OR "created_by" IS NULL OR "approved_by" <> "created_by")
    )
);

-- Registro de cada uso (ficha 17.21: caso de uso, modelo y resultado). Decisión 5: sin el texto
-- enviado ni la respuesta; solo tamaños, fuentes citadas y lo que la persona decidió.
CREATE TABLE "ai_requests" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "use_case" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "prompt_version" INTEGER NOT NULL DEFAULT 0,
    "input_class" TEXT NOT NULL,
    "input_chars" INTEGER NOT NULL DEFAULT 0,
    "output_chars" INTEGER NOT NULL DEFAULT 0,
    "tokens_in" INTEGER NOT NULL DEFAULT 0,
    "tokens_out" INTEGER NOT NULL DEFAULT 0,
    "redactions" INTEGER NOT NULL DEFAULT 0,
    "outcome" TEXT NOT NULL,
    "target_kind" TEXT,
    "target_id" UUID,
    "sources" JSONB NOT NULL DEFAULT '[]',
    "review" TEXT,
    "reviewed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),
    CONSTRAINT "ai_requests_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ai_requests_use_case_check" CHECK ("use_case" IN ('doc_search', 'doc_summary',
        'ticket_summary', 'ticket_reply', 'ticket_classify', 'pqrsf_reply', 'pqrsf_classify')),
    CONSTRAINT "ai_requests_provider_check" CHECK ("provider" IN ('rehearsal', 'anthropic')),
    CONSTRAINT "ai_requests_input_class_check" CHECK (
        "input_class" IN ('none', 'internal', 'confidential')
    ),
    CONSTRAINT "ai_requests_outcome_check" CHECK (
        "outcome" IN ('answered', 'no_sources', 'refused', 'failed', 'blocked')
    ),
    CONSTRAINT "ai_requests_target_check" CHECK (
        ("target_kind" IS NULL) = ("target_id" IS NULL)
        AND ("target_kind" IS NULL OR "target_kind" IN ('document', 'ticket', 'pqrsf'))
    ),
    CONSTRAINT "ai_requests_sizes_check" CHECK (
        "input_chars" >= 0 AND "output_chars" >= 0 AND "tokens_in" >= 0 AND "tokens_out" >= 0
        AND "redactions" >= 0 AND "prompt_version" >= 0
    ),
    CONSTRAINT "ai_requests_sources_check" CHECK (jsonb_typeof("sources") = 'array'),
    CONSTRAINT "ai_requests_review_check" CHECK (
        ("review" IS NULL) = ("reviewed_at" IS NULL)
        AND ("review" IS NULL OR "review" IN ('accepted', 'discarded'))
    )
);

-- Fragmentos del texto vigente de los documentos internos y confidenciales (decisiones 3 y 9). Lo
-- restringido nunca se copia aquí. Quién puede leer cada documento se decide al consultar, con la
-- misma regla de Gestión documental; por eso no hay columnas de permisos ni llaves hacia doc_.
CREATE TABLE "ai_index_chunks" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "document_version_id" UUID NOT NULL,
    "chunk_no" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "classification" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),
    CONSTRAINT "ai_index_chunks_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ai_index_chunks_classification_check" CHECK (
        "classification" IN ('public', 'internal', 'confidential')
    ),
    CONSTRAINT "ai_index_chunks_chunk_check" CHECK (
        "chunk_no" >= 0 AND length("content") BETWEEN 1 AND 4000
    )
);

CREATE UNIQUE INDEX "ai_use_cases_tenant_id_id_key" ON "ai_use_cases"("tenant_id", "id");
CREATE UNIQUE INDEX "ai_use_cases_tenant_id_use_case_key" ON "ai_use_cases"("tenant_id", "use_case");
CREATE UNIQUE INDEX "ai_prompts_tenant_id_id_key" ON "ai_prompts"("tenant_id", "id");
CREATE UNIQUE INDEX "ai_prompts_tenant_id_use_case_prompt_version_key" ON "ai_prompts"("tenant_id", "use_case", "prompt_version");
-- A lo sumo una instrucción aprobada por uso.
CREATE UNIQUE INDEX "ai_prompts_one_approved_key" ON "ai_prompts"("tenant_id", "use_case")
    WHERE "status" = 'approved';
CREATE UNIQUE INDEX "ai_requests_tenant_id_id_key" ON "ai_requests"("tenant_id", "id");
CREATE INDEX "ai_requests_tenant_id_user_id_created_at_idx" ON "ai_requests"("tenant_id", "user_id", "created_at");
CREATE INDEX "ai_requests_tenant_id_created_at_idx" ON "ai_requests"("tenant_id", "created_at");
CREATE UNIQUE INDEX "ai_index_chunks_tenant_id_id_key" ON "ai_index_chunks"("tenant_id", "id");
CREATE UNIQUE INDEX "ai_index_chunks_tenant_id_document_version_id_chunk_no_key" ON "ai_index_chunks"("tenant_id", "document_version_id", "chunk_no");
CREATE INDEX "ai_index_chunks_tenant_id_document_id_idx" ON "ai_index_chunks"("tenant_id", "document_id");
CREATE INDEX "ai_index_chunks_content_search_idx" ON "ai_index_chunks"
    USING GIN (to_tsvector('doc_spanish'::regconfig, "content"));

ALTER TABLE "ai_use_cases" ADD CONSTRAINT "ai_use_cases_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ai_prompts" ADD CONSTRAINT "ai_prompts_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ai_requests" ADD CONSTRAINT "ai_requests_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ai_index_chunks" ADD CONSTRAINT "ai_index_chunks_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TRIGGER "ai_use_cases_control_columns" BEFORE INSERT OR UPDATE ON "ai_use_cases"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();
CREATE TRIGGER "ai_prompts_control_columns" BEFORE INSERT OR UPDATE ON "ai_prompts"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();
CREATE TRIGGER "ai_requests_control_columns" BEFORE INSERT OR UPDATE ON "ai_requests"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();
CREATE TRIGGER "ai_index_chunks_control_columns" BEFORE INSERT OR UPDATE ON "ai_index_chunks"
    FOR EACH ROW EXECUTE FUNCTION "core_set_control_columns"();

ALTER TABLE "ai_use_cases" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ai_use_cases" FORCE ROW LEVEL SECURITY;
CREATE POLICY "ai_use_cases_tenant_isolation" ON "ai_use_cases"
    USING ("tenant_id" = core_current_tenant_id()) WITH CHECK ("tenant_id" = core_current_tenant_id());
ALTER TABLE "ai_prompts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ai_prompts" FORCE ROW LEVEL SECURITY;
CREATE POLICY "ai_prompts_tenant_isolation" ON "ai_prompts"
    USING ("tenant_id" = core_current_tenant_id()) WITH CHECK ("tenant_id" = core_current_tenant_id());
ALTER TABLE "ai_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ai_requests" FORCE ROW LEVEL SECURITY;
CREATE POLICY "ai_requests_tenant_isolation" ON "ai_requests"
    USING ("tenant_id" = core_current_tenant_id()) WITH CHECK ("tenant_id" = core_current_tenant_id());
ALTER TABLE "ai_index_chunks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ai_index_chunks" FORCE ROW LEVEL SECURITY;
CREATE POLICY "ai_index_chunks_tenant_isolation" ON "ai_index_chunks"
    USING ("tenant_id" = core_current_tenant_id()) WITH CHECK ("tenant_id" = core_current_tenant_id());

GRANT SELECT, INSERT, UPDATE ON "ai_use_cases" TO app_user;
GRANT SELECT, INSERT, UPDATE ON "ai_prompts" TO app_user;
-- El registro de usos no se borra y de él solo cambia lo que la persona decidió sobre la propuesta.
GRANT SELECT, INSERT ON "ai_requests" TO app_user;
GRANT UPDATE ("review", "reviewed_at") ON "ai_requests" TO app_user;
-- El índice se reconstruye: los fragmentos de una versión que dejó de estar vigente se borran.
GRANT SELECT, INSERT, DELETE ON "ai_index_chunks" TO app_user;

-- El worker indexa solo las empresas con textos listos (B21). La función corre como dueña del
-- esquema: lee todas las empresas solo para saber cuáles.
CREATE FUNCTION "doc_tenants_with_ready_texts"() RETURNS SETOF UUID
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
    AS $$ SELECT DISTINCT tenant_id FROM doc_version_texts WHERE status = 'ready' ORDER BY 1 $$;
REVOKE EXECUTE ON FUNCTION "doc_tenants_with_ready_texts"() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "doc_tenants_with_ready_texts"() TO app_user;
