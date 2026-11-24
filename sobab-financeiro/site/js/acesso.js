// ================= Login, acessos e backup =================
// Firebase Authentication (e-mail e senha) + Firestore. Quem pode o quê fica em usuarios/{uid}
// e é garantido pelas regras do banco (firestore.rules), não só pela tela.

const PAPEIS = {
  admin: ["Administradora", "Tudo, inclusive liberar e bloquear acessos"],
  financeiro: ["Financeiro", "Lança, concilia, paga e edita cadastros"],
  diretoria: ["Diretoria", "Acompanha os números e aprova ou reprova pagamentos"],
  leitura: ["Só consulta", "Vê os números, sem alterar nada"]
};
const ERROS_LOGIN = {
  "auth/invalid-credential": "E-mail ou senha incorretos. Confira e tente de novo.",
  "auth/invalid-login-credentials": "E-mail ou senha incorretos. Confira e tente de novo.",
  "auth/wrong-password": "E-mail ou senha incorretos. Confira e tente de novo.",
  "auth/user-not-found": "E-mail ou senha incorretos. Confira e tente de novo.",
  "auth/invalid-email": "Esse e-mail não parece válido. Confira se digitou certo.",
  "auth/missing-password": "Digite a sua senha.",
  "auth/too-many-requests": "Muitas tentativas seguidas. Espere alguns minutos e tente de novo.",
  "auth/network-request-failed": "Sem conexão com a internet. Confira e tente de novo.",
  "auth/email-already-in-use": "Já existe um acesso com esse e-mail.",
  "auth/weak-password": "A senha precisa ter pelo menos 6 caracteres.",
  "auth/user-disabled": "Este acesso foi bloqueado. Fale com a administradora.",
  "auth/requires-recent-login": "Por segurança, saia e entre de novo antes de trocar a senha."
};
const msgErro = (e, padrao) => ERROS_LOGIN[e && e.code] || padrao || "Algo deu errado. Tente de novo.";

let auth = null, appCadastro = null, instalando = false, emulador = false;
function telas(qual) { ["telaCarregando", "telaConfig", "telaLogin", "telaApp"].forEach(id => { $("#" + id).hidden = id !== qual; }); }
function aviso(id, texto, tipo) { const el = $(id); el.textContent = texto || ""; el.hidden = !texto; el.className = "aviso " + (tipo || "erro"); }

// ----- Início -----
(function inicio() {
  const cfg = window.FIREBASE_CONFIG || {};
  if (!cfg.apiKey || !cfg.projectId) { telas("telaConfig"); return; }
  if (!window.firebase) { $("#telaCarregando").querySelector("p").textContent = "Não foi possível carregar o sistema. Confira a internet e recarregue a página."; return; }
  firebase.initializeApp(cfg);
  auth = firebase.auth(); auth.languageCode = "pt-BR";
  db = firebase.firestore();
  db.settings({ ignoreUndefinedProperties: true, merge: true });
  // Projetos "demo-" são só para teste local, com o emulador do Firebase
  emulador = cfg.projectId.startsWith("demo-");
  if (emulador) { auth.useEmulator("http://localhost:9099", { disableWarnings: true }); db.useEmulator("localhost", 8080); }
  auth.onAuthStateChanged(u => { if (instalando) return; if (u) entrar(u); else { pararTudo(); mostrarLogin(); } });
})();

async function entrar(u) {
  telas("telaCarregando");
  let perfil = null;
  try { const s = await db.collection("usuarios").doc(u.uid).get(); perfil = s.exists ? s.data() : null; } catch (e) { perfil = null; }
  if (!perfil || perfil.ativo !== true) {
    await auth.signOut();
    mostrarLogin(perfil ? "Seu acesso está bloqueado. Fale com a administradora do sistema." : "Este e-mail ainda não tem acesso ao sistema. Peça para a administradora liberar.");
    return;
  }
  meId = u.uid; PAPEL = perfil.papel;
  canWrite = PAPEL === "admin" || PAPEL === "financeiro";
  canApprove = canWrite || PAPEL === "diretoria";
  $("#uNome").textContent = perfil.nome || u.email;
  $("#uPapel").textContent = (PAPEIS[PAPEL] || [PAPEL])[0];
  montarAbas(); telas("telaApp"); render();
  $("#app").innerHTML = '<section class="tab"><div class="panel empty">Carregando os lançamentos…</div></section>';
  iniciarDados();
}

