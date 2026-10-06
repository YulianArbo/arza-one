# 12. Base de datos

## 12.1 Principios de diseño

| **Principio**           | **Regla**                                                                                                                                                                                                                                                                |
|-------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Motor**               | PostgreSQL 17 o superior, codificación UTF-8, intercalación es-CO, zona horaria UTC.                                                                                                                                                                                     |
| **Nombres**             | Tablas en plural y snake_case con prefijo de dominio (crm_quotes). Columnas en snake_case. Llaves foráneas terminadas en \_id.                                                                                                                                           |
| **Llave primaria**      | id de tipo uuid versión 7, generado por la aplicación. Nunca se expone ni se usa un número consecutivo como identificador técnico.                                                                                                                                       |
| **Códigos de negocio**  | Columna code generada por el servicio de consecutivos (COT-2026-0001). Única por empresa.                                                                                                                                                                                |
| **Empresa**             | Toda tabla de negocio lleva tenant_id obligatorio, primera columna de todos los índices compuestos.                                                                                                                                                                      |
| **Seguridad por fila**  | Política RLS en toda tabla con tenant_id: solo se ven las filas cuya empresa coincide con la variable de sesión app.tenant_id que la API fija en cada transacción. El usuario de base de datos de la aplicación no es dueño de las tablas ni puede saltar las políticas. |
| **Columnas de control** | created_at, created_by, updated_at, updated_by, version (bloqueo optimista) y deleted_at (borrado lógico) en toda tabla de negocio.                                                                                                                                      |
| **Borrado**             | Lógico por defecto. El borrado físico solo ocurre por disposición final según la tabla de retención o por supresión de datos personales, siempre auditado.                                                                                                               |
| **Integridad**          | Llaves foráneas, restricciones NOT NULL, UNIQUE y CHECK en la base de datos, no solo en el código.                                                                                                                                                                       |
| **Estados y listas**    | Los estados de flujo se guardan como texto controlado por el motor de flujos; las listas administrables viven en core_catalog_items.                                                                                                                                     |
| **Dinero**              | numeric(18,2) con columna currency (COP por defecto). Porcentajes en numeric(7,4).                                                                                                                                                                                       |
| **Fechas**              | timestamptz para instantes; date para fechas de calendario (vencimientos, vigencias).                                                                                                                                                                                    |
| **Datos sensibles**     | Cifrado a nivel de campo con llave fuera de la base de datos para: secretos MFA, cuentas bancarias, datos de salud y documentos de identidad de candidatos no contratados.                                                                                               |
| **Datos flexibles**     | jsonb solo para formularios dinámicos, parámetros y metadatos; siempre validado contra un esquema versionado.                                                                                                                                                            |
| **Índices**             | Uno por cada llave foránea y por cada filtro frecuente; GIN para búsqueda de texto y jsonb. Se revisan con el plan de ejecución antes de cada versión.                                                                                                                   |
| **Auditoría**           | Tabla aud_events solo de inserción, particionada por mes; el usuario de la aplicación no tiene permiso de UPDATE ni DELETE sobre ella.                                                                                                                                   |
| **Migraciones**         | Solo con Prisma Migrate, revisadas en el pull request, compatibles hacia atrás y probadas contra una copia de la estructura de producción.                                                                                                                               |
| **Datos semilla**       | Guion idempotente que crea empresa, roles, permisos, catálogos, flujos, plantillas y festivos; guion aparte con datos ficticios para pruebas.                                                                                                                            |

## 12.2 Dominios y prefijos

