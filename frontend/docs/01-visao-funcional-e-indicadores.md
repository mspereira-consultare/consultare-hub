# Visão Funcional e Indicadores

Este documento descreve:

- o objetivo de cada página do painel;
- os filtros aplicáveis;
- a origem de dados (API/tabela/coluna);
- a regra de cálculo dos indicadores.

## Premissas Gerais

- Timezone de referência: `America/Sao_Paulo`.
- Quando não houver dado, o frontend exibe `0`, `-` ou lista vazia.
- Workers e status operacional são controlados por `system_status`.
- Atualização manual no frontend usa `POST /api/admin/refresh`, que marca o serviço como `PENDING`.

---

## Login (`/login`)

### Objetivo

Autenticar usuário por e-mail/senha e redirecionar para a primeira página permitida.

### Fonte e regra

| Item | Regra |
|---|---|
| Autenticação | `next-auth` Credentials Provider em `frontend/src/app/api/auth/[...nextauth]/route.ts` |
| Tabela de usuários | `users` |
| Senha | Comparação via `bcryptjs.compare()` contra `users.password` |
| Sessão | JWT com validade de 30 dias |
| Redirecionamento pós-login | Primeira rota com `view=true` na matriz de permissões |

---

## Visão Geral (`/dashboard`)

### Objetivo

Consolidar operação em tempo real (filas) e visão financeira rápida (dia e mês), com metas e projeções.

### Fontes consumidas

- `GET /api/queue/medic`
- `GET /api/queue/reception`
- `GET /api/queue/whatsapp`
- `GET /api/admin/financial/history`
- `GET /api/admin/goals/dashboard`

### Indicadores

| Indicador | Fonte | Regra |
|---|---|---|
| Fila Médica | `queue/medic` | Soma de pacientes com `status=waiting` nas unidades |
| Fila Recepção | `queue/reception` | `data.global.total_fila` |
| WhatsApp Digital | `queue/whatsapp` | `data.global.queue` |
| Tempo médio recepção | `queue/reception` | Média ponderada por atendidos (`tempo_medio * total_passaram`) |
| Faturamento hoje | `financial/history` (dia atual) | `totals.total` |
| Guias hoje | `financial/history` (dia atual) | `totals.qtd` |
| Ticket médio hoje | `financial/history` (dia atual) | `totals.total / totals.qtd` |
| Faturamento mês | `financial/history` (mês atual) | `totals.total` |
| Guias mês | `financial/history` (mês atual) | `totals.qtd` |
| Ticket médio mês | `financial/history` (mês atual) | `totals.total / totals.qtd` |
| Meta diária de faturamento | `goals/dashboard` | Meta com `linked_kpi_id='revenue'`, periodicidade `daily`, escopo clínico |
| Meta mensal de faturamento | `goals/dashboard` | Meta com `linked_kpi_id='revenue'`, periodicidade `monthly`, escopo clínico |
| Projeção diária | frontend | `valor_atual / horas_decorridas * horas_operacao` (08h-19h) |
| Projeção mensal | frontend | `valor_atual / dias_decorridos * dias_do_mês` |

---

## Monitor de Atendimento (`/monitor`)

### Objetivo

Operação em tempo real das filas de recepção, médico e fila digital (Clinia/WhatsApp).

### Fontes consumidas

- `GET /api/queue/medic`
- `GET /api/queue/reception`
- `GET /api/queue/whatsapp`

### Regras operacionais da tela

| Item | Regra |
|---|---|
| Polling | A cada 15s |
| Dado stale | Marcado se passar 5 minutos sem atualização |
| Alerta sonoro | Toca quando há paciente médico aguardando acima do limite configurado |
| Limite padrão de alerta | 30 minutos |

### Indicadores na tela

