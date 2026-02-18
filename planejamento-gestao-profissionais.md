# Planejamento Técnico Final — Gestão de Profissionais (`/profissionais`)

## 1) Objetivo e escopo
Criar uma nova funcionalidade no painel para gestão da carteira de médicos, com:
- cadastro e edição de profissionais;
- gestão de documentos obrigatórios;
- visão operacional de pendências e vencimentos;
- base para geração de contratos;
- preparação completa para integração com AWS S3 (sem depender de S3 já configurado).

Fora de escopo nesta fase:
- assinatura eletrônica;
- workflow avançado de aprovação;
- ingestão de dados externos.

---

## 2) Decisões técnicas
1. Nova página: `/profissionais`.
2. Padrão de APIs: `frontend/src/app/api/admin/profissionais/*`.
3. Controle de acesso com `pageKey = profissionais` no mesmo modelo `view/edit/refresh`.
4. Persistência em MySQL (Railway).
5. Armazenamento de arquivos via abstração `StorageProvider`.
6. Implementação inicial de storage: `LocalStorageProvider` (ou `StubProvider`) para desenvolvimento.
7. Migração para S3: apenas troca de provider + variáveis de ambiente.
8. Cadastro terá campo obrigatório `contract_type` para direcionar o template de contrato.
9. Controle documental ficará em modo híbrido durante transição (`manual + upload`).

---

## 3) Requisito específico de expiração (confirmado)
A data de expiração da **Certidão de Ético Profissional** será **sempre informada manualmente pelo usuário**.

Regras:
1. `expires_at` é obrigatório para `CERTIDAO_ETICA`.
2. O sistema não tentará inferir data a partir do arquivo.
3. O usuário pode editar a data depois, sem novo upload.

---

## 4) Permissões e segurança
## 4.1 Novo `PageKey`
Adicionar em `frontend/src/lib/permissions.ts`:
- `profissionais` (`/profissionais`).

## 4.2 Defaults recomendados
- `ADMIN`: `view/edit/refresh = true`
- `GESTOR`: `view/edit/refresh = true`
- `OPERADOR`: `view = true` (opcional), `edit = false`, `refresh = false`

## 4.3 Validação server-side obrigatória
Todas as rotas da funcionalidade devem validar sessão e permissão no servidor:
- GET/HEAD: `view`
- POST/PUT/DELETE: `edit`

## 4.4 LGPD mínima
- mascarar CPF na listagem por padrão;
- exibir CPF completo apenas em tela de edição para quem tem permissão;
- logar acesso e download de documentos em auditoria.

---

## 5) Modelo de dados
## 5.1 Tabela `professionals`
- `id` (PK, VARCHAR 64)
- `name` (VARCHAR 180, not null)
- `contract_party_type` (ENUM: PF/PJ, not null, default PF)
- `contract_type` (VARCHAR 40, not null) // tipo de contrato selecionado no cadastro
- `cpf` (VARCHAR 14, null, unique)
- `cnpj` (VARCHAR 18, null, unique)
- `legal_name` (VARCHAR 180, null) // razão social quando PJ
- `specialty` (VARCHAR 120, not null)
- `personal_doc_type` (ENUM: RG/CPF/CNH, not null)
- `personal_doc_number` (VARCHAR 40, not null)
- `address_text` (TEXT, not null)
- `is_active` (TINYINT, default 1)
- `has_physical_folder` (TINYINT, default 0)
- `physical_folder_note` (TEXT, null)
- `created_at` (DATETIME)
- `updated_at` (DATETIME)

Índices:
- `UNIQUE(cpf)` // permite múltiplos NULL
- `UNIQUE(cnpj)` // permite múltiplos NULL
- `INDEX(is_active)`
- `INDEX(name)`

Validações de negócio:
- `contract_party_type=PF` exige `cpf` preenchido.
- `contract_party_type=PJ` exige `cnpj` e `legal_name` preenchidos.
- `contract_type` é obrigatório e precisa existir no catálogo de tipos de contrato.

## 5.2 Tabela `professional_registrations`
- `id` (PK, VARCHAR 64)
- `professional_id` (FK -> professionals.id)
- `council_type` (VARCHAR 10, not null) // CRM, CRO, CRP, etc.
- `council_number` (VARCHAR 40, not null)
- `council_uf` (CHAR 2, not null)
- `is_primary` (TINYINT, default 0)
- `created_at` (DATETIME)
- `updated_at` (DATETIME)

Índices:
- `INDEX(professional_id)`
- `INDEX(professional_id, is_primary)`
- `UNIQUE(council_type, council_number, council_uf)`

