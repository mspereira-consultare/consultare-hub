# Plano de Implementacao - Portal do Colaborador

Data: 2026-04-21

## Resumo executivo

Criar uma aplicacao externa ao painel administrativo para que colaboradores em pre-admissao, colaboradores ativos e colaboradores antigos possam preencher informacoes pessoais e enviar documentos obrigatorios.

O portal deve ser acessado por uma URL propria, preferencialmente em subdominio, mas implementado dentro do mesmo projeto Next.js do painel para reaproveitar banco, storage, dominio de colaboradores, componentes e regras ja existentes.

O fluxo definido para o V1 e:
- o RH cria ou seleciona um colaborador no painel;
- o RH gera um convite seguro para esse colaborador;
- o colaborador acessa o link externo e confirma CPF + data de nascimento;
- o colaborador preenche dados pessoais permitidos e envia documentos;
- a submissao entra no painel como pendente de revisao pelo DP/RH;
- o DP aprova, rejeita ou pede correcao;
- apos aprovacao, os dados viram oficiais em `employees` e os documentos viram ativos em `employee_documents`;
- demais partes do painel continuam consumindo a mesma fonte da verdade atual, sem cadastro paralelo.

Este documento deve servir como roadmap tecnico e funcional para desenvolvimento do modulo.

## Decisoes fechadas

- Aplicacao externa: sim, acessada fora do painel administrativo.
- Implementacao: app Next.js separado em `apps/portal-colaborador`, dentro do monorepo.
- URL preferencial: subdominio apontando para o servico Railway do portal, por exemplo `colaboradores.consultare...`.
- Fallback local/desenvolvimento: raiz do app do portal, normalmente `http://localhost:3001`.
- Autenticacao do portal: convite seguro + confirmacao de CPF e data de nascimento.
- Origem do cadastro: pre-cadastro feito pelo RH no painel.
- Fonte oficial de colaboradores: tabela `employees`.
- Fonte oficial de documentos aprovados: tabela `employee_documents`.
- Envio pelo portal: entra primeiro em area de staging/revisao.
- Oficializacao: somente apos revisao e aprovacao do DP/RH.
- Envio automatico de convite: fora do V1; o V1 gera link para o RH copiar e enviar pelo canal desejado.
- Documentos dependentes da empresa, como `ASO`, nao devem ser cobrados do colaborador no portal por padrao.

## Objetivos do modulo

### Objetivos funcionais

- Reduzir coleta manual de dados e documentos por WhatsApp, e-mail e planilhas.
- Permitir que o colaborador envie documentos em um ambiente simples, guiado e responsivo.
- Permitir que o colaborador acompanhe o que ja foi enviado, o que falta e o que foi devolvido para correcao.
- Centralizar no painel do RH a revisao de dados e documentos recebidos.
- Transformar documentos aprovados em documentos oficiais do cadastro, preservando historico.
- Alimentar automaticamente as telas existentes do painel que usam `employees` e `employee_documents`.
- Facilitar pre-admissao sem expor o painel administrativo para o colaborador.

### Objetivos tecnicos

- Reaproveitar o modulo atual de colaboradores.
- Evitar uma segunda fonte da verdade.
- Separar autenticacao do portal da autenticacao administrativa via NextAuth.
- Adicionar auditoria detalhada sobre convites, acessos, envios e aprovacoes.
- Manter o storage S3 atual, mas com prefixo proprio para arquivos enviados pelo portal.
- Criar APIs especificas e restritas para o portal.
- Criar uma camada de staging para dados e documentos antes da oficializacao.

## Fora de escopo do V1

- Auto-cadastro livre sem pre-cadastro do RH.
- Login por senha do colaborador.
- Criacao de usuario interno para colaborador.
- Envio automatico de e-mail, WhatsApp ou SMS.
- Assinatura digital de documentos.
- OCR ou validacao automatica de conteudo dos arquivos.
- Integracao direta com sistemas externos de admissao.
- Edicao pelo colaborador de campos administrativos como salario, cargo, setor, unidade, beneficios, admissao e desligamento.
- Download pelo colaborador de todos os documentos ja existentes no painel.

## Contexto atual reaproveitado

O modulo de colaboradores ja possui:
- cadastro oficial em `employees`;
- documentos ativos em `employee_documents`;
- historico de documentos substituidos/removidos em `employee_documents_inactive`;
- auditoria em `employee_audit_log`;
- checklist documental calculado por perfil do colaborador;
- upload/download autenticado via APIs administrativas;
- storage S3 por meio de `packages/core/src/storage`;
- regras de pendencia documental em `packages/core/src/colaboradores/status.ts`;
- tipos documentais em `packages/core/src/colaboradores/constants.ts`;
- painel de cadastro em `/colaboradores`.

O portal deve ser uma camada externa conectada a esse mesmo dominio.

## Arquitetura proposta

### Estrutura de aplicacao

O portal deve ser um app Next.js separado dentro do monorepo:

```text
apps/painel/                 -> painel gerencial administrativo
apps/portal-colaborador/     -> portal externo do colaborador
packages/core/               -> db, storage, tipos e dominio compartilhado
packages/ui/                 -> componentes compartilhados futuros
```

O app `apps/portal-colaborador` deve ter:
- layout proprio;
- visual limpo e responsivo;
- ausencia de sidebar administrativa;
- ausencia de dependencias visuais do painel interno;
- foco em celular;
- linguagem simples para usuario nao tecnico.