// ----- Tela de login -----
async function mostrarLogin(msg) {
  telas("telaLogin");
  $("#boxEntrar").hidden = false; $("#boxInstalar").hidden = true;
  aviso("#loginAviso", msg || "");
  // Instalação nova: oferece criar o acesso da administradora
  $("#linkInstalar").hidden = true;
  try { const s = await db.doc("config/instalado").get(); $("#linkInstalar").hidden = s.exists; } catch (e) { /* fica escondido */ }
  setTimeout(() => { const em = $("#lEmail"); if (em && !em.value) em.focus(); }, 50);
}
$("#mostrarSenha").addEventListener("change", e => { $("#lSenha").type = e.target.checked ? "text" : "password"; });
$("#fLogin").addEventListener("submit", async e => {
  e.preventDefault();
  const b = $("#btnEntrar"), email = $("#lEmail").value.trim(), senha = $("#lSenha").value;
  if (!email) { aviso("#loginAviso", "Digite o seu e-mail."); return; }
  b.disabled = true; b.textContent = "Entrando…"; aviso("#loginAviso", "");
  try { await auth.signInWithEmailAndPassword(email, senha); $("#lSenha").value = ""; }
  catch (err) { aviso("#loginAviso", msgErro(err, "Não foi possível entrar. Tente de novo.")); }
  b.disabled = false; b.textContent = "Entrar";
});
$("#btnEsqueci").addEventListener("click", async () => {
  const email = $("#lEmail").value.trim();
  if (!email) { aviso("#loginAviso", "Digite o seu e-mail no campo acima e clique de novo em “Esqueci minha senha”.", "info"); $("#lEmail").focus(); return; }
  try { await auth.sendPasswordResetEmail(email); aviso("#loginAviso", `Se esse e-mail tiver acesso, chega em alguns minutos uma mensagem para ${email} com o link para criar uma senha nova. Confira também a caixa de spam.`, "ok"); }
  catch (err) { aviso("#loginAviso", msgErro(err, "Não foi possível enviar o e-mail agora. Tente de novo.")); }
});

// ----- Primeiro acesso (só enquanto o sistema não tem administradora) -----
$("#linkInstalar").addEventListener("click", () => { $("#boxEntrar").hidden = true; $("#boxInstalar").hidden = false; aviso("#instAviso", ""); $("#iNome").focus(); });
$("#instVoltar").addEventListener("click", () => mostrarLogin());
$("#fInstalar").addEventListener("submit", async e => {
  e.preventDefault();
  const nome = $("#iNome").value.trim(), email = $("#iEmail").value.trim(), s1 = $("#iSenha").value, s2 = $("#iSenha2").value;
  if (!nome || !email) { aviso("#instAviso", "Preencha nome e e-mail."); return; }
  if (s1.length < 8) { aviso("#instAviso", "Use uma senha com pelo menos 8 caracteres."); return; }
  if (s1 !== s2) { aviso("#instAviso", "As duas senhas não são iguais."); return; }
  const b = $("#btnInstalar"); b.disabled = true; b.textContent = "Criando…";
  instalando = true;
  try {
    const cred = await auth.createUserWithEmailAndPassword(email, s1);
    const lote = db.batch();
    lote.set(db.collection("usuarios").doc(cred.user.uid), { nome, email, papel: "admin", ativo: true, criadoEm: new Date().toISOString() });
    lote.set(db.doc("config/instalado"), { em: new Date().toISOString(), por: cred.user.uid });
    await lote.commit();
    instalando = false;
    await entrar(cred.user);
    toast("Acesso de administradora criado. Agora libere o acesso da equipe na aba Acessos.");
  } catch (err) {
    instalando = false;
    if (auth.currentUser) { try { await auth.currentUser.delete(); } catch (x) {} await auth.signOut(); }
    aviso("#instAviso", err && err.code === "permission-denied" ? "Este sistema já tem administradora. Entre com o seu e-mail e senha." : msgErro(err, "Não foi possível criar o acesso. Tente de novo."));
  }
  b.disabled = false; b.textContent = "Criar meu acesso";
});

