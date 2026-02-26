# Plano Tecnico Final - Modulo de Treinamentos e Qualidade

## 1) Objetivo

Implementar um modulo de Qualidade para:

- Gerenciar documentos operacionais (POPs) com versionamento.
- Planejar e registrar treinamentos.
- Controlar conformidade e auditorias internas.
- Medir status operacional (vencimentos, execucao, pendencias) com dados auditaveis.

## 2) Escopo funcional aprovado

O modulo sera dividido em 3 paginas:

1. `Documentos Operacionais`
2. `Treinamentos` (duas abas: `Cronograma Anual` e `Realizacoes`)
3. `Conformidade e Auditorias`

Decisao de desenho:

- O item "Cronograma anual de treinamentos" fica dentro da pagina de Treinamentos para evitar duplicidade.
- POP e Treinamento terao relacao N:N (um POP pode vincular varios treinamentos e vice-versa).
- Auditoria referencia POP por `document_id` + `version_id` para rastreabilidade real.

## 3) Modelo de dados (MySQL)

### 3.1 Tabelas principais

1. `qms_documents`
- `id` (PK)
- `code` (unico, legivel: `POP-2026-0001`)
- `sector`
- `name`
- `objective`
- `status` (`rascunho`, `vigente`, `a_vencer`, `vencido`, `arquivado`)
- `periodicity_days`
- `created_by`, `created_at`, `updated_by`, `updated_at`

2. `qms_document_versions`
- `id` (PK)
- `document_id` (FK `qms_documents.id`)
- `version_label` (ex.: `1.0`, `1.1`, `2.0`)
- `elaborated_by`
- `reviewed_by`
- `approved_by`
- `creation_date`
- `last_review_date`
- `next_review_date`
- `revision_reason`
- `scope`
- `notes`
- `is_current` (bool)

3. `qms_document_files`
- `id` (PK)
- `document_version_id` (FK)
- `storage_provider` (`s3`)
- `bucket`
- `key`
- `filename`
- `mime_type`
- `size_bytes`
- `uploaded_by`
- `uploaded_at`

4. `qms_training_plans`
- `id` (PK)
- `code` (unico, legivel: `CRN-2026-0001`)
- `theme`
- `training_type` (`inicial`, `reciclagem`)
- `objective`
- `instructor`
- `target_audience`
- `workload_hours`
- `planned_date`
- `expiration_date`
- `evaluation_applied` (bool)
- `evaluation_type`
- `target_indicator`
- `expected_goal`
- `status` (`planejado`, `em_andamento`, `concluido`, `cancelado`)
- `notes`

5. `qms_trainings`
- `id` (PK)
- `code` (unico, legivel: `TRN-2026-0001`)
- `plan_id` (FK `qms_training_plans.id`, opcional)
- `name`
- `sector`
- `training_type`
- `instructor`
- `target_audience`
- `performed_at`
- `workload_hours`
- `evaluation_applied` (bool)
- `average_score`
- `next_training_date`
- `status`
- `participants_planned`
- `participants_actual`
- `result_post_training`
- `notes`

6. `qms_training_files`
- `id` (PK)
- `training_id` (FK)
- `file_type` (`attendance_list`, `evaluation`, `evidence`, `other`)
- `storage_provider`, `bucket`, `key`, `filename`, `mime_type`, `size_bytes`
- `uploaded_by`, `uploaded_at`

7. `qms_document_training_links`
- `document_id` (FK)
- `training_plan_id` (FK)
- PK composta (`document_id`, `training_plan_id`)

8. `qms_audits`
- `id` (PK)
- `code` (unico, legivel: `AUD-2026-0001`)
- `document_id` (FK)
- `document_version_id` (FK)
- `responsible`
- `audit_date`
- `compliance_percent`
- `non_conformity`
- `action_plan`
- `correction_deadline`
- `reassessed` (bool)
- `effectiveness_check_date`
- `criticality` (`baixa`, `media`, `alta`)
- `status` (`aberta`, `em_tratativa`, `encerrada`)

9. `qms_audit_actions`
- `id` (PK)
- `audit_id` (FK)
- `description`
- `owner`
- `deadline`
- `status` (`aberta`, `em_andamento`, `concluida`, `atrasada`)
- `completion_note`