Em producao, o Railway deve ter servicos separados:
- servico `painel`, com build/start do app `apps/painel`;
- servico `portal-colaborador`, com build/start do app `apps/portal-colaborador`;
- dominio administrativo apontando para o painel;
- dominio publico do portal apontando para o portal.

O portal nao deve depender de rewrite por host no painel. O painel deve gerar convites usando `EMPLOYEE_PORTAL_URL`.

### Separacao de responsabilidades

O painel administrativo continua responsavel por:
- criar colaborador em pre-admissao;
- gerar e revogar convite;
- acompanhar submissao;
- revisar dados pessoais;
- aprovar/rejeitar documentos;
- oficializar dados e documentos;
- consultar auditoria.

O portal do colaborador fica responsavel por:
- validar convite e identidade minima;
- permitir preenchimento de dados pessoais autorizados;
- permitir upload de documentos solicitados;
- salvar rascunho;
- enviar submissao para revisao;
- mostrar pendencias, devolucoes e status.

### Fonte da verdade

O portal nao deve gravar diretamente em `employees` nem em `employee_documents` durante o preenchimento.

Fluxo correto:
1. colaborador envia dados/documentos;
2. sistema salva em tabelas de staging;
3. DP/RH revisa;
4. aprovacao atualiza `employees` e/ou cria documentos oficiais em `employee_documents`;
5. documentos anteriores do mesmo tipo sao arquivados pela regra atual.

Essa abordagem evita que informacoes sensiveis, erradas ou fraudulentas entrem automaticamente no cadastro oficial.

## Modelo de dados proposto

### `employee_portal_invites`

Tabela para convites de acesso ao portal.

Campos previstos:
- `id`
- `employee_id`
- `token_hash`
- `status`
- `expires_at`
- `created_by`
- `created_at`
- `revoked_by`
- `revoked_at`
- `last_used_at`
- `attempt_count`
- `locked_until`

Status previstos:
- `ACTIVE`
- `USED`
- `EXPIRED`
- `REVOKED`
- `LOCKED`

Regras:
- o token em texto puro aparece apenas no momento da geracao do link;
- salvar no banco somente hash do token;
- convite expira em 14 dias por padrao;
- convite pode ser revogado manualmente pelo RH;
- gerar novo convite deve revogar convites ativos anteriores do mesmo colaborador, salvo decisao contraria;
- tentativas invalidas devem incrementar `attempt_count`;
- apos numero limite de erros, bloquear temporariamente.

### `employee_portal_sessions`

Tabela para sessoes curtas do portal.

Campos previstos:
- `id`
- `employee_id`
- `invite_id`
- `session_hash`
- `created_at`
- `expires_at`
- `revoked_at`
- `ip_address`
- `user_agent`

Regras:
- sessao criada apos validacao correta de convite, CPF e data de nascimento;
- cookie deve ser `HttpOnly`, `Secure`, `SameSite=Lax`;
- expiracao sugerida: 2 horas;
- logout deve revogar a sessao;
- APIs do portal devem validar a sessao a cada request.

### `employee_portal_submissions`

Tabela principal da submissao enviada pelo colaborador.

Campos previstos:
- `id`
- `employee_id`
- `invite_id`
- `status`
- `personal_data_json`
- `consent_lgpd`
- `consent_lgpd_at`
- `submitted_at`
- `reviewed_by`
- `reviewed_at`
- `review_notes`
- `created_at`
- `updated_at`

Status previstos:
- `DRAFT`
- `SUBMITTED`
- `CHANGES_REQUESTED`
- `PARTIALLY_APPROVED`
- `APPROVED`
- `REJECTED`
- `CANCELED`

Regras:
- um colaborador pode ter uma submissao em rascunho/aberta por vez;
- submissao enviada nao pode ser editada ate o DP pedir correcao;
- pedido de correcao reabre os campos/documentos rejeitados;
- aprovacoes parciais devem ser permitidas, pois o DP pode aprovar dados pessoais e rejeitar um documento.

### `employee_portal_submission_documents`

Tabela para documentos enviados antes da aprovacao.

Campos previstos:
- `id`
- `submission_id`
- `employee_id`
- `doc_type`
- `storage_provider`
- `storage_bucket`
- `storage_key`
- `original_name`
- `mime_type`
- `size_bytes`
- `checksum`
- `issue_date`
- `expires_at`
- `notes`
- `status`
- `rejection_reason`
- `reviewed_by`
- `reviewed_at`
- `promoted_document_id`
- `created_at`
- `updated_at`

Status previstos:
- `PENDING`
- `APPROVED`
- `REJECTED`
- `REPLACED_BY_COLLABORATOR`
- `REMOVED_BY_COLLABORATOR`

Regras:
- documento pendente nao substitui documento oficial;
- ao aprovar, criar registro em `employee_documents`;
- `promoted_document_id` guarda o documento oficial criado;
- se for documento de tipo unico, usar regra atual de substituicao;
- `OUTRO` pode ter multiplos ativos;
- documentos rejeitados devem manter arquivo para auditoria e consulta do DP;
- colaborador pode reenviar documento rejeitado, criando novo registro e marcando anterior como substituido pelo colaborador.

## Campos pessoais permitidos no portal

