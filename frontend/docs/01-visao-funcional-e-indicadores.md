# VisÃ£o Funcional e Indicadores

Este documento descreve:

- o objetivo de cada pÃ¡gina do painel;
- os filtros aplicÃ¡veis;
- a origem de dados (API/tabela/coluna);
- a regra de cÃ¡lculo dos indicadores.

## Premissas Gerais

- Timezone de referÃªncia: `America/Sao_Paulo`.
- Quando nÃ£o houver dado, o frontend exibe `0`, `-` ou lista vazia.
- Workers e status operacional sÃ£o controlados por `system_status`.
- AtualizaÃ§Ã£o manual no frontend usa `POST /api/admin/refresh`, que marca o serviÃ§o como `PENDING`.

---

## Login (`/login`)

### Objetivo

Autenticar usuÃ¡rio por e-mail/senha e redirecionar para a primeira pÃ¡gina permitida.

### Fonte e regra

| Item | Regra |
|---|---|
| AutenticaÃ§Ã£o | `next-auth` Credentials Provider em `frontend/src/app/api/auth/[...nextauth]/route.ts` |
| Tabela de usuÃ¡rios | `users` |
| Senha | ComparaÃ§Ã£o via `bcryptjs.compare()` contra `users.password` |
| SessÃ£o | JWT com validade de 30 dias |
| Redirecionamento pÃ³s-login | Primeira rota com `view=true` na matriz de permissÃµes |

---

## VisÃ£o Geral (`/dashboard`)

### Objetivo

Consolidar operaÃ§Ã£o em tempo real (filas) e visÃ£o financeira rÃ¡pida (dia e mÃªs), com metas e projeÃ§Ãµes.

### Fontes consumidas

- `GET /api/queue/medic`
- `GET /api/queue/reception`
- `GET /api/queue/whatsapp`
- `GET /api/admin/financial/history`
- `GET /api/admin/goals/dashboard`

### Indicadores

| Indicador | Fonte | Regra |
|---|---|---|
| Fila MÃ©dica | `queue/medic` | Soma de pacientes com `status=waiting` nas unidades |
| Fila RecepÃ§Ã£o | `queue/reception` | `data.global.total_fila` |
| WhatsApp Digital | `queue/whatsapp` | `data.global.queue` |
| Tempo mÃ©dio recepÃ§Ã£o | `queue/reception` | MÃ©dia ponderada por atendidos (`tempo_medio * total_passaram`) |
| Faturamento hoje | `financial/history` (dia atual) | `totals.total` |
| Guias hoje | `financial/history` (dia atual) | `totals.qtd` |
| Ticket mÃ©dio hoje | `financial/history` (dia atual) | `totals.total / totals.qtd` |
| Faturamento mÃªs | `financial/history` (mÃªs atual) | `totals.total` |
| Guias mÃªs | `financial/history` (mÃªs atual) | `totals.qtd` |
| Ticket mÃ©dio mÃªs | `financial/history` (mÃªs atual) | `totals.total / totals.qtd` |
| Meta diÃ¡ria de faturamento | `goals/dashboard` | Meta com `linked_kpi_id='revenue'`, periodicidade `daily`, escopo clÃ­nico |
| Meta mensal de faturamento | `goals/dashboard` | Meta com `linked_kpi_id='revenue'`, periodicidade `monthly`, escopo clÃ­nico |
| ProjeÃ§Ã£o diÃ¡ria | frontend | `valor_atual / horas_decorridas * horas_operacao` (08h-19h) |
| ProjeÃ§Ã£o mensal | frontend | `valor_atual / dias_decorridos * dias_do_mÃªs` |

---

## Monitor de Atendimento (`/monitor`)

### Objetivo

OperaÃ§Ã£o em tempo real das filas de recepÃ§Ã£o, mÃ©dico e fila digital (Clinia/WhatsApp).

### Fontes consumidas

- `GET /api/queue/medic`
- `GET /api/queue/reception`
- `GET /api/queue/whatsapp`

