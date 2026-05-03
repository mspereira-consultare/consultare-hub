# Plano Executivo — Recrutamento com Indeed e Triagem com IA

## Objetivo

Evoluir o módulo `/recrutamento` do painel para centralizar melhor o processo seletivo, conectando o fluxo com a Indeed e adicionando uma triagem inicial com inteligência artificial.

Com isso, o RH passa a ter:

- vagas concentradas no painel;
- candidatos recebidos da Indeed dentro do mesmo fluxo operacional;
- currículos já organizados no histórico do processo;
- uma análise inicial automática para priorizar os melhores perfis com mais velocidade e consistência;
- uma etapa formal com a gerência antes da admissão.

## O que será entregue

### 1. Integração oficial com a Indeed

- O painel passará a se integrar com a Indeed pelos caminhos oficiais suportados pela plataforma.
- Faremos uma carga inicial das vagas já existentes para não perder o histórico operacional.
- Depois dessa etapa, o painel passa a ser o ponto principal de gestão das vagas, com sincronização para a Indeed.
- As candidaturas recebidas pela Indeed entrarão automaticamente no funil do painel.

### 2. Triagem inicial com IA

Cada candidato poderá receber uma análise inicial automática com base em:

- currículo;
- descrição da vaga;
- requisitos da posição.

Essa análise irá gerar:

- nota de aderência do candidato à vaga;
- parecer breve;
- relatório mais detalhado com pontos fortes, pontos fracos e aderência aos requisitos.

### 3. Segunda etapa com a gerência

- Depois que o recrutador identificar um candidato promissor e concluir a entrevista, ele poderá encaminhar esse candidato para uma etapa própria da gerência.
- A gerente verá essa pendência no painel executivo, como uma tarefa de acompanhamento.
- Se aprovar, o sistema já inicia automaticamente a pré-admissão.
- Se não aprovar, o candidato retorna para o RH seguir com os ajustes ou reavaliar o processo.

## Benefícios esperados

- Redução do trabalho manual na triagem inicial.
- Mais velocidade para o RH identificar candidatos com maior potencial.
- Maior padronização na avaliação inicial.
- Melhor organização dos dados de vaga, candidatura, currículo e histórico.
- Menor risco de perder candidatos recebidos por canais externos.
- Mais visibilidade gerencial do funil de recrutamento.
- Menor perda de contexto entre triagem, entrevista, decisão da gerência e admissão.
- Transição mais rápida entre candidato aprovado e início formal da admissão.

## Como a solução vai funcionar

- O painel continuará sendo o centro operacional do recrutamento.
- A Indeed funcionará como canal oficial de divulgação e recebimento de candidaturas.
- O candidato recebido entrará no painel com seus dados e anexos.
- A IA fará uma leitura inicial do currículo e devolverá uma recomendação estruturada.
- O recrutador continuará conduzindo a triagem e a entrevista.
- A gerente terá uma etapa própria para a segunda decisão.
- Quando houver aprovação gerencial, o sistema já abrirá a pré-admissão automaticamente.

## Limites e salvaguardas

- A IA não aprova, reprova nem movimenta candidatos sozinha.
- A recomendação automática será apenas apoio à decisão humana.
- A decisão da gerente continuará sendo humana e formal.
- Toda integração e toda análise ficarão registradas para auditoria.
- A aprovação ou devolução da segunda etapa também ficará registrada.
- Em caso de falha da Indeed ou da IA, o candidato continuará visível no painel e poderá ser tratado manualmente.

## Forma de implantação

### Etapa 1 — Preparação do módulo

- ampliar os dados das vagas;
- preparar a estrutura de integração;
- preparar a área visual da triagem no painel.

### Etapa 2 — Integração com a Indeed

- conectar a conta/canal oficial da Indeed;
- importar o estoque inicial de vagas;
- ativar a sincronização operacional.

### Etapa 3 — Entrada automática de candidatos

- receber candidaturas da Indeed dentro do painel;
- anexar currículo e demais arquivos no processo local.

### Etapa 4 — Triagem automática com IA

- analisar currículos automaticamente;
- exibir nota, parecer e relatório no cadastro do candidato.

### Etapa 5 — Aprovação gerencial e início da admissão

- criar a etapa “Com a Gerência” no funil;
- exibir essa pendência no painel executivo;
- permitir aprovação da segunda fase;
- iniciar automaticamente a pré-admissão após aprovação.

## Resultado esperado para a gerência

Ao final da implantação, a Consultare terá um processo de recrutamento mais organizado, mais rápido e mais escalável, com:

- uso do painel como centro do processo;
- integração com a Indeed dentro do fluxo oficial;
- triagem inicial automatizada;
- participação formal da gerência na segunda etapa;
- início mais ágil da admissão após aprovação final;
- manutenção do controle decisório nas mãos do RH e da gerência.

## Resumo executivo

Este projeto melhora diretamente a eficiência do recrutamento. Ele reduz esforço manual, acelera a leitura inicial dos currículos, organiza melhor a participação da gerência na segunda fase e encurta o caminho entre aprovação final e início da admissão. A proposta continua de baixo risco operacional porque mantém o painel como base de trabalho, adiciona integrações com rastreabilidade e usa a IA como suporte, não como substituição da decisão humana.
