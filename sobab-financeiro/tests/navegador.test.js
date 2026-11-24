// Fluxo completo no navegador, com o emulador do Firebase: instalação, importação,
// liberar acesso para a diretoria, aprovar conta, bloquear acesso. Dados inventados.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { iniciar } = require("./servidor.js");

let chromium;
try { ({ chromium } = require("playwright")); } catch (e) { chromium = null; }

const PORTA = 5056, BASE = `http://127.0.0.1:${PORTA}/`;
const NM = path.join(__dirname, "..", "node_modules");
const ARQ_TESTE = process.env.SAIDA_TESTE || path.join(__dirname, "..", ".saida-teste");
const ADM = { nome: "Adm Teste", email: "adm@teste.dev", senha: "senha-forte-1" };
const mesAtual = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; })();
const BACKUP = {
  formato: "sobab-financeiro-backup", versao: 1,
  lanc: [
    { id: "t-e1", data: mesAtual + "-02", mes: mesAtual, tipo: "E", cat: "Formação AB", desc: "Mensalidade", pessoa: "Aluna Teste", valor: 1000, status: "realizado", conc: true, aprov: "", obs: "", revisar: false, metodo: "Pix", operacao: "", origem: "teste" },
    { id: "t-s1", data: mesAtual + "-10", mes: mesAtual, tipo: "S", cat: "Imposto", desc: "ISS de teste", pessoa: "", valor: 321.45, status: "previsto", conc: false, aprov: "pendente", obs: "", revisar: false, metodo: "Boleto", operacao: "", origem: "teste" }
  ],
  meses: [{ id: mesAtual, saldoInicial: 5000 }],
  cad: { geral: { conta: "Conta de teste", alunos: [{ nome: "Aluna Teste", valor: 1000, meses: [] }], cfgm: [], fixas: [], pacientes: [], regras: [] } }
};

