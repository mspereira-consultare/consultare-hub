# Guia Explicativo do Módulo de Tarefas, Projetos e Gantt

Data: 2026-06-16

## Visão geral
O módulo de tarefas da Consultare foi criado para organizar demandas internas de forma simples no dia a dia e, ao mesmo tempo, dar visibilidade gerencial sobre prazos, andamento e entregas.

Ele funciona em duas camadas:

- **Tarefas**: para o acompanhamento operacional das demandas do dia a dia.
- **Projetos**: para agrupar várias tarefas relacionadas em um mesmo cronograma.

Na prática, isso significa que tarefas simples podem continuar sendo tratadas de forma avulsa, enquanto entregas maiores podem ser organizadas em projeto com visão completa de etapas e prazos.

## Como funcionam as tarefas
Cada tarefa funciona como um registro de trabalho interno, com tudo o que a equipe precisa para acompanhar uma entrega.

Uma tarefa pode ter:

- número de identificação interno;
- título e descrição;
- prioridade;
- status;
- prazo;
- responsável principal;
- responsáveis adicionais;
- aprovador, quando necessário;
- comentários;
- anexos;
- checklist de execução.

### O que a equipe consegue fazer com as tarefas
- Criar novas tarefas para si ou para outros colaboradores.
- Acompanhar as tarefas em formato visual, como um board estilo Trello.
- Mover a tarefa conforme o andamento.
- Comentar e anexar arquivos.
- Solicitar aprovação quando a demanda exigir validação.
- Usar checklist para acompanhar subtarefas sem precisar criar várias demandas separadas.

### Status das tarefas
Hoje o fluxo principal é:

- **Backlog**: demanda registrada, mas ainda não priorizada.
- **A fazer**: pronta para execução.
- **Em andamento**: já está sendo trabalhada.
- **Aguardando aprovação**: foi enviada para validação.
- **Concluída**: entrega finalizada.

Além disso, existem estados de encerramento:

- **Cancelada**: a tarefa foi interrompida e não seguirá.
- **Arquivada**: a tarefa foi retirada da operação do dia a dia, mas continua preservada para histórico.

## Quem vê cada tarefa
O sistema foi pensado para mostrar ao colaborador apenas o que faz sentido para ele.

De forma geral, o usuário vê:

- tarefas criadas por ele;
- tarefas atribuídas a ele;
- tarefas em que foi incluído como colaborador;
- tarefas em que foi definido como aprovador;
- tarefas dos projetos em que participa.

Já a gerência e os perfis administrativos têm visão global, para conseguir acompanhar o andamento geral da operação.

## Aprovações
Algumas tarefas podem exigir aprovação antes de serem consideradas finalizadas.

Nesse caso:

- um aprovador é definido;
- a tarefa segue normalmente até o momento da revisão;
- o aprovador pode aprovar, devolver para ajuste ou reprovar;
- todo esse histórico fica registrado na própria tarefa.

Isso ajuda a dar mais controle em entregas sensíveis, sem perder agilidade no restante da operação.

## Checklist
O checklist foi incluído para permitir que uma tarefa maior seja dividida em pequenas etapas internas.

Exemplo:

- preparar documento;
- revisar informações;
- anexar evidências;
- finalizar envio.

O checklist mostra o progresso da execução, mas não muda o status principal da tarefa sozinho. Ele funciona como apoio visual e operacional.

## Como funcionam os projetos
Os projetos foram criados para organizar entregas maiores, que envolvem várias tarefas relacionadas.

Eles fazem sentido quando existe:

- mais de uma etapa;
- necessidade de acompanhar sequência;
- prazo definido para várias entregas;
- mais de uma pessoa envolvida;
- interesse em enxergar o cronograma completo.

### O que é um projeto na prática
Um projeto é um agrupador de tarefas.

Ele reúne:

- nome e descrição do projeto;
- membros participantes;
- tarefas vinculadas;
- ordem do cronograma;
- dependências entre tarefas;
- visualização Gantt.

## Relação entre tarefas e projetos
Nem toda tarefa precisa estar em um projeto.