// ----- Barra do usuário -----
$("#btnSair").addEventListener("click", async () => { await auth.signOut(); toast("Você saiu do sistema."); });
$("#btnSenha").addEventListener("click", () => { ["#sAtual", "#sNova", "#sNova2"].forEach(s => $(s).value = ""); aviso("#senhaAviso", ""); $("#dlgSenha").showModal(); });
$("#sCancel").addEventListener("click", () => $("#dlgSenha").close());
$("#fSenha").addEventListener("submit", async e => {
  e.preventDefault();
  const atual = $("#sAtual").value, nova = $("#sNova").value, nova2 = $("#sNova2").value;
  if (nova.length < 8) { aviso("#senhaAviso", "Use uma senha com pelo menos 8 caracteres."); return; }
  if (nova !== nova2) { aviso("#senhaAviso", "As duas senhas novas não são iguais."); return; }
  const u = auth.currentUser, b = $("#sSave"); b.disabled = true;
  try {
    await u.reauthenticateWithCredential(firebase.auth.EmailAuthProvider.credential(u.email, atual));
    await u.updatePassword(nova);
    $("#dlgSenha").close(); toast("Senha trocada. Use a nova senha da próxima vez.");
  } catch (err) { aviso("#senhaAviso", ["auth/invalid-credential", "auth/wrong-password", "auth/invalid-login-credentials"].includes(err.code) ? "A senha atual não está certa." : msgErro(err)); }
  b.disabled = false;
});