| **Prefijo**       | **Dominio**                                                | **Módulo** |
|-------------------|------------------------------------------------------------|------------|
| **core\_**        | Empresa, organización, catálogos, consecutivos, parámetros | M00        |
| **iam\_**         | Identidad y acceso                                         | M01        |
| **pty\_**         | Terceros                                                   | M02        |
| **doc\_**         | Gestión documental                                         | M03        |
| **wf\_ · ntf\_**  | Flujos, tareas y notificaciones                            | M04        |
| **crm\_**         | Comercial                                                  | M05        |
| **ctr\_ · sig\_** | Contratos y firma electrónica                              | M06        |
| **prj\_**         | Proyectos y desarrollo                                     | M07        |
| **svc\_**         | Servicio al cliente                                        | M08        |
| **fin\_**         | Facturación, cartera y finanzas operativas                 | M10        |
| **pur\_ · ast\_** | Compras, proveedores y activos                             | M11        |
| **hr\_**          | Talento humano                                             | M12        |
| **sst\_**         | Seguridad y salud en el trabajo                            | M13        |
| **qms\_**         | Calidad, mejora y dirección                                | M14 · M16  |
| **inn\_**         | Innovación y propiedad intelectual                         | M15        |
| **web\_**         | Sitio público y textos legales                             | M17        |
| **prv\_**         | Privacidad                                                 | M18        |
| **aud\_**         | Auditoría                                                  | M19        |
| **ai\_**          | Inteligencia artificial                                    | M20        |

## 12.3 Diccionario de tablas

Se listan las tablas con su propósito y sus columnas propias más relevantes. Todas incluyen además las columnas de control del numeral 12.1. El tipo exacto, las restricciones y los índices de cada columna los define Claude Code en el esquema de Prisma al construir el bloque respectivo, siguiendo estos principios, y quedan documentados en docs/manual/datos.

**Núcleo (core\_)**

| **Tabla**                              | **Propósito**                         | **Columnas principales**                                  |
|----------------------------------------|---------------------------------------|-----------------------------------------------------------|
| **core_tenants**                       | Empresas inquilinas                   | legal_name, trade_name, tax_id, status, settings          |
| **core_sites**                         | Sedes                                 | name, city, address, is_main                              |
| **core_org_units**                     | Procesos y áreas                      | parent_id, code, name, kind, owner_position_id            |
| **core_positions**                     | Cargos del organigrama                | org_unit_id, name, reports_to_id, profile_document_id     |
| **core_cost_centers**                  | Centros de costo                      | code, name, org_unit_id, status                           |
| **core_catalogs · core_catalog_items** | Listas administrables                 | catalog key; code, label, sort_order, is_active, metadata |
| **core_sequences**                     | Consecutivos de negocio               | key, prefix, year, next_value, padding                    |
| **core_parameters**                    | Parámetros versionados                | key, value, valid_from, valid_to                          |
| **core_holidays**                      | Festivos para cálculo de días hábiles | holiday_date, name                                        |
| **core_comments**                      | Comentarios sobre cualquier registro  | entity_type, entity_id, body, visibility                  |
| **core_attachments**                   | Adjuntos de cualquier registro        | entity_type, entity_id, file_id, label                    |
| **core_tags · core_entity_tags**       | Etiquetas                             | name, color; entity_type, entity_id                       |
| **core_outbox_events**                 | Eventos pendientes de publicar        | event_type, payload, occurred_at, published_at, attempts  |

**Identidad y acceso (iam\_)**

| **Tabla**                | **Propósito**                                            | **Columnas principales**                                                                             |
|--------------------------|----------------------------------------------------------|------------------------------------------------------------------------------------------------------|
| **iam_users**            | Cuentas de usuario                                       | email, password_hash, kind, status, party_id, position_id, mfa_required, last_login_at, locked_until |
| **iam_roles**            | Roles                                                    | code, name, is_system, description                                                                   |
| **iam_permissions**      | Catálogo de permisos                                     | resource, action, description                                                                        |
| **iam_role_permissions** | Permisos de cada rol                                     | role_id, permission_id, conditions                                                                   |
| **iam_user_roles**       | Roles de cada usuario                                    | user_id, role_id, scope_type, scope_id, valid_until                                                  |
| **iam_sessions**         | Sesiones activas                                         | user_id, token_hash, ip, user_agent, last_seen_at, expires_at, revoked_at                            |
| **iam_mfa_factors**      | Segundos factores                                        | user_id, type, secret_encrypted, confirmed_at                                                        |
| **iam_recovery_codes**   | Códigos de recuperación                                  | user_id, code_hash, used_at                                                                          |
| **iam_tokens**           | Invitaciones, restablecimientos y códigos de un solo uso | user_id, purpose, token_hash, expires_at, used_at                                                    |
| **iam_login_attempts**   | Intentos de inicio de sesión                             | email, ip, succeeded, reason, occurred_at                                                            |
| **iam_delegations**      | Delegación temporal de aprobaciones                      | from_user_id, to_user_id, starts_at, ends_at, scope                                                  |