Hoje existem dois cenários:

- **Tarefa avulsa**: usada para demandas simples e isoladas.
- **Tarefa vinculada a projeto**: usada quando a entrega faz parte de um cronograma maior.

Regras importantes:

- uma tarefa pode ficar sem projeto;
- uma tarefa pode pertencer a apenas um projeto por vez;
- ao entrar em um projeto, ela passa a compor a visão cronológica desse projeto.

## Visibilidade dentro dos projetos
Quando uma pessoa participa de um projeto, ela consegue enxergar as tarefas daquele projeto, mesmo que não seja a responsável direta por todas elas.

Isso foi pensado para melhorar o alinhamento da equipe e evitar que partes importantes do cronograma fiquem invisíveis para quem participa da entrega.

## Governança dos projetos
Os projetos possuem uma camada de governança para evitar bagunça no cronograma.

### O que os membros podem fazer
Os membros do projeto podem:

- acompanhar o projeto;
- visualizar as tarefas vinculadas;
- criar tarefa já dentro do projeto;
- vincular ao projeto tarefas criadas por eles;
- remover do projeto tarefas criadas por eles.

### O que continua com owner ou gestão
O responsável estrutural do projeto, junto da gerência/ADM, continua com o controle sobre:

- membros do projeto;
- ordem das tarefas no cronograma;
- dependências entre tarefas;
- conclusão, arquivamento e reativação do projeto;
- alterações estruturais mais sensíveis.

Essa divisão ajuda a dar autonomia operacional ao time sem perder organização.

## O que é a visualização Gantt
O Gantt é a visão de cronograma do projeto.

Ele mostra:

- quais tarefas fazem parte do projeto;
- quando cada tarefa começa;
- qual é o prazo de cada uma;
- a sequência entre etapas;
- o andamento do conjunto.

É uma visão especialmente útil para:

- projetos com várias etapas;
- demandas com dependência entre tarefas;
- acompanhamento de prazo;
- leitura gerencial do andamento.

## Quando o Gantt faz mais sentido
O Gantt não foi pensado para tarefas pequenas e isoladas.

Ele faz mais sentido quando o projeto tem:

- pelo menos várias tarefas relevantes;
- início e prazo definidos;
- alguma sequência entre as entregas;
- necessidade de visão mais estratégica.

Se o projeto ainda estiver muito no começo, com poucas tarefas ou sem datas, a visualização pode existir, mas ainda não mostrar um cronograma realmente útil.

## Dependência entre tarefas
O projeto também permite indicar que uma tarefa depende da outra.

Na prática, isso significa:

- uma etapa deve acontecer antes da seguinte;
- o cronograma consegue mostrar melhor a ordem de execução;
- a equipe entende com mais clareza o que precisa ser feito primeiro.

Isso ajuda bastante em projetos com várias áreas envolvidas.

## O que a gerência passa a enxergar
No painel gerencial, a liderança consegue acompanhar:

- total de tarefas;
- tarefas a vencer;
- tarefas vencidas;
- tarefas aguardando aprovação;
- tarefas aprovadas;
- visão global de projetos;
- andamento dos cronogramas;
- gargalos por prazo e sequência.

Ou seja, o módulo não serve apenas para organizar o operacional. Ele também apoia acompanhamento de desempenho e execução.

## Benefícios esperados
Com esse modelo, a clínica passa a ganhar:

- mais organização das demandas internas;
- menos perda de contexto em tarefas;
- melhor rastreabilidade;
- clareza sobre responsáveis e prazos;
- histórico de decisões e aprovações;
- visibilidade compartilhada entre áreas;
- acompanhamento mais maduro de projetos e cronogramas.

## Resumo final
Em termos simples:

- **Tarefa** é a unidade de trabalho do dia a dia.
- **Projeto** é o agrupador de várias tarefas relacionadas.
- **Gantt** é a visão cronológica do projeto.

Assim, a operação continua simples para demandas pequenas, mas a clínica também passa a ter estrutura para acompanhar entregas maiores com mais controle, previsibilidade e visibilidade.