async function limparEmulador() {
  await fetch("http://127.0.0.1:8080/emulator/v1/projects/demo-sobab/databases/(default)/documents", { method: "DELETE" });
  await fetch("http://127.0.0.1:9099/emulator/v1/projects/demo-sobab/accounts", { method: "DELETE" });
}
// Bibliotecas de CDN servidas do node_modules (o teste não depende de internet)
async function rotas(ctx) {
  const local = (re, arq, tipo) => ctx.route(re, r => r.fulfill({ path: arq, contentType: tipo }));
  for (const m of ["app", "auth", "firestore"]) await local(new RegExp(`gstatic\\.com/firebasejs/.*/firebase-${m}-compat\\.js`), path.join(NM, "firebase", `firebase-${m}-compat.js`), "text/javascript");
  await local(/cdnjs\.cloudflare\.com\/ajax\/libs\/xlsx\//, path.join(NM, "xlsx", "dist", "xlsx.full.min.js"), "text/javascript");
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
}
async function entrar(page, email, senha) {
  await page.goto(BASE);
  await page.locator("#telaLogin").waitFor({ state: "visible" });
  await page.fill("#lEmail", email); await page.fill("#lSenha", senha);
  await page.click("#btnEntrar");
}
const sair = async page => { await page.click("#btnSair"); await page.locator("#telaLogin").waitFor({ state: "visible" }); };

test("fluxo completo de acesso", { skip: !chromium && "playwright não instalado" }, async () => {
  fs.mkdirSync(ARQ_TESTE, { recursive: true });
  await limparEmulador();
  const srv = await iniciar(PORTA);
  const browser = await chromium.launch();
  const erros = [];
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await rotas(ctx);
    const page = await ctx.newPage();
    page.on("pageerror", e => erros.push(String(e)));
    page.on("dialog", d => d.accept());

    // 1. Instalação nova: oferece criar a administradora
    await page.goto(BASE);
    await page.locator("#linkInstalar").waitFor({ state: "visible" });
    await page.screenshot({ path: path.join(ARQ_TESTE, "1-login.png") });
    await page.click("#linkInstalar");
    await page.fill("#iNome", ADM.nome); await page.fill("#iEmail", ADM.email);
    await page.fill("#iSenha", ADM.senha); await page.fill("#iSenha2", ADM.senha);
    await page.click("#btnInstalar");
    await page.locator("#telaApp").waitFor({ state: "visible" });
    await page.locator('#tabs button[data-t="acessos"]').waitFor({ state: "visible" });
    assert.equal(await page.textContent("#uNome"), ADM.nome);

    // 2. Importa backup
    await page.click('#tabs button[data-t="acessos"]');
    const arq = path.join(ARQ_TESTE, "backup-teste.json"); fs.writeFileSync(arq, JSON.stringify(BACKUP));
    await page.setInputFiles("#bkArquivo", arq);

    await page.locator("#bkStatus", { hasText: "Pronto" }).waitFor();
    await page.click('#tabs button[data-t="painel"]');
    await page.locator(".kpi b.in", { hasText: "1.000,00" }).waitFor();
    assert.equal(await page.textContent("#contaDesc"), "Conta de teste");

    // 3. Libera acesso para a diretoria
    await page.click('#tabs button[data-t="acessos"]');
    await page.fill('[data-na="nome"]', "Diretora Teste");
    await page.fill('[data-na="email"]', "diretora@teste.dev");
    await page.click("#naGerar");
    const senhaDir = await page.inputValue('[data-na="senha"]');
    assert.ok(senhaDir.length >= 8);
    await page.click("#naCriar");
    await page.locator(".msgacesso").waitFor();
    const msg = await page.textContent(".msgacesso");
    assert.ok(msg.includes("diretora@teste.dev") && msg.includes(senhaDir), "mensagem pronta para enviar");
    assert.equal(await page.textContent("#uNome"), ADM.nome, "criar acesso não desconecta a administradora");
    await page.locator("td", { hasText: "Diretora Teste" }).waitFor();
    await sair(page);
    assert.equal(await page.isVisible("#linkInstalar"), false, "primeiro acesso some depois da instalação");

    // 4. Senha errada
    await entrar(page, "diretora@teste.dev", "errada123");
    await page.locator("#loginAviso", { hasText: "incorretos" }).waitFor();

    // 5. Diretoria: menos abas, aprova conta, não vê botões de edição
    await page.fill("#lSenha", senhaDir); await page.click("#btnEntrar");
    await page.locator("#telaApp").waitFor({ state: "visible" });
    const abas = await page.$$eval("#tabs button:not([hidden])", bs => bs.map(b => b.dataset.t));
    assert.deepEqual(abas, ["painel", "pagar", "rel", "fech", "mens", "lanc"]);
    await page.locator(".list li", { hasText: "aguardando aprovação" }).waitFor();
    await page.click('#tabs button[data-t="pagar"]');
    await page.locator("td", { hasText: "321,45" }).first().waitFor();
    assert.equal(await page.isVisible('button[data-pg="t-s1"]'), false, "diretoria não marca como pago");
    assert.equal(await page.$$eval("input[data-vl]", e => e.length), 0, "diretoria não edita valor");
    await page.screenshot({ path: path.join(ARQ_TESTE, "2-diretoria-contas.png"), fullPage: true });
    await page.click('button[data-ap="t-s1"]');
    await page.locator("td .chip.acc", { hasText: "Aprovado" }).waitFor();
    await page.locator('[data-name]', { hasText: "você" }).waitFor();
    await sair(page);

    // 6. Administradora bloqueia a diretora
    await entrar(page, ADM.email, ADM.senha);
    await page.locator("#telaApp").waitFor({ state: "visible" });
    await page.click('#tabs button[data-t="pagar"]');
    await page.locator('[data-name]', { hasText: "Diretora Teste" }).waitFor();
    await page.click('#tabs button[data-t="acessos"]');
    const bloq = page.locator("tr", { hasText: "Diretora Teste" }).locator("button[data-ubloq]");
    await bloq.click(); await bloq.click();
    await page.locator("tr", { hasText: "Diretora Teste" }).locator(".chip.bad").waitFor();
    await sair(page);
    await entrar(page, "diretora@teste.dev", senhaDir);
    await page.locator("#loginAviso", { hasText: "bloqueado" }).waitFor();

    // 7. Celular: login sem rolagem lateral
    const cel = await browser.newContext({ viewport: { width: 375, height: 740 } });
    await rotas(cel);
    const p2 = await cel.newPage();
    await p2.goto(BASE); await p2.locator("#telaLogin").waitFor({ state: "visible" });
    assert.ok(await p2.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "sem rolagem lateral no celular");
    await p2.screenshot({ path: path.join(ARQ_TESTE, "3-login-celular.png") });
  } catch (e) {
    // foto da tela no momento da falha, para entender o que aconteceu
    for (const c of browser.contexts()) for (const pg of c.pages()) await pg.screenshot({ path: path.join(ARQ_TESTE, "falha.png"), fullPage: true }).catch(() => {});
    throw e;
  } finally {
    await browser.close(); srv.close();
  }
  assert.deepEqual(erros, [], "sem erros de JavaScript na página");
});