| Indicador | Fonte | Regra |
|---|---|---|
| Fila recepção por unidade | `recepcao_historico` via API | Contagem de não finalizados no dia |
| Fila médica por unidade | `espera_medica` via API | Pacientes ativos não finalizados |
| Atendidos médico (dia) | `espera_medica` via API | `status LIKE 'Finalizado%'` em janela recente |
| Tempo médio médico (dia) | `espera_medica` via API | Média de `espera_minutos` finalizados (faixa válida) |
| Fila digital (global) | `clinia_group_snapshots` via API | Total de conversas abertas |
| Fila digital por grupo | `clinia_group_snapshots` via API | `queue_size` por `group_id` |

---


## Agendamentos (`/agendamentos`)

### Objetivo

Visualizar o histórico e evolução dos agendamentos realizados, com análise de tendência, taxa de confirmação e filtros detalhados.

### Filtros

- Data inicial (`startDate`)
- Data final (`endDate`)
- Agrupamento: dia, mês, ano
- Responsável pelo agendamento
- Especialidade
- Profissional
- Status do agendamento

### Fontes consumidas

- `GET /api/admin/agendamentos` (dados agregados, filtros e heartbeat)
- `POST /api/admin/agendamentos` (refresh manual)

### Indicadores

| Indicador | Fonte | Regra |
|---|---|---|
| Total de agendamentos no período | `/api/admin/agendamentos` | Soma total dos registros filtrados |
| Taxa de confirmação | `/api/admin/agendamentos` | % de agendamentos com status "MARCADO - CONFIRMADO" sobre o total |
| Evolução histórica | `/api/admin/agendamentos` | Série temporal agregada por período |
| Filtros distintos | `/api/admin/agendamentos` | Listas únicas de responsáveis, especialidades, profissionais, status |
| Heartbeat | `/api/admin/agendamentos` | Status e data/hora da última sincronização |

---

## Financeiro (`/financeiro`)

### Objetivo

Analisar faturamento por período, unidade, grupo e procedimento, com modo comparativo e relatório geral exportável.

### Filtros

- Período A (`startDate`, `endDate`)
- Unidade
- Grupo de procedimento
- Procedimento
- Comparação de períodos (B): anterior equivalente, YoY, personalizado

### Fontes consumidas

- `GET /api/admin/financial/history`
- `GET /api/admin/financial/general-report` (modal Relatório Geral)

### Indicadores (página principal)

| Indicador | Fonte | Regra |
|---|---|---|
| Faturamento | `history.totals.total` | Soma de `total_pago` no período filtrado |
| Atendimentos/Guias | `history.totals.qtd` | Soma de `qtd` (resumo) ou contagem (analítico fallback) |
| Ticket médio | frontend | `total / qtd` |
| Novos pacientes | `history.totals.newPatients` | `COUNT(DISTINCT patient_id)` em `feegow_appointments`, com `first_appointment_flag = 1`, usando a `date` da consulta e respeitando os filtros de unidade, grupo e procedimento |
| Curva diária | `history.daily` | Série por dia (`d`) |
| Evolução mensal | `history.monthly` | Série por mês (`m`) |
| Grupos de procedimento | `history.groupStats` | Soma e quantidade por `grupo` |
| Faturamento por unidade | `history.unitsBilling` | Soma por `unidade` |

### Comparativo (A vs B)

| Indicador | Regra |
|---|---|
| Delta absoluto | `A - B` |
| Delta percentual | `(A - B) / B * 100` (quando `B > 0`) |
| Alinhamento diário/mensal | Alinhamento por posição da série (não por data textual) |

### Relatório Geral (modal + exportação PDF/XLSX)

| Item | Regra |
|---|---|
| Fonte | `faturamento_analitico` |
| Estrutura | Linhas = anos, colunas = meses, por unidade |
| Destaque em verde | Maior faturamento histórico de cada mês (comparação entre anos) |
| Crescimento vs melhor ano | Acumulado do ano de referência vs melhor acumulado histórico |
| Crescimento vs ano anterior | Acumulado do ano de referência vs acumulado do ano anterior |
| Critério de acumulado | De `01/01` até **ontem** (mesmo dia/mês nos anos comparados) |
| Filtro | Unidade (`all` ou específica) |

