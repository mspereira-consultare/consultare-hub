# Plano Tecnico - Modulo de Colaboradores

## 1. Objetivo

O modulo `/colaboradores` centraliza a operacao do Departamento Pessoal no painel, cobrindo:
- cadastro e desligamento de colaboradores;
- dashboard gerencial de funcionários;
- leitura gerencial de Qualidade & Metas;
- beneficios;
- uniforme e armario;
- recessos;
- documentos com upload/download;
- status operacional do ASO e pendencias documentais.

O desenho segue o mesmo padrao funcional de `/profissionais`:
- pagina principal com tabela, filtros e paginacao;
- modal grande com abas;
- APIs proprias em `/api/admin/colaboradores/*`;
- persistencia direta em MySQL.

## 2. Componentes implementados

### Frontend

- Pagina principal: `frontend/src/app/(admin)/colaboradores/page.tsx`
- Ajuda guiada: `frontend/src/app/(admin)/colaboradores/components/ColaboradoresHelpModal.tsx`
- Dominio:
  - `frontend/src/lib/colaboradores/constants.ts`
  - `frontend/src/lib/colaboradores/types.ts`
  - `frontend/src/lib/colaboradores/status.ts`
  - `frontend/src/lib/colaboradores/auth.ts`
  - `frontend/src/lib/colaboradores/repository.ts`
- Sidebar: `frontend/src/components/layout/Sidebar.tsx`
- Permissoes: `frontend/src/lib/permissions.ts`

### APIs

- `GET/POST /api/admin/colaboradores`
- `GET/PUT /api/admin/colaboradores/[id]`
- `GET /api/admin/colaboradores/dashboard`
- `GET /api/admin/colaboradores/quality-goals`
- `GET /api/admin/colaboradores/options`
- `GET/POST /api/admin/colaboradores/[id]/documentos`
- `GET /api/admin/colaboradores/documentos/[documentId]/download`
- `DELETE /api/admin/colaboradores/documentos/[documentId]`
- `GET/POST /api/admin/colaboradores/[id]/uniformes`
- `PUT/DELETE /api/admin/colaboradores/[id]/uniformes/[entryId]`
- `GET/POST /api/admin/colaboradores/[id]/recessos`
- `PUT/DELETE /api/admin/colaboradores/[id]/recessos/[entryId]`
- `GET/POST /api/admin/colaboradores/lifecycle`
- `PATCH /api/admin/colaboradores/lifecycle/[caseId]`
- `PATCH /api/admin/colaboradores/lifecycle/[caseId]/tasks`

## 3. Modelo de dados

As tabelas sao garantidas em runtime por `ensureEmployeesTables()` no repositorio.

### `employees`

Cadastro principal do colaborador.

Campos principais:
- identificacao: `full_name`, `rg`, `cpf`, `birth_date`;
- contato: `email`, `phone`;
- endereco: `street`, `street_number`, `address_complement`, `district`, `city`, `state_uf`, `zip_code`;
- vinculo: `employment_regime`, `status`, `work_schedule`, `salary_amount`, `contract_duration_text`, `admission_date`, `contract_end_date`;
- lotacao: `units_json`, `job_title`, `department`, `supervisor_name`, `cost_center`;
- estagio: `education_institution`, `education_level`, `course_name`, `current_semester`;
- beneficios: `insalubrity_percent`, `transport_voucher_per_day`, `meal_voucher_per_day`, `life_insurance_status`;
- familia: `marital_status`, `has_children`, `children_count`;
- bancario: `bank_name`, `bank_agency`, `bank_account`, `pix_key`;
- desligamento: `termination_date`, `termination_reason`, `termination_notes`;
- auditoria: `created_at`, `updated_at`.

### `employee_documents`

Metadados de arquivos enviados para o colaborador.

Campos principais:
- `employee_id`, `doc_type`;
- `storage_provider`, `storage_bucket`, `storage_key`;
- `original_name`, `mime_type`, `size_bytes`;
- `issue_date`, `expires_at`, `notes`;
- `is_active`, `uploaded_by`, `created_at`.

Regras atuais:
- novo upload do mesmo tipo desativa os anteriores e preserva o arquivo antigo no historico;
- `OUTRO` permite multiplos documentos ativos para anexos diversos;
- `ASO` usa o mesmo fluxo documental, com `issue_date` e `expires_at`;
- `Conta Bancaria` fica no cadastro estruturado, nao em upload.