### Regras operacionais da tela

| Item | Regra |
|---|---|
| Polling | A cada 15s |
| Dado stale | Marcado se passar 5 minutos sem atualizaÃ§Ã£o |
| Alerta sonoro | Toca quando hÃ¡ paciente mÃ©dico aguardando acima do limite configurado |
| Limite padrÃ£o de alerta | 30 minutos |

### Indicadores na tela

| Indicador | Fonte | Regra |
|---|---|---|
| Fila recepÃ§Ã£o por unidade | `recepcao_historico` via API | Contagem de nÃ£o finalizados no dia |
| Fila mÃ©dica por unidade | `espera_medica` via API | Pacientes ativos nÃ£o finalizados |
| Atendidos mÃ©dico (dia) | `espera_medica` via API | `status LIKE 'Finalizado%'` em janela recente |
| Tempo mÃ©dio mÃ©dico (dia) | `espera_medica` via API | MÃ©dia de `espera_minutos` finalizados (faixa vÃ¡lida) |
| Fila digital (global) | `clinia_group_snapshots` via API | Total de conversas abertas |
| Fila digital por grupo | `clinia_group_snapshots` via API | `queue_size` por `group_id` |

---


## Agendamentos (`/agendamentos`)

### Objetivo

Visualizar o histÃ³rico e evoluÃ§Ã£o dos agendamentos realizados, com anÃ¡lise de tendÃªncia, taxa de confirmaÃ§Ã£o e filtros detalhados.

### Filtros

- Data inicial (`startDate`)
- Data final (`endDate`)
- Agrupamento: dia, mÃªs, ano
- ResponsÃ¡vel pelo agendamento
- Especialidade
- Profissional
- Status do agendamento

### Fontes consumidas

- `GET /api/admin/agendamentos` (dados agregados, filtros e heartbeat)
- `POST /api/admin/agendamentos` (refresh manual)

### Indicadores

| Indicador | Fonte | Regra |
|---|---|---|
| Total de agendamentos no perÃ­odo | `/api/admin/agendamentos` | Soma total dos registros filtrados |
| Taxa de confirmaÃ§Ã£o | `/api/admin/agendamentos` | % de agendamentos com status "MARCADO - CONFIRMADO" sobre o total |
| EvoluÃ§Ã£o histÃ³rica | `/api/admin/agendamentos` | SÃ©rie temporal agregada por perÃ­odo |
| Filtros distintos | `/api/admin/agendamentos` | Listas Ãºnicas de responsÃ¡veis, especialidades, profissionais, status |
| Heartbeat | `/api/admin/agendamentos` | Status e data/hora da Ãºltima sincronizaÃ§Ã£o |

---

## Financeiro (`/financeiro`)

### Objetivo

Analisar faturamento por perÃ­odo, unidade, grupo e procedimento, com modo comparativo e relatÃ³rio geral exportÃ¡vel.

### Filtros

- PerÃ­odo A (`startDate`, `endDate`)
- Unidade
- Grupo de procedimento
- Procedimento
- ComparaÃ§Ã£o de perÃ­odos (B): anterior equivalente, YoY, personalizado

### Fontes consumidas

- `GET /api/admin/financial/history`
- `GET /api/admin/financial/general-report` (modal RelatÃ³rio Geral)

### Indicadores (pÃ¡gina principal)