// ================= Aba Acessos (só administradora) =================
UI.na = { nome: "", email: "", papel: "diretoria", senha: "" };
UI.criado = null;
function senhaSugerida() {
  const p = ["sol", "mar", "rio", "lua", "flor", "casa", "vida", "luz"], a = new Uint32Array(3); crypto.getRandomValues(a);
  return p[a[0] % p.length] + "-" + String(1000 + a[1] % 9000) + "-" + p[a[2] % p.length];
}
function mensagemAcesso(c) {
  return `Olá, ${c.nome.split(" ")[0]}! Seu acesso ao Financeiro SOBAB está pronto.\n\n` +
    `1. Abra este link: ${location.origin}${location.pathname}\n2. E-mail: ${c.email}\n3. Senha: ${c.senha}\n\n` +
    `Depois de entrar, o sistema fica salvo nesse aparelho. Se esquecer a senha, clique em “Esqueci minha senha” na tela de entrada.`;
}
function vAcessos() {
  if (PAPEL !== "admin") return '<div class="panel empty">Só a administradora vê esta aba.</div>';
  const us = Object.entries(USERS).sort((a, b) => (a[1].nome || "").localeCompare(b[1].nome || ""));
  const na = UI.na, c = UI.criado;
  const papelOpts = cur => Object.entries(PAPEIS).map(([k, [t]]) => `<option value="${k}" ${k === cur ? "selected" : ""}>${t}</option>`).join("");
  return `${c ? `<div class="okbox"><h3>Acesso criado para ${esc(c.nome)}</h3><p>Envie a mensagem abaixo pelo WhatsApp ou e-mail. Por segurança, a senha só aparece agora.</p>
      <pre class="msgacesso">${esc(mensagemAcesso(c))}</pre>
      <div class="acts2" style="justify-content:flex-start"><button class="pri" id="naCopiar">Copiar mensagem</button><button class="ghost" id="naFechar">Fechar</button></div></div>` : ""}
    <div class="panel"><div class="ph"><div><h2>Liberar novo acesso</h2><p>Você cria o e-mail e a senha inicial e envia para a pessoa. Ela não precisa se cadastrar em nada.</p></div></div>
    <form id="fNovo" class="formgrid">
      <label class="f">Nome<input data-na="nome" value="${esc(na.nome)}" placeholder="Ex.: Maria Souza" required></label>
      <label class="f">E-mail da pessoa<input data-na="email" type="email" value="${esc(na.email)}" placeholder="nome@exemplo.com" required></label>
      <label class="f">O que ela pode fazer<select data-na="papel">${papelOpts(na.papel)}</select><small class="muted">${esc((PAPEIS[na.papel] || ["", ""])[1])}</small></label>
      <label class="f">Senha inicial<span style="display:flex;gap:6px"><input data-na="senha" value="${esc(na.senha)}" placeholder="mínimo 8 caracteres" style="flex:1"><button type="button" id="naGerar">Gerar</button></span></label>
      <div class="full acts2" style="justify-content:flex-start"><button class="pri" id="naCriar" type="submit">Criar acesso</button><span class="aviso erro" id="naAviso" hidden></span></div>
    </form></div>
    <div class="panel"><div class="ph"><div><h2>Quem tem acesso</h2><p>${us.length} pessoas. Bloquear tira o acesso na hora, sem apagar nada do histórico.</p></div></div>
    <div class="tblwrap"><table><thead><tr><th>Pessoa</th><th>Pode fazer</th><th>Situação</th><th></th></tr></thead><tbody>
    ${us.map(([id, u]) => { const eu = id === meId; return `<tr><td><div class="who">${esc(u.nome || "")}${eu ? " <small>(você)</small>" : ""}<small>${esc(u.email || "")}</small></div></td>
      <td>${eu ? esc((PAPEIS[u.papel] || [u.papel])[0]) : `<select data-upapel="${id}" aria-label="Papel de ${esc(u.nome || "")}">${papelOpts(u.papel)}</select>`}</td>
      <td>${u.ativo ? '<span class="chip ok">Ativo</span>' : '<span class="chip bad">Bloqueado</span>'}</td>
      <td class="acoes"><button class="ghost" data-ureset="${esc(u.email || "")}">Enviar e-mail para trocar senha</button>${eu ? "" : u.ativo ? `<button data-ubloq="${id}">Bloquear</button>` : `<button data-uativ="${id}">Reativar</button>`}</td></tr>`; }).join("")}
    </tbody></table></div></div>
    <div class="panel"><div class="ph"><div><h2>Backup</h2><p>Baixe uma cópia de tudo de vez em quando e guarde no computador. A importação serve para trazer os dados do sistema antigo ou restaurar um backup.</p></div></div>
    <div class="acts2" style="justify-content:flex-start"><button class="pri" id="bkBaixar">Baixar backup completo (.json)</button>
      <label class="btn" style="cursor:pointer">Importar backup<input type="file" id="bkArquivo" accept="application/json,.json" hidden></label></div>
    <div id="bkStatus" class="muted" style="margin-top:8px">${esc(UI.bk || "")}</div></div>`;
}
function afterAcessos() {
  const on = (s, ev, fn) => { const el = $(s); if (el) el.addEventListener(ev, fn); };
  document.querySelectorAll("[data-na]").forEach(el => el.addEventListener(el.tagName === "SELECT" ? "change" : "input", () => { UI.na[el.dataset.na] = el.value; if (el.tagName === "SELECT") render(); }));
  on("#naGerar", "click", () => { UI.na.senha = senhaSugerida(); render(); });
  on("#naFechar", "click", () => { UI.criado = null; render(); });
  on("#naCopiar", "click", () => copiar(mensagemAcesso(UI.criado), "Mensagem copiada. Cole no WhatsApp ou no e-mail."));
  on("#fNovo", "submit", criarAcesso);
  on("#bkBaixar", "click", baixarBackup);
}
async function criarAcesso(e) {
  e.preventDefault();
  const na = UI.na, nome = na.nome.trim(), email = na.email.trim().toLowerCase(), senha = na.senha.trim();
  if (!nome || !email) { aviso("#naAviso", "Preencha nome e e-mail."); return; }
  if (senha.length < 8) { aviso("#naAviso", "A senha inicial precisa ter pelo menos 8 caracteres. Use o botão Gerar."); return; }
  const b = $("#naCriar"); b.disabled = true; b.textContent = "Criando…";
  // Um segundo app do Firebase cria a conta sem desconectar a administradora
  try {
    if (!appCadastro) {
      appCadastro = firebase.initializeApp(window.FIREBASE_CONFIG, "cadastro");
      if (emulador) appCadastro.auth().useEmulator("http://localhost:9099", { disableWarnings: true });
      await appCadastro.auth().setPersistence(firebase.auth.Auth.Persistence.NONE);
    }
    const a2 = appCadastro.auth();
    const cred = await a2.createUserWithEmailAndPassword(email, senha);
    await db.collection("usuarios").doc(cred.user.uid).set({ nome, email, papel: na.papel, ativo: true, criadoEm: new Date().toISOString(), criadoPor: meId });
    await a2.signOut();
    UI.criado = { nome, email, senha }; UI.na = { nome: "", email: "", papel: "diretoria", senha: "" };
    toast("Acesso criado"); render(); window.scrollTo(0, 0);
  } catch (err) {
    b.disabled = false; b.textContent = "Criar acesso";
    aviso("#naAviso", err && err.code === "auth/email-already-in-use"
      ? "Esse e-mail já tem conta. Se a pessoa estava bloqueada, use Reativar na lista abaixo."
      : msgErro(err, "Não foi possível criar o acesso."));
  }
}
document.addEventListener("change", async e => {
  if (e.target.id === "bkArquivo") { const f = e.target.files && e.target.files[0]; e.target.value = ""; if (f) importarBackup(f); return; }
  const id = e.target.dataset.upapel; if (!id) return;
  try { await db.collection("usuarios").doc(id).update({ papel: e.target.value }); toast("Acesso atualizado"); } catch (err) { toast("Não foi possível mudar o acesso."); }
});
document.addEventListener("click", async e => {
  const b = e.target.closest("button"); if (!b) return; const d = b.dataset;
  if (d.ubloq || d.uativ) {
    const id = d.ubloq || d.uativ, ativo = !!d.uativ;
    if (!ativo && b.dataset.arm !== "1") { b.dataset.arm = "1"; b.textContent = "Confirmar bloqueio"; return; }
    try { await db.collection("usuarios").doc(id).update({ ativo }); toast(ativo ? "Acesso reativado" : "Acesso bloqueado"); } catch (err) { toast("Não foi possível alterar o acesso."); }
  }
  if (d.ureset !== undefined) {
    if (!d.ureset) { toast("Esse acesso não tem e-mail cadastrado."); return; }
    try { await auth.sendPasswordResetEmail(d.ureset); toast("E-mail enviado para " + d.ureset); } catch (err) { toast(msgErro(err, "Não foi possível enviar o e-mail.")); }
  }
});