10. `qms_audit_log`
- `id` (PK)
- `entity_type`
- `entity_id`
- `action` (`create`, `update`, `delete`, `status_change`, `file_upload`)
- `before_json`
- `after_json`
- `actor_user_id`
- `created_at`

### 3.2 Indices e constraints

- Unicos por `code` em todas as entidades.
- Indices por data/status:
  - `qms_document_versions(next_review_date, is_current)`
  - `qms_trainings(performed_at, status)`
  - `qms_training_plans(planned_date, status)`
  - `qms_audits(audit_date, status, correction_deadline)`
- FKs com `ON DELETE RESTRICT` nas entidades de historico.
- Soft-delete para entidades mestre (`archived_at`), quando aplicavel.

## 4) API (Next.js route handlers)

Base: `frontend/src/app/api/admin/qms/...`

### 4.1 Documentos

- `GET /documents` (filtros: setor, status, vencimento, texto)
- `POST /documents` (cria documento + versao inicial)
- `GET /documents/:id`
- `PATCH /documents/:id`
- `DELETE /documents/:id` (arquivo lógico/arquivar)
- `POST /documents/:id/versions` (nova revisao)
- `POST /documents/:id/files` (upload S3)
- `GET /documents/:id/files/:fileId/download`

### 4.2 Treinamentos

- `GET /training-plans`
- `POST /training-plans`
- `PATCH /training-plans/:id`
- `GET /trainings`
- `POST /trainings`
- `PATCH /trainings/:id`
- `POST /trainings/:id/files`
- `GET /trainings/:id/files/:fileId/download`
- `POST /training-plans/:id/link-document` (N:N)
- `DELETE /training-plans/:id/link-document/:documentId`

### 4.3 Auditorias

- `GET /audits`
- `POST /audits`
- `PATCH /audits/:id`
- `POST /audits/:id/actions`
- `PATCH /audits/:id/actions/:actionId`

### 4.4 Refresh e heartbeat

- `POST /qms/documents/refresh`
- `POST /qms/trainings/refresh`
- `POST /qms/audits/refresh`

Obs.: refresh recalcula status derivados (a_vencer, vencido, atrasada etc.) e atualiza `system_status`.

## 5) Frontend (PT-BR) e composicao de telas

### 5.1 Rotas

- `frontend/src/app/(admin)/qualidade/documentos/page.tsx`
- `frontend/src/app/(admin)/qualidade/treinamentos/page.tsx`
- `frontend/src/app/(admin)/qualidade/auditorias/page.tsx`

### 5.2 Componentizacao recomendada

Para manter arquivos curtos:

- `components/DocumentFormModal.tsx`
- `components/DocumentTable.tsx`
- `components/TrainingPlanFormModal.tsx`
- `components/TrainingExecutionFormModal.tsx`
- `components/TrainingTable.tsx`
- `components/AuditFormModal.tsx`
- `components/AuditTable.tsx`
- `components/QmsStatusStrip.tsx` (heartbeat e alertas)

### 5.3 Regras de UX

- Labels e mensagens em PT-BR.
- Datas em `dd/mm/aaaa` na UI.
- Modal com validacao obrigatoria e mensagens claras.
- Campos longos (`plano de acao`, `nao conformidade`, `observacoes`) com `textarea` e resize vertical.
- Tabelas com ordenacao por coluna, filtros, paginação e exportacao CSV.

## 6) Permissoes

Reusar padrao atual (`view`, `edit`, `refresh`) por pagina:

- `qualidade_documentos`
- `qualidade_treinamentos`
- `qualidade_auditorias`

Regra:

- `view`: visualiza tela e baixa anexos.
- `edit`: cria/edita/arquiva, faz upload de anexos.
- `refresh`: executa recálculo/manual refresh.

## 7) S3 e anexos

- Reuso do provider atual (S3).
- Prefixos sugeridos:
  - `qms/documents/{document_id}/{version_id}/...`
  - `qms/trainings/{training_id}/...`
  - `qms/audits/{audit_id}/...` (evidencias futuras)
- Validar MIME e tamanho maximo por tipo.
- Nao salvar arquivo em DB; somente metadados e chave S3.

## 8) Indicadores operacionais (MVP)

1. `% POPs vigentes` = POPs vigentes / POPs ativos.
2. `% revisoes em dia` = revisoes com `next_review_date >= hoje`.
3. `% treinamentos executados no prazo` = treinamentos executados dentro da data planejada.
4. `% auditorias conformes` = auditorias com `compliance_percent >= meta`.
5. `% acoes corretivas atrasadas`.

