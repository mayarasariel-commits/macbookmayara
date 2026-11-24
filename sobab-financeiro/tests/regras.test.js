// Leitura do extrato e classificação automática. Dados inventados.
const test = require("node:test");
const assert = require("node:assert/strict");
const R = require("../site/js/regras.js");

const CAD = {
  ...R.DEFAULT_CAD,
  alunos: [{ nome: "Ana Paula Teste", valor: 1018.5, meses: [] }],
  cfgm: [{ nome: "Bruna Exemplo", valor: 250 }],
  pacientes: [{ id: "p1", nome: "Carlos Ficticio", terapeuta: "Dora Modelo", valor: 200, apelidos: ["Carlos Ficticio Junior"] }],
  profCfgm: ["Elisa Amostra"],
  profFormacao: ["Fabio Demo"],
  regras: [
    { tipo: "S", contem: "operadora x", cat: "Infraestrutura", desc: "Telefone" },
    { tipo: "S", contem: "imobiliaria y", valor: 3000, cat: "Imóvel", desc: "Aluguel" },
    { tipo: "S", contem: "imobiliaria y", cat: "Compartilhada", desc: "Condomínio", revisar: true },
    { tipo: "S", contem: "darf", min: 600, max: 700, cat: "Imposto", desc: "DARF parcelamento" },
    { tipo: "S", contem: "gestor", comecaNumero: true, cat: "Marketing", desc: "Tráfego" },
    { tipo: "S", contem: "dora", fase: "depois", cat: "Infraestrutura", desc: "Reembolso", revisar: true },
    { tipo: "E", contem: "reembolsador", cat: "Reembolsos", desc: "Reembolso mensal" }
  ]
};
const it = (tipo, nome, valor, data = "2026-10-20", operacao = tipo === "E" ? "Transf Pix recebida" : "Transf Pix enviada") => ({ tipo, nome, valor, data, operacao, cnpj: "" });

test("lê o extrato da Cora com saldo do dia, entradas e saídas", () => {
  const txt = [
    "20/10/2026 Saldo do dia R$ 10.500,00",
    "Transf Pix recebida  ANA PAULA TESTE  + R$ 1.018,50",
    "Boleto pago  OPERADORA X LTDA  - R$ 150,00",
    "21/10/2026",
    "Transf Pix recebida  CARLOS FICTICIO  + R$ 200,00"
  ].join("\n");
  const r = R.parseExtrato(txt);
  assert.equal(r.saldos["2026-10-20"], 10500);
  assert.equal(r.itens.length, 3);
  assert.deepEqual(r.itens.map(i => [i.data, i.tipo, i.valor]), [["2026-10-20", "E", 1018.5], ["2026-10-20", "S", 150], ["2026-10-21", "E", 200]]);
  assert.equal(r.itens[1].operacao, "Boleto pago");
  assert.match(r.itens[0].nome, /ANA PAULA TESTE/);
});

test("entrada: aluno, CFGM, paciente, GM, não identificado", () => {
  assert.equal(R.classificar(it("E", "ANA PAULA TESTE", 1018.5), CAD).cat, "Formação AB");
  assert.equal(R.classificar(it("E", "BRUNA EXEMPLO", 250, "2026-10-20", "Pagamento recebido"), CAD).cat, "CFGM");
  const p = R.classificar(it("E", "CARLOS FICTICIO", 200), CAD);
  assert.equal(p.cat, "Clínica Social"); assert.equal(p.pacId, "p1"); assert.equal(p.revisar, false);
  const ant = R.classificar(it("E", "CARLOS FICTICIO", 600), CAD);
  assert.equal(ant.mult, 3, "múltiplo exato vira pagamento antecipado");
  assert.equal(R.classificar(it("E", "ZEZINHO QUALQUER", 50), CAD).cat, "GM / Cursos extras");
  assert.equal(R.classificar(it("E", "ZEZINHO QUALQUER", 999), CAD).cat, "Não identificado");
  assert.equal(R.classificar(it("E", "REEMBOLSADOR SA", 999), CAD).cat, "Reembolsos");
});

test("saída: regras do cadastro, valor exato e faixa de valor", () => {
  const c = x => R.classificar(x, CAD);
  assert.deepEqual([c(it("S", "OPERADORA X", 150)).cat, c(it("S", "OPERADORA X", 150)).desc], ["Infraestrutura", "Telefone"]);
  assert.equal(c(it("S", "IMOBILIARIA Y", 3000.4)).desc, "Aluguel");
  const cond = c(it("S", "IMOBILIARIA Y", 812));
  assert.equal(cond.desc, "Condomínio"); assert.equal(cond.revisar, true);
  assert.equal(c(it("S", "DARF", 650)).desc, "DARF parcelamento");
  assert.equal(c(it("S", "DARF", 1200)).desc, "DARF");
  assert.equal(c(it("S", "12345678 GESTOR DE MIDIA", 400)).cat, "Marketing");
  assert.notEqual(c(it("S", "GESTOR DE MIDIA", 400)).cat, "Marketing", "comecaNumero exige o CNPJ na frente");
  assert.equal(c(it("S", "ALGUEM", 10, "2026-10-20", "Devolução Pix enviada")).cat, "Devolução");
});

test("saída: repasse no dia do repasse, professores e fase depois", () => {
  const c = x => R.classificar(x, CAD);
  assert.equal(c(it("S", "DORA MODELO", 1700, "2026-10-14")).cat, "Terapeutas");
  assert.equal(c(it("S", "ELISA AMOSTRA", 900, "2026-10-22")).cat, "Professores CFGM");
  assert.equal(c(it("S", "FABIO DEMO", 900, "2026-10-22")).cat, "Professores Formação");
  // terapeuta fora do dia do repasse: a regra "depois" vale
  assert.equal(c(it("S", "DORA MODELO", 120, "2026-10-25")).desc, "Reembolso");
  assert.equal(c(it("S", "NINGUEM CONHECIDO", 80)).cat, "Outras saídas");
});

test("regra precisa de algum critério e de categoria", () => {
  assert.equal(R.regraBate({ tipo: "S", cat: "Imposto" }, it("S", "QUALQUER", 1)), false);
  assert.equal(R.regraBate({ tipo: "S", contem: "qual" }, it("S", "QUALQUER", 1)), false);
  assert.equal(R.regraBate({ tipo: "E", contem: "qual", cat: "Projetos" }, it("S", "QUALQUER", 1)), false);
});

test("competência da clínica respeita o dia de corte", () => {
  assert.equal(R.compDe("2026-11-10", 15), "2026-10");
  assert.equal(R.compDe("2026-11-16", 15), "2026-11");
  assert.equal(R.compDe("2026-01-05", 15), "2025-12");
});
