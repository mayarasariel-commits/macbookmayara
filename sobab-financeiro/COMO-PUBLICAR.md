# Como colocar o Financeiro SOBAB no ar

Tudo gratuito. O sistema usa duas coisas:

- **Firebase** (do Google, entra com o seu Gmail): guarda os dados e cuida do login.
- **GitHub Pages**: publica o sistema direto do seu repositório, no link `https://mayarasariel-commits.github.io/macbookmayara/`.

Você faz os passos 1 a 6 (uns 15 minutos, só uma vez). O resto o Claude faz.

---

## Passo 1. Criar o projeto no Firebase

1. Abra **console.firebase.google.com** e entre com o seu Gmail.
2. Clique em **Criar um projeto** (ou "Adicionar projeto").
3. Nome: `financeiro-sobab`. Avance.
4. Na tela do Google Analytics, **desative** e clique em **Criar projeto**.

## Passo 2. Ligar o login por e-mail e senha

1. No menu da esquerda: **Criação > Authentication** e clique em **Vamos começar**.
2. Na lista de provedores, clique em **E-mail/senha**.
3. Ative só a **primeira** chave ("E-mail/senha") e clique em **Salvar**.

## Passo 3. Criar o banco de dados e colar as regras de segurança

1. No menu da esquerda: **Criação > Firestore Database** e clique em **Criar banco de dados**.
2. Local: escolha **southamerica-east1 (São Paulo)**. Esse item não muda depois.
3. Escolha **Iniciar no modo de produção** e clique em **Criar**.
4. Quando abrir, clique na aba **Regras**.
5. Apague tudo o que estiver lá e cole o conteúdo inteiro do arquivo [`firestore.rules`](firestore.rules).
6. Clique em **Publicar**.

> As regras são o que protege os dados. Sem elas, ninguém acessa nada; com elas, cada pessoa só faz o que o papel dela permite.

## Passo 4. Pegar a configuração do projeto

1. Clique na engrenagem ao lado de "Visão geral do projeto" e em **Configurações do projeto**.
2. Role até **Seus apps** e clique no ícone **`</>`** (Web).
3. Apelido: `site`. **Não** marque Firebase Hosting. Clique em **Registrar app**.
4. Vai aparecer um bloco parecido com este:

   ```js
   const firebaseConfig = {
     apiKey: "AIza...",
     authDomain: "financeiro-sobab.firebaseapp.com",
     projectId: "financeiro-sobab",
     storageBucket: "...",
     messagingSenderId: "...",
     appId: "..."
   };
   ```

5. Copie esse bloco e mande para o Claude colocar no sistema. Ou, se preferir fazer você mesma: no GitHub, abra `sobab-financeiro/site/js/config.js`, clique no lápis, preencha os mesmos campos e clique em **Commit changes**.

> Esses valores não são senha. Eles só dizem qual é o projeto. Quem protege os dados é o login junto com as regras do passo 3.

## Passo 5. Ligar o GitHub Pages (um clique)

1. No GitHub, abra o repositório **macbookmayara** e clique em **Settings** (Configurações).
2. No menu da esquerda, clique em **Pages**.
3. Em **Build and deployment > Source**, escolha **GitHub Actions**. Não precisa salvar: a escolha já vale.

Toda vez que o sistema for atualizado na versão principal, ele publica sozinho em 1 ou 2 minutos.

## Passo 6. Avisar o Firebase sobre o link do sistema

1. No Firebase: **Authentication > Configurações > Domínios autorizados**.
2. Clique em **Adicionar domínio** e cole `mayarasariel-commits.github.io`.

## Passo 7. Primeiro acesso e dados antigos

1. Abra `https://mayarasariel-commits.github.io/macbookmayara/`.
2. Clique em **Primeira vez usando o sistema? Criar o acesso da administradora**. Esse link só aparece enquanto o sistema não tem administradora.
3. Preencha seu nome, e-mail e uma senha. Você entra direto.
4. Vá na aba **Acessos > Importar backup** e escolha o arquivo `SOBAB_dados_para_importar.json` (os lançamentos, saldos e cadastros do sistema antigo).
5. Ainda em **Acessos**, libere a equipe (próximo passo).

## Passo 8. Liberar o acesso das diretoras e da equipe

Na aba **Acessos**, em "Liberar novo acesso":

1. Nome e e-mail da pessoa.
2. **O que ela pode fazer**:
   - **Diretoria**: vê os números e aprova ou reprova pagamentos. Não altera mais nada.
   - **Só consulta**: só vê.
   - **Financeiro**: lança, concilia, paga e edita cadastros.
   - **Administradora**: tudo, inclusive liberar e bloquear acessos.
3. Clique em **Gerar** para criar uma senha fácil de digitar (ex.: `lua-4821-flor`).
4. Clique em **Criar acesso**. Aparece uma mensagem pronta com link, e-mail e senha: clique em **Copiar mensagem** e mande no WhatsApp.

Para as diretoras, o sistema abre direto no **Painel**, com só 6 abas, e os botões **Aprovar** e **Reprovar** em destaque em **Contas a pagar**. Depois do primeiro login, o sistema fica salvo no aparelho e elas não precisam digitar a senha de novo.

Se alguém esquecer a senha: na tela de entrada, **Esqueci minha senha** manda um link por e-mail. Ou você clica em **Enviar e-mail para trocar senha** na aba Acessos.

Para tirar o acesso de alguém: **Bloquear**. Vale na hora e não apaga nada do histórico.

---

## Custos e limites

O plano gratuito do Firebase (Spark) não pede cartão e **não cobra nada de surpresa**: se um dia passar do limite, o banco só pausa até o dia seguinte. O limite é de 50 mil leituras por dia, e o sistema carrega no máximo os últimos 24 meses de lançamentos, então o uso da SOBAB fica bem abaixo disso.

## Backup

Uma vez por mês, entre em **Acessos > Baixar backup completo** e guarde o arquivo no computador ou no Google Drive.
