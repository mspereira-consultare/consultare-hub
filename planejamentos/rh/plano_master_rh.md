# Plano Mestre RH — Finalização dos Itens Prioritários

Data: 2026-04-18

## Resumo
Este documento consolida o roadmap operacional do RH em um único plano de execução, priorizando a evolução do que já existe no painel e evitando abrir módulos novos sem necessidade real.

Diretrizes fechadas deste plano:
- modo de entrega: `MVP operacional`
- estratégia de navegação: reaproveitar módulos existentes
- ordem de prioridade: `2.17` -> `2.18` -> `2.24` -> `2.20` -> `2.19` -> `2.21`
- base principal de dados: tabela `employees` e seus vínculos já usados por `colaboradores` e `folha-pagamento`
- nova permissão estrutural apenas para `recrutamento`

Decisão de estrutura:
- `2.17 Fechamento de folha x ponto` continua em `/folha-pagamento`
- `2.18 Compra de benefícios VR x ponto` entra como nova aba em `/folha-pagamento`
- `2.24 Admissão e demissão` entra como nova aba em `/colaboradores`
- `2.20 Dashboard funcionários` entra como nova aba em `/colaboradores`
- `2.21 Qualidade incluir no painel (meta funcionários)` entra como seção ou aba complementar em `/colaboradores`
- `2.19 Processo de triagem de currículos` vira o novo módulo `/recrutamento`

## Objetivo operacional
Entregar um fluxo de RH que permita:
- fechar folha e benefícios por competência com rastreabilidade
- operar admissões e desligamentos sem planilhas paralelas
- acompanhar indicadores de pessoas em tempo real
- estruturar triagem de candidatos dentro do painel
- cruzar dados de pessoas, qualidade e metas em uma leitura única

## Base compartilhada
Antes das ondas funcionais, a base comum deve ser consolidada para evitar regra duplicada entre folha, benefícios e workflows de pessoas.

### Fonte única da verdade
O cadastro de colaboradores em `employees` passa a ser a referência oficial para:
- salário
- benefícios
- centro de custo
- jornada
- status
- datas de admissão e desligamento
- unidade, setor, cargo e supervisor

### Matriz de obrigatoriedade do cadastro
Criar uma matriz única de validação por contexto de uso, com retorno estruturado para frontend e processos de cálculo.

Contextos mínimos:
- folha
- benefícios
- admissão
- desligamento
- dashboard

Campos mínimos por contexto:

| Contexto | Campos críticos mínimos |
| --- | --- |
| Folha | nome, CPF, regime contratual, data de admissão, salário, centro de custo |
| Benefícios | campos de folha + VR por dia, VT por dia ou mensal, regras de desconto aplicáveis |
| Admissão | identificação, vínculo, data de admissão, unidade, setor, cargo, documentos obrigatórios do perfil |
| Desligamento | status, data de desligamento, motivo, observações finais, devoluções pendentes |
| Dashboard | status, data de admissão, data de nascimento, unidade, setor, regime, ASO, pendência documental |

### Estados operacionais padrão
Padronizar os estados exibidos no RH para uso transversal:
- `pendente cadastro`
- `pronto`
- `em processamento`
- `com bloqueio`
- `fechado`

Esses estados devem ser reaproveitados em:
- prontidão da folha
- cálculo de benefícios
- checklist de admissão
- checklist de desligamento
- visão de pendências do dashboard

### Permissões
Permissões reaproveitadas:
- `colaboradores`
- `folha_pagamento`

Nova permissão:
- `recrutamento`

## Sequência de implementação

### Onda 1 — `2.17 Fechamento de folha x ponto`
Objetivo da onda:
- fechar a robustez operacional do módulo já existente sem redesenhar a experiência principal

Entregas:
- visão de prontidão da competência antes da geração da folha
- indicação clara de cadastro faltante
- indicação de colaboradores não vinculados ao ponto
- indicação de importações inválidas ou incompletas
- bloqueios reais de cálculo com linguagem operacional do RH
- ação explícita de reprocessamento da competência após correções no cadastro
- motivo de linhas zeradas ou parciais visível no histórico e na memória de cálculo

Critério de pronto:
- uma competência precisa poder ser importada, validada, recalculada e exportada com rastreabilidade