**Terceros (pty\_)**

| **Tabla**             | **Propósito**                                                | **Columnas principales**                                                                                      |
|-----------------------|--------------------------------------------------------------|---------------------------------------------------------------------------------------------------------------|
| **pty_parties**       | Persona u organización, registro único                       | kind, legal_name, first_name, last_name, id_type, id_number, check_digit, email, phone, city, address, status |
| **pty_party_roles**   | Papel del tercero: cliente, proveedor, colaborador, contacto | party_id, role, since, status                                                                                 |
| **pty_contacts**      | Personas de contacto de una organización                     | organization_id, person_id, job_title, is_primary, can_sign                                                   |
| **pty_bank_accounts** | Cuentas para pagos                                           | party_id, bank, account_type, account_number_encrypted, certificate_file_id                                   |
| **pty_due_diligence** | Conocimiento del tercero                                     | party_id, form_record_id, risk_level, reviewed_by, reviewed_at, next_review_at                                |

**Gestión documental (doc\_)**

| **Tabla**                | **Propósito**                                  | **Columnas principales**                                                                                                           |
|--------------------------|------------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------|
| **doc_folders**          | Expedientes y carpetas                         | parent_id, code, name, kind, entity_type, entity_id, classification                                                                |
| **doc_documents**        | Documento lógico                               | code, title, doc_type, process_id, classification, status, current_version_id, owner_position_id, retention_rule_id, is_controlled |
| **doc_versions**         | Versiones                                      | document_id, version_label, file_id, change_summary, status, effective_date, approved_by, approved_at                              |
| **doc_files**            | Archivo físico                                 | storage_key, filename, mime_type, size_bytes, sha256, scan_status                                                                  |
| **doc_links**            | Vínculo documento–registro                     | document_id, entity_type, entity_id, relation                                                                                      |
| **doc_change_requests**  | Solicitud de Acción Documental                 | code, document_id, action, justification, requested_by, workflow_instance_id                                                       |
| **doc_acknowledgements** | Constancia de lectura                          | version_id, user_id, acknowledged_at                                                                                               |
| **doc_retention_rules**  | Tabla de retención                             | series, active_years, archive_years, disposition, legal_basis                                                                      |
| **doc_dispositions**     | Disposición final                              | document_id, action, executed_by, executed_at, certificate_file_id                                                                 |
| **doc_form_templates**   | Formatos digitales                             | code, name, schema, layout, version, status                                                                                        |
| **doc_form_records**     | Registros diligenciados                        | template_id, template_version, code, data, status, pdf_file_id, entity_type, entity_id                                             |
| **doc_output_templates** | Plantillas de salida (PDF, DOCX)               | code, name, engine, file_id, variables, version                                                                                    |
| **doc_access_log**       | Consulta y descarga de documentos restringidos | document_id, version_id, user_id, action, occurred_at                                                                              |

**Flujos, tareas y notificaciones (wf\_, ntf\_)**

| **Tabla**             | **Propósito**                          | **Columnas principales**                                                                                          |
|-----------------------|----------------------------------------|-------------------------------------------------------------------------------------------------------------------|
| **wf_definitions**    | Definición de un flujo                 | key, name, entity_type, version, is_active                                                                        |
| **wf_states**         | Estados                                | definition_id, key, label, kind, sla_hours                                                                        |
| **wf_transitions**    | Transiciones permitidas                | definition_id, from_state, to_state, action, required_permission, condition, requires_comment, requires_signature |
| **wf_instances**      | Flujo en curso de un registro          | definition_id, entity_type, entity_id, current_state, started_at, due_at, completed_at                            |
| **wf_history**        | Historial de transiciones              | instance_id, from_state, to_state, action, actor_id, comment, occurred_at                                         |
| **wf_tasks**          | Tareas asignadas                       | instance_id, title, assignee_id, assignee_role, due_at, status, completed_at                                      |
| **wf_approvals**      | Decisiones de aprobación               | task_id, approver_id, decision, comment, decided_at                                                               |
| **wf_sla_policies**   | Acuerdos de tiempo                     | key, priority, first_response_hours, resolution_hours, calendar                                                   |
| **ntf_templates**     | Plantillas de aviso                    | key, channel, subject, body, version                                                                              |
| **ntf_notifications** | Avisos en la aplicación                | user_id, title, body, link, read_at                                                                               |
| **ntf_deliveries**    | Envíos por correo                      | template_key, recipient, status, provider_message_id, sent_at, error                                              |
| **ntf_preferences**   | Preferencias y horario de notificación | user_id, channel, event_key, enabled, quiet_hours                                                                 |