### `employee_documents_inactive`

Tabela de apoio para historico de documentos inativos.

Campos principais:
- `source_document_id`, `employee_id`, `doc_type`;
- metadados originais do arquivo (`storage_*`, `original_name`, `mime_type`, `size_bytes`);
- `issue_date`, `expires_at`, `notes`;
- `inactive_reason` (`REPLACED` ou `DELETED`);
- `original_created_at`, `archived_by`, `archived_at`.

Uso:
- recebe copia do documento ativo quando ele e substituido por novo upload;
- recebe copia quando o usuario exclui/remova o arquivo da checklist ativa;
- o arquivo fisico permanece no storage para consulta historica.

### `employee_uniform_items`

Movimentacoes de uniforme e armario.

Campos principais:
- `withdrawal_date`
- `item_description`
- `quantity`
- `signed_receipt`
- `delivery_type`
- `delivered_by`
- `status`
- `created_at`, `updated_at`

### `employee_recess_periods`

Controle de periodos aquisitivos e programacao de ferias.

Campos principais:
- `acquisition_start_date`, `acquisition_end_date`
- `days_due`, `days_paid`
- `leave_deadline_date`
- `vacation_start_date`, `vacation_duration_days`
- `sell_ten_days`, `thirteenth_on_vacation`
- `created_at`, `updated_at`

Campos calculados em leitura:
- `balance = days_due - days_paid`
- `vacationEndDate = vacationStartDate + duration - 1`
- `situation = QUITADAS | VENCIDAS | EM_ABERTO`

### `employee_lifecycle_cases`

Processos de admissão e desligamento da Onda 3.

Campos principais:
- `employee_id`
- `case_type` (`ADMISSION` ou `TERMINATION`)
- `stage` (`PRE_ADMISSION`, `ADMISSION_IN_PROGRESS`, `TERMINATION_IN_PROGRESS`, `CLOSED`)
- `owner_name`
- `target_date`
- `closed_at`
- `notes`
- `created_at`, `updated_at`

### `employee_lifecycle_tasks`

Checklist operacional vinculado ao processo.

Campos principais:
- `case_id`
- `task_key`
- `title`
- `status` (`PENDING`, `DONE`, `BLOCKED`, `WAIVED`)
- `owner_name`
- `due_date`
- `notes`
- `source_type` (`EMPLOYEE_FIELD`, `DOCUMENT`, `UNIFORM`, `LOCKER`, `MANUAL`)
- `source_ref`
- `sort_order`
- `created_at`, `updated_at`

Regra importante:
- `source_type` e `source_ref` indicam a fonte oficial da informação; o checklist acompanha o andamento, mas não duplica documentos, uniforme, armário ou dados contratuais.

### Integração `Qualidade & Metas`

Implementação da Onda 6 do plano RH como leitura consolidada, sem cadastro paralelo.

Fontes oficiais:
- metas continuam em `goals_config`;
- treinamentos e evidências continuam no módulo de Qualidade;
- cadastro, documentos e ASO continuam em `employees` e `employee_documents`.

A integração adiciona:
- `goals_config.employee_id`, campo opcional usado para vincular uma meta ao cadastro oficial do colaborador;
- `qms_training_assignments`, tabela do módulo de Qualidade que vincula treinamentos a `employees.id` com status, prazo, conclusão e observações.

A aba `/colaboradores > Qualidade & Metas` apenas consulta e agrega essas fontes. Ela não cria nem edita metas, treinamentos, documentos ou ASO.

### `employee_audit_log`

Trilha de auditoria do modulo.

Campos principais:
- `employee_id`
- `action`
- `actor_user_id`
- `payload_json`
- `created_at`

## 4. Regras de negocio

### Regime contratual

Valores suportados:
- `CLT`
- `PJ`
- `ESTAGIO`

Regras:
- `full_name`, `cpf` e `admission_date` sao obrigatorios;
- `ESTAGIO` exige `education_institution`, `education_level` e `course_name`;
- quando o colaborador nao e estagiario, os campos de estagio sao limpos no backend.

### Status do colaborador

Valores suportados:
- `PRE_ADMISSAO`
- `ATIVO`
- `DESLIGADO`