O portal deve permitir somente campos que fazem sentido para preenchimento pelo colaborador.

### Identificacao e contato

- nome completo para conferencia;
- RG;
- CPF somente leitura apos autenticacao;
- data de nascimento somente leitura apos autenticacao;
- e-mail;
- telefone.

### Endereco

- CEP;
- logradouro;
- numero;
- complemento;
- bairro;
- cidade;
- UF.

### Familia

- estado civil;
- possui filhos;
- quantidade de filhos.

### Escolaridade e estagio

- instituicao de ensino;
- nivel de escolaridade;
- curso;
- semestre atual.

Esses campos devem ser exigidos apenas quando o regime do colaborador for `ESTAGIO`.

### Dados bancarios

- banco;
- agencia;
- conta;
- chave PIX.

### Campos que nao devem ser editados no portal

- regime contratual;
- status;
- cargo/funcao;
- setor;
- supervisor;
- centro de custo;
- unidade;
- data de admissao;
- data de fim de contrato;
- salario/bolsa;
- beneficios;
- insalubridade;
- vale-transporte;
- vale-refeicao;
- Totalpass;
- seguro de vida;
- demissao;
- observacoes internas;
- uniforme;
- armario;
- recesso.

Esses campos continuam exclusivos do painel.

## Documentos solicitados no portal

O portal deve reaproveitar os tipos documentais atuais, mas exibir somente documentos cuja responsabilidade de envio seja do colaborador.

### Documentos base

- Curriculo;
- Foto 3x4;
- CTPS;
- Cartao PIS / Cartao cidadao;
- RG e CPF;
- CNH, se aplicavel ou se o RH marcar como desejado;
- Certidao de nascimento;
- Carteira de vacinacao;
- Titulo de eleitor;
- Ultimo protocolo de votacao;
- Reservista ou alistamento militar, quando aplicavel;
- Comprovante de endereco;
- Comprovante de escolaridade;
- Certificados de cursos e treinamentos, quando aplicavel;
- Antecedentes criminais;
- Vacinacao Covid-19 e gripe.

### Documentos condicionais por estado civil

Quando estado civil for `CASADO` ou `UNIAO_ESTAVEL`:
- Certidao de casamento / uniao;
- RG e CPF do conjuge.

### Documentos condicionais por filhos

Quando possuir filhos:
- Certidao de nascimento dos filhos;
- Carteira de vacinacao dos filhos;
- CPF dos filhos.

### Documentos condicionais por estagio

Quando regime for `ESTAGIO`:
- Comprovante de matricula;
- Relatorio semestral de estagio.

### Documentos fora do portal por padrao

- ASO;
- documentos internos gerados pela empresa;
- termos assinados internamente;
- documentos finais de desligamento;
- recibos de uniforme;
- documentos de armario/chave.

O `ASO` continua existindo no modulo de colaboradores e no checklist interno, mas nao deve ser cobrado do colaborador no portal V1 porque depende de processo da empresa.

## Regras de checklist documental

O portal deve calcular documentos solicitados a partir de:
- `employmentRegime`;
- `maritalStatus`;
- `hasChildren`;
- documentos ja enviados na submissao atual;
- documentos oficiais ja existentes, quando for colaborador antigo.

Para novos colaboradores em pre-admissao:
- mostrar como pendente todo documento obrigatorio do perfil ainda nao enviado.

Para colaboradores antigos:
- mostrar como "ja consta no cadastro" documentos oficiais ativos;
- permitir reenviar/substituir documentos se o RH abriu convite para atualizacao;
- documentos reenviados entram em revisao antes de substituir o oficial.

Estados visuais por documento:
- `Pendente`;
- `Enviado para revisao`;
- `Aprovado`;
- `Rejeitado`;
- `Correção solicitada`;
- `Ja consta no cadastro`;
- `Nao se aplica`.

## UX do portal

### Principios

- Mobile-first.
- Linguagem simples, sem termos internos do painel.
- Poucos passos, com progresso claro.
- Salvamento de rascunho.
- Feedback claro apos upload.
- Erros com orientacao objetiva.
- Sem expor dados sensiveis alem do necessario.

### Telas previstas

#### 1. Entrada pelo convite

Objetivo:
- receber o link com token e iniciar autenticacao.

Elementos:
- logo Consultare;
- texto curto explicando que o portal e para envio de informacoes e documentos;
- campos CPF e data de nascimento;
- botao de continuar;
- mensagem generica de erro em caso de falha.

Regras:
- token invalido, expirado ou revogado deve exibir orientacao para procurar o RH;
- CPF e data de nascimento devem ser validados contra `employees`;
- nao informar se o erro foi no CPF, nascimento ou convite.

#### 2. Visao geral

Objetivo:
- mostrar progresso e proximas acoes.

Elementos:
- saudacao pelo primeiro nome;
- barra de progresso geral;
- cards de status:
  - dados pessoais;
  - documentos pendentes;
  - documentos em revisao;
  - documentos rejeitados;
- botao para continuar preenchimento;
- botao para enviar para revisao quando tudo minimo estiver completo.

#### 3. Dados pessoais

Objetivo:
- coletar informacoes estruturadas.

Secoes:
- identificacao e contato;
- endereco;
- familia;
- escolaridade/estagio;
- dados bancarios.