**Comercial (crm\_)**

| **Tabla**                   | **Propósito**                     | **Columnas principales**                                                                          |
|-----------------------------|-----------------------------------|---------------------------------------------------------------------------------------------------|
| **crm_leads**               | Contactos entrantes               | code, source, party_id, need, consent_id, status, owner_id                                        |
| **crm_opportunities**       | Oportunidades                     | code, party_id, title, stage, estimated_value, probability, expected_close, owner_id, lost_reason |
| **crm_activities**          | Llamadas, reuniones, tareas       | opportunity_id, type, subject, due_at, done_at, outcome                                           |
| **crm_services**            | Portafolio y tarifas              | code, name, unit, base_price, tax_rate, is_active                                                 |
| **crm_quotes**              | Cotizaciones                      | code, opportunity_id, version, valid_until, subtotal, tax_total, total, status, pdf_file_id       |
| **crm_quote_items**         | Ítems de la cotización            | quote_id, service_id, description, quantity, unit_price, discount, tax_rate, line_total           |
| **crm_requirement_reviews** | Revisión de requisitos y arranque | opportunity_id, form_record_id, approved_by, approved_at                                          |
| **crm_campaigns**           | Campañas                          | name, channel, starts_at, ends_at, budget                                                         |

**Contratos y firma (ctr\_, sig\_)**

| **Tabla**              | **Propósito**                         | **Columnas principales**                                                                       |
|------------------------|---------------------------------------|------------------------------------------------------------------------------------------------|
| **ctr_contracts**      | Contratos y órdenes de servicio       | code, type, party_id, quote_id, title, value, starts_on, ends_on, renewal, status, document_id |
| **ctr_obligations**    | Obligaciones y hitos contractuales    | contract_id, description, responsible, due_on, status                                          |
| **ctr_amendments**     | Otrosíes y prórrogas                  | contract_id, code, summary, effective_on, document_id                                          |
| **ctr_clause_library** | Cláusulas aprobadas                   | key, title, body, version, approved_by                                                         |
| **sig_envelopes**      | Proceso de firma                      | code, document_version_id, level, status, expires_at, completed_at, evidence_file_id           |
| **sig_signers**        | Firmantes                             | envelope_id, party_id, name, email, id_number, role, sign_order, status, signed_at             |
| **sig_events**         | Eventos del proceso de firma          | envelope_id, signer_id, type, ip, user_agent, occurred_at, prev_hash, hash                     |
| **sig_verifications**  | Consultas a la página de verificación | envelope_id, verified_at, ip, result                                                           |

**Proyectos y desarrollo (prj\_)**