| Indicador | Fonte | Regra |
|---|---|---|
| Faturamento | `history.totals.total` | Soma de `total_pago` no perÃ­odo filtrado |
| Atendimentos/Guias | `history.totals.qtd` | Soma de `qtd` (resumo) ou contagem (analÃ­tico fallback) |
| Ticket mÃ©dio | frontend | `total / qtd` |
| Novos pacientes | `history.totals.newPatients` | `COUNT(DISTINCT patient_id)` em `feegow_appointments`, filtrando pelos par?metros da p?gina e marcando como novo quando `DATE(feegow_patients.criado_em)` cai dentro do per?odo selecionado |
| % de novos pacientes | frontend + `history.totals.totalPatients` | `newPatients / totalPatients * 100`, considerando pacientes distintos no per?odo filtrado |
| Curva diÃ¡ria | `history.daily` | SÃ©rie por dia (`d`) |
| EvoluÃ§Ã£o mensal | `history.monthly` | SÃ©rie por mÃªs (`m`) |
| Grupos de procedimento | `history.groupStats` | Soma e quantidade por `grupo` |
| Faturamento por unidade | `history.unitsBilling` | Soma por `unidade` |

### Comparativo (A vs B)

| Indicador | Regra |
|---|---|
| Delta absoluto | `A - B` |
| Delta percentual | `(A - B) / B * 100` (quando `B > 0`) |
| Alinhamento diÃ¡rio/mensal | Alinhamento por posiÃ§Ã£o da sÃ©rie (nÃ£o por data textual) |

### RelatÃ³rio Geral (modal + exportaÃ§Ã£o PDF/XLSX)

| Item | Regra |
|---|---|
| Fonte | `faturamento_analitico` |
| Estrutura | Linhas = anos, colunas = meses, por unidade |
| Destaque em verde | Maior faturamento histÃ³rico de cada mÃªs (comparaÃ§Ã£o entre anos) |
| Crescimento vs melhor ano | Acumulado do ano de referÃªncia vs melhor acumulado histÃ³rico |
| Crescimento vs ano anterior | Acumulado do ano de referÃªncia vs acumulado do ano anterior |
| CritÃ©rio de acumulado | De `01/01` atÃ© **ontem** (mesmo dia/mÃªs nos anos comparados) |
| Filtro | Unidade (`all` ou especÃ­fica) |

---

## ResolveSaÃºde / Contratos (`/contratos`)

### Objetivo

Acompanhar carteira ativa do cartÃ£o, vendas do perÃ­odo, inadimplÃªncia e faturamento realizado.

### Fonte consumida

- `GET /api/admin/contratos`

### Indicadores

| Indicador | Fonte | Regra |
|---|---|---|
| Contratos ativos | `feegow_contracts` | `COUNT(DISTINCT contract_id)` com `status_contract='Aprovado'` |
| Pacientes ativos | `feegow_contracts` | `COUNT(DISTINCT registration_number)` com `status_contract='Aprovado'` |
| MRR carteira | `feegow_contracts` | `SUM(recurrence_value)` dos aprovados |
| Inadimplentes (qtd/valor) | `feegow_contracts` | `status_financial='Inadimplente'` |
| AdesÃ£o no perÃ­odo | `feegow_contracts` | `SUM(membership_value)` aprovados entre datas |
| Mensalidade no perÃ­odo | `feegow_contracts` | `SUM(recurrence_value)` aprovados entre datas |
| Cancelados no perÃ­odo | `feegow_contracts` | `COUNT(*)` com `status_contract='Cancelado'` entre datas |
| Faturamento realizado (perÃ­odo) | `faturamento_resumo_diario` | Soma da unidade ResolveCard no intervalo |
| GrÃ¡fico diÃ¡rio | `faturamento_resumo_diario` | SÃ©rie diÃ¡ria de faturamento da unidade ResolveCard |

---

## GestÃ£o de Propostas

### Objetivo

Separar a operaÃ§Ã£o da equipe da leitura gerencial do pipeline:
- `/propostas` = base de trabalho;
- `/propostas/gerencial` = visÃ£o gerencial.

### Fonte consumida

- `GET /api/admin/propostas`
- `GET /api/admin/propostas/options`
- `GET /api/admin/propostas/details`
- `GET /api/admin/propostas/export`
- `GET /api/admin/propostas/followup/options`
- `PATCH /api/admin/propostas/followup/[proposalId]`

### PÃ¡ginas do mÃ³dulo