## 9) Plano por sprints

## Sprint 1 - Fundacao e Documentos (POPs)

Objetivo: subir estrutura de documentos com versao e anexo.

Entrega tecnica:

1. Migracoes MySQL:
- `qms_documents`
- `qms_document_versions`
- `qms_document_files`
- `qms_audit_log` (base)

2. APIs de documentos:
- listar, criar, editar, arquivar
- criar nova versao
- upload/download S3

3. Frontend:
- pagina `Documentos Operacionais`
- modal de cadastro/edicao
- tabela com filtros e ordenacao

4. Permissoes:
- `qualidade_documentos` com `view/edit/refresh`

Criterios de aceite:

- cadastro de POP completo com versao inicial.
- upload e download funcionando.
- revisao/versao nova preservando historico.
- logs de alteracao gravados em `qms_audit_log`.

## Sprint 2 - Treinamentos (Cronograma + Realizacoes)

Objetivo: planejar e executar treinamentos no mesmo dominio.

Entrega tecnica:

1. Migracoes:
- `qms_training_plans`
- `qms_trainings`
- `qms_training_files`
- `qms_document_training_links`

2. APIs:
- CRUD de cronograma
- CRUD de realizacao
- upload lista de presenca/avaliacao
- vinculo POP <-> cronograma

3. Frontend:
- pagina `Treinamentos` com abas `Cronograma Anual` e `Realizacoes`
- modais separados para planejamento e execucao
- filtros por setor, status, periodo

4. Permissoes:
- `qualidade_treinamentos`

Criterios de aceite:

- registrar planejamento e execucao sem duplicidade.
- vincular treinamento a POP existente.
- anexar lista de presenca e baixar arquivo.
- status consistente entre planejado e realizado.

## Sprint 3 - Conformidade e Auditorias

Objetivo: registrar auditorias, nao conformidades e plano de acao.

Entrega tecnica:

1. Migracoes:
- `qms_audits`
- `qms_audit_actions`

2. APIs:
- CRUD de auditoria
- CRUD de acoes corretivas
- atualizacao de status/reateste

3. Frontend:
- pagina `Conformidade e Auditorias`
- modal de auditoria
- subgrid de acoes corretivas

4. Permissoes:
- `qualidade_auditorias`

Criterios de aceite:

- auditoria vinculada a versao correta de POP.
- plano de acao com responsavel e prazo.
- possibilidade de reavaliacao e encerramento.
- rastreabilidade completa no log.

## Sprint 4 - Automacoes, indicadores e hardening

Objetivo: fechar ciclo operacional e qualidade de uso.

Entrega tecnica:

1. Jobs/refresh:
- recalculo de vencimentos e status
- atualizacao heartbeat em `system_status`

2. Indicadores:
- cards de compliance por pagina
- endpoints agregados para status geral

3. Hardening:
- validacao de payload
- controle de erro padronizado
- protecao de rotas por permissao
- testes de regressao (API + regras criticas)

4. Documentacao:
- atualizar `frontend/docs/01`, `03`, `04`, `05` com novo modulo

Criterios de aceite:

- indicadores batendo com base transacional.
- alertas de vencimento funcionais.
- refresh manual e heartbeat visiveis.
- sem regressao nas permissoes existentes.

## 10) Riscos e mitigacao

1. Duplicidade entre planejamento e execucao.
- Mitigacao: separar tabelas (`plan` e `realizacao`) com vinculo opcional.

2. Perda de rastreabilidade de versao de POP.
- Mitigacao: auditoria sempre aponta para `document_version_id`.

3. Crescimento de arquivo e custo S3.
- Mitigacao: limite de tamanho, bloqueio por MIME, lifecycle policy.

4. Arquivos frontend muito extensos.
- Mitigacao: componentizacao obrigatoria por dominio.

## 11) Definicao de pronto (DoD)

- Migracoes aplicadas e reversiveis.
- APIs com validacao e tratamento de erro consistente.
- UI em PT-BR, sem texto quebrado/encoding incorreto.
- Permissoes `view/edit/refresh` ativas por pagina.
- Logs de auditoria gerados para create/update/delete.
- Documentacao atualizada em `frontend/docs`.