| **Tabla**              | **Propósito**                        | **Columnas principales**                                                                                                       |
|------------------------|--------------------------------------|--------------------------------------------------------------------------------------------------------------------------------|
| **prj_projects**       | Proyectos                            | code, contract_id, party_id, name, type, methodology, status, starts_on, ends_on, budget_hours, budget_amount, manager_id      |
| **prj_members**        | Equipo del proyecto                  | project_id, user_id, role, allocation_pct                                                                                      |
| **prj_milestones**     | Hitos                                | project_id, name, due_on, billing_pct, status                                                                                  |
| **prj_sprints**        | Iteraciones                          | project_id, name, starts_on, ends_on, goal, status                                                                             |
| **prj_items**          | Épicas, historias, tareas y defectos | project_id, parent_id, type, code, title, description, acceptance_criteria, status, priority, estimate, assignee_id, sprint_id |
| **prj_time_entries**   | Registro de horas                    | item_id, user_id, work_date, hours, billable, note                                                                             |
| **prj_deliverables**   | Entregables                          | project_id, milestone_id, name, document_id, status                                                                            |
| **prj_acceptances**    | Actas de entrega y aceptación        | deliverable_id, form_record_id, envelope_id, accepted_at                                                                       |
| **prj_risks**          | Riesgos del proyecto                 | project_id, description, probability, impact, response, owner_id, status                                                       |
| **prj_releases**       | Versiones liberadas                  | project_id, version, released_on, notes, test_report_document_id                                                               |
| **prj_code_reviews**   | Revisiones de código                 | project_id, reference_url, reviewer_id, checklist_record_id, result                                                            |
| **prj_incidents**      | Incidentes críticos y de seguridad   | project_id, code, severity, detected_at, resolved_at, root_cause, form_record_id                                               |
| **prj_external_links** | Enlaces a repositorios y entornos    | project_id, kind, url, label                                                                                                   |

**Servicio al cliente (svc\_)**

| **Tabla**                | **Propósito**                                              | **Columnas principales**                                                                                                            |
|--------------------------|------------------------------------------------------------|-------------------------------------------------------------------------------------------------------------------------------------|
| **svc_tickets**          | Solicitudes de soporte                                     | code, party_id, project_id, requester_id, category, priority, level, subject, status, sla_policy_id, first_response_at, resolved_at |
| **svc_ticket_messages**  | Conversación del tiquete                                   | ticket_id, author_id, body, is_internal                                                                                             |
| **svc_pqrsf**            | Peticiones, quejas, reclamos, sugerencias y felicitaciones | code, type, party_id, channel, description, due_on, status, response, responded_at                                                  |
| **svc_surveys**          | Encuestas                                                  | key, name, questions, trigger                                                                                                       |
| **svc_survey_responses** | Respuestas y NPS                                           | survey_id, party_id, entity_type, entity_id, score, comment, answered_at                                                            |
| **svc_kb_articles**      | Base de conocimiento                                       | title, body, audience, status                                                                                                       |
| **svc_compensations**    | Compensaciones técnicas                                    | ticket_id, type, amount, approved_by, applied_on                                                                                    |
| **svc_warranties**       | Garantías por entregable                                   | deliverable_id, starts_on, ends_on, scope                                                                                           |

**Facturación y finanzas operativas (fin\_)**

| **Tabla**                          | **Propósito**                         | **Columnas principales**                                                                                                                                           |
|------------------------------------|---------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **fin_invoices**                   | Facturas (registro operativo)         | code, party_id, contract_id, milestone_id, issue_date, due_date, subtotal, tax_total, withholding_total, total, status, fiscal_number, fiscal_uuid, fiscal_file_id |
| **fin_invoice_items**              | Ítems de factura                      | invoice_id, description, quantity, unit_price, tax_rate, line_total, cost_center_id                                                                                |
| **fin_credit_notes**               | Notas crédito y débito                | invoice_id, kind, reason, amount, fiscal_number                                                                                                                    |
| **fin_payments**                   | Recaudos                              | invoice_id, paid_on, amount, method, reference, support_file_id                                                                                                    |
| **fin_collection_actions**         | Gestiones de cobro                    | invoice_id, channel, contacted_at, result, promise_date                                                                                                            |
| **fin_impairments**                | Deterioro de cartera                  | period, invoice_id, age_days, rate, amount, approved_by                                                                                                            |
| **fin_budgets · fin_budget_lines** | Presupuesto por centro de costo       | year, status; cost_center_id, account, month, planned, executed                                                                                                    |
| **fin_expenses**                   | Gastos y legalizaciones               | code, cost_center_id, supplier_id, expense_date, amount, category, support_file_id, status                                                                         |
| **fin_petty_cash**                 | Caja menor                            | movement_date, type, amount, concept, voucher_record_id, balance                                                                                                   |
| **fin_bank_reconciliations**       | Conciliaciones bancarias              | account, period, book_balance, bank_balance, differences, status                                                                                                   |
| **fin_cost_certifications**        | Certificación de costos de desarrollo | project_id, period, hours, amount, phase, form_record_id                                                                                                           |
| **fin_tax_parameters**             | Parámetros tributarios vigentes       | key, rate, valid_from, valid_to, legal_basis                                                                                                                       |
| **fin_export_batches**             | Lotes exportados al software contable | period, kind, file_id, exported_by, exported_at                                                                                                                    |