- `/propostas`: fila operacional para follow-up, conversÃ£o e responsÃ¡vel.
- `/propostas/gerencial`: cards, status e rankings consolidados do perÃ­odo.

### Indicadores de topo

| Indicador | Regra |
|---|---|
| Total Propostas | `COUNT(*)` no perÃ­odo |
| Valor Total | `SUM(total_value)` no perÃ­odo |
| Convertido (ganho) | `SUM(total_value)` com status em lista de ganho |
| Taxa conversÃ£o | `valor_ganho / valor_total * 100` |
| Valor perdido | `SUM(total_value)` com status de perda |
| Ticket mÃ©dio | `valor_total / qtd` |

### Status considerados â€œganho/executadoâ€

`executada`, `aprovada pelo cliente`, `ganho`, `realizado`, `concluido`, `pago`.

### Ranking profissional

| Coluna | Regra |
|---|---|
| QTD | Quantidade total de propostas |
| Exec. QTD | Quantidade com status ganho |
| Total estimado | Soma total das propostas |
| Total executado | Soma das propostas ganhas |
| Taxa conversÃ£o | `valor_executado / valor_total * 100` |
| Ticket mÃ©dio | `valor_total / qtd` |
| Ticket exec. | `valor_executado / qtd_executado` |

### Base de trabalho

Objetivo operacional:
- expor a lista detalhada que alimenta o painel;
- priorizar follow-up de propostas em `Aguardando aprovaÃ§Ã£o do cliente`;
- permitir atribuiÃ§Ã£o de responsÃ¡vel e registro do desfecho comercial;
- exportar a base em XLSX para apoio da equipe.

Regras:
- respeita os filtros globais de perÃ­odo, unidade, status, conversÃ£o, responsÃ¡vel e profissional;
- se o filtro global de status estiver especÃ­fico, a base segue esse status;
- se o filtro global estiver em `Todos`, a base abre em `Aguardando aprovaÃ§Ã£o do cliente`;
- a tabela Ã© paginada e mostra data, paciente, telefone, procedimento(s), unidade, profissional, valor e status da proposta;
- o campo `Procedimento(s)` mostra um resumo de atÃ© `100` caracteres;
- quando o resumo ultrapassa esse limite, o botÃ£o `Ver itens` aparece para expandir a linha e exibir todos os procedimentos com valores quando disponÃ­veis;
- a base inclui colunas operacionais persistentes: `ConversÃ£o`, `Motivo`, `ResponsÃ¡vel` e `Ãšltima ediÃ§Ã£o`;
- a navegaÃ§Ã£o do mÃ³dulo na sidebar fica em `Financeiro > Propostas > Base de trabalho` e `Financeiro > Propostas > VisÃ£o gerencial`;
- nome e telefone do paciente sÃ£o enriquecidos a partir da Feegow por `patient/search?paciente_id=...`, com cache local;
- as ediÃ§Ãµes da equipe ficam em tabela separada (`proposal_followup_control`) e nÃ£o sÃ£o sobrescritas pelo worker de propostas.

---

## Produtividade de Agendamento (`/produtividade`)

### Objetivo

Mensurar produÃ§Ã£o de agendamentos por colaborador e equipe.

### Fonte consumida

- `GET /api/admin/produtividade`
- `GET /api/admin/goals/dashboard` (metas relacionadas a agendamento)
- `GET /api/admin/user-teams` (configuraÃ§Ã£o de equipes)

### Regras

| Item | Regra |
|---|---|
| PerÃ­odo padrÃ£o | 1Âº dia do mÃªs atual atÃ© hoje |
| Equipe padrÃ£o | `CRC` |
| ProduÃ§Ã£o base | `feegow_appointments.scheduled_at` |
| Confirmados | `status_id IN (3,7)` |
| NÃ£o compareceu | `status_id = 6` |

### Indicadores