Regras:
- um profissional pode ter múltiplos registros.
- deve existir exatamente 1 registro principal (`is_primary=1`) por profissional ativo.
- atualização de registros deve rodar em transação para garantir consistência do primário.
- backfill inicial do legado: registros existentes entram como `council_type='CRM'`.

## 5.3 Tabela `professional_documents`
- `id` (PK, VARCHAR 64)
- `professional_id` (FK -> professionals.id)
- `doc_type` (VARCHAR 40, not null)
- `storage_provider` (VARCHAR 30, not null)
- `storage_bucket` (VARCHAR 120, null)
- `storage_key` (VARCHAR 255, not null)
- `original_name` (VARCHAR 255, not null)
- `mime_type` (VARCHAR 120, not null)
- `size_bytes` (BIGINT, not null)
- `expires_at` (DATE, null)
- `is_active` (TINYINT, default 1)
- `notes` (TEXT, null)
- `uploaded_by` (VARCHAR 64, not null)
- `created_at` (DATETIME)

Índices:
- `INDEX(professional_id, doc_type, is_active)`
- `INDEX(doc_type, expires_at)`

## 5.4 Tabela `professional_document_checklist` (controle manual de transição)
- `id` (PK, VARCHAR 64)
- `professional_id` (FK -> professionals.id)
- `doc_type` (VARCHAR 40, not null)
- `has_physical_copy` (TINYINT, default 0)
- `has_digital_copy` (TINYINT, default 0)
- `expires_at` (DATE, null) // para CERTIDAO_ETICA quando ainda não houver upload
- `notes` (TEXT, null)
- `verified_by` (VARCHAR 64, not null)
- `verified_at` (DATETIME, not null)
- `updated_at` (DATETIME, not null)

Índices:
- `UNIQUE(professional_id, doc_type)`
- `INDEX(doc_type, expires_at)`

Regra:
- tabela mantém o estado manual atual por tipo de documento.
- quando houver upload ativo, o checklist manual continua visível para histórico operacional, mas o status final prioriza o upload.

## 5.5 Tabela `professional_contracts`
- `id` (PK, VARCHAR 64)
- `professional_id` (FK -> professionals.id)
- `template_key` (VARCHAR 80, not null)
- `template_version` (VARCHAR 20, not null)
- `status` (VARCHAR 20, not null) // pending/generated/failed
- `storage_provider` (VARCHAR 30, null)
- `storage_bucket` (VARCHAR 120, null)
- `storage_key` (VARCHAR 255, null)
- `generated_by` (VARCHAR 64, not null)
- `generated_at` (DATETIME, null)
- `error_message` (TEXT, null)
- `meta_json` (LONGTEXT, null)
- `created_at` (DATETIME)

## 5.6 Tabela `professional_audit_log`
- `id` (PK, VARCHAR 64)
- `professional_id` (VARCHAR 64, null)
- `action` (VARCHAR 60, not null)
- `actor_user_id` (VARCHAR 64, not null)
- `payload_json` (LONGTEXT, null)
- `created_at` (DATETIME)

---

## 6) Tipos de documentos (MVP)
Obrigatórios:
1. `FOTO`
2. `DIPLOMA`
3. `DIPLOMA_ESPECIALIDADE`
4. `CERTIDAO_ETICA` (com `expires_at` obrigatório)

Opcional:
1. `CONTRATO_ASSINADO`

Configuração em código (`documentTypes.ts`):
- `required`
- `hasExpiration`
- `warningDays` (inicial 30 para certidão ética)

## 6.1 Tipos de contrato (MVP)
Configuração inicial em código (`contractTypes.ts`) com possibilidade de migrar para tabela depois.

Campos por tipo:
- `code` (ex.: `PADRAO_CLT`, `PJ_PADRAO`, `PLANTONISTA`)
- `label`
- `template_key`
- `template_version`
- `is_active`

Regra:
- `professionals.contract_type` deve referenciar um tipo ativo.
- geração de contrato usa `template_key/template_version` do tipo selecionado.

## 6.2 Modo híbrido de documentação (transição)
Configuração recomendada (`documentsValidationMode`):
- `hybrid` (padrão inicial): aceita upload ativo **ou** checklist manual.
- `upload_required` (pós-transição): exige upload ativo.

---

## 7) Storage abstraction (preparado para S3)
## 7.1 Interface (`storage/provider.ts`)
Métodos:
1. `uploadFile(params)` -> metadados do objeto
2. `deleteFile(params)`
3. `getDownloadStream(params)`
4. `getSignedViewUrl(params)` (opcional)