**Compras, proveedores y activos (pur\_, ast\_)**

| **Tabla**                    | **Propósito**                               | **Columnas principales**                                                                |
|------------------------------|---------------------------------------------|-----------------------------------------------------------------------------------------|
| **pur_requests**             | Solicitudes de compra y órdenes de servicio | code, requester_id, cost_center_id, description, estimated_amount, status               |
| **pur_quotes**               | Cotizaciones de proveedores                 | request_id, supplier_id, amount, delivery_days, file_id, selected                       |
| **pur_orders**               | Órdenes de compra                           | code, request_id, supplier_id, total, status, document_id                               |
| **pur_receipts**             | Recepciones                                 | order_id, received_on, received_by, conforming, note                                    |
| **pur_supplier_evaluations** | Selección y reevaluación de proveedores     | supplier_id, period, criteria, score, result                                            |
| **pur_travel_requests**      | Solicitudes de viaje                        | code, traveler_id, destination, starts_on, ends_on, advance_amount, status              |
| **pur_travel_expenses**      | Legalización de viaje                       | travel_request_id, concept, amount, support_file_id                                     |
| **ast_assets**               | Activos fijos y licencias                   | code, name, category, serial, purchase_date, cost, useful_life_months, status, location |
| **ast_assignments**          | Asignación de activos (comodato)            | asset_id, employee_id, assigned_on, returned_on, contract_document_id                   |
| **ast_maintenance**          | Mantenimientos                              | asset_id, kind, scheduled_on, done_on, cost, note                                       |

**Talento humano (hr\_)**

| **Tabla**                                 | **Propósito**                           | **Columnas principales**                                                             |
|-------------------------------------------|-----------------------------------------|--------------------------------------------------------------------------------------|
| **hr_employees**                          | Colaboradores                           | party_id, position_id, hire_date, termination_date, contract_type, work_mode, status |
| **hr_contracts**                          | Contratos laborales y anexos            | employee_id, type, starts_on, ends_on, salary_band, document_id, envelope_id         |
| **hr_vacancies**                          | Vacantes                                | code, position_id, reason, status, opened_on, closed_on                              |
| **hr_candidates**                         | Candidatos                              | party_id, vacancy_id, source, stage, consent_id, retention_until                     |
| **hr_evaluations_selection**              | Evaluaciones de selección               | candidate_id, kind, score, evaluator_id, note                                        |
| **hr_onboarding_tasks**                   | Inducción                               | employee_id, task, responsible_id, due_on, done_on                                   |
| **hr_leave_requests**                     | Permisos, licencias y vacaciones        | employee_id, type, starts_on, ends_on, days, status                                  |
| **hr_overtime**                           | Horas extras                            | employee_id, work_date, hours, kind, authorized_by                                   |
| **hr_payroll_novelties**                  | Novedades de nómina                     | period, employee_id, concept, quantity, amount, source_entity                        |
| **hr_performance_reviews**                | Evaluación de desempeño                 | employee_id, period, objectives, score, reviewer_id, agreed_on                       |
| **hr_trainings · hr_training_attendance** | Formación y asistencia                  | title, kind, scheduled_on, hours; employee_id, attended, evaluation                  |
| **hr_disciplinary_cases**                 | Proceso disciplinario                   | employee_id, code, facts, hearing_on, decision, status                               |
| **hr_offboardings**                       | Retiro                                  | employee_id, reason, last_day, checklist, exit_interview_record_id                   |
| **hr_file_checklist**                     | Lista de chequeo de la historia laboral | employee_id, item, document_id, status                                               |