Regras:
- `PRE_ADMISSAO` permite acompanhar entrada sem tratar a pessoa como colaborador ativo na visão padrão;
- `DESLIGADO` exige `termination_date` e `termination_reason`;
- nao existe exclusao fisica pela UI no V1.

### Unidades canonicas

Persistencia em `units_json` com os nomes canonicos:
- `SHOPPING CAMPINAS`
- `CENTRO CAMBUI`
- `OURO VERDE`
- `RESOLVECARD GESTAO DE BENEFICOS E MEIOS DE PAGAMENTOS`

Na UI, o ultimo valor pode ser exibido como `Resolvecard`.

### Documentos obrigatorios e pendencias

A lista obrigatoria e calculada por perfil do colaborador:
- base comum do cadastro;
- extras para estagio;
- extras para casado/uniao estavel;
- extras para quem tem filhos.

O backend calcula:
- documentos esperados;
- documentos entregues;
- quantidade faltante;
- `pendingDocuments` para uso na tabela principal.

### Status do ASO

Calculado a partir do documento `ASO` ativo mais recente:
- `PENDENTE`: sem ASO ativo;
- `OK`: vencimento acima de 30 dias;
- `VENCENDO`: vencimento entre hoje e 30 dias;
- `VENCIDO`: vencimento passado.

Implementacao: `frontend/src/lib/colaboradores/status.ts`.

## 5. Fluxo de UI

### Pagina principal

A tabela exibe:
- colaborador;
- regime contratual;
- cargo/funcao;
- setor;
- unidades;
- admissao;
- status;
- status do ASO;
- progresso documental;
- acoes.

Filtros do V1:
- busca por nome, CPF ou e-mail;
- status;
- regime contratual;
- unidade;
- status do ASO;
- pendencia documental.

O cabeçalho possui o botão `Como funciona`, que abre uma ajuda guiada explicando:
- uso atual do cadastro de colaboradores;
- vínculo entre cadastro, documentos, benefícios, uniforme, armário e recesso;
- regra da Onda 3 para Admissões & Demissões: workflow/checklist usa o cadastro como fonte única da verdade, sem duplicar documentos, uniforme, armário ou dados de desligamento;
- regra da Onda 6 para Qualidade & Metas: a aba consolida dados oficiais de Metas, Qualidade e cadastro, mas a edição continua nos módulos de origem;
- campos críticos que alimentam folha, benefícios, dashboard e desligamentos.

### Aba `Admissões & Demissões`

Implementação da Onda 3 do plano RH.

A aba funciona como camada operacional sobre `employees`, sem criar cadastro paralelo:
- processos de admissão e desligamento são persistidos em `employee_lifecycle_cases`;
- tarefas/checklist são persistidas em `employee_lifecycle_tasks`;
- cada processo aponta para um `employee_id`;
- cada tarefa possui status, responsável, prazo, observação e referência à fonte oficial (`EMPLOYEE_FIELD`, `DOCUMENT`, `UNIFORM`, `LOCKER` ou `MANUAL`);
- documentos continuam em `employee_documents`;
- uniformes continuam em `employee_uniform_items`;
- armários/chaves continuam em `employee_locker_assignments`;
- dados de desligamento continuam em `employees.termination_date`, `employees.termination_reason` e `employees.termination_notes`.

Etapas da aba:
- `Pré-admissão`;
- `Admissão em andamento`;
- `Desligamento em andamento`;
- `Encerrados`.

O checklist inicial de admissão cobre cadastro contratual, documentos obrigatórios, ASO, benefícios iniciais, uniforme, armário e observações finais.

O checklist inicial de desligamento cobre data/motivo de desligamento, devolução de uniforme, devolução de armário/chave, documentos finais, revisão de benefícios/descontos e observações finais.

### Aba `Dashboard`

Implementação da Onda 4 do plano RH.

A aba funciona como visão gerencial sobre o cadastro oficial, sem novas tabelas:
- agregação server-side em `getEmployeeDashboard`;
- rota `GET /api/admin/colaboradores/dashboard`;
- filtros por unidade, setor, regime contratual e status;
- indicadores de headcount, admissões do mês, desligamentos do mês, turnover mensal/acumulado, pendências documentais e ASO;
- listas operacionais de aniversariantes do mês, aniversariantes dos próximos 30 dias, admissões, desligamentos e pendências documentais;
- distribuição de tempo de empresa e status de ASO.