Regras:
- CPF e nascimento aparecem como somente leitura;
- campos administrativos nao aparecem;
- campos condicionais aparecem conforme perfil;
- botao "Salvar rascunho";
- validacao antes de permitir envio final.

#### 4. Documentos

Objetivo:
- enviar documentos solicitados.

Elementos:
- lista de documentos com status;
- botao de upload por documento;
- orientacao de formatos aceitos;
- tamanho maximo;
- preview de nome do arquivo;
- data de emissao/vencimento somente quando o tipo exigir;
- motivo de rejeicao quando houver;
- acao para substituir arquivo rejeitado.

Regras:
- aceitar PDF, JPG, JPEG, PNG e WEBP;
- limite sugerido: 15 MB por arquivo;
- impedir arquivo vazio;
- impedir extensoes e MIME types nao permitidos;
- upload deve salvar em staging, nao no documento oficial.

#### 5. Revisao e envio

Objetivo:
- permitir revisao antes do envio ao DP.

Elementos:
- resumo dos dados preenchidos;
- resumo dos documentos enviados;
- pendencias restantes;
- aceite de responsabilidade/veracidade das informacoes;
- aceite LGPD;
- botao "Enviar para revisao".

Regras:
- sem aceite LGPD nao permite envio;
- se houver pendencias obrigatorias, bloquear envio ou permitir envio parcial somente se o RH configurar isso no futuro;
- ao enviar, submissao muda para `SUBMITTED`.

#### 6. Status apos envio

Objetivo:
- informar que o DP esta revisando.

Elementos:
- status da submissao;
- lista de documentos em revisao;
- lista de aprovados;
- lista de correcoes solicitadas;
- orientacao para aguardar ou corrigir quando necessario.

## Ajuda ao usuario do portal

O portal deve ter uma forma clara de ajuda para reduzir duvidas e retrabalho. Para o V1, a recomendacao e implementar um modal de ajuda acessivel em todas as telas do portal.

### Modal "Precisa de ajuda?"

Entrada:
- botao com icone de ajuda no topo;
- link secundario perto dos uploads;
- chamada contextual quando houver erro.

Conteudo previsto:
- explicacao curta sobre o objetivo do portal;
- o que fazer se o CPF/data de nascimento nao funcionar;
- formatos aceitos de arquivo;
- como tirar foto legivel de documento;
- como enviar documento com frente e verso;
- o que significa "em revisao";
- o que significa "correcao solicitada";
- como corrigir documento rejeitado;
- contato do RH/DP para suporte.

Comportamento:
- abrir em modal responsivo;
- em mobile, usar bottom sheet ou tela cheia;
- fechar por botao, ESC e clique fora;
- nao perder dados preenchidos ao abrir;
- conteudo dividido por abas ou acordeoes:
  - Acesso;
  - Dados pessoais;
  - Documentos;
  - Correcao;
  - Contato.

### Ajuda contextual

Alem do modal geral, cada area deve ter micro-ajudas:
- abaixo do campo CPF: "Use somente os numeros do CPF";
- abaixo do upload: "Envie PDF ou foto legivel. Tamanho maximo 15 MB";
- documentos rejeitados: exibir motivo informado pelo DP;
- tela de envio: explicar que os dados serao analisados antes de entrarem no cadastro oficial.

### Conteudo operacional sugerido

Textos base para o modal:

#### Acesso

"Use o CPF e a data de nascimento informados ao RH. Se aparecer erro, confira os numeros e tente novamente. Se continuar, fale com o RH para validar seu cadastro ou gerar um novo link."

#### Dados pessoais

"Preencha seus dados com atencao. O DP vai conferir as informacoes antes de atualizar seu cadastro oficial."

#### Documentos

"Envie arquivos em PDF, JPG, JPEG, PNG ou WEBP. Fotos devem estar legiveis, sem cortes e com boa iluminacao. Se o documento tiver frente e verso, envie as duas partes no mesmo arquivo quando possivel."

#### Correcao

"Quando um documento for devolvido, veja o motivo informado e envie uma nova versao. O documento antigo fica registrado apenas para controle interno."

#### Privacidade

"Seus dados e documentos serao usados apenas para processos internos de cadastro, admissao, folha, beneficios e obrigacoes legais da empresa."

## Fluxo administrativo no painel

### Geracao de convite

Adicionar no modal de colaborador, preferencialmente em uma aba ou secao "Portal do colaborador":
- status do convite atual;
- botao "Gerar convite";
- botao "Copiar link";
- botao "Revogar convite";
- data de expiracao;
- ultimo acesso;
- status da submissao.

Regras:
- somente usuarios com permissao `colaboradores.edit` podem gerar/revogar convite;
- usuarios com `colaboradores.view` podem ver status e submissao;
- convite deve exigir que colaborador tenha CPF e data de nascimento cadastrados;
- se faltar nascimento, exibir bloqueio operacional para o RH completar o cadastro.

### Revisao de submissao

No painel, o DP deve conseguir:
- abrir dados enviados pelo colaborador;
- comparar valor atual x valor enviado;
- aprovar dados pessoais em bloco;
- rejeitar dados pessoais com observacao;
- aprovar/rejeitar documento individualmente;
- visualizar/baixar documento pendente;
- pedir correcao para campos/documentos especificos;
- registrar observacao interna.

### Oficializacao de dados pessoais

