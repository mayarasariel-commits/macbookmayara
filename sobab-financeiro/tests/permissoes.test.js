// Regras do banco (firestore.rules) para cada papel. Roda no emulador: npm run test:banco
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const { initializeTestEnvironment, assertSucceeds, assertFails } = require("@firebase/rules-unit-testing");

let env;
const db = uid => (uid ? env.authenticatedContext(uid) : env.unauthenticatedContext()).firestore();
const LANC = { data: "2026-10-10", mes: "2026-10", tipo: "S", cat: "Imposto", desc: "ISS", pessoa: "", valor: 100, status: "previsto", conc: false, aprov: "pendente", obs: "" };

test.before(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-sobab",
    firestore: { rules: fs.readFileSync(path.join(__dirname, "..", "firestore.rules"), "utf8"), host: "127.0.0.1", port: 8080 }
  });
});
test.after(async () => { if (env) await env.cleanup(); });

test("instalação: primeira pessoa vira administradora uma única vez", async () => {
  await env.clearFirestore();
  await assertSucceeds(db(null).doc("config/instalado").get());
  const a = db("primeira"), lote = a.batch();
  lote.set(a.doc("usuarios/primeira"), { nome: "Adm", email: "adm@x.com", papel: "admin", ativo: true });
  lote.set(a.doc("config/instalado"), { por: "primeira" });
  await assertSucceeds(lote.commit());
  const b = db("intrusa"), lote2 = b.batch();
  lote2.set(b.doc("usuarios/intrusa"), { nome: "X", email: "x@x.com", papel: "admin", ativo: true });
  lote2.set(b.doc("config/instalado"), { por: "intrusa" });
  await assertFails(lote2.commit());
  await assertFails(b.doc("usuarios/intrusa").set({ nome: "X", papel: "admin", ativo: true }));
  await assertFails(db("primeira").doc("config/instalado").set({ por: "outra" }));
});

test("sem instalação, ninguém cria admin sem marcar config/instalado junto", async () => {
  await env.clearFirestore();
  await assertFails(db("u1").doc("usuarios/u1").set({ nome: "X", papel: "admin", ativo: true }));
});

async function semear() {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async ctx => {
    const f = ctx.firestore();
    const u = (id, papel, ativo = true) => f.doc("usuarios/" + id).set({ nome: id, email: id + "@x.com", papel, ativo });
    await Promise.all([u("adm", "admin"), u("fin", "financeiro"), u("dir", "diretoria"), u("lei", "leitura"), u("blq", "financeiro", false),
      f.doc("config/instalado").set({ por: "adm" }), f.doc("lanc/x1").set(LANC), f.doc("cad/geral").set({ alunos: [] }), f.doc("meses/2026-10").set({ saldoInicial: 10 })]);
  });
}

test("sem login ou sem perfil: nada", async () => {
  await semear();
  await assertFails(db(null).doc("lanc/x1").get());
  await assertFails(db("estranha").doc("lanc/x1").get());
  await assertFails(db("estranha").collection("usuarios").get());
  await assertFails(db("estranha").doc("lanc/novo").set(LANC));
});

test("bloqueada: não lê nem grava, mas enxerga o próprio perfil", async () => {
  await semear();
  await assertFails(db("blq").doc("lanc/x1").get());
  await assertFails(db("blq").doc("lanc/novo").set(LANC));
  await assertSucceeds(db("blq").doc("usuarios/blq").get());
  await assertFails(db("blq").doc("usuarios/adm").get());
});

test("só consulta: lê tudo, não altera nada", async () => {
  await semear();
  const l = db("lei");
  await assertSucceeds(l.doc("lanc/x1").get());
  await assertSucceeds(l.doc("cad/geral").get());
  await assertSucceeds(l.collection("usuarios").get());
  await assertFails(l.doc("lanc/x1").update({ aprov: "aprovado", aprovPor: "lei", aprovEm: "agora" }));
  await assertFails(l.doc("lanc/x1").update({ valor: 1 }));
  await assertFails(l.doc("cad/geral").set({}));
});

test("diretoria: aprova e reprova em nome próprio, e só isso", async () => {
  await semear();
  const d = db("dir");
  await assertSucceeds(d.doc("lanc/x1").update({ aprov: "aprovado", aprovPor: "dir", aprovEm: "agora" }));
  await assertSucceeds(d.doc("lanc/x1").update({ aprov: "reprovado", aprovPor: "dir", aprovEm: "depois" }));
  await assertFails(d.doc("lanc/x1").update({ aprov: "aprovado", aprovPor: "fin", aprovEm: "agora" }));
  await assertFails(d.doc("lanc/x1").update({ aprov: "pendente", aprovPor: "dir", aprovEm: "agora" }));
  await assertFails(d.doc("lanc/x1").update({ aprov: "aprovado", aprovPor: "dir", valor: 1 }));
  await assertFails(d.doc("lanc/x1").update({ status: "realizado" }));
  await assertFails(d.doc("lanc/novo").set(LANC));
  await assertFails(d.doc("lanc/x1").delete());
  await assertFails(d.doc("cad/geral").set({}));
  await assertFails(d.doc("meses/2026-10").set({ saldoInicial: 0 }));
  await assertFails(d.doc("usuarios/dir").update({ papel: "admin" }));
});

test("financeiro: lança, edita cadastros e meses, mas não mexe em acessos", async () => {
  await semear();
  const f = db("fin");
  await assertSucceeds(f.doc("lanc/novo").set(LANC));
  await assertSucceeds(f.doc("lanc/x1").update({ valor: 250, status: "realizado" }));
  await assertSucceeds(f.doc("lanc/x1").delete());
  await assertSucceeds(f.doc("cad/geral").set({ alunos: [{ nome: "A", valor: 1 }] }));
  await assertSucceeds(f.doc("meses/2026-11").set({ saldoInicial: 5 }));
  await assertFails(f.doc("usuarios/nova").set({ nome: "N", papel: "leitura", ativo: true }));
  await assertFails(f.doc("usuarios/fin").update({ papel: "admin" }));
  await assertFails(f.doc("outra/coisa").set({ a: 1 }));
});

test("administradora: libera, muda papel e bloqueia, mas não se tranca para fora", async () => {
  await semear();
  const a = db("adm");
  await assertSucceeds(a.doc("usuarios/nova").set({ nome: "N", email: "n@x.com", papel: "diretoria", ativo: true }));
  await assertSucceeds(a.doc("usuarios/dir").update({ papel: "leitura" }));
  await assertSucceeds(a.doc("usuarios/fin").update({ ativo: false }));
  await assertFails(a.doc("usuarios/lei").update({ papel: "dona" }));
  await assertFails(a.doc("usuarios/nova2").set({ nome: "N", papel: "admin", ativo: "sim" }));
  await assertFails(a.doc("usuarios/adm").update({ ativo: false }));
  await assertFails(a.doc("usuarios/adm").update({ papel: "leitura" }));
  await assertSucceeds(a.doc("usuarios/adm").update({ nome: "Novo nome" }));
  await assertFails(a.doc("usuarios/adm").delete());
  await assertSucceeds(a.doc("usuarios/lei").delete());
  // quem foi bloqueada perde o acesso na hora
  await assertFails(db("fin").doc("lanc/x1").get());
});
