# Planejamento em Sprints — Report Semanal de Tarefas por E-mail

## Resumo
Objetivo:
- enviar automaticamente um **report semanal por e-mail** para colaboradores com pendências reais no módulo de tarefas;
- usar **SendPulse** com remetente próprio do fluxo;
- adicionar **e-mail corporativo** no cadastro oficial de colaborador;
- incluir **eficiência acumulada** e **eficiência semanal**;
- disponibilizar uma **camada administrativa simples no painel** para acompanhar envios, faltantes e falhas.

Decisões fechadas:
- envio automático: **segunda-feira às 06h30**, `America/Sao_Paulo`;
- elegibilidade: apenas colaboradores com **tarefas operacionais pendentes sob execução direta**;
- execução direta = responsável principal ou colaborador;
- sem fallback para e-mail pessoal;
- sem `corporate_email`, o colaborador é **ignorado individualmente** e registrado como pendência administrativa;
- campo novo fica em `employees`, não em `users`;
- formato do e-mail: **resumo + lista curta**;
- lista prioriza **atrasadas e urgentes**;
- o e-mail mostra **eficiência acumulada** e **eficiência da semana**;
- configurações operacionais do report serão gerenciadas no painel, não no `.env`:
  - ativação do recurso
  - e-mail remetente
  - nome do remetente
  - e-mail de resposta
- remetente padrão do V1:
  - `no-reply@consultare.com.br`
  - nome: `Consultare Intranet`
- o módulo de **repasses** permanece em `MailerSend` e não entra neste escopo

## Sprint 1 — Base Cadastral e Elegibilidade
Objetivo:
preparar os dados obrigatórios do destinatário e fechar a regra oficial de quem pode receber o report.

Entregas:
- adicionar `corporate_email` em `employees`;
- atualizar tipos e payloads de colaborador para incluir `corporateEmail`;
- expor o campo no formulário de `/colaboradores`;
- validar formato do e-mail corporativo;
- bloquear duplicidade de `corporate_email`;
- manter `users.email` sem alteração e sem sincronização;
- criar resolução oficial de destinatário via `users.employee_id -> employees.id`;
- implementar serviço de elegibilidade com os motivos de exclusão:
  - sem vínculo `user -> employee`
  - sem e-mail corporativo
  - sem pendências elegíveis

Critério de pronto:
- o sistema consegue listar quem seria elegível e quem seria ignorado, com motivo claro.

## Sprint 2 — Janela Semanal, Métricas e Conteúdo
Objetivo:
montar o recorte semanal, as métricas e a composição do report.

Entregas:
- implementar janela da semana anterior:
  - segunda 00:00:00 a domingo 23:59:59
- montar snapshot atual do colaborador:
  - pendências atuais
  - vencidas
  - vencem nos próximos 7 dias
  - aguardando aprovação
- calcular **eficiência acumulada**:
  - mesma regra atual do produto
  - `concluídas / operacionais`
- calcular **eficiência semanal**:
  - numerador: tarefas concluídas na semana
  - denominador: `concluídas na semana + pendências operacionais atuais no corte`
  - sem base => `—`
- montar lista curta de tarefas críticas:
  - máximo `8`
  - ordem:
    1. vencidas
    2. urgentes
    3. alta prioridade
    4. prazo mais próximo
- gerar payload do e-mail com:
  - saudação
  - período
  - indicadores
  - lista curta
  - link para `/tarefas`

Critério de pronto:
- o sistema gera uma prévia completa e consistente do report para um colaborador elegível.

## Sprint 3 — Envio Automático e Auditoria
Objetivo:
transformar o report em um processo automático, seguro e auditável.

Entregas:
- criar pipeline próprio de envio, separado de repasses;
- criar persistência dedicada:
  - `task_weekly_report_runs`
  - `task_weekly_report_recipients`
  - `task_weekly_report_events`
- registrar:
  - janela semanal
  - status do run
  - enviados
  - ignorados com motivo
  - falhas
  - `provider_message_id`
- integrar com SendPulse;
- manter em `.env` apenas segredos e infraestrutura do fluxo:
  - `TASKS_WEEKLY_REPORT_CRON_SECRET`
- criar persistência/configuração administrativa do recurso para substituir envs operacionais:
  - `enabled`
  - `fromEmail`
  - `fromName`
  - `replyToEmail`
