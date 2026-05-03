# Plano — Refatorar `/metas/dashboard` para Visão Retroativa sem Quebrar UI/UX

## Resumo

- Não criar nova página. A melhoria será uma refatoração da própria `/metas/dashboard`, preservando o layout, a navegação, os componentes e o padrão visual atuais.
- A principal evolução funcional será adicionar análise por `data inicial` e `data final`, permitindo que a gestora veja metas retroativas e também metas hoje inativas, desde que tenham vigência no período selecionado.
- Todos os filtros já existentes na página atual continuarão válidos nesse modo histórico.
- O dashboard passará a recalcular `meta`, `realizado`, `atingimento`, `status` e `comparações` com base no período escolhido, em vez de usar apenas o “agora”.
- A UI deve manter o máximo possível da experiência atual: mesmos cards, tabela, modal de detalhe, abas e padrão visual; a mudança principal será a camada temporal.

## Mudanças principais

### 1. Estratégia de produto e UX

- A página atual continua sendo a entrada principal da leitura gerencial.
- Não introduzir um “dashboard histórico” separado nem uma navegação paralela.
- Adicionar no topo da página atual um bloco de período com:
  - `data inicial`
  - `data final`
  - ação rápida para limpar/voltar ao período atual
- Quando nenhum período for informado:
  - manter o comportamento atual, focado no período corrente.
- Quando houver período informado:
  - ativar o modo retroativo;
  - incluir metas cuja vigência intersecta o intervalo;
  - recalcular todo o desempenho para esse recorte.
- Manter o padrão visual atual:
  - não trocar tabs, tabela e cards por uma UI nova;
  - só acrescentar os controles de período e enriquecer os dados exibidos.

### 2. Regras de negócio do período retroativo

- O filtro temporal principal passa a ser `start_date` e `end_date` no sentido analítico, não apenas de cadastro/configuração.
- A meta entra no resultado se sua vigência tiver interseção com o período selecionado.
- Metas hoje inativas devem aparecer quando o intervalo pedido cair dentro da sua vigência histórica.
- Para cada meta do resultado, o backend deve calcular:
  - valor alvo válido para o período;
  - realizado no período;
  - percentual de atingimento;
  - status do período (`SUCCESS`, `WARNING`, `DANGER`);
  - comparação com período anterior equivalente.
- Para metas mensais, como “Shopping Campinas em janeiro”, o cálculo deve refletir exatamente o intervalo `2026-01-01` a `2026-01-31`.
- A visão por `unidade x grupo de faturamento x meta` deve funcionar com os filtros já existentes, especialmente:
  - `clinic_unit`
  - `filter_group`
  - `linked_kpi_id`
  - `sector`

### 3. Backend e contratos

- Refatorar `GET /api/admin/goals/dashboard` para aceitar e aplicar:
  - todos os filtros atuais;
  - `start_date` e `end_date` como recorte analítico real.
- Alterar a lógica atual que busca apenas metas ativas “hoje”.
- A resposta deve deixar de ser um array cru e passar a retornar payload estruturado com:
  - `summary`
  - `comparison`
  - `coverage`
  - `goals`
  - `filtersApplied`
- Ampliar os tipos do dashboard para incluir:
  - `previousCurrent`
  - `previousPercentage`
  - `deltaCurrent`
  - `deltaPercentage`
  - `isHistorical`
- Refatorar `GET /api/admin/goals/history` para respeitar o mesmo período selecionado no dashboard.
- O modal de detalhes deve abrir já no contexto temporal da página, sem forçar mês/semana atuais.
- Exportação `PDF/XLSX` deve refletir exatamente o período e os filtros aplicados na tela.

### 4. Metas automáticas e manuais

- Metas automáticas:
  - recalcular o realizado a partir das fontes oficiais já existentes, usando o intervalo selecionado.
- Metas manuais:
  - criar persistência histórica por período, pois hoje só existe `goals_config`.
  - tabela sugerida: `goal_manual_entries`
  - campos mínimos:
    - `goal_id`
    - `period_start`
    - `period_end`
    - `value`
    - `notes`
    - `updated_by`
    - `created_at`
    - `updated_at`
- Regra para metas manuais:
  - se houver lançamento no período, usar esse valor;
  - se não houver, mostrar estado “sem lançamento” em vez de zero silencioso.
- Manter o cadastro atual de metas quase intacto; a nova persistência manual entra apenas como complemento histórico.

### 5. Filtros com paridade total

Aplicar no modo retroativo todos os filtros já presentes hoje em `/metas/dashboard`:

- `name`
- `status`
- `scope`
- `periodicity`
- `clinic_unit`
- `unit`
- `sector`
- `linked_kpi_id`
- `filter_group`
- `collaborator`
- `team`
- `target_min`
- `target_max`

Tratamento esperado:

- esses filtros continuam funcionando exatamente como hoje;
- a diferença é que agora operam sobre o período selecionado;
- `start_date` e `end_date` deixam de ser apenas filtros de vigência e passam a definir o recorte analítico do dashboard.

### 6. UI/UX e preservação do padrão atual

- Manter a composição geral da tela:
  - topo com visão executiva;
  - tabs por setor;
  - tabela detalhada;
  - modal de detalhe.
- Alterações visuais devem ser mínimas:
  - inserir o filtro de período no bloco já existente de filtros;
  - manter espaçamentos, tons, componentes e linguagem visual atuais.
- O modo histórico deve parecer uma extensão natural da tela, não uma experiência nova.
- No detalhe e na tabela, apenas acrescentar informações úteis quando houver período retroativo:
  - realizado anterior
  - variação
  - status do período
- Evitar:
  - nova página;
  - novo menu;
  - nova taxonomia visual;
  - quebra do padrão de leitura que a gestora já conhece.

## Testes e cenários

- Selecionar `01/01/2026` a `31/01/2026` e visualizar a meta de faturamento de `Shopping Campinas`.
- Filtrar `clinic_unit=SHOPPING CAMPINAS` + `filter_group=Consultas` e ver só o grupo correspondente.
- Filtrar `clinic_unit=SHOPPING CAMPINAS` + `filter_group=Endoscopia` e validar meta, realizado e atingimento do período.
- Validar que metas encerradas hoje, mas vigentes em janeiro, aparecem no recorte de janeiro.
- Validar que metas fora da vigência do intervalo não aparecem.
- Validar que o modal de detalhes usa o mesmo período da tela principal.
- Validar exportação PDF/XLSX com período retroativo e múltiplos filtros ativos.
- Validar comparação com período anterior equivalente.
- Validar meta manual com lançamento histórico.
- Validar meta manual sem lançamento exibindo “sem lançamento”.
- Validar que, sem período informado, a tela mantém comportamento atual.

## Assunções

- A solução deve reaproveitar a página atual, sem criar nova rota.
- O período retroativo será dirigido por `data inicial` e `data final`.
- A prioridade da gestora é leitura gerencial retroativa com preservação máxima da experiência atual.
- A visão por unidade e grupo de faturamento é caso prioritário e deve ser suportada no V1.
- A UI deve ser tratada como refatoração incremental, não redesign.

