# Financeiro SOBAB

Fluxo de caixa, conciliação bancária (extrato Cora), Clínica Social, contas a pagar com aprovação da diretoria, mensalidades e fechamento mensal. Login com e-mail e senha.

Para colocar no ar: [COMO-PUBLICAR.md](COMO-PUBLICAR.md).

## Como funciona

- `site/`: o sistema (HTML, CSS e JavaScript puro, sem etapa de build). É a pasta publicada no GitHub Pages pelo workflow `.github/workflows/financeiro-sobab-publicar.yml`.
- **Firebase Authentication** (e-mail e senha) para o login e **Cloud Firestore** para os dados.
- `firestore.rules`: quem pode o quê. A tela esconde o que a pessoa não pode fazer, mas quem garante é o banco.

| Papel | Pode |
|---|---|
| `admin` | tudo, inclusive liberar, mudar e bloquear acessos |
| `financeiro` | lançar, conciliar, pagar, editar cadastros e meses |
| `diretoria` | ler tudo e aprovar ou reprovar contas a pagar (só os campos de aprovação, em nome próprio) |
| `leitura` | ler tudo |

Coleções: `lanc` (lançamentos), `meses` (saldo inicial, saldos Cora do dia, fechamento), `cad/geral` (alunos, CFGM, pacientes, contas fixas, professores, regras de classificação), `usuarios/{uid}` (nome, e-mail, papel, ativo) e `config/instalado` (marca que a administradora já foi criada).

### Dados pessoais fora do código

O repositório é público. Nomes de alunos, pacientes, professores e fornecedores e as regras de classificação por nome ficam em `cad/geral`, dentro do banco, e são editados na aba **Cadastros**. O código só tem a lógica.

## Testes

Precisa de Node 20+ e Java (para o emulador do Firebase).

```bash
cd sobab-financeiro
npm install
npm test            # leitura do extrato e classificação + permissões + fluxo no navegador
npm run local       # sistema em http://localhost:5055 com o emulador (dados de mentira)
```

- `tests/regras.test.js`: leitura do extrato e classificação, com dados inventados.
- `tests/permissoes.test.js`: `firestore.rules` para cada papel, no emulador.
- `tests/navegador.test.js`: fluxo completo no Chromium com Playwright (instalação, importação de backup, liberar acesso, aprovação pela diretoria, bloqueio, tela de celular).