O turnover do MVP é calculado sobre `quadro ativo + saídas do período`, usando as datas de desligamento registradas no cadastro.

### Aba `Qualidade & Metas`

Implementação da Onda 6 do plano RH.

A aba funciona como visão transversal e somente leitura:
- agregação server-side em `getEmployeeQualityGoals`;
- rota `GET /api/admin/colaboradores/quality-goals`;
- filtros por unidade, setor, regime contratual e status;
- indicadores de colaboradores críticos, metas vinculadas, metas abaixo de 70%, treinamentos vencidos/pendentes, pendências documentais e ASO;
- leitura por colaborador com metas oficialmente vinculadas, treinamentos atribuídos, status documental, ASO e alertas críticos;
- leitura por equipe/setor com média de metas e pendências de treinamento.

Regras de fonte da verdade:
- metas são criadas e editadas no módulo `/metas`;
- o vínculo oficial com o colaborador usa `goals_config.employee_id`;
- metas antigas com colaborador textual, mas sem `employee_id`, aparecem como "metas sem vínculo" para revisão operacional;
- treinamentos são criados e editados em `/qualidade/treinamentos`;
- participantes de treinamento são vinculados ao cadastro oficial por `qms_training_assignments.employee_id`;
- documentos e ASO continuam sendo atualizados na ficha do colaborador.

### Modal com abas

Abas implementadas:
- `Cadastro`
- `Beneficios`
- `Uniforme & Armario`
- `Recesso`
- `Documentos`

Regras de uso:
- `Uniforme`, `Recesso` e `Documentos` ficam operacionais apos o primeiro save do colaborador;
- a aba `Documentos` exibe uma tabela por tipo documental esperado, com upload, substituicao e exclusao diretamente na linha;
- documentos diversos usam o tipo `OUTRO` e aceitam mais de um arquivo ativo;
- documentos substituidos ou excluidos continuam visiveis no historico para consulta/download;
- uniforme e recesso usam CRUD proprio por colaborador.

## 6. Permissoes

Novo `pageKey`: `colaboradores`.

Comportamento do V1:
- `view`: abrir pagina e consultar cadastro/documentos/uniforme/recesso;
- `edit`: criar e editar colaborador, documentos, uniforme e recesso;
- `refresh`: mantido por consistencia da matriz, sem worker especifico nesta fase.

Defaults implementados em `frontend/src/lib/permissions.ts`:
- `ADMIN`: `view/edit/refresh`
- `GESTOR`: `view/edit/refresh`
- `OPERADOR`: `view/edit/refresh`

## 7. Storage

O modulo reaproveita o provider plug-and-play ja usado em profissionais:
- `frontend/src/lib/storage/provider.ts`
- `frontend/src/lib/storage/index.ts`
- `frontend/src/lib/storage/providers/s3.ts`

Uso atual:
- upload de documentos via API autenticada;
- download/visualizacao via rota autenticada.

Sem configuracao de storage, o upload nao deve ser habilitado em producao.

## 8. Smoke tecnico executado em 2026-03-20

Validacoes executadas localmente com banco MySQL real:
- `ensureEmployeesTables()`;
- `getEmployeesOptions()`;
- `listEmployees()`;
- `createEmployee()`;
- `updateEmployee()`;
- `createEmployeeDocumentRecord()` com `ASO`;
- `saveEmployeeUniformItem()`;
- `saveEmployeeRecessPeriod()`;
- `getEmployeeById()` com calculo de `asoStatus` e progresso documental;
- limpeza manual dos registros de smoke ao final.

Resultado do smoke:
- criacao e edicao do colaborador: OK;
- documento `ASO` com status calculado: OK;
- uniforme: OK;
- recesso: OK;
- limpeza final do dado temporario: OK.

Observacao:
- durante o smoke foi corrigido um erro no `INSERT` de `employees`, que tinha um placeholder extra na query de criacao.

## 9. Proximos passos naturais

- validar o fluxo visual ponta a ponta no navegador;
- revisar mascara/formatacao de CPF, telefone, CEP e moeda;
- evoluir o indicador documental com checklist visual por tipo de documento;
- adicionar exportacao/listagem operacional se o DP pedir acompanhamento fora do modal.
