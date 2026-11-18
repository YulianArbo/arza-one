-- B35 (decisión 6): aviso nuevo para quien responde por una tarea de inducción de un colaborador
-- que se acaba de vincular. Solo expande: la versión anterior sigue funcionando.

ALTER TABLE "ntf_templates" DROP CONSTRAINT "ntf_templates_key_check";
ALTER TABLE "ntf_notifications" DROP CONSTRAINT "ntf_notifications_kind_check";
ALTER TABLE "ntf_preferences" DROP CONSTRAINT "ntf_preferences_event_key_check";

ALTER TABLE "ntf_templates"
    ADD CONSTRAINT "ntf_templates_key_check" CHECK ("key" IN ('task_assigned', 'task_escalated',
        'comment_mention', 'security_alert', 'doc_read_requested', 'doc_request_decided',
        'crm_activity_due', 'crm_quote_update', 'ctr_contract_update', 'prj_project_update',
        'svc_ticket_update', 'svc_ticket_alert', 'svc_pqrsf_update', 'hr_onboarding_task'));
ALTER TABLE "ntf_notifications"
    ADD CONSTRAINT "ntf_notifications_kind_check" CHECK ("kind" IN ('task_assigned', 'task_escalated',
        'comment_mention', 'security_alert', 'doc_read_requested', 'doc_request_decided',
        'crm_activity_due', 'crm_quote_update', 'ctr_contract_update', 'prj_project_update',
        'svc_ticket_update', 'svc_ticket_alert', 'svc_pqrsf_update', 'hr_onboarding_task'));
ALTER TABLE "ntf_preferences"
    ADD CONSTRAINT "ntf_preferences_event_key_check" CHECK ("event_key" IN ('task_assigned',
        'task_escalated', 'comment_mention', 'security_alert', 'doc_read_requested',
        'doc_request_decided', 'crm_activity_due', 'crm_quote_update', 'ctr_contract_update',
        'prj_project_update', 'svc_ticket_update', 'svc_ticket_alert', 'svc_pqrsf_update',
        'hr_onboarding_task'));
