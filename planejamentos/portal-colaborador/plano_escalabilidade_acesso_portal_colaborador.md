# Plano - Escalabilidade de Acesso ao Portal do Colaborador

## Resumo

Transformar o portal em um fluxo hibrido: qualquer colaborador pode descobrir a pagina publica e entrar com `CPF + data de nascimento`, sem depender de convite previo, enquanto o convite individual continua existindo como fallback para excecoes operacionais.

A regra de negocio da intranet permanece igual: usuario e senha da intranet so aparecem apos revisao/aprovacao do RH/DP.

## Mudancas principais

### 1. Novo modelo de entrada no portal

- Tornar a URL do portal uma entrada publica e permanente, pensada para divulgacao ampla.
- Manter dois caminhos de autenticacao no mesmo portal:
  - `self-service`: colaborador entra com `CPF + nascimento`.
  - `invite`: colaborador entra com `token de convite + CPF + nascimento`.
- O fluxo padrao da tela passa a ser acesso direto, sem exigir convite preenchido.
- O campo de convite continua disponivel como modo alternativo, inclusive aceitando `?convite=` na URL como hoje.

### 2. Sessao e autenticacao

- Separar o conceito de autenticar no portal do conceito de ter convite ativo.
- Permitir criacao de sessao de portal sem `invite_id`.
- Ajustar `employee_portal_sessions` e o tipo `EmployeePortalSession` para `inviteId: string | null`.
- Adicionar um campo de origem da sessao, por exemplo:
  - `access_mode: 'SELF_SERVICE' | 'INVITE'`
- Criar uma politica explicita de elegibilidade para acesso publico:
  - colaborador precisa existir em `employees`
  - precisa ter `CPF` valido
  - precisa ter `birth_date`
  - status permitido: `ATIVO`
- Manter o convite como bypass operacional:
  - se houver convite, ele continua funcionando para acesso individual
  - o convite nao deixa de existir, apenas deixa de ser obrigatorio

### 3. Protecao contra abuso no acesso publico

- Como o lock atual esta amarrado ao convite, criar uma protecao propria para o login publico.
- Adicionar uma tabela dedicada para tentativas de autenticacao do portal, por exemplo:
  - identificador por `cpf_hash`
  - `ip_address`
  - `attempt_count`
  - `locked_until`
  - `last_attempt_at`
  - `last_success_at`
  - `access_mode`
- Regras do modo publico:
  - bloquear novas tentativas apos N erros consecutivos
  - resetar tentativas no sucesso
  - registrar auditoria de sucesso e falha com `SELF_SERVICE`
- Reaproveitar os limites atuais de convite como referencia, para nao criar duas politicas muito diferentes.

### 4. UX do portal

- Alterar a home do portal para deixar clara a proposta:
  - "Se voce e colaborador da Consultare, acesse com CPF e data de nascimento."
  - "Se o RH enviou um link de convite, voce tambem pode usar esse codigo."
- Trocar o foco da UX de codigo do convite para identificacao do colaborador.
- Incluir uma mensagem de suporte para casos sem cadastro completo:
  - "Se seu CPF ou nascimento nao forem reconhecidos, fale com o RH para validar o cadastro."
- Manter a exibicao de usuario/senha da intranet somente quando:
  - submissao estiver `APPROVED`
  - colaborador estiver `ATIVO`
  - credencial estiver disponivel

### 5. Painel do RH e operacao

- No painel do colaborador, manter o bloco de convite, mas mudar seu papel para acesso alternativo/manual.
- Adicionar no painel uma visao mais operacional do portal:
  - link publico oficial do portal
  - botao de copiar link publico
  - status de elegibilidade do colaborador para acesso publico:
    - apto
    - sem CPF
    - sem data de nascimento
    - inativo
- Adicionar uma listagem/filtro de pendencias para adocao em massa:
  - colaboradores sem `CPF`
  - sem `birth_date`
  - sem vinculo de conta
  - sem submissao iniciada
- Nao implementar disparo automatico por e-mail/WhatsApp nesta fase.
- A estrategia de divulgacao padrao sera:
  - URL publica fixa
  - QR code institucional
  - comunicacao interna do RH
  - convite individual apenas como fallback

## APIs, interfaces e tipos

- `POST /api/auth` do portal:
  - aceitar dois modos:
    - `token + cpf + birthDate`
    - `cpf + birthDate`
  - quando `token` vier vazio, autenticar por modo publico
- `EmployeePortalSession`:
  - `inviteId` passa a ser nullable
  - adicionar `accessMode`
- `employee_portal_sessions`:
  - `invite_id` nullable
  - adicionar `access_mode`
- Nova estrutura de tentativas:
  - tabela nova para lock/rate-limit do modo publico
- `EmployeePortalOverview`:
  - manter `activeInvite`, mas incluir um bloco simples de elegibilidade publica se necessario para o painel
- Auditoria:
  - registrar eventos distintos para `LOGIN_SUCCESS/FAILED` em `SELF_SERVICE` e `INVITE`

## Testes e cenarios

- Login publico com `CPF + nascimento` corretos cria sessao valida sem convite.
- Login publico com CPF invalido falha sem vazar se o colaborador existe.
- Login publico com nascimento invalido incrementa tentativas e bloqueia apos limite.
- Login por convite continua funcionando como hoje.
- Sessao criada por self-service consegue salvar dados pessoais, subir documentos e enviar submissao normalmente.
- Submissao aprovada continua liberando usuario/senha da intranet; antes disso, nao exibe credenciais.
- Colaborador sem `birth_date` ou sem `CPF` nao consegue entrar no modo publico e recebe mensagem orientando procurar o RH.
- Painel do RH mostra corretamente se o colaborador esta apto para acesso publico.
- Convite revogado nao afeta o modo publico, a menos que o colaborador esteja inelegivel pelas regras gerais.
- Sessoes antigas com `invite_id` preenchido continuam funcionando apos a mudanca.

## Assuncoes e defaults

- Modelo escolhido: hibrido.
- Validacao do primeiro acesso: `CPF + data de nascimento`.
- Entrega de credenciais da intranet: somente apos revisao/aprovacao.
- Divulgacao em massa nesta fase sera por link publico fixo + QR code + comunicacao do RH, sem integrar envio automatico.
- Elegibilidade padrao do acesso publico sera para colaboradores `ATIVOS` com `CPF` e `data de nascimento` validos.
- O convite passa a ser um mecanismo de excecao, nao o caminho principal.