## 7.2 Providers
1. `LocalStorageProvider` (fase inicial)
2. `S3StorageProvider` (fase de ativação)

## 7.3 Variáveis de ambiente previstas para S3
- `STORAGE_PROVIDER=s3`
- `AWS_REGION`
- `AWS_S3_BUCKET`
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_S3_PREFIX=profissionais/` (opcional)

Formato de chave recomendado:
`profissionais/{professionalId}/{docType}/{timestamp}-{safeFileName}`

---

## 8) APIs (admin)
Base: `/api/admin/profissionais`

## 8.1 Profissionais
1. `GET /api/admin/profissionais`
   - filtros: `search`, `status`, `certidaoStatus`, `isActive`, `page`, `pageSize`
2. `POST /api/admin/profissionais`
   - payload inclui `contract_type`
   - payload inclui `registrations[]` (com `council_type`, `council_number`, `council_uf`, `is_primary`)
3. `GET /api/admin/profissionais/:id`
4. `PUT /api/admin/profissionais/:id`
   - payload inclui `contract_type`
   - payload inclui `registrations[]` completo para upsert transacional
5. `GET /api/admin/profissionais/:id/registrations`
6. `PUT /api/admin/profissionais/:id/registrations/primary`
   - define qual registro é primário

## 8.2 Documentos
1. `GET /api/admin/profissionais/:id/documentos`
2. `POST /api/admin/profissionais/:id/documentos` (multipart)
   - campos: `file`, `docType`, `expiresAt?`
3. `PUT /api/admin/profissionais/:id/documentos/:documentId`
   - uso principal: ajustar `expiresAt` manualmente
4. `GET /api/admin/profissionais/documentos/:documentId/download`
5. `GET /api/admin/profissionais/:id/documentos/checklist`
6. `PUT /api/admin/profissionais/:id/documentos/checklist`
   - atualiza controle manual por `doc_type` (`has_physical_copy`, `has_digital_copy`, `expires_at`, `notes`)

## 8.3 Contratos
1. `POST /api/admin/profissionais/:id/contratos/generate`
2. `GET /api/admin/profissionais/:id/contratos`
3. `GET /api/admin/profissionais/contratos/:contractId/download`

---

## 9) Regras de negócio
## 9.1 Pendências
`pendente = missingFields.length > 0 OR missingDocs.length > 0`

Definição de `missingDocs` por modo:
- `hybrid`: documento é considerado atendido se tiver upload ativo **ou** checklist manual (`has_physical_copy` ou `has_digital_copy`).
- `upload_required`: documento só é considerado atendido com upload ativo.

Campos mínimos para não gerar pendência estrutural:
- dados civis/fiscais conforme `contract_party_type` (PF/PJ);
- `contract_type` válido;
- especialidade;
- ao menos 1 registro em `professional_registrations`;
- exatamente 1 registro marcado como primário.

## 9.2 Certidão ética
- sem documento ativo e sem checklist manual válido: `PENDENTE`
- com evidência (upload/manual) e sem `expires_at`: `PENDENTE`
- `expires_at < hoje`: `VENCIDA`
- `expires_at <= hoje + warningDays`: `VENCENDO`
- caso contrário: `OK`

Fonte de `expires_at`:
1. priorizar documento ativo em `professional_documents`;
2. fallback no `professional_document_checklist` durante transição.

## 9.3 Substituição de documento
Ao enviar novo documento ativo do mesmo tipo:
1. desativar o ativo anterior (`is_active = 0`)
2. inserir novo registro como ativo

## 9.4 Geração de contrato
Bloquear geração quando houver:
1. campos obrigatórios pendentes;
2. docs obrigatórios pendentes;
3. certidão ética vencida.

## 9.5 Dados de contrato
- o contrato usa o registro primário de `professional_registrations`.
- exibição recomendada no template: `${council_type}/${council_uf} ${council_number}`.
- documento fiscal usado no contrato depende de `contract_party_type`:
  - PF -> CPF
  - PJ -> CNPJ (+ razão social)
- template usado vem de `contract_type` selecionado no cadastro.

---

## 10) UI/UX da página `/profissionais`
## 10.1 Listagem
- tabela com busca + filtros rápidos:
  - pendentes
  - certidão vencida
  - certidão vencendo
  - ativos/inativos
- colunas:
  - Profissional (nome, registro principal)
  - Especialidade
  - Documentos (`X/Y`)
  - Certidão ética (badge)
  - Pasta física
  - Ações

## 10.2 Modal de cadastro/edição
Abas:
1. Dados
2. Documentos
3. Pastas

Comportamentos:
- validação de obrigatórios no client e no server;
- seleção PF/PJ com validação dinâmica de CPF/CNPJ;
- seleção de `contract_type` (obrigatório);
- gestão de múltiplos registros regionais com seleção do primário;
- upload por tipo;
- controle manual por tipo de documento (checkbox pasta física/digital + observação) para modo híbrido;
- para certidão ética: campo de expiração sempre visível/obrigatório;
- edição da expiração sem reupload.

## 10.3 Tela de documentos
- listar ativos e histórico por tipo;
- permitir download seguro;
- mostrar data de upload, validade e usuário responsável.

---

## 11) Auditoria e observabilidade
## 11.1 Eventos mínimos em `professional_audit_log`
1. `PROFESSIONAL_CREATED`
2. `PROFESSIONAL_UPDATED`
3. `DOCUMENT_UPLOADED`
4. `DOCUMENT_UPDATED`
5. `DOCUMENT_DOWNLOADED`
6. `CONTRACT_GENERATED`
7. `CONTRACT_FAILED`

## 11.2 Heartbeat / status
- usar `system_status` para informar sincronizações de dados relacionados, se houver worker futuro.

---

## 12) Plano de implementação
## Fase 1 — Base de dados + permissões + UI inicial
1. adicionar `pageKey profissionais` + menu lateral;
2. migrations de tabelas;
3. migration/backfill de registros legados para `professional_registrations` com `council_type='CRM'` quando aplicável;
4. CRUD de profissionais + registros regionais;
5. regras transacionais de registro primário;
6. listagem com busca/filtros e modal de cadastro/edição (sem upload real).

## Fase 2 — Documentos + regras de pendência
1. implementar `StorageProvider` e provider local;
2. endpoints de upload/listagem/download;
3. endpoints e UI de checklist manual por tipo de documento;
4. cálculo de pendências e badge de certidão em modo híbrido;
5. edição manual de validade da certidão.

## Fase 3 — Contratos
1. template v1;
2. endpoint de geração;
3. histórico e download.

## Fase 4 — Hardening
1. auditoria completa;
2. validações avançadas;
3. paginação/performance;
4. ativação do provider S3.

---

## 13) Critérios de aceite (DoD)
1. usuário com `view` acessa `/profissionais` e vê dados paginados;
2. usuário com `edit` cria/edita profissional com validações corretas;
3. cadastro suporta múltiplos registros regionais por profissional com 1 primário;
4. validações PF/PJ aplicam CPF/CNPJ corretamente;
5. `contract_type` é obrigatório e determina o template de contrato;
6. controle manual de documentos funciona e persiste durante transição;
7. uploads obrigatórios funcionam e persistem no banco;
8. data de expiração da certidão é sempre manual e obrigatória;
9. status `OK/VENCENDO/VENCIDA/PENDENTE` calculado corretamente;
10. geração de contrato respeita bloqueios de pendência e usa registro primário;
11. logs de auditoria gravados para ações críticas;
12. troca para S3 exige só configuração + provider, sem refatorar regra de negócio.

---

## 14) Riscos e mitigação
1. **Risco:** crescimento de arquivos.
   **Mitigação:** limites de tamanho e tipos MIME permitidos.
2. **Risco:** vazamento de documento.
   **Mitigação:** download apenas via API autenticada; sem URL pública.
3. **Risco:** inconsistência em substituição de documento.
   **Mitigação:** transação no banco para `desativar anterior + inserir novo`.
4. **Risco:** falha de storage externo quando migrar para S3.
   **Mitigação:** retries com backoff e mensagens claras ao usuário.
5. **Risco:** divergência entre checklist manual e upload digital no período de transição.
   **Mitigação:** regra de prioridade explícita (upload > checklist) e auditoria de alterações.

---

## 15) Estrutura sugerida de código
- `frontend/src/app/(admin)/profissionais/page.tsx`
- `frontend/src/app/(admin)/profissionais/components/*`
- `frontend/src/app/api/admin/profissionais/**/route.ts`
- `frontend/src/lib/profissionais/documentTypes.ts`
- `frontend/src/lib/profissionais/contractTypes.ts`
- `frontend/src/lib/profissionais/status.ts`
- `frontend/src/lib/storage/provider.ts`
- `frontend/src/lib/storage/providers/local.ts`
- `frontend/src/lib/storage/providers/s3.ts` (placeholder)