// ----- Backup -----
// A mensagem fica em UI.bk porque a própria importação redesenha a tela
function bkStatus(t) { UI.bk = t; const el = $("#bkStatus"); if (el) el.textContent = t; }
async function baixarBackup() {
  bkStatus("Preparando o backup…");
  try {
    const [l, m, c] = await Promise.all([db.collection("lanc").get(), db.collection("meses").get(), db.collection("cad").get()]);
    const out = { formato: "sobab-financeiro-backup", versao: 1, exportadoEm: new Date().toISOString(),
      lanc: l.docs.map(d => ({ id: d.id, ...d.data() })), meses: m.docs.map(d => ({ id: d.id, ...d.data() })), cad: Object.fromEntries(c.docs.map(d => [d.id, d.data()])) };
    baixar(new Blob([JSON.stringify(out, null, 1)], { type: "application/json" }), `SOBAB_backup_${hoje()}.json`);
    bkStatus(`Backup com ${out.lanc.length} lançamentos baixado.`);
  } catch (e) { bkStatus("Não foi possível gerar o backup."); }
}
async function importarBackup(file) {
  let j; try { j = JSON.parse(await file.text()); } catch (e) { bkStatus("Esse arquivo não é um backup válido."); return; }
  if (!j || j.formato !== "sobab-financeiro-backup" || !Array.isArray(j.lanc)) { bkStatus("Esse arquivo não é um backup do Financeiro SOBAB."); return; }
  if (!confirm(`Importar ${j.lanc.length} lançamentos, ${(j.meses || []).length} meses e os cadastros?\n\nLançamentos com o mesmo código são substituídos pela versão do arquivo.`)) { bkStatus(""); return; }
  const ops = [];
  for (const x of j.lanc) { const { id, ...d } = x; if (id) ops.push(["lanc", id, d]); }
  for (const x of j.meses || []) { const { id, ...d } = x; if (id) ops.push(["meses", id, d]); }
  for (const [id, d] of Object.entries(j.cad || {})) ops.push(["cad", id, d]);
  try {
    for (let i = 0; i < ops.length; i += 400) {
      const lote = db.batch();
      ops.slice(i, i + 400).forEach(([c, id, d]) => lote.set(db.collection(c).doc(id), d));
      await lote.commit();
      bkStatus(`Importando… ${Math.min(i + 400, ops.length)} de ${ops.length}`);
    }
    bkStatus(`Pronto: ${ops.length} registros importados.`); toast("Backup importado");
  } catch (e) { bkStatus("A importação parou no meio. Tente de novo: o que já entrou não duplica."); }
}