Ao aprovar dados pessoais:
- atualizar apenas campos permitidos;
- preservar campos administrativos;
- registrar auditoria com diff resumido;
- atualizar `updated_at` do colaborador;
- retornar colaborador atualizado.

### Oficializacao de documentos

Ao aprovar documento:
- criar registro em `employee_documents` com `uploaded_by` indicando origem portal ou usuario revisor;
- usar `actorUserId` do revisor na auditoria;
- se o tipo nao for `OUTRO`, arquivar documento ativo anterior em `employee_documents_inactive`;
- gravar `promoted_document_id` na tabela de staging;
- marcar documento de staging como `APPROVED`.

### Rejeicao e pedido de correcao

Ao rejeitar documento:
- exigir motivo;
- marcar documento como `REJECTED`;
- permitir que colaborador envie nova versao;
- exibir motivo no portal.

Ao pedir correcao da submissao:
- mudar status para `CHANGES_REQUESTED`;
- liberar edicao dos campos/documentos rejeitados;
- manter aprovados bloqueados, salvo decisao futura.

## APIs previstas

### APIs do portal

#### `POST /api/auth`

Entrada:
- token;
- CPF;
- data de nascimento.

Saida:
- cria sessao curta;
- retorna resumo seguro do colaborador.

Regras:
- nao retornar detalhes de erro de autenticacao;
- aplicar rate limit por convite/IP;
- registrar auditoria de sucesso/falha.

#### `POST /api/logout`

Encerra a sessao do portal.

#### `GET /api/me`

Retorna:
- colaborador seguro;
- status da submissao;
- dados ja preenchidos;
- checklist documental;
- documentos enviados e respectivos status;
- pendencias.

Nao deve retornar:
- salario;
- beneficios;
- observacoes internas;
- dados administrativos sensiveis.

#### `PUT /api/submission/personal`

Salva rascunho de dados pessoais.

Regras:
- aceita apenas campos permitidos;
- valida formatos;
- nao atualiza `employees` diretamente.

#### `POST /api/submission/documents`

Upload multipart de documento.

Campos:
- `file`;
- `docType`;
- `issueDate`, quando aplicavel;
- `expiresAt`, quando aplicavel;
- `notes`, opcional.

Regras:
- validar sessao;
- validar tipo documental esperado;
- validar arquivo;
- salvar no S3;
- persistir em `employee_portal_submission_documents`;
- limpar S3 se a persistencia falhar.

#### `DELETE /api/submission/documents/[id]`

Remove documento ainda nao enviado ou ainda nao aprovado.

Regras:
- nao remover arquivo aprovado/oficial;
- marcar como `REMOVED_BY_COLLABORATOR`.

#### `POST /api/submission/submit`

Envia rascunho para revisao do DP.

Regras:
- validar aceite LGPD;
- validar pendencias obrigatorias;
- mudar status para `SUBMITTED`;
- bloquear edicao ate revisao.

### APIs administrativas

#### `POST /api/admin/colaboradores/[id]/portal-invites`

Gera convite para colaborador.

Regras:
- exige `colaboradores.edit`;
- exige CPF e data de nascimento;
- revoga convites ativos anteriores;
- retorna link completo para copia.

#### `DELETE /api/admin/colaboradores/[id]/portal-invites/[inviteId]`

Revoga convite.

#### `GET /api/admin/colaboradores/[id]/portal`

Retorna:
- convite atual;
- historico de convites;
- submissao atual;
- documentos pendentes;
- documentos rejeitados/aprovados;
- progresso.

#### `POST /api/admin/colaboradores/portal-submissions/[submissionId]/approve-personal`

Aprova dados pessoais enviados.

#### `POST /api/admin/colaboradores/portal-submissions/[submissionId]/reject-personal`

Rejeita dados pessoais com observacao.

#### `POST /api/admin/colaboradores/portal-submissions/[submissionId]/documents/[documentId]/approve`

Aprova documento e promove para `employee_documents`.

#### `POST /api/admin/colaboradores/portal-submissions/[submissionId]/documents/[documentId]/reject`

Rejeita documento com motivo.

#### `POST /api/admin/colaboradores/portal-submissions/[submissionId]/request-changes`

Reabre submissao para correcao.

#### `POST /api/admin/colaboradores/portal-submissions/[submissionId]/close`

Encerra submissao quando todos os itens forem resolvidos.

## Regras de seguranca

### Identidade e acesso

- O portal nao deve usar a sessao NextAuth administrativa.
- Token de convite deve ser longo, aleatorio e de uso restrito.
- Banco deve armazenar apenas hash do token.
- CPF deve ser normalizado somente com digitos.
- Data de nascimento deve ser validada em formato ISO.
- Mensagens de erro de login devem ser genericas.
- Sessao deve expirar em curto prazo.
- Logout deve revogar a sessao.

### Rate limit e bloqueio

Regras sugeridas:
- maximo de 5 tentativas invalidas por convite em janela curta;
- apos limite, bloquear por 15 minutos;
- registrar IP e user agent;
- permitir desbloqueio por geracao de novo convite.

### Dados sensiveis

- Nao exibir salario, beneficios ou observacoes internas no portal.
- Nao permitir download amplo de documentos oficiais existentes.
- Downloads de documentos pendentes pelo admin continuam protegidos por permissao.
- Cookies devem usar `HttpOnly`, `Secure` em producao e `SameSite=Lax`.
- Respostas de API do portal devem conter apenas campos necessarios.