**Seguridad y salud en el trabajo (sst\_)**

| **Tabla**                     | **Propósito**                             | **Columnas principales**                                                      |
|-------------------------------|-------------------------------------------|-------------------------------------------------------------------------------|
| **sst_hazards**               | Matriz de peligros y riesgos              | process_id, activity, hazard, risk_level, controls, review_on                 |
| **sst_work_plan_items**       | Plan anual de trabajo                     | year, activity, responsible_id, due_on, done_on, evidence_document_id         |
| **sst_incidents**             | Incidentes y accidentes                   | code, employee_id, kind, occurred_at, description, reported_to_arl_at, status |
| **sst_investigations**        | Investigaciones                           | incident_id, root_causes, actions, closed_on, form_record_id                  |
| **sst_inspections**           | Inspecciones locales y de trabajo en casa | kind, inspected_on, inspector_id, findings, form_record_id                    |
| **sst_unsafe_reports**        | Actos y condiciones inseguras             | reported_by, description, location, status                                    |
| **sst_medical_exams**         | Evaluaciones médicas ocupacionales        | employee_id, kind, exam_date, aptitude_concept, restrictions, next_due_on     |
| **sst_ppe_deliveries**        | Entrega de elementos de protección        | employee_id, item, delivered_on, acknowledged                                 |
| **sst_committee_minutes**     | Actas de comités                          | committee, meeting_on, document_id                                            |
| **sst_standards_assessments** | Autoevaluación de estándares mínimos      | year, standard, score, evidence, action_id                                    |

**Calidad, mejora y dirección (qms\_)**

| **Tabla**                  | **Propósito**                           | **Columnas principales**                                                                      |
|----------------------------|-----------------------------------------|-----------------------------------------------------------------------------------------------|
| **qms_processes**          | Procesos y caracterizaciones            | code, name, type, owner_position_id, document_id                                              |
| **qms_context_items**      | Contexto organizacional                 | kind, description, impact, period                                                             |
| **qms_stakeholders**       | Partes interesadas                      | name, needs, expectations, monitoring                                                         |
| **qms_risks**              | Riesgos y oportunidades                 | process_id, kind, description, probability, impact, level, treatment, owner_id, review_on     |
| **qms_nonconformities**    | No conformidades y salidas no conformes | code, source, process_id, description, classification, containment, status                    |
| **qms_actions**            | Acciones correctivas y de mejora        | code, origin_type, origin_id, root_cause, plan, responsible_id, due_on, effectiveness, status |
| **qms_audit_programs**     | Programa anual de auditorías            | year, objectives, status                                                                      |
| **qms_audits**             | Auditorías                              | program_id, code, process_id, auditor_id, planned_on, done_on, report_document_id             |
| **qms_findings**           | Hallazgos                               | audit_id, type, requirement, description, action_id                                           |
| **qms_indicators**         | Indicadores                             | code, process_id, name, formula, unit, target, frequency, source_query                        |
| **qms_measurements**       | Mediciones                              | indicator_id, period, value, analysis, measured_by                                            |
| **qms_management_reviews** | Revisión por la dirección               | period, inputs, decisions, document_id                                                        |
| **qms_legal_requirements** | Normograma                              | norm, issuer, article, requirement, process_id, applies                                       |
| **qms_legal_evaluations**  | Evaluación de cumplimiento legal        | requirement_id, period, status, evidence, action_id                                           |
| **qms_lessons**            | Lecciones aprendidas y conocimiento     | title, context, lesson, process_id                                                            |

**Innovación, sitio público, privacidad, auditoría e inteligencia artificial**