| Indicador | Regra |
|---|---|
| Total global | `COUNT(*)` no perÃ­odo |
| Taxa confirmaÃ§Ã£o global | `confirmados / total * 100` |
| Taxa no-show | `nao_compareceu / total * 100` |
| Ranking por colaborador | Agrupamento por `scheduled_by` |
| EstatÃ­stica da equipe | Join `user_teams` + `teams_master` sobre `scheduled_by` |
| Metas por equipe/colaborador | Dados de `goals/dashboard` para KPIs de agendamento |

---

## Painel de Metas (`/metas/dashboard`)

### Objetivo

Acompanhar progresso em tempo real das metas vigentes.

### Fonte consumida

- `GET /api/admin/goals/dashboard`
- `POST /api/admin/goals/dashboard/export`

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

### Exportações

- `XLSX`: planilha com aba `Resumo` e aba `Metas`, incluindo filtros aplicados e todos os detalhes visíveis da meta.
- `PDF`: relatório executivo em A4 paisagem, com identidade visual Consultare, cabeçalho institucional, resumo dos KPIs e tabela consolidada das metas filtradas, com quebra de linha por célula para evitar sobreposição e corte de conteúdo.

---

## GestÃ£o de Metas (`/metas`)

### Objetivo

CRUD de metas e governanÃ§a de parÃ¢metros de KPI por escopo/setor/unidade/equipe.

### Fonte consumida

- `GET/POST/DELETE /api/admin/goals`
- `GET /api/admin/goals/dashboard` (dados realizados)
- `GET /api/admin/options/groups` (lista de grupos)

### ConfiguraÃ§Ãµes de meta suportadas

| Campo | ObservaÃ§Ã£o |
|---|---|
| Escopo | `CLINIC` ou `CARD` |
| Periodicidade | `daily`, `weekly`, `monthly`, `total` |
| Unidade de medida | moeda, quantidade, percentual, minutos |
| KPI vinculado | Lista em `KPIS_AVAILABLE` |
| Filtros avanÃ§ados | grupo, unidade clÃ­nica, colaborador, equipe |

---

## Checklist CRC (`/checklist-crc`)

### Objetivo

Gerar checklist diÃ¡rio operacional do CRC, com persistÃªncia de campos manuais e compartilhamento via WhatsApp.

### Fonte consumida

- `GET/POST /api/admin/checklist/crc`
- `GET /api/admin/status`

### Indicadores e campos

| Campo | Origem | Regra |
|---|---|---|
| Meta do dia | `goals_config` | Soma de metas `agendamentos` diÃ¡rias (escopo clÃ­nico), com fallback global |
| Agendamentos total | `feegow_appointments` | `COUNT(*)` por `scheduled_at` no dia |
| Agendamentos CRC | `feegow_appointments` + equipes | `COUNT(DISTINCT appointment_id)` com equipe `CRC` |
| Agendamento online/robÃ´ | `feegow_appointments` | `scheduled_by LIKE 'AGENDAMENTO ONLINE%'` |
| SolicitaÃ§Ãµes WhatsApp CRC | Google Sheets | Contagem de linhas da data atual |
| LigaÃ§Ãµes realizadas | tabela manual | `crc_checklist_daily.calls_made` |
| ConversÃ£o CRC | cÃ¡lculo | `agendamentos_crc / (ligacoes + solicitacoes_whatsapp) * 100` |
| Taxa de abandono | tabela manual | `crc_checklist_daily.abandon_rate` |
| Tempo mÃ©dio de espera | `clinia_group_snapshots` | `avg_wait_seconds` do grupo Central / 60 |
| Texto do relatÃ³rio | montagem backend/frontend | Formato pronto para copiar/enviar |

### PersistÃªncia manual

- Tabela: `crc_checklist_daily`
- Chave: `date_ref` (um registro por dia)
- Campos persistidos: `calls_made`, `abandon_rate`

---

## Checklist RecepÃ§Ã£o (`/checklist-recepcao`)

### Objetivo

Gerar checklist diÃ¡rio por unidade (financeiro + agenda + qualidade + operaÃ§Ã£o), com campos manuais persistidos por unidade.