---

## ResolveSaúde / Contratos (`/contratos`)

### Objetivo

Acompanhar carteira ativa do cartão, vendas do período, inadimplência e faturamento realizado.

### Fonte consumida

- `GET /api/admin/contratos`

### Indicadores

| Indicador | Fonte | Regra |
|---|---|---|
| Contratos ativos | `feegow_contracts` | `COUNT(DISTINCT contract_id)` com `status_contract='Aprovado'` |
| Pacientes ativos | `feegow_contracts` | `COUNT(DISTINCT registration_number)` com `status_contract='Aprovado'` |
| MRR carteira | `feegow_contracts` | `SUM(recurrence_value)` dos aprovados |
| Inadimplentes (qtd/valor) | `feegow_contracts` | `status_financial='Inadimplente'` |
| Adesão no período | `feegow_contracts` | `SUM(membership_value)` aprovados entre datas |
| Mensalidade no período | `feegow_contracts` | `SUM(recurrence_value)` aprovados entre datas |
| Cancelados no período | `feegow_contracts` | `COUNT(*)` com `status_contract='Cancelado'` entre datas |
| Faturamento realizado (período) | `faturamento_resumo_diario` | Soma da unidade ResolveCard no intervalo |
| Gráfico diário | `faturamento_resumo_diario` | Série diária de faturamento da unidade ResolveCard |

---

## Gestão de Propostas (`/propostas`)

### Objetivo

Monitorar pipeline comercial por período, unidade e profissional.

### Fonte consumida

- `GET /api/admin/propostas`
- `GET /api/admin/propostas/details`
- `GET /api/admin/propostas/export`

### Indicadores de topo

| Indicador | Regra |
|---|---|
| Total Propostas | `COUNT(*)` no período |
| Valor Total | `SUM(total_value)` no período |
| Convertido (ganho) | `SUM(total_value)` com status em lista de ganho |
| Taxa conversão | `valor_ganho / valor_total * 100` |
| Valor perdido | `SUM(total_value)` com status de perda |
| Ticket médio | `valor_total / qtd` |

### Status considerados “ganho/executado”

`executada`, `aprovada pelo cliente`, `ganho`, `realizado`, `concluido`, `pago`.

### Ranking profissional

| Coluna | Regra |
|---|---|
| QTD | Quantidade total de propostas |
| Exec. QTD | Quantidade com status ganho |
| Total estimado | Soma total das propostas |
| Total executado | Soma das propostas ganhas |
| Taxa conversão | `valor_executado / valor_total * 100` |
| Ticket médio | `valor_total / qtd` |
| Ticket exec. | `valor_executado / qtd_executado` |

### Base detalhada

Objetivo operacional:
- expor a lista de registros que alimenta o painel;
- priorizar follow-up de propostas em `Aguardando aprova??o do cliente`;
- permitir exporta??o em XLSX para apoio da equipe comercial.

Regras:
- respeita os filtros globais de per?odo e unidade;
- se o filtro global de status estiver espec?fico, a base segue esse status;
- se o filtro global estiver em `Todos`, a base abre em `Aguardando aprova??o do cliente`;
- a tabela ? paginada e mostra data, paciente, telefone, procedimento(s), unidade, profissional, valor e status;
- nome e telefone do paciente s?o enriquecidos a partir da Feegow por `patient/search?paciente_id=...`, com cache local.

---

## Produtividade de Agendamento (`/produtividade`)

### Objetivo

Mensurar produção de agendamentos por colaborador e equipe.

### Fonte consumida

- `GET /api/admin/produtividade`
- `GET /api/admin/goals/dashboard` (metas relacionadas a agendamento)
- `GET /api/admin/user-teams` (configuração de equipes)

### Regras

| Item | Regra |
|---|---|
| Período padrão | 1º dia do mês atual até hoje |
| Equipe padrão | `CRC` |
| Produção base | `feegow_appointments.scheduled_at` |
| Confirmados | `status_id IN (3,7)` |
| Não compareceu | `status_id = 6` |

