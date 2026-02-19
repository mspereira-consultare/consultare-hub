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

Gerenciar credenciais de integracao (Feegow e Clinia) e modelos de contrato (.docx).

### Fonte consumida

- `GET/POST /api/admin/settings`
- Server action: `frontend/src/app/actions/settings.ts`
- `GET/POST /api/admin/contract-templates`
- `PUT /api/admin/contract-templates/:id/mapping`
- `POST /api/admin/contract-templates/:id/activate`
- `POST /api/admin/contract-templates/:id/archive`

### Campos de integracao

| Servico | Campos |
|---|---|
| Feegow | `username`, `password`, `token/cookie` |
| Clinia | `token/cookie` |

### Modelos de contrato

| Item | Regra |
|---|---|
| Upload | Aceita somente `.docx` |
| Placeholders | Extraidos automaticamente no padrao `{{token}}` |
| Mapeamento | Placeholder deve ser associado a fonte de dados |
| Ativacao | Exige mapeamento obrigatorio completo |
| Arquivamento | Remove da lista de ativos sem perda de historico |

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
- registros regionais (CRM/CRO/CRP etc.) com registro principal;
- controle documental em modo hibrido (manual + upload futuro);
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

### Indicadores/regras da tela

| Indicador | Fonte | Regra |
|---|---|---|
| Documentos `X/Y` | `professional_document_checklist` + `professional_documents` | Conta documentos obrigatorios concluidos no modo `hybrid` |
| Pendente | `missingFields` + `missingDocs` | Verdadeiro quando ha pendencia cadastral ou documental |
| Certidao etica | checklist/documents | `OK`, `VENCENDO`, `VENCIDA`, `PENDENTE` por `expires_at` manual/ativo |
| Registro principal | `professional_registrations` | Exibe `council_type/council_uf council_number` do item `is_primary=1` |
| Tipo de contrato | `professionals.contract_type` | Define qual template de contrato sera usado na automacao |
| Modelo de contrato | `professionals.contract_template_id` + `contract_templates` | Lista apenas modelos ativos do mesmo tipo de contrato |

### Observacao operacional

Na fase atual, o controle documental continua funcionando no modo de transicao:
- o usuario pode marcar manualmente copia fisica/digital por tipo de documento;
- upload em S3 entra depois sem quebrar o fluxo atual.

### Evolução técnica (18/02/2026)

- Endpoints de documentos para o módulo foram adicionados:
  - `GET/POST /api/admin/profissionais/:id/documentos`
  - `GET /api/admin/profissionais/documentos/:documentId/download`
- A UI mantém aviso de transição e prioriza checklist manual até validação final do S3 em produção.