### Storage

- Usar prefixo separado para documentos do portal.
- Exemplo: `colaboradores-portal/{employeeId}/{submissionId}/{docType}/{timestamp}-{filename}`.
- Nome original deve ser preservado em metadado, mas chave S3 deve ser sanitizada.
- Arquivo pendente nao deve ser acessivel publicamente.
- Download deve passar por API autenticada.

### Auditoria

Registrar em `employee_audit_log`:
- convite criado;
- convite revogado;
- login bem-sucedido no portal;
- tentativas bloqueadas;
- submissao criada;
- dados pessoais enviados;
- documento enviado;
- submissao enviada para revisao;
- dados aprovados/rejeitados;
- documento aprovado/rejeitado;
- documento promovido para oficial;
- pedido de correcao;
- fechamento da submissao.

Para eventos do colaborador, usar ator logico como `portal:{employeeId}` ou campo equivalente no payload.

## Permissoes

Permissao administrativa reaproveitada:
- `colaboradores.view`: visualizar status do portal, submissao e documentos pendentes.
- `colaboradores.edit`: gerar/revogar convite, aprovar/rejeitar dados e documentos, pedir correcao.

Nao criar permissao nova no V1, salvo se o RH solicitar segregacao especifica.

## Tratamento de erros

### Portal

Erros devem ser claros e acionaveis:
- convite invalido/expirado: orientar procurar RH;
- arquivo grande: informar limite;
- formato invalido: listar formatos aceitos;
- upload falhou: orientar tentar novamente;
- sessao expirada: pedir novo acesso pelo link;
- documento rejeitado: mostrar motivo do DP.

### Painel

Erros devem ajudar o operador:
- colaborador sem CPF: impedir convite;
- colaborador sem data de nascimento: impedir convite;
- submissao ja fechada: impedir edicao;
- documento ja aprovado: impedir rejeicao posterior sem fluxo de reversao;
- arquivo nao encontrado no storage: mostrar erro operacional e registrar log.

## Observabilidade e logs

Registrar logs tecnicos para:
- falha de autenticacao;
- convite expirado/revogado;
- falha de upload;
- falha de promocao para `employee_documents`;
- falha de limpeza no S3;
- falha de envio/submissao.

Indicadores operacionais futuros:
- convites ativos;
- convites expirados;
- taxa de submissao concluida;
- documentos pendentes de revisao;
- documentos rejeitados;
- tempo medio entre convite e envio;
- tempo medio entre envio e aprovacao.

## UX administrativa no cadastro de colaboradores

### Secao "Portal do colaborador"

Adicionar no modal de colaborador, possivelmente dentro da aba `Documentos` ou em nova aba especifica.

Elementos:
- status do convite;
- status da submissao;
- data de expiracao do convite;
- ultimo acesso;
- progresso de documentos;
- botao gerar convite;
- botao copiar link;
- botao revogar convite;
- botao abrir submissao;
- alertas de bloqueio, como CPF/data de nascimento ausentes.

### Painel de revisao

Pode ser implementado como modal lateral/drawer.

Secoes:
- resumo do colaborador;
- dados pessoais enviados;
- comparacao campo atual x campo enviado;
- documentos enviados;
- historico de mensagens/status;
- acoes de aprovacao/rejeicao.

Para cada documento:
- tipo;
- nome do arquivo;
- tamanho;
- data de envio;
- status;
- motivo de rejeicao;
- botoes visualizar, baixar, aprovar, rejeitar.

## Fluxos detalhados

### Fluxo 1 - Novo colaborador em pre-admissao

1. RH cria colaborador com status `PRE_ADMISSAO`.
2. RH preenche dados minimos: nome, CPF, data de nascimento, regime, data prevista/admissao, unidade/setor quando souber.
3. RH gera convite.
4. Sistema cria `employee_portal_invites`.
5. RH copia link e envia ao colaborador.
6. Colaborador acessa o portal.
7. Colaborador confirma CPF e nascimento.
8. Sistema cria sessao curta.
9. Colaborador preenche dados pessoais.
10. Colaborador envia documentos.
11. Colaborador aceita termos e envia para revisao.
12. DP recebe submissao no painel.
13. DP aprova dados e documentos validos.
14. Sistema atualiza `employees` e `employee_documents`.
15. Pendencias restantes continuam visiveis no painel.

### Fluxo 2 - Correcao de documento rejeitado

1. DP abre documento pendente.
2. DP rejeita com motivo, por exemplo "foto cortada" ou "arquivo ilegivel".
3. Sistema marca documento como `REJECTED`.
4. Sistema muda submissao para `CHANGES_REQUESTED`, se necessario.
5. Colaborador acessa portal novamente.
6. Portal exibe documento rejeitado e motivo.
7. Colaborador envia nova versao.
8. Sistema marca versao anterior como `REPLACED_BY_COLLABORATOR`.
9. Nova versao entra como `PENDING`.
10. DP aprova ou rejeita novamente.

### Fluxo 3 - Atualizacao de colaborador antigo