### Indicadores

| Indicador | Regra |
|---|---|
| Total global | `COUNT(*)` no período |
| Taxa confirmação global | `confirmados / total * 100` |
| Taxa no-show | `nao_compareceu / total * 100` |
| Ranking por colaborador | Agrupamento por `scheduled_by` |
| Estatística da equipe | Join `user_teams` + `teams_master` sobre `scheduled_by` |
| Metas por equipe/colaborador | Dados de `goals/dashboard` para KPIs de agendamento |

---

## Painel de Metas (`/metas/dashboard`)

### Objetivo

Acompanhar progresso em tempo real das metas vigentes.

### Fonte consumida

- `GET /api/admin/goals/dashboard`

### Regras de status visual

| Status | Regra |
|---|---|
| SUCCESS | `percentage >= 100` |
| WARNING | `70 <= percentage < 100` |
| DANGER | `percentage < 70` |

### Indicadores de resumo

| Indicador | Regra |
|---|---|
| Global | Média de progresso das metas filtradas (`min(percentage, 100)`) |
| Batidas | Quantidade de metas em `SUCCESS` |
| Atenção | Quantidade de metas em `WARNING` |
| Total | Quantidade total de metas filtradas |

---

## Gestão de Metas (`/metas`)

### Objetivo

CRUD de metas e governança de parâmetros de KPI por escopo/setor/unidade/equipe.

### Fonte consumida

- `GET/POST/DELETE /api/admin/goals`
- `GET /api/admin/goals/dashboard` (dados realizados)
- `GET /api/admin/options/groups` (lista de grupos)

### Configurações de meta suportadas

| Campo | Observação |
|---|---|
| Escopo | `CLINIC` ou `CARD` |
| Periodicidade | `daily`, `weekly`, `monthly`, `total` |
| Unidade de medida | moeda, quantidade, percentual, minutos |
| KPI vinculado | Lista em `KPIS_AVAILABLE` |
| Filtros avançados | grupo, unidade clínica, colaborador, equipe |

---

## Checklist CRC (`/checklist-crc`)

### Objetivo

Gerar checklist diário operacional do CRC, com persistência de campos manuais e compartilhamento via WhatsApp.

### Fonte consumida

- `GET/POST /api/admin/checklist/crc`
- `GET /api/admin/status`

### Indicadores e campos

| Campo | Origem | Regra |
|---|---|---|
| Meta do dia | `goals_config` | Soma de metas `agendamentos` diárias (escopo clínico), com fallback global |
| Agendamentos total | `feegow_appointments` | `COUNT(*)` por `scheduled_at` no dia |
| Agendamentos CRC | `feegow_appointments` + equipes | `COUNT(DISTINCT appointment_id)` com equipe `CRC` |
| Agendamento online/robô | `feegow_appointments` | `scheduled_by LIKE 'AGENDAMENTO ONLINE%'` |
| Solicitações WhatsApp CRC | Google Sheets | Contagem de linhas da data atual |
| Ligações realizadas | tabela manual | `crc_checklist_daily.calls_made` |
| Conversão CRC | cálculo | `agendamentos_crc / (ligacoes + solicitacoes_whatsapp) * 100` |
| Taxa de abandono | tabela manual | `crc_checklist_daily.abandon_rate` |
| Tempo médio de espera | `clinia_group_snapshots` | `avg_wait_seconds` do grupo Central / 60 |
| Texto do relatório | montagem backend/frontend | Formato pronto para copiar/enviar |

### Persistência manual

- Tabela: `crc_checklist_daily`
- Chave: `date_ref` (um registro por dia)
- Campos persistidos: `calls_made`, `abandon_rate`

---

## Checklist Recepção (`/checklist-recepcao`)

### Objetivo

Gerar checklist diário por unidade (financeiro + agenda + qualidade + operação), com campos manuais persistidos por unidade.

