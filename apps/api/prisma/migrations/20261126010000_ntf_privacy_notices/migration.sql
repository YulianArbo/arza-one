-- B42 · Avisos de Privacidad (decisión 11): solicitud de titular nueva, solicitud por vencer o
-- vencida e incidente por reportar a la SIC. Solo amplía las listas permitidas: la versión anterior
-- sigue funcionando.

ALTER TABLE "ntf_templates" DROP CONSTRAINT "ntf_templates_key_check";
ALTER TABLE "ntf_notifications" DROP CONSTRAINT "ntf_notifications_kind_check";
ALTER TABLE "ntf_preferences" DROP CONSTRAINT "ntf_preferences_event_key_check";

ALTER TABLE "ntf_templates"
    ADD CONSTRAINT "ntf_templates_key_check" CHECK ("key" IN ('task_assigned', 'task_escalated',
        'comment_mention', 'security_alert', 'doc_read_requested', 'doc_request_decided',
        'crm_activity_due', 'crm_quote_update', 'ctr_contract_update', 'prj_project_update',
        'svc_ticket_update', 'svc_ticket_alert', 'svc_pqrsf_update', 'hr_onboarding_task',
        'hr_leave_update', 'hr_overtime_update', 'hr_review_update', 'hr_disciplinary_notice',
        'hr_offboarding_task', 'sst_report_received', 'sst_arl_due', 'sst_exam_due',
        'sst_task_assigned', 'sst_complaint_received', 'qms_nonconformity_reported',
        'qms_action_assigned', 'qms_action_to_verify', 'qms_action_overdue',
        'qms_audit_assigned', 'qms_indicator_due', 'qms_review_to_approve',
        'prv_request_received', 'prv_request_due', 'prv_incident_due'));
ALTER TABLE "ntf_notifications"
    ADD CONSTRAINT "ntf_notifications_kind_check" CHECK ("kind" IN ('task_assigned', 'task_escalated',
        'comment_mention', 'security_alert', 'doc_read_requested', 'doc_request_decided',
        'crm_activity_due', 'crm_quote_update', 'ctr_contract_update', 'prj_project_update',
        'svc_ticket_update', 'svc_ticket_alert', 'svc_pqrsf_update', 'hr_onboarding_task',
        'hr_leave_update', 'hr_overtime_update', 'hr_review_update', 'hr_disciplinary_notice',
        'hr_offboarding_task', 'sst_report_received', 'sst_arl_due', 'sst_exam_due',
        'sst_task_assigned', 'sst_complaint_received', 'qms_nonconformity_reported',
        'qms_action_assigned', 'qms_action_to_verify', 'qms_action_overdue',
        'qms_audit_assigned', 'qms_indicator_due', 'qms_review_to_approve',
        'prv_request_received', 'prv_request_due', 'prv_incident_due'));
ALTER TABLE "ntf_preferences"
    ADD CONSTRAINT "ntf_preferences_event_key_check" CHECK ("event_key" IN ('task_assigned', 'task_escalated',
        'comment_mention', 'security_alert', 'doc_read_requested', 'doc_request_decided',
        'crm_activity_due', 'crm_quote_update', 'ctr_contract_update', 'prj_project_update',
        'svc_ticket_update', 'svc_ticket_alert', 'svc_pqrsf_update', 'hr_onboarding_task',
        'hr_leave_update', 'hr_overtime_update', 'hr_review_update', 'hr_disciplinary_notice',
        'hr_offboarding_task', 'sst_report_received', 'sst_arl_due', 'sst_exam_due',
        'sst_task_assigned', 'sst_complaint_received', 'qms_nonconformity_reported',
        'qms_action_assigned', 'qms_action_to_verify', 'qms_action_overdue',
        'qms_audit_assigned', 'qms_indicator_due', 'qms_review_to_approve',
        'prv_request_received', 'prv_request_due', 'prv_incident_due'));