### Fonte consumida

- `GET/POST /api/admin/checklist/recepcao`
- `GET /api/admin/status`

### Indicadores e campos

| Campo | Origem | Regra |
|---|---|---|
| Faturamento do dia | `faturamento_resumo_diario` | `SUM(total_pago)` por unidade e data atual |
| Faturamento do mÃªs | `faturamento_resumo_mensal` | `SUM(total_pago)` por unidade e mÃªs atual |
| Ticket mÃ©dio dia | resumo diÃ¡rio | `faturamento_dia / qtd_dia` |
| Meta mensal | `goals_config` | Soma de metas `revenue` mensais (unit-first, fallback global) |
| % meta atingida | cÃ¡lculo | `faturamento_mes / meta_mensal * 100` |
| Meta Resolve (alvo) | tabela manual | Campo digitÃ¡vel |
| Meta Resolve (realizado) | Google Sheets | Contagem por data atual, unidade e serviÃ§o resolve |
| Meta Check-up (alvo) | tabela manual | Campo digitÃ¡vel |
| Meta Check-up (realizado) | Google Sheets | Contagem por data atual, unidade e serviÃ§o check-up |
| OrÃ§amentos em aberto | `feegow_proposals` | Soma de propostas com status fora da lista de ganho |
| Notas fiscais emitidas | tabela manual | Lista (`Validado`/`Nao Validado`) |
| Contas em aberto | tabela manual | Lista (`Validado`/`Nao Validado`) |
| ConfirmaÃ§Ã£o agenda D+1 | `feegow_appointments` | `%` de `status_id=7` sobre total do dia seguinte (`date`) |
| AvaliaÃ§Ã£o Google e comentÃ¡rios | tabela manual | Campo livre |
| PendÃªncias urgentes | tabela manual | Texto livre |
| SituaÃ§Ãµes crÃ­ticas | tabela manual | Texto + prazo + responsÃ¡vel |
| AÃ§Ãµes realizadas | tabela manual | Texto livre |

### PersistÃªncia manual por unidade

- Tabela principal: `recepcao_checklist_manual`
- Chave: `scope_key` (ex.: `campinas_shopping`, `centro_cambui`, `ouro_verde`, `resolve`)
- Comportamento: cada unidade mantÃ©m seus prÃ³prios campos, sem compartilhamento entre unidades.

---

## GestÃ£o de UsuÃ¡rios (`/users`)

### Objetivo

Gerenciar usuÃ¡rios (CRUD) e matriz de permissÃµes por pÃ¡gina.

### Fonte consumida

- `GET/POST/DELETE /api/admin/users`
- `GET/POST /api/admin/users/permissions`

### Funcionalidades

| Item | Regra |
|---|---|
| Cadastro de usuÃ¡rio | Grava em `users` com senha hash (`bcrypt`) |
| EdiÃ§Ã£o de usuÃ¡rio | Atualiza dados e senha opcional |
| ExclusÃ£o de usuÃ¡rio | Remove usuÃ¡rio por `id` |
| Matriz de permissÃµes | Controle por pÃ¡gina e aÃ§Ã£o (`view`, `edit`, `refresh`) |

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

## Catalogo de KPIs de MetasÃ¡logo de KPIs de Metas

IDs disponÃ­veis em `frontend/src/app/(admin)/metas/constants.ts`:

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

| PÃ¡gina | AÃ§Ã£o de refresh | ServiÃ§o(s) acionado(s) |
|---|---|---|
| Dashboard | botÃ£o atualizar faturamento | `worker_faturamento_scraping` |
| Monitor | botÃ£o atualizar monitor | recarrega APIs de fila (sem trigger pesado) |
| Financeiro | botÃ£o atualizar | `worker_faturamento_scraping` |
| Contratos | botÃ£o atualizar | `contratos` |
| Propostas - VisÃ£o gerencial | botÃ£o atualizar | `comercial` |
| Produtividade | botÃ£o atualizar | `financeiro` |
| Checklist CRC | botÃ£o atualizar | `financeiro` + `clinia` |
| Checklist RecepÃ§Ã£o | botÃ£o atualizar | `financeiro` + `faturamento` + `comercial` |

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

