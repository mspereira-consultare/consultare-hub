# Proposta de IAM Compartilhado

## Objetivo

Este documento apresenta uma proposta de abordagem para identidade e controle de acessos compartilhados entre:

- o Magic IA, novo SaaS multi-tenant da Consultare; e
- o outro sistema que será desenvolvido em paralelo.

A ideia é avaliar se faz sentido os dois produtos consumirem uma mesma camada centralizada de identidade e acessos, em vez de cada sistema manter seu próprio cadastro de usuários, tenants e permissões.

O objetivo aqui não é impor uma solução fechada, mas propor uma base de alinhamento para avaliarmos juntos.

Neste pacote de arquitetura, quando este documento fala em "novo SaaS", o produto de referencia e o Magic IA. O IAM compartilhado nao substitui os contratos internos do produto: modulos contratados continuam sendo resolvidos por `EntitlementGrant`, permissoes funcionais por perfis/grupos e escopo operacional por `DataAccessContext`.

---

## 1. Problema atual

Se cada sistema nascer com seu próprio cadastro de usuários, login, papéis e permissões, alguns problemas tendem a aparecer rapidamente:

- duplicidade de usuários entre sistemas;
- permissões inconsistentes para a mesma pessoa;
- retrabalho para manter login, convite, reset de senha e sessão em dois lugares;
- dificuldade para gerir tenants, organizações e memberships de forma coerente;
- aumento do custo de manutenção e evolução;
- risco maior de falhas de segurança e de governança.

Na prática, isso costuma gerar dois efeitos ruins:

- cada sistema resolve o mesmo problema de identidade de forma diferente;
- no futuro, a unificação fica muito mais cara do que seria se a base fosse pensada desde o início.

---

## 2. Proposta

A proposta é criar uma camada centralizada de IAM, que funcione como fonte única da verdade para:

- usuários;
- autenticação/login;
- sessão;
- tenants/clientes;
- organizações;
- papéis;
- permissões;
- memberships;
- tokens e controle de acesso entre sistemas.

Em vez de cada produto manter sua própria estrutura principal de identidade, os dois sistemas passariam a consumir essa camada compartilhada.

Isso não significa misturar os sistemas. Significa apenas centralizar o que é transversal:

- quem é o usuário;
- a quais tenants ele pertence;
- quais papéis e permissões ele tem;
- em quais sistemas ele pode acessar;
- qual o contexto de acesso dele naquele momento.

---

## 3. Como os sistemas se relacionariam

A proposta de relacionamento é a seguinte:

- o IAM cuidaria da autenticação e do controle central de acessos;
- o novo SaaS consumiria esse IAM;
- o outro sistema também consumiria esse IAM;
- cada sistema continuaria dono das suas próprias regras de negócio;
- cada sistema continuaria dono dos seus dados operacionais;
- cada sistema continuaria dono dos seus fluxos internos e das suas integrações específicas.

Em outras palavras:

- o IAM não deve virar um produto de negócio;
- o IAM não deve carregar regra operacional específica de nenhum dos dois sistemas;
- o papel do IAM deve ser fornecer identidade, contexto de acesso e autorização compartilhada;
- o papel de cada sistema deve continuar sendo executar sua própria aplicação e suas próprias regras.

---

## 4. Benefícios esperados

Se essa abordagem fizer sentido para os dois lados, os principais benefícios são:

- login unificado entre sistemas;
- menos duplicidade de usuários;
- papéis e permissões centralizados;
- gestão mais simples de tenants e clientes;
- maior consistência de acessos entre os sistemas;
- base melhor para segurança, auditoria e governança;
- menos retrabalho na evolução futura;
- caminho mais claro para SSO no futuro;
- experiência mais consistente para usuários que acessam mais de um sistema.

Também existe um ganho importante de crescimento:

- se surgirem novos módulos ou novos sistemas depois, a base de identidade já estaria pronta para escalar sem duplicar cadastro e autorização outra vez.

---

## 5. Pontos de atenção

Essa abordagem traz benefícios, mas exige alguns cuidados desde o início:

- o desenho inicial precisa ser feito com mais responsabilidade;
- os contratos entre os sistemas precisam ser bem alinhados;
- as responsabilidades do IAM e dos produtos precisam ficar muito claras;
- é importante evitar que o IAM fique inchado com regra de negócio;
- precisamos definir com clareza como tokens, memberships e permissões vão funcionar;
- cada sistema ainda precisará validar acessos corretamente no próprio backend.

Em resumo:

- centralizar identidade não elimina a responsabilidade de cada sistema;
- apenas evita duplicidade e melhora a consistência do que é compartilhado.

---

## 6. Proposta inicial de responsabilidades

### O IAM deve cuidar de

- usuário;
- login;
- autenticação;
- sessão;
- tenants;
- organizações;
- papéis;
- permissões;
- memberships;
- tokens;
- controle básico de acesso entre sistemas.

### Cada sistema deve cuidar de

- suas telas;
- suas regras de negócio;
- seus dados operacionais;
- seus fluxos internos;
- suas integrações específicas;
- sua experiência de usuário;
- suas regras funcionais próprias.

Essa separação é importante para manter o IAM leve, neutro e reutilizável.

---

## 7. Como isso pode funcionar na prática

De forma simples, a proposta inicial seria:

- o usuário autentica em um IAM central;
- o IAM emite os tokens e informa o contexto de acesso;
- cada sistema recebe esse contexto e valida o acesso ao próprio produto;
- o IAM informa quem é o usuário, a quais tenants ele pertence, quais papéis ele possui e para quais sistemas ele tem acesso;
- cada produto decide o que fazer dentro do seu próprio domínio com base nesse contexto.
- no Magic IA, o produto ainda deve validar se o tenant contratou o modulo, se o usuario tem permissao funcional e qual escopo de dados pode acessar.

Exemplo prático:

- o mesmo usuário pode pertencer a mais de um tenant;
- o mesmo usuário pode acessar o SaaS novo e o outro sistema;
- ele pode ter papéis diferentes em cada contexto;
- o IAM centraliza essa identidade e esse vínculo;
- os produtos continuam independentes no que diz respeito a negócio.

---

## 8. Perguntas para avaliação do outro dev

Para validar se essa abordagem faz sentido para o outro sistema, seria importante avaliar:

- Essa abordagem faz sentido para o seu sistema?
- Seu sistema precisará de usuários próprios ou pode consumir um IAM central?
- Quais tipos de permissão o seu sistema precisará?
- Haverá papéis específicos do seu sistema?
- Seu sistema precisará acessar múltiplos tenants?
- O login unificado seria útil para sua aplicação?
- Existe alguma restrição técnica que dificulte ou impeça essa abordagem?
- Seu sistema vai precisar apenas autenticar usuários ou também usar tenants, memberships e grants compartilhados?
- Há alguma necessidade especial de autorização que você já enxerga desde agora?

---

## 9. Proposta de próximo passo

Se a abordagem fizer sentido em princípio, o próximo passo sugerido é uma conversa curta de alinhamento para fechar os pontos básicos antes da implementação.

Temas dessa conversa:

- modelo de usuário;
- modelo de tenant;
- modelo de organização;
- modelo de memberships;
- modelo de papéis e permissões;
- formato básico dos tokens;
- relacao entre IAM, `EntitlementGrant`, permissoes do produto e `DataAccessContext`;
- responsabilidades do IAM;
- responsabilidades de cada sistema;
- limites do IAM para não virar um sistema inchado.

O ideal é sair dessa conversa com um entendimento comum sobre:

- o que será compartilhado;
- o que continuará local de cada sistema;
- e quais contratos mínimos precisarão existir entre os produtos e o IAM.

---

## 10. Fechamento

A proposta de IAM compartilhado faz mais sentido quando olhamos para médio e longo prazo.

Ela exige um pouco mais de cuidado no início, mas tende a reduzir:

- retrabalho;
- duplicidade;
- inconsistência;
- problemas de segurança;
- dificuldade de crescimento.

Se o outro sistema também tiver necessidade real de usuários, tenants, papéis e acessos, a tendência é que uma base centralizada seja mais saudável do que duas soluções separadas tentando se reencontrar depois.

A ideia deste documento é abrir essa conversa de forma estruturada e colaborativa.