### Fonte consumida

- `GET/POST /api/admin/checklist/recepcao`
- `GET /api/admin/status`

### Indicadores e campos

| Campo | Origem | Regra |
|---|---|---|
| Faturamento do dia | `faturamento_resumo_diario` | `SUM(total_pago)` por unidade e data atual |
| Faturamento do mês | `faturamento_resumo_mensal` | `SUM(total_pago)` por unidade e mês atual |
| Ticket médio dia | resumo diário | `faturamento_dia / qtd_dia` |
| Meta mensal | `goals_config` | Soma de metas `revenue` mensais (unit-first, fallback global) |
| % meta atingida | cálculo | `faturamento_mes / meta_mensal * 100` |
| Meta Resolve (alvo) | tabela manual | Campo digitável |
| Meta Resolve (realizado) | Google Sheets | Contagem por data atual, unidade e serviço resolve |
| Meta Check-up (alvo) | tabela manual | Campo digitável |
| Meta Check-up (realizado) | Google Sheets | Contagem por data atual, unidade e serviço check-up |
| Orçamentos em aberto | `feegow_proposals` | Soma de propostas com status fora da lista de ganho |
| Notas fiscais emitidas | tabela manual | Lista (`Validado`/`Nao Validado`) |
| Contas em aberto | tabela manual | Lista (`Validado`/`Nao Validado`) |
| Confirmação agenda D+1 | `feegow_appointments` | `%` de `status_id=7` sobre total do dia seguinte (`date`) |
| Avaliação Google e comentários | tabela manual | Campo livre |
| Pendências urgentes | tabela manual | Texto livre |
| Situações críticas | tabela manual | Texto + prazo + responsável |
| Ações realizadas | tabela manual | Texto livre |

### Persistência manual por unidade

- Tabela principal: `recepcao_checklist_manual`
- Chave: `scope_key` (ex.: `campinas_shopping`, `centro_cambui`, `ouro_verde`, `resolve`)
- Comportamento: cada unidade mantém seus próprios campos, sem compartilhamento entre unidades.

---

## Gestão de Usuários (`/users`)

### Objetivo

Gerenciar usuários (CRUD) e matriz de permissões por página.

### Fonte consumida

- `GET/POST/DELETE /api/admin/users`
- `GET/POST /api/admin/users/permissions`

### Funcionalidades

| Item | Regra |
|---|---|
| Cadastro de usuário | Grava em `users` com senha hash (`bcrypt`) |
| Edição de usuário | Atualiza dados e senha opcional |
| Exclusão de usuário | Remove usuário por `id` |
| Matriz de permissões | Controle por página e ação (`view`, `edit`, `refresh`) |

---

## Configuracoes (`/settings`)

### Objetivo

Gerenciar credenciais de integracao (Feegow e Clinia).

### Fonte consumida

- `GET/POST /api/admin/settings`
- Server action: `frontend/src/app/actions/settings.ts`

### Campos de integracao

| Servico | Campos |
|---|---|
| Feegow | `username`, `password`, `token/cookie` |
| Clinia | `token/cookie` |

---

## Modelos de Contrato (`/modelos-contrato`)

### Objetivo

Gerenciar upload, mapeamento e ciclo de vida dos modelos de contrato (`.docx`) sem expor credenciais de integracao.

### Fonte consumida

- `GET/POST /api/admin/contract-templates`
- `PUT /api/admin/contract-templates/:id/mapping`
- `POST /api/admin/contract-templates/:id/activate`
- `POST /api/admin/contract-templates/:id/archive`
- `DELETE /api/admin/contract-templates/:id`
- `GET /api/admin/contract-templates/:id/download` (com `?inline=1` para visualizacao)

### Regras de negocio