### EvoluÃ§Ã£o tÃ©cnica (18/02/2026)

- Endpoints de documentos para o mÃ³dulo foram adicionados:
  - `GET/POST /api/admin/profissionais/:id/documentos`
  - `GET /api/admin/profissionais/documentos/:documentId/download`
- A tabela de documentos do modal permite `Visualizar` (`?inline=1`) e `Baixar`.
- A geraÃ§Ã£o de contrato foi incorporada na aba `Contratos` do modal, com histÃ³rico por profissional.
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
| Exporta??o XLSX | Usa exatamente os filtros visíveis da tela |

---

## Marketing / Controle (`/marketing/controle`)

### Objetivo

Oferecer um cockpit executivo mensal por marca, com leitura semanal e mensal das fontes de marketing ja integradas, sem depender da planilha manual.

### Filtros

- Marca (`Consultare` ou `Resolve`)
- Mes (`YYYY-MM`)

### Fontes consumidas

- `GET /api/admin/marketing/controle/summary`
- `GET /api/admin/marketing/controle/grid`
- `GET /api/admin/marketing/controle/source-status`
- `POST /api/admin/marketing/controle/refresh`
- `GET /api/admin/marketing/controle/export`

### Indicadores principais

| Indicador | Fonte | Regra |
|---|---|---|
| Visitantes do site | `fact_marketing_funnel_daily` | `SUM(total_users)` |
| Cliques em WhatsApp | `fact_marketing_funnel_daily` | `SUM(leads)` |
| Novos contatos Clinia (Google) | `fact_clinia_ads_daily` | `SUM(new_contacts_received)` com `origin='google'` |
| Agendamentos Clinia (Google) | `fact_clinia_ads_daily` | `SUM(appointments_converted)` com `origin='google'` |
| Investimento Google Ads | `fact_marketing_funnel_daily` | `SUM(spend)` |
| Custo por novo contato | frontend/API | `spend / new_contacts_received` |
| Custo por agendamento | frontend/API | `spend / appointments_converted` |

### Grade mensal

Colunas fixas da grade:

- `Semana 1`: dias `1-7`
- `Semana 2`: dias `8-14`
- `Semana 3`: dias `15-21`
- `Semana 4`: dias `22-fim do mes`
- `Mensal`

Blocos reais do MVP:

- `KPIs principais`
- `Google Ads`
- `Site / GA4`

Blocos visiveis, mas ainda sem integracao:

- `Facebook organico`
- `Instagram organico`
- `LinkedIn organico`
- `E-mail marketing`
- `Google Meu Negocio`
- `SEO tecnico / SEMrush`



---

## Vigilância Sanitária (`/qualidade/vigilancia-sanitaria`)

### Objetivo

Controlar licenças, documentos regulatórios, anexos e vencimentos por unidade, com visão gerencial para itens vencidos, vencendo e em dia.

### Indicadores

| Indicador | Fonte | Regra |
|---|---|---|
| Total de licenças | `health_surveillance_licenses` | Registros ativos filtrados |
| Licenças vencidas | `health_surveillance_licenses` | `valid_until < hoje` |
| Licenças vencendo | `health_surveillance_licenses` | `valid_until` entre hoje e 60 dias |
| Documentos vencidos | `health_surveillance_documents` | `valid_until < hoje` |
| Documentos vencendo | `health_surveillance_documents` | `valid_until` entre hoje e 60 dias |
| Sem validade | licenças/documentos | Itens sem data de validade, quando aplicável |

### Observações

- A página `/qualidade/documentos` passa a ser exibida como `POPs e Manuais`.
- Documentos regulatórios da Vigilância Sanitária ficam separados em `/qualidade/vigilancia-sanitaria`.
