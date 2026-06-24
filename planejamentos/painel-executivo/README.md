# Painel Executivo - Guia dos Arquivos

Este diretório reúne os materiais de planejamento e referência do `dashboard-executivo`.

O objetivo deste guia é deixar claro:

- o que é material histórico ou de origem;
- o que é plano ativo de implementação;
- o que já foi entregue;
- o que ainda está pendente.

---

## 1. Arquivo principal de trabalho

### `plano_refatoracao_painel_executivo.md`

Status: **arquivo principal e atual**

Use este arquivo como fonte oficial para:

- contexto do painel executivo;
- decisões travadas da V1;
- backlog por lotes;
- status do que foi concluído;
- próximos ciclos recomendados.

Situação atual registrada nele:

- Lote A: concluído
- Lote B: concluído
- Lote C: concluído
- Lote D: concluído
- Próximo ciclo: automação do snapshot + controle de custo da IA

---

## 2. Arquivos históricos e de origem

### `resumo_executivo.md`

Status: **histórico / visão de negócio inicial**

Uso:

- material executivo de origem;
- narrativa resumida do objetivo do painel;
- bom para alinhamento com gestão e contexto de produto.

Não usar como fonte principal de status técnico atual.

### `PAINEL EXECUTIVO POR SETOR.pdf`

Status: **referência externa / insumo original**

Uso:

- material recebido da operação/gestão;
- referência de visão por setor e expectativa de conteúdo.

Não usar como checklist de implementação atual sem passar pelo plano principal.

### `plano_refatoracao_usuarios_grupos_perfis_dashboard.md`

Status: **plano estrutural separado**

Uso:

- referência da refatoração mais profunda de governança executiva por usuários, grupos e perfis.

Situação:

- não faz parte da retomada concluída agora;
- continua como trilha estrutural futura, separada do ciclo que fechou os lotes A-D.

---

## 3. O que já foi implementado

A V1 consolidada do painel executivo já entregou:

- `/dashboard` como página principal do painel executivo;
- governança executiva atual por perfil/grupo/cargo/exceção, sem reabrir `/users` nem permissões nesta retomada;
- snapshot executivo persistido;
- refresh manual;
- exportação PDF alinhada com a tela atual;
- composição `widgets-first` no dashboard;
- distinção visual entre:
  - widgets ativos;
  - widgets em preparação;
  - widgets bloqueados nesta retomada.

Widgets entregues nesta retomada:

- `progresso_metas`
- `agendamento_diario_meta`
- `agendamento_mensal_meta`
- `tempo_empresa_um_ano`

---

## 4. O que ainda está pendente

### Próximo ciclo prioritário

Planejado no arquivo principal:

- automação de refresh do dashboard executivo;
- política de IA com janelas fixas;
- reaproveitamento da última leitura válida para reduzir custo;
- limitação de requests automáticos aos perfis de liderança.

### Backlog residual de widgets

Ainda pendentes por fonte ou refinamento:

- `banco_horas`
- `agenda_calendario`
- `contas_aberto`
- `nf_aberto`
- `recoletas`
- `fila_telefonia`
- `ultima_inspecao`
- `contas_semana`
- `notas_fiscais`
- `previsto_realizado`
- `estornos_pendentes`
- `contratos_pendentes_vencidos`
- `estoque_vencendo`

Bloqueado nesta retomada:

- `reclame_aqui`

---

## 5. Ordem recomendada para consulta

Quando retomarmos esse tema no futuro, a ordem ideal é:

1. Ler este `README.md`
2. Ler `plano_refatoracao_painel_executivo.md`
3. Consultar `resumo_executivo.md` apenas como contexto de negócio
4. Consultar `plano_refatoracao_usuarios_grupos_perfis_dashboard.md` apenas se a conversa voltar para governança estrutural
5. Usar o PDF somente como referência externa/original

---

## 6. Regra prática de manutenção

Para evitar confusão daqui para frente:

- status de implementação deve sempre ser atualizado no `plano_refatoracao_painel_executivo.md`;
- este `README.md` deve ser atualizado quando surgir novo arquivo relevante ou quando mudar o “arquivo principal” do tema;
- arquivos históricos não devem virar fonte oficial de andamento técnico.