| **Tabla**                     | **Propósito**                                | **Columnas principales**                                                                                                |
|-------------------------------|----------------------------------------------|-------------------------------------------------------------------------------------------------------------------------|
| **inn_ideas**                 | Ideas y proyectos de innovación              | code, title, proposer_id, stage, viability_record_id                                                                    |
| **inn_roadmap_items**         | Hoja de ruta de producto                     | product, title, quarter, status                                                                                         |
| **inn_ip_assets**             | Portafolio de propiedad intelectual          | kind, title, registry_number, filed_on, status, owner, document_id                                                      |
| **inn_tech_watch**            | Vigilancia tecnológica                       | topic, source, finding, relevance                                                                                       |
| **inn_competitors**           | Análisis de competencia                      | name, segment, strengths, weaknesses, updated_on                                                                        |
| **web_legal_texts**           | Textos legales versionados                   | key, version, body, effective_from, approved_by                                                                         |
| **web_legal_acceptances**     | Aceptaciones de términos                     | text_id, user_id, party_id, accepted_at, ip, user_agent                                                                 |
| **web_form_submissions**      | Envíos de formularios públicos               | form_key, data, consent_id, ip, created_lead_id                                                                         |
| **web_pages**                 | Contenido administrable del sitio            | slug, title, body, status, published_at                                                                                 |
| **prv_processing_activities** | Registro de actividades de tratamiento       | name, purpose, data_categories, holders, legal_basis, retention, processors, transfers                                  |
| **prv_notices**               | Avisos y políticas de privacidad versionados | key, version, body, effective_from                                                                                      |
| **prv_consents**              | Autorizaciones de tratamiento                | party_id, notice_id, purposes, channel, granted_at, revoked_at, evidence                                                |
| **prv_cookie_consents**       | Preferencias de cookies                      | visitor_id, policy_version, categories, decided_at, ip_truncated                                                        |
| **prv_requests**              | Consultas y reclamos de titulares            | code, party_id, type, description, received_at, due_on, status, response                                                |
| **prv_incidents**             | Incidentes de seguridad con datos personales | code, detected_at, description, affected_count, reported_to_sic_at, status                                              |
| **prv_processors**            | Encargados y proveedores con acceso a datos  | party_id, service, country, contract_document_id, review_on                                                             |
| **aud_events**                | Auditoría de negocio, solo inserción         | occurred_at, actor_id, actor_kind, action, entity_type, entity_id, result, changes, ip, correlation_id, prev_hash, hash |
| **aud_security_events**       | Eventos de seguridad                         | occurred_at, type, user_id, ip, detail, severity                                                                        |
| **aud_exports**               | Exportaciones de datos y de auditoría        | requested_by, scope, row_count, file_id, exported_at                                                                    |
| **ai_requests**               | Peticiones a la pasarela de IA               | user_id, use_case, model, input_classification, tokens, outcome, reviewed_by                                            |
| **ai_index_chunks**           | Fragmentos indexados para búsqueda semántica | document_version_id, chunk, embedding, classification, permissions                                                      |
| **ai_prompts**                | Instrucciones versionadas                    | key, version, body, approved_by                                                                                         |

## 12.4 Clasificación y retención de los datos

| **Clase**        | **Ejemplos**                                                                               | **Controles**                                                                                                                          |
|------------------|--------------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------------------------------------------------|
| **Pública**      | Contenido del sitio, portafolio, textos legales                                            | Integridad y control de versiones                                                                                                      |
| **Interna**      | Procedimientos, proyectos, tareas, indicadores                                             | Acceso autenticado por rol                                                                                                             |
| **Confidencial** | Contratos, cotizaciones, cartera, datos de clientes, código de clientes                    | Acceso por rol y por pertenencia; registro de consulta y descarga; enlaces temporales                                                  |
| **Restringida**  | Datos de salud ocupacional, procesos disciplinarios, salarios, cuentas bancarias, secretos | Cifrado de campo, acceso nominal, segundo factor, registro de cada lectura, exclusión de exportaciones y de la inteligencia artificial |

Los plazos de conservación provienen de la Tabla de Retención de Registros RE-SGC-005 y se configuran en doc_retention_rules. Como referencia legal: los libros y papeles del comerciante se conservan diez años (Ley 962 de 2005, art. 28); las historias laborales y los registros del SG-SST, por el tiempo que fija la normativa laboral y el Decreto 1072 de 2015; los datos de candidatos no seleccionados, máximo doce meses salvo autorización; los datos personales, solo mientras subsista la finalidad o un deber legal. Un trabajo programado propone cada mes las disposiciones vencidas y el responsable las aprueba; nada se elimina automáticamente sin aprobación.