Principais mudanças esperadas:
- nova camada de validação de prontidão em `/folha-pagamento`
- reaproveitamento do histórico de importações já existente
- ajuste de mensagens e memória de cálculo para explicar bloqueios de forma objetiva

### Onda 2 — `2.18 Compra de benefícios VR x ponto`
Objetivo da onda:
- transformar a mesma competência da folha em base de compra e conferência de benefícios

Entregas:
- nova aba `Benefícios` dentro de `/folha-pagamento`
- memória mensal de benefícios por colaborador
- cálculo a partir de ponto + regras do cadastro
- cobertura MVP de:
  - VR por dia
  - VT por dia
  - VT mensal
  - descontos fixos
  - exceções manuais
- destaque automático de bloqueios por cadastro incompleto
- visão analítica por colaborador
- consolidado da competência para compra
- exportação operacional
- snapshot mensal para auditoria e reabertura controlada

Critério de pronto:
- RH consegue conferir e exportar a compra de benefícios da competência sem sair do módulo de folha

Principais mudanças esperadas:
- contratos de leitura e geração por competência
- persistência do snapshot mensal de benefícios
- integração lógica com o mesmo recorte de período já usado no ponto

### Onda 3 — `2.24 Admissão e demissão`
Status: implementada no MVP operacional.

Objetivo da onda:
- transformar o cadastro de colaboradores em fluxo operacional de entrada e saída

Entregas:
- nova aba `Admissões & Demissões` dentro de `/colaboradores`
- listas separadas para:
  - pré-admissão
  - admissão em andamento
  - desligamentos em andamento
  - encerrados
- checklist persistido por colaborador
- responsável, prazo, status e observação por item
- vínculo de checklist com documentos já existentes
- cobertura MVP de:
  - documentos obrigatórios
  - cadastro contratual
  - benefícios iniciais
  - ASO
  - entrega de uniforme
  - devolução de uniforme
  - armário
  - data e motivo de desligamento
  - observações finais

Critério de pronto:
- RH consegue acompanhar admissões e desligamentos sem planilha paralela

Principais mudanças esperadas:
- workflow sobre a base já existente de colaboradores
- checklist persistido por colaborador
- reaproveitamento de documentos, uniforme, armário e trilha de auditoria

Implementação realizada:
- aba `Admissões & Demissões` em `/colaboradores`;
- status `PRE_ADMISSAO` no cadastro para entrada ainda não ativa;
- tabelas `employee_lifecycle_cases` e `employee_lifecycle_tasks`;
- APIs `/api/admin/colaboradores/lifecycle`;
- checklist inicial de admissão e desligamento com responsável, prazo, status e observação;
- referência explícita às fontes oficiais `employees`, `employee_documents`, `employee_uniform_items` e `employee_locker_assignments`;
- modal `Como funciona` atualizado para explicar a abordagem sem fonte paralela.

### Onda 4 — `2.20 Dashboard funcionários`
Objetivo da onda:
- dar visibilidade gerencial do RH em cima do cadastro operacional

Entregas:
- nova aba `Dashboard` dentro de `/colaboradores`
- indicadores MVP:
  - aniversariantes do mês
  - aniversariantes dos próximos 30 dias
  - headcount ativo e inativo
  - admissões do mês
  - desligamentos do mês
  - tempo de empresa por faixa
  - turnover mensal
  - turnover acumulado
  - pendências de ASO
  - pendências documentais
- filtros por:
  - unidade
  - setor
  - regime contratual
  - status

Critério de pronto:
- os números do dashboard precisam bater com o cadastro e substituir consultas manuais do RH

Principais mudanças esperadas:
- camada de agregação própria do módulo de colaboradores
- componentes de leitura gerencial coerentes com o padrão visual atual do painel

Status de implementação:
- iniciada com a aba `Dashboard` em `/colaboradores`;
- criada a rota `GET /api/admin/colaboradores/dashboard`;
- agregação atual cobre headcount, aniversários, admissões, desligamentos, turnover, tempo de empresa, ASO e pendências documentais.

### Onda 5 — `2.19 Processo de triagem de currículos`
Objetivo da onda:
- criar o primeiro fluxo estruturado de recrutamento dentro do painel

