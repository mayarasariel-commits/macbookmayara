# Financeiro SOBAB: como está montado e como usar

**Link do sistema:** https://financeiro-sobab-5b4f6.web.app

Tudo roda no plano gratuito do **Firebase** (do Google), na conta mayara.s.ariel@gmail.com, projeto `financeiro-sobab-5b4f6`:

- **Authentication**: login por e-mail e senha.
- **Firestore** (São Paulo): os dados, protegidos pelas regras de `firestore.rules`.
- **Hosting**: o site.

O plano gratuito não pede cartão e **não cobra nada de surpresa**: se um dia passar do limite, o banco só pausa até o dia seguinte. O limite é de 50 mil leituras por dia, e o sistema carrega no máximo os últimos 24 meses, então o uso da SOBAB fica bem abaixo disso.

---

## Primeiro acesso (uma vez só)

1. Abra o link do sistema.
2. Clique em **Primeira vez usando o sistema? Criar o acesso da administradora**. Esse link só aparece enquanto o sistema não tem administradora.
3. Preencha seu nome, e-mail e uma senha. Você entra direto.

Os lançamentos, saldos e cadastros do sistema antigo já estão no banco.

## Liberar o acesso das diretoras e da equipe

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

## Backup

Uma vez por mês, entre em **Acessos > Baixar backup completo** e guarde o arquivo no computador ou no Google Drive. O mesmo arquivo pode ser restaurado em **Acessos > Importar backup**.

---

## Para quem for mexer no sistema

O código fica em `sobab-financeiro/` neste repositório. Depois de mudar o código, publique com o Firebase CLI logado na conta dona do projeto:

```bash
cd sobab-financeiro
firebase deploy --only hosting            # só o site
firebase deploy --only firestore:rules    # só as regras de acesso
```

O projeto padrão já está em `.firebaserc`. Os testes estão descritos no [README](README.md).

### Montar do zero em outro projeto Firebase

1. Criar o projeto em console.firebase.google.com (Analytics desligado).
2. **Authentication > Vamos começar > E-mail/senha**: ativar só a primeira chave.
3. **Firestore Database > Criar banco de dados**: local `southamerica-east1 (São Paulo)`, modo produção.
4. Registrar um app **Web** e copiar a configuração para `site/js/config.js`; trocar o projeto em `.firebaserc`.
5. `firebase deploy --only hosting,firestore:rules`.
6. Primeiro acesso no link novo e **Acessos > Importar backup** com o último backup.