| Item | Regra |
|---|---|
| Upload | Aceita somente `.docx` |
| Placeholders | Extraidos automaticamente no padrao `{{token}}` |
| Mapeamento | Placeholder deve ser associado a fonte de dados; secao inicia recolhida e abre em `Mapear` |
| Ativacao | Exige mapeamento obrigatorio completo |
| Arquivamento | Remove da lista de ativos sem perda de historico |
| Exclusao | Permitida apenas quando modelo nao esta vinculado a profissional e sem contratos gerados |
| Arquivo do modelo | A tabela permite `Visualizar` e `Baixar` o `.docx` armazenado |

---

## Catalogo de KPIs de Metasálogo de KPIs de Metas

IDs disponíveis em `frontend/src/app/(admin)/metas/constants.ts`:

- `manual`
- `revenue`
- `agendamentos` (baseado em `scheduled_at`)
- `consultas_dia` (baseado em `date`)
- `agendamentos_confirm_rate`
- `appointments`
- `ticket_medio`
- `proposals`
- `proposals_exec_qty`
- `proposals_exec_value`
- `proposals_exec_rate`
- `contracts`
- `sales`
- `sales_qty`
- `churn_rate`
- `whatsapp_queue`
- `whatsapp_time`

---

## Regras de Refresh no Frontend

| Página | Ação de refresh | Serviço(s) acionado(s) |
|---|---|---|
| Dashboard | botão atualizar faturamento | `worker_faturamento_scraping` |
| Monitor | botão atualizar monitor | recarrega APIs de fila (sem trigger pesado) |
| Financeiro | botão atualizar | `worker_faturamento_scraping` |
| Contratos | botão atualizar | `contratos` |
| Propostas | botão atualizar | `comercial` |
| Produtividade | botão atualizar | `financeiro` |
| Checklist CRC | botão atualizar | `financeiro` + `clinia` |
| Checklist Recepção | botão atualizar | `financeiro` + `faturamento` + `comercial` |

---

## Profissionais (`/profissionais`)

### Objetivo

Centralizar o cadastro da carteira de profissionais, com foco em:
- dados contratuais (PF/PJ e tipo de contrato);
- clausula opcional de pagamento minimo (`paymentMinimumText`);
- registros regionais (CRM/CRO/CRP etc.) com registro principal;
- vinculacao de procedimentos e valores por profissional (base Feegow);
- controle documental em modo hibrido (checklist manual + upload S3 ativo);
- status de pendencias e vencimento da certidao etica.

### Filtros

- Busca textual (`name`, `specialty`, `cpf`, `cnpj`)
- Status (`all`, `active`, `inactive`, `pending`)
- Status da certidao etica (`all`, `OK`, `VENCENDO`, `VENCIDA`, `PENDENTE`)
- Paginacao (`page`, `pageSize`)

### Fontes consumidas

- `GET /api/admin/profissionais`
- `GET /api/admin/profissionais/:id`
- `POST /api/admin/profissionais`
- `PUT /api/admin/profissionais/:id`
- `GET /api/admin/profissionais/:id/procedimentos`
- `PUT /api/admin/profissionais/:id/procedimentos`
- `GET /api/admin/profissionais/procedures/options`
- `GET /api/admin/profissionais/:id/contratos`
- `POST /api/admin/profissionais/:id/contratos`
- `POST /api/admin/profissionais/:id/contratos/:contractId/reprocess`
- `GET /api/admin/profissionais/:id/contratos/:contractId/download?format=pdf|docx`

### Indicadores/regras da tela

| Indicador | Fonte | Regra |
|---|---|---|
| Documentos `X/Y` | `professional_document_checklist` + `professional_documents` | Conta documentos obrigatorios concluidos no modo `hybrid` |
| Pendente | `missingFields` + `missingDocs` | Verdadeiro quando ha pendencia cadastral ou documental |
| Certidao etica | checklist/documents | `OK`, `VENCENDO`, `VENCIDA`, `PENDENTE` por `expires_at` manual/ativo |
| Registro principal | `professional_registrations` | Exibe `council_type/council_uf council_number` do item `is_primary=1` |
| Tipo de contrato | `professionals.contract_type` | Define qual template de contrato sera usado na automacao |
| Modelo de contrato | `professionals.contract_template_id` + `contract_templates` | Lista apenas modelos ativos do mesmo tipo de contrato |
| Procedimentos do profissional | `professional_procedure_rates` | Lista de procedimentos e valores personalizados por profissional |