- validar que `fromEmail` pertence a remetente/domínio autorizado no SendPulse antes de ativar o envio;
- criar rota processadora protegida por segredo;
- garantir idempotência por semana;
- criar webhook ou trilha equivalente para status de entrega/falha no SendPulse.

Critério de pronto:
- um lote semanal pode ser executado ponta a ponta sem duplicação automática e com rastreabilidade completa.

## Sprint 4 — Camada Administrativa no Painel
Objetivo:
dar visibilidade operacional mínima para a gestão acompanhar o recurso.

Entregas:
- adicionar seção administrativa simples dentro da governança de tarefas;
- mostrar status do recurso:
  - ativo/desativado
  - remetente configurado
  - e-mail de resposta configurado
  - próximo disparo esperado
- permitir editar diretamente na UI administrativa:
  - ativação do recurso
  - e-mail remetente
  - nome do remetente
  - e-mail de resposta
- mostrar resumo do último run:
  - elegíveis
  - enviados
  - aceitos/entregues
  - ignorados por falta de `corporate_email`
  - ignorados por falta de vínculo
  - falhas
- mostrar histórico recente de runs;
- mostrar lista resumida dos ignorados com motivo;
- incluir ação de **prévia manual**;
- incluir ação de **disparo manual controlado** para homologação.

Critério de pronto:
- a equipe consegue auditar rapidamente se o semanal rodou, quem recebeu e quem ficou de fora.

## Sprint 5 — Hardening e Go-Live
Objetivo:
validar cenários reais, fechar QA e preparar ativação segura.

Entregas:
- revisar consistência entre:
  - tarefa
  - usuário
  - colaborador
  - `employee_id`
  - `corporate_email`
- validar cenários críticos:
  - sem pendências
  - sem e-mail corporativo
  - concluídas na semana sem pendências atuais
  - só aprovador
  - só criador
  - com vencidas e urgentes
- validar assunto, HTML, texto e CTA;
- validar remetente, reply-to e webhook no SendPulse;
- revisar mensagens administrativas de skip/falha;
- preparar checklist de ativação:
  - remetente validado no SendPulse
  - configuração administrativa preenchida
  - cron configurado
  - base mínima de `corporate_email` carregada

Critério de pronto:
- o recurso pode ser ativado com previsibilidade operacional e sem dependência de suporte constante.

## Interfaces e Contratos
- Novo campo:
  - `Employee.corporateEmail`
- Novos tipos esperados:
  - `TaskWeeklyReportRun`
  - `TaskWeeklyReportRecipient`
  - `TaskWeeklyReportSummary`
  - `TaskWeeklyReportEmailPayload`
- Novas estruturas persistidas:
  - `task_weekly_report_runs`
  - `task_weekly_report_recipients`
  - `task_weekly_report_events`
- Nova configuração administrativa esperada:
  - `TaskWeeklyReportSettings`
  - `enabled`
  - `fromEmail`
  - `fromName`
  - `replyToEmail`
- Novas envs:
  - `TASKS_WEEKLY_REPORT_CRON_SECRET`
- Reuso obrigatório:
  - `INTRANET_BASE_URL`
  - credenciais/integração de SendPulse já configuradas no projeto

## Testes e Cenários
- colaborador com 0 pendências no corte não recebe;
- colaborador com tarefas concluídas na semana, mas sem pendências atuais, não recebe;
- colaborador com 1+ pendência sob execução direta recebe;
- colaborador que só aprova tarefas não recebe;
- colaborador que só cria tarefas não recebe;
- colaborador elegível sem `corporate_email` é ignorado e aparece no administrativo;
- colaborador sem vínculo `user -> employee` é ignorado e aparece no administrativo;
- eficiência acumulada bate com a lógica já existente do módulo;
- eficiência semanal usa a janela correta da semana encerrada;
- lista curta respeita a ordem por atraso e urgência;
- CTA abre `/tarefas` na intranet;
- o mesmo período semanal não dispara automaticamente duas vezes;
- eventos do SendPulse atualizam o status do envio.

## Assumptions e Defaults
- O backend e a operação ficam no painel; o destino do colaborador é a intranet.
- O V1 não inclui anexos, PDF, XLSX ou editor visual de template.
- O V1 não usa e-mail pessoal em nenhum cenário.
- O V1 já inclui disparo manual controlado para homologação, além do cron automático.
- As configurações operacionais do fluxo vivem no painel; o `.env` fica restrito a segredo e infraestrutura.