1. RH seleciona colaborador ativo.
2. RH gera convite para atualizacao cadastral/documental.
3. Portal mostra dados permitidos para revisao pelo colaborador.
4. Documentos oficiais existentes aparecem como "ja consta no cadastro".
5. Colaborador envia somente documentos faltantes ou atualizados.
6. DP revisa.
7. Aprovacoes substituem documentos oficiais quando aplicavel.

### Fluxo 4 - Convite expirado

1. Colaborador tenta acessar link expirado.
2. Portal mostra mensagem generica orientando procurar RH.
3. RH gera novo convite no painel.
4. Convite anterior permanece como `EXPIRED`.

## Regras de validacao

### CPF

- aceitar com ou sem pontuacao;
- normalizar para 11 digitos;
- bloquear se vazio;
- validar contra o CPF do colaborador pre-cadastrado.

Validacao matematica de CPF e recomendada, mas pode entrar no mesmo pacote de validacoes do V1.

### Data de nascimento

- usar formato `YYYY-MM-DD` internamente;
- aceitar input visual em formato brasileiro;
- comparar com `employees.birth_date`;
- se o colaborador nao tiver nascimento no cadastro, impedir geracao do convite no painel.

### E-mail

- validar formato basico;
- permitir vazio se RH decidir, mas recomendado exigir para pre-admissao.

### Telefone

- normalizar para digitos;
- exigir DDD;
- aceitar celular e telefone fixo.

### CEP

- normalizar para digitos;
- permitir preenchimento manual do endereco;
- integracao com API de CEP fica fora do V1, salvo se ja existir dependencia interna.

### Arquivos

- tamanho maior que zero;
- limite maximo 15 MB;
- extensoes permitidas: `.pdf`, `.jpg`, `.jpeg`, `.png`, `.webp`;
- MIME types permitidos correspondentes;
- nome sanitizado para storage;
- checksum opcional, recomendado para rastreio.

## Estrutura tecnica sugerida

### Dominio

Criar pacote compartilhado:
- `packages/core/src/employee_portal`

Arquivos sugeridos:
- `auth.ts`: validacao de convite, sessao e cookies;
- `constants.ts`: status, limites, formatos aceitos;
- `types.ts`: tipos de convite, submissao e documentos;
- `repository.ts`: persistencia e regras de negocio;
- `documents.ts`: montagem de checklist e regras de documentos do portal;
- `storage.ts`: geracao de chave e upload/download de staging;
- `validation.ts`: validacao de dados pessoais.

### Rotas publicas

Criar:
- `apps/portal-colaborador/src/app/page.tsx`;
- `apps/portal-colaborador/src/app/layout.tsx`;
- componentes internos para formulario, checklist, upload, ajuda e status.

### Rotas API

Criar APIs em:
- portal publico: `apps/portal-colaborador/src/app/api/...`;
- painel administrativo: `apps/painel/src/app/api/admin/colaboradores/[id]/portal...`;
- revisao administrativa: `apps/painel/src/app/api/admin/colaboradores/portal-submissions/...`.

### Separacao de apps

O painel nao deve expor paginas ou APIs publicas do portal. O `proxy.ts`/middleware do painel deve continuar protegendo o painel administrativo normalmente, sem excecoes para `/portal-colaborador`.

O app do portal deve ter suas proprias APIs publicas, protegidas pela sessao simplificada do portal, sem usar NextAuth administrativo.
- preservar caminho e querystring.

## Roadmap de implementacao

### Onda 1 - Fundacao tecnica

Entregas:
- tabelas novas garantidas por rotina `ensureEmployeePortalTables`;
- tipos e constantes do dominio;
- repository base de convites, sessoes e submissao;
- geracao de token e hash;
- validacao de convite;
- liberacao controlada no `proxy.ts`;
- testes unitarios ou smoke tecnico das funcoes principais.

Critério de pronto:
- RH consegue gerar convite no backend;
- convite e salvo com hash;
- convite pode ser validado por CPF/data de nascimento;
- sessao curta pode ser criada e validada.

### Onda 2 - Portal publico MVP

Entregas:
- layout do portal;
- tela de acesso;
- tela de visao geral;
- formulario de dados pessoais;
- checklist de documentos;
- upload de arquivos para staging;
- modal de ajuda "Precisa de ajuda?";
- salvamento de rascunho;
- envio para revisao.

Critério de pronto:
- colaborador consegue acessar link, preencher dados, enviar documentos e concluir submissao pelo celular.

### Onda 3 - Painel administrativo de revisao

Entregas:
- secao "Portal do colaborador" no cadastro;
- gerar/copiar/revogar convite;
- visualizar submissao;
- comparar dados atuais x enviados;
- visualizar/baixar documentos pendentes;
- aprovar/rejeitar documentos;
- aprovar/rejeitar dados pessoais;
- pedir correcao.

Critério de pronto:
- DP consegue revisar tudo pelo painel sem acessar banco ou S3 manualmente.

### Onda 4 - Oficializacao e auditoria

Entregas:
- promocao de documentos para `employee_documents`;
- substituicao/historico conforme regra existente;
- atualizacao controlada de `employees`;
- auditoria completa;
- fechamento de submissao;
- logs de falhas.

Critério de pronto:
- documentos aprovados aparecem automaticamente no cadastro de colaboradores e nos calculos de pendencia documental.

### Onda 5 - Acabamento operacional