Entregas:
- novo módulo `/recrutamento`
- page key `recrutamento`
- grupo `GESTÃO DE PESSOAS`
- entidades MVP:
  - vagas
  - candidatos
  - anexos do candidato
  - histórico de movimentação
  - pipeline
- estágios fechados do funil:
  - `recebido`
  - `triagem`
  - `entrevista`
  - `banco`
  - `aprovado`
  - `recusado`
  - `contratado`
- padrão visual alinhado aos drawers e listas já usados no painel
- conversão de candidato aprovado em rascunho de colaborador
- prevenção de duplicidade por CPF e e-mail

Critério de pronto:
- RH consegue cadastrar vaga, mover candidato no funil, anexar currículo e converter aprovado em rascunho de colaborador

Principais mudanças esperadas:
- novo conjunto de tabelas e APIs de recrutamento
- nova permissão `recrutamento`
- reaproveitamento do padrão de funil/lista/drawer já validado em outros módulos

### Onda 6 — `2.21 Qualidade incluir no painel (meta funcionários)`
Objetivo da onda:
- fechar a visão transversal de pessoas com qualidade e metas

Entregas:
- nova seção ou aba `Qualidade & Metas` acoplada ao contexto de `/colaboradores`
- leitura por colaborador e por equipe
- exibição MVP de:
  - conformidade documental
  - treinamentos pendentes
  - treinamentos vencidos
  - metas atribuídas a colaborador
  - metas atribuídas a equipe
  - atingimento
  - pendências críticas para o RH

Critério de pronto:
- RH consegue cruzar situação cadastral, qualidade e metas sem trocar de módulo

Principais mudanças esperadas:
- composição a partir das APIs já existentes de Qualidade e Metas
- criação de agregador novo apenas se o acoplamento no cliente ficar excessivo

## APIs, interfaces e contratos

### `/folha-pagamento`
Adicionar:
- camada de prontidão da competência
- aba `Benefícios`
- contratos de leitura, geração, reprocessamento e exportação por competência

Persistência esperada:
- snapshot mensal de benefícios
- rastreabilidade de bloqueios e mensagens de cálculo

### `/colaboradores`
Adicionar:
- aba `Admissões & Demissões`
- aba `Dashboard`
- seção ou aba `Qualidade & Metas`

Contratos necessários:
- agregação gerencial de colaboradores
- workflow e checklist por colaborador
- leitura consolidada de pendências

### `/recrutamento`
Criar:
- APIs para vagas
- APIs para candidatos
- APIs para pipeline e histórico
- conversão candidato -> colaborador

### Validação centralizada
Criar uma camada compartilhada de validação do cadastro por contexto para evitar regra duplicada em:
- folha
- benefícios
- admissões
- desligamentos
- dashboard

## Critérios de aceite
- folha e benefícios devem bloquear cálculo quando faltarem campos críticos do cadastro, com pendência acionável
- após correção do cadastro, a competência deve poder ser recalculada sem perda de rastreabilidade
- admissões e desligamentos devem funcionar com checklist persistido, responsável e prazo
- dashboard de funcionários deve bater com os números do cadastro para headcount, aniversários, admissões, desligamentos e turnover
- recrutamento deve permitir cadastrar vaga, anexar currículo, mover candidato no funil e converter aprovado em rascunho de colaborador
- qualidade e metas devem refletir os mesmos indicadores-base já existentes, reorganizados para consumo do RH
- todas as ondas devem sair com empty states, permissões coerentes e regressão preservada nos módulos atuais

## Ordem prática de execução
Sequência recomendada do time:
1. consolidar a validação compartilhada do cadastro
2. fechar prontidão e reprocessamento de `2.17`
3. entregar benefícios de `2.18`
4. estruturar workflow de `2.24`
5. publicar dashboard de `2.20`
6. abrir módulo novo de `2.19`
7. fechar composição transversal de `2.21`

## Assumptions
- não haverá um hub RH novo neste MVP
- `2.18` será tratado como desdobramento da competência da folha
- `2.21` depende do dashboard de colaboradores e por isso vem por último
- não entram integrações externas com job boards, fornecedores de benefício ou automações de admissão neste MVP
- `2.17` já está funcional e entra agora em fase de fechamento operacional, não de reconstrução