### Observacao operacional

No fluxo atual:
- o usuario pode marcar manualmente copia fisica/digital por tipo de documento;
- tambem pode fazer upload real de arquivos via S3 no mesmo modal;
- o tipo `OUTRO` aparece apenas no upload (nao entra no checklist manual e nao altera o indicador `X/Y` de documentos).
- a tabela de documentos exibida no cadastro nao recebe mais `CONTRATO_GERADO` automaticamente; para contrato final, usar upload manual de `CONTRATO_ASSINADO`.
- a aba `Contratos` do modal gera os dois formatos por padrao (`PDF` + `Word`), permite `Visualizar PDF`, `Baixar PDF`, `Baixar Word`, `Gerar novo` e `Reprocessar` (somente status `ERRO`).
- na renderizacao do contrato: CPF e CNPJ sao formatados automaticamente; `Todas Especialidades` usa separacao em portugues (`A, B e C`).
- a aba `Procedimentos` do modal permite buscar no catalogo Feegow, adicionar multiplos procedimentos e salvar `valor_profissional`.

### Evolução técnica (18/02/2026)

- Endpoints de documentos para o módulo foram adicionados:
  - `GET/POST /api/admin/profissionais/:id/documentos`
  - `GET /api/admin/profissionais/documentos/:documentId/download`
- A tabela de documentos do modal permite `Visualizar` (`?inline=1`) e `Baixar`.
- A geração de contrato foi incorporada na aba `Contratos` do modal, com histórico por profissional.
- O modal foi ampliado e reorganizado para reduzir scroll e condensar campos.
## Qualidade - Sprint 1 (Documentos Operacionais)

Nova tela:
- `/qualidade/documentos`

Funcionalidades entregues:
- cadastro de documento operacional (POP) com codigo legivel;
- edicao e exclusao de documento;
- controle de versao com acao "Nova versao";
- upload e download/visualizacao de arquivo vinculado ao documento;
- refresh manual para recalculo de status por data de proxima revisao.

Indicadores/regras iniciais:
- `Status`: `Rascunho`, `Vigente`, `A vencer`, `Vencido`, `Arquivado`;
- regra de status por revisao:
  - `Vencido`: `next_review_date < hoje`;
  - `A vencer`: ate 30 dias para vencimento;
  - `Vigente`: acima de 30 dias.
- heartbeat: servico `qms_documentos` em `system_status`.

## Qualidade - Sprint 2 (Treinamentos)

Nova tela:
- `/qualidade/treinamentos`

Estrutura:
- Aba `Cronograma Anual`
- Aba `Realizacoes`

Funcionalidades entregues:
- cadastro/edicao/exclusao de cronogramas;
- vinculo de cronograma com POPs do modulo de documentos;
- cadastro/edicao/exclusao de realizacoes;
- upload de anexos por realizacao (`lista de presenca`, `avaliacao`, `evidencia`, `outro`);
- visualizacao/download do ultimo anexo da realizacao;
- refresh manual de status operacional.

Indicadores/regras iniciais:
- total de anexos por realizacao (`files_count`);
- status de cronograma e realizacao (`planejado`, `em_andamento`, `concluido`, `cancelado`);
- heartbeat: servico `qms_treinamentos` em `system_status`.

## Qualidade - Sprint 3 (Conformidade e Auditorias)

Nova tela:
- `/qualidade/auditorias`

Funcionalidades entregues:
- cadastro/edicao/exclusao de auditoria interna;
- vinculo obrigatorio com POP e versao auditada;
- registro de nao conformidade e plano de acao;
- cadastro e edicao de acoes corretivas por auditoria;
- refresh manual para recalculo de status.