Entregas:
- estados visuais refinados;
- mensagens de erro e ajuda contextual;
- indicadores no painel;
- filtros por submissao pendente;
- melhorias de acessibilidade;
- revisao responsiva;
- documentacao de uso para RH.

Critério de pronto:
- fluxo pode ser usado pelo RH em operacao real com baixo suporte manual.

## Testes de aceitacao

### Autenticacao e convite

- convite ativo permite login com CPF e nascimento corretos;
- CPF incorreto nao permite login;
- nascimento incorreto nao permite login;
- convite expirado nao permite login;
- convite revogado nao permite login;
- excesso de tentativas bloqueia temporariamente;
- mensagem de erro nao revela qual dado esta errado;
- sessao expirada obriga novo login.

### Portal

- colaborador visualiza somente campos permitidos;
- CPF e nascimento aparecem como somente leitura;
- formulario salva rascunho;
- campos condicionais aparecem para estagio;
- campos de filhos aparecem quando `hasChildren` for verdadeiro;
- documentos condicionais aparecem conforme estado civil, filhos e estagio;
- `ASO` nao aparece como pendencia do portal;
- modal de ajuda abre em todas as telas;
- modal de ajuda funciona em mobile;
- envio final exige aceite LGPD;
- submissao enviada bloqueia edicao.

### Upload

- PDF valido e aceito;
- imagem valida e aceita;
- arquivo vazio e recusado;
- arquivo acima de 15 MB e recusado;
- tipo invalido e recusado;
- falha na persistencia remove arquivo recem-enviado do S3 quando possivel;
- documento enviado aparece como pendente de revisao.

### Painel

- RH nao consegue gerar convite sem CPF;
- RH nao consegue gerar convite sem data de nascimento;
- convite gerado pode ser copiado;
- convite pode ser revogado;
- submissao pendente aparece no cadastro do colaborador;
- DP consegue visualizar arquivo pendente;
- DP consegue aprovar dados pessoais;
- DP consegue rejeitar dados pessoais com motivo;
- DP consegue aprovar documento;
- DP consegue rejeitar documento com motivo;
- documento rejeitado aparece no portal com motivo;
- colaborador consegue reenviar documento rejeitado.

### Oficializacao

- aprovar dados pessoais atualiza somente campos permitidos em `employees`;
- aprovar documento cria registro em `employee_documents`;
- aprovar documento de tipo unico inativa documento oficial anterior;
- documento anterior e preservado em `employee_documents_inactive`;
- documento aprovado passa a contar no progresso documental;
- auditoria registra ator, acao e payload minimo;
- outras telas do painel enxergam o documento como enviado.

### Regressao

- login administrativo do painel continua funcionando;
- rotas `/api/admin/*` continuam protegidas por NextAuth;
- rotas do portal nao exigem NextAuth;
- APIs do portal exigem sessao propria;
- download administrativo de documentos oficiais continua funcionando;
- modulo `/colaboradores` continua listando documentos oficiais como antes.

## Riscos e mitigacoes

### Risco: autenticacao fraca por CPF e nascimento

Mitigacao:
- exigir token de convite forte;
- salvar somente hash;
- expirar convite;
- rate limit;
- mensagens genericas;
- revogacao manual.

### Risco: dados incorretos entrarem no cadastro oficial

Mitigacao:
- usar staging;
- exigir revisao do DP;
- comparar atual x enviado;
- registrar auditoria.

### Risco: documentos sensiveis expostos

Mitigacao:
- storage privado;
- download via API autenticada;
- nao expor documentos oficiais amplamente ao colaborador;
- cookies seguros;
- respostas minimizadas.

### Risco: duplicidade de regras de documentos

Mitigacao:
- reaproveitar constantes e calculos atuais;
- criar funcao especifica apenas para filtrar documentos do portal;
- manter `employee_documents` como unica fonte oficial.

### Risco: RH esquecer de revisar pendencias

Mitigacao:
- status visivel no cadastro;
- filtros de submissao pendente;
- indicadores futuros no dashboard;
- alertas operacionais.

## Criterios de pronto do modulo

O modulo pode ser considerado pronto para V1 quando:
- RH gera convite a partir do cadastro do colaborador;
- colaborador acessa por URL externa/subdominio;
- autenticacao por convite + CPF + nascimento funciona;
- colaborador preenche dados pessoais permitidos;
- colaborador envia documentos obrigatorios do perfil;
- portal possui ajuda clara para uso e upload;
- submissao entra no painel para revisao;
- DP aprova/rejeita dados e documentos;
- documentos aprovados entram em `employee_documents`;
- dados aprovados atualizam `employees`;
- documentos aprovados aparecem no cadastro e nos calculos de pendencia;
- auditoria cobre eventos principais;
- rotas administrativas permanecem protegidas;
- fluxo funciona bem em desktop e mobile.

## Pendencias para decisao futura

- Envio automatico de link por e-mail.
- Envio automatico por WhatsApp.
- Codigo de verificacao por e-mail/SMS/WhatsApp alem do convite.
- Assinatura digital de termos.
- OCR para conferir documentos.
- Validacao automatica de CPF/documentos.
- Area para colaborador baixar documentos internos.
- Notificacoes para o DP quando submissao for enviada.
- SLA e lembretes automaticos de pendencias.
- Configuracao pelo RH de quais documentos pedir por colaborador.
- Suporte a multiplos anexos por documento, alem de `OUTRO`.
