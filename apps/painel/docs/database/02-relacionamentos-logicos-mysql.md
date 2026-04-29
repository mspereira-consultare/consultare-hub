# Relacionamentos Logicos do MySQL

## Premissas

- Nenhuma `FOREIGN KEY` fisica foi encontrada no schema vivo extraido do MySQL.
- Os relacionamentos abaixo combinam vinculos logicos inferidos de nomes de colunas, jobs e repositories do projeto.
- Em caso de divergencia entre dado real e inferencia, prevalece o uso observado no codigo do modulo.

## Mapa consolidado

| Tabela origem | Coluna origem | Tabela destino | Coluna destino | Tipo | Observacao |
| --- | --- | --- | --- | --- | --- |
| clinia_ads_job_items | job_id | clinia_ads_jobs | id | Vinculo logico | Ligacao entre item/artefato e o job pai. |
| clinic_equipment_events | equipment_id | clinic_equipment | id | Vinculo logico | Ligacao por equipamento. |
| clinic_equipment_files | equipment_id | clinic_equipment | id | Vinculo logico | Ligacao por equipamento. |
| contract_template_audit_log | template_id | contract_templates | id | Vinculo logico | Ligacao por modelo de contrato. |
| employee_audit_log | employee_id | employees | id | Vinculo logico | Relacionamento esperado por identificador de colaborador. |
| employee_documents | employee_id | employees | id | Vinculo logico | Relacionamento esperado por identificador de colaborador. |
| employee_documents_inactive | employee_id | employees | id | Vinculo logico | Relacionamento esperado por identificador de colaborador. |
| employee_lifecycle_cases | employee_id | employees | id | Vinculo logico | Relacionamento esperado por identificador de colaborador. |
| employee_locker_assignments | employee_id | employees | id | Vinculo logico | Relacionamento esperado por identificador de colaborador. |
| employee_portal_invites | employee_id | employees | id | Vinculo logico | Relacionamento esperado por identificador de colaborador. |
| employee_portal_sessions | employee_id | employees | id | Vinculo logico | Relacionamento esperado por identificador de colaborador. |
| employee_portal_submission_documents | employee_id | employees | id | Vinculo logico | Relacionamento esperado por identificador de colaborador. |
| employee_portal_submissions | employee_id | employees | id | Vinculo logico | Relacionamento esperado por identificador de colaborador. |
| employee_recess_periods | employee_id | employees | id | Vinculo logico | Relacionamento esperado por identificador de colaborador. |
| employee_uniform_items | employee_id | employees | id | Vinculo logico | Relacionamento esperado por identificador de colaborador. |
| feegow_appointments | patient_id | feegow_patients | patient_id | Vinculo logico | Ligacao por paciente na Feegow. |
| feegow_patient_contacts_cache | patient_id | feegow_patients | patient_id | Vinculo logico | Ligacao por paciente na Feegow. |
| feegow_proposals | patient_id | feegow_patients | patient_id | Vinculo logico | Ligacao por paciente na Feegow. |
| feegow_repasse_a_conferir | professional_id | professionals | id | Vinculo logico | Relacionamento esperado por identificador de profissional. |
| feegow_repasse_consolidado | professional_id | professionals | id | Vinculo logico | Relacionamento esperado por identificador de profissional. |
| goals_config | employee_id | employees | id | Vinculo logico | Relacionamento esperado por identificador de colaborador. |
| health_surveillance_document_licenses | document_id | health_surveillance_documents | id | Vinculo logico | Ligacao por documento regulatorio. |
| health_surveillance_document_licenses | license_id | health_surveillance_licenses | id | Vinculo logico | Ligacao por licenca regulatoria. |
| health_surveillance_documents | license_id | health_surveillance_licenses | id | Vinculo logico | Ligacao por licenca regulatoria. |
| intranet_chat_conversation_members | user_id | users | id | Vinculo logico | Relacionamento esperado por identificador de usuario. |
| intranet_editorial_scope_assignments | user_id | users | id | Vinculo logico | Relacionamento esperado por identificador de usuario. |
| intranet_professional_catalog_items | professional_id | professionals | id | Vinculo logico | Relacionamento esperado por identificador de profissional. |
| intranet_professional_notes | professional_id | professionals | id | Vinculo logico | Relacionamento esperado por identificador de profissional. |
| intranet_professional_procedures | professional_id | professionals | id | Vinculo logico | Relacionamento esperado por identificador de profissional. |
| intranet_professional_profiles | professional_id | professionals | id | Vinculo logico | Relacionamento esperado por identificador de profissional. |
| intranet_professional_specialties | professional_id | professionals | id | Vinculo logico | Relacionamento esperado por identificador de profissional. |
| intranet_user_audience_assignments | user_id | users | id | Vinculo logico | Relacionamento esperado por identificador de usuario. |
| marketing_funnel_job_items | job_id | marketing_funnel_jobs | id | Vinculo logico | Ligacao entre item/artefato e o job pai. |
| payroll_lines | employee_id | employees | id | Vinculo logico | Relacionamento esperado por identificador de colaborador. |
| payroll_occurrences | employee_id | employees | id | Vinculo logico | Relacionamento esperado por identificador de colaborador. |
| payroll_point_daily | employee_id | employees | id | Vinculo logico | Relacionamento esperado por identificador de colaborador. |
| professional_audit_log | professional_id | professionals | id | Vinculo logico | Relacionamento esperado por identificador de profissional. |
| professional_contracts | professional_id | professionals | id | Vinculo logico | Relacionamento esperado por identificador de profissional. |
| professional_document_checklist | professional_id | professionals | id | Vinculo logico | Relacionamento esperado por identificador de profissional. |
| professional_documents | professional_id | professionals | id | Vinculo logico | Relacionamento esperado por identificador de profissional. |
| professional_documents_inactive | professional_id | professionals | id | Vinculo logico | Relacionamento esperado por identificador de profissional. |
| professional_procedure_rates | professional_id | professionals | id | Vinculo logico | Relacionamento esperado por identificador de profissional. |
| professional_registrations | professional_id | professionals | id | Vinculo logico | Relacionamento esperado por identificador de profissional. |
| proposal_followup_control | proposal_id | feegow_proposals | id | Vinculo logico | Controle manual complementar da proposta comercial. |
| qms_audit_actions | audit_id | qms_audits | id | Vinculo logico | Ligacao por auditoria. |
| qms_audits | document_id | qms_documents | id | Vinculo logico | Ligacao por documento do modulo QMS. |
| qms_document_training_links | document_id | qms_documents | id | Vinculo logico | Ligacao por documento do modulo QMS. |
| qms_document_versions | document_id | qms_documents | id | Vinculo logico | Ligacao por documento do modulo QMS. |
| qms_training_assignments | employee_id | employees | id | Vinculo logico | Relacionamento esperado por identificador de colaborador. |
| qms_training_assignments | training_id | qms_trainings | id | Vinculo logico | Ligacao por treinamento. |
| qms_training_files | training_id | qms_trainings | id | Vinculo logico | Ligacao por treinamento. |
| qms_trainings | plan_id | qms_training_plans | id | Vinculo logico | Ligacao por plano de treinamento. |
| repasse_consolidacao_job_items | professional_id | professionals | id | Vinculo logico | Relacionamento esperado por identificador de profissional. |
| repasse_consolidacao_job_items | job_id | repasse_consolidacao_jobs | id | Vinculo logico | Ligacao entre item/artefato e o job pai. |
| repasse_consolidacao_line_marks | professional_id | professionals | id | Vinculo logico | Relacionamento esperado por identificador de profissional. |
| repasse_consolidacao_line_marks | user_id | users | id | Vinculo logico | Relacionamento esperado por identificador de usuario. |
| repasse_consolidacao_mark_legends | user_id | users | id | Vinculo logico | Relacionamento esperado por identificador de usuario. |
| repasse_consolidacao_notes | professional_id | professionals | id | Vinculo logico | Relacionamento esperado por identificador de profissional. |
| repasse_fechamento_manual | professional_id | professionals | id | Vinculo logico | Relacionamento esperado por identificador de profissional. |
| repasse_pdf_artifacts | professional_id | professionals | id | Vinculo logico | Relacionamento esperado por identificador de profissional. |
| repasse_professional_notes | professional_id | professionals | id | Vinculo logico | Relacionamento esperado por identificador de profissional. |
| repasse_sync_job_items | professional_id | professionals | id | Vinculo logico | Relacionamento esperado por identificador de profissional. |
| repasse_sync_job_items | job_id | repasse_sync_jobs | id | Vinculo logico | Ligacao entre item/artefato e o job pai. |
| user_page_permissions | user_id | users | id | Vinculo logico | Relacionamento esperado por identificador de usuario. |
| user_teams | team_id | teams_master | id | Vinculo logico | Relacionamento esperado por identificador de equipe. |
| user_teams | user_name | users | name | Vinculo logico | Associacao por nome do usuario/agendador; nao ha FK fisica. |
| users | employee_id | employees | id | Vinculo logico | Relacionamento esperado por identificador de colaborador. |