Indicadores/regras iniciais:
- `Status da auditoria`:
  - `encerrada`: sem acoes abertas e com `reassessed=true`;
  - `em_tratativa`: existe acao aberta/em andamento/atrasada;
  - `aberta`: estado inicial sem tratativa.
- `Status da acao corretiva`:
  - passa para `atrasada` quando `deadline < hoje` e status anterior era `aberta` ou `em_andamento`.
- coluna `Acoes` da tabela:
  - `actions_open / actions_total`.
- heartbeat:
  - servico `qms_auditorias` em `system_status`.

## Qualidade - Sprint 4 (Indicadores consolidados e hardening)

Recursos entregues:
- faixa consolidada de indicadores em todas as telas de Qualidade:
  - `/qualidade/documentos`
  - `/qualidade/treinamentos`
  - `/qualidade/auditorias`
- endpoint de leitura consolidada:
  - `GET /api/admin/qms/indicadores?page=<pageKey>`
- endpoint de refresh consolidado do modulo:
  - `POST /api/admin/qms/indicadores/refresh`

Indicadores consolidados:
| Indicador | Regra |
|---|---|
| Documentos vigentes | `vigente / total` |
| A vencer / vencidos | contagem por `status` em `qms_documents` |
| Treinamentos concluidos | `executions_concluidas / executions_total` |
| Taxa de execucao | `executions_concluidas / plans_total * 100` |
| Compliance medio auditorias | `AVG(compliance_percent)` de `qms_audits` |
| Acoes atrasadas | acoes com `deadline < hoje` e status aberto/em andamento/atrasada |

Hardening aplicado:
- validacao de conformidade entre `0` e `100`;
- impedimento de auditoria `encerrada` sem `reassessed=true`;
- validacao de coerencia de datas (checagem/prazo nao anteriores a auditoria);
- acao corretiva `concluida` exige `completion_note`.

## Atualizacao adicional - Pagina Agenda Ocupacao (`/agenda-ocupacao`)

Indicador principal por especialidade:

`Tx. Confirmacao (%) = Agendamentos / (Horarios Disponiveis + Agendamentos - Horarios Bloqueados)`

Filtros:

- Data inicial/final
- Unidade (`Todas`, `2`, `3`, `12`)

Acoes:

- Atualizar dados (job manual)
- Atualizar tela
- Exportar XLSX
- Exportar PDF


## Equipamentos (`/equipamentos`)

### Objetivo

Controlar os equipamentos f?sicos da cl?nica, com foco em calibra??o, manuten??o, evid?ncias documentais e rastreabilidade por unidade.

### Filtros

- Unidade
- Status de calibra??o
- Status operacional
- Busca por descri??o, identifica??o, s?rie ou respons?vel

### Fontes consumidas

- `GET /api/admin/equipamentos`
- `GET /api/admin/equipamentos/options`
- `GET /api/admin/equipamentos/export`

### Indicadores

| Indicador | Fonte | Regra |
|---|---|---|
| Total de equipamentos | `/api/admin/equipamentos` | Quantidade total do recorte filtrado |
| Calibra??o em dia | `/api/admin/equipamentos` | Equipamentos com pr?xima calibra??o fora da janela de alerta |
| Vencendo | `/api/admin/equipamentos` | Pr?xima calibra??o nos pr?ximos 30 dias |
| Vencidos | `/api/admin/equipamentos` | Pr?xima calibra??o anterior ? data atual |
| Em manuten??o | `/api/admin/equipamentos` | Equipamentos com `operational_status='EM_MANUTENCAO'` |

### Regras da tabela

| Item | Regra |
|---|---|
| Status de calibra??o | Derivado por `calibration_required` + `next_calibration_date` |
| Hist?rico de manuten??o | Mantido em `clinic_equipment_events` |
| Arquivos | Mantidos em `clinic_equipment_files` com download pelo painel |
| Exporta??o XLSX | Usa exatamente os filtros vis?veis da tela |
