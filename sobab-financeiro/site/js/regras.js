// ===== Regras do caixa: leitura do extrato Cora e classificação automática =====
// Nenhum nome de pessoa fica neste arquivo. Alunos, pacientes, professores e as
// regras por nome (ex.: "vivo" vira Fatura Vivo) ficam no cadastro, dentro do banco.

const CATS = {
  E: ["Formação AB", "CFGM", "Clínica Social", "Aula Aberta", "Intervisão", "Projetos", "Link de cartão (Zoop)", "Outras entradas",
    "GM / Cursos extras", "Reembolsos", "Não identificado"],
  S: ["Terapeutas", "Professores", "Professores Formação", "Professores CFGM", "Professores Aula Aberta", "Imóvel", "Compartilhada",
    "Infraestrutura", "Afiliação", "Profissional", "Contador", "Imposto", "Cartão de crédito", "Copeira", "Contrato", "Marketing",
    "Workshop", "Devolução", "Outras saídas"]
};
const GRUPO_S = {
  "Terapeutas": "Repasses", "Professores": "Repasses", "Professores Formação": "Repasses", "Professores CFGM": "Repasses", "Professores Aula Aberta": "Repasses",
  "Imóvel": "Fixas", "Compartilhada": "Fixas", "Infraestrutura": "Fixas", "Afiliação": "Fixas", "Profissional": "Fixas",
  "Contador": "Fixas", "Imposto": "Fixas", "Cartão de crédito": "Fixas", "Copeira": "Fixas", "Contrato": "Fixas", "Marketing": "Fixas",
  "Workshop": "Variáveis", "Devolução": "Variáveis", "Outras saídas": "Variáveis"
};
// Estrutura vazia. Os dados reais chegam do banco (cad/geral) depois do login.
const DEFAULT_CAD = {
  conta: "", alunos: [], cfgm: [], fixas: [], pacientes: [], profFormacao: [], profCfgm: [], terapeutasExtra: [],
  clinica: { sobab: 10, poupanca: 5, terapeutas: 85 }, diaRepasse: [13, 15], corte: 15, regras: []
};

const OPS = ["Transf Pix recebida", "Transf Pix enviada", "Devolução Pix enviada", "Devolução Pix recebida", "Depósito recebido",
  "Boleto pago", "Pagamento recebido", "Pagamento da fatura", "Transferência recebida", "Transferência enviada", "Pagamento enviado",
  "Pix agendado", "Tarifa", "Estorno", "Transferência Pix recebida", "Transferência Pix enviada via chave", "Transferência Pix manual enviada",
  "Transferência Pix enviada", "Pagamento QR Code Pix", "Pix recebido", "Pix enviado"];

function brl2n(s) { return Number(String(s).replace(/\./g, "").replace(",", ".")); }
function normTxt(s) { return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase(); }
function tokens(s) {
  return normTxt(s).replace(/…/g, " ").replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(Boolean);
}
// Compara um nome truncado do extrato ("MARIA DA SILVA S …") com um nome completo do cadastro
function nomeBate(nomeExtrato, nomeCompleto) {
  const truncado = /…|\.\.\.$/.test(String(nomeExtrato || "").trim());
  const a = tokens(nomeExtrato).filter(t => !/^\d+$/.test(t));
  const b = tokens(nomeCompleto);
  if (!a.length || !b.length) return false;
  if (b.length === 1) return a[0] === b[0];
  if (a.length < 2) return false;
  for (let i = 0; i < a.length; i++) {
    const ultimo = i === a.length - 1;
    if (!b[i]) return i >= 2;
    if (ultimo && truncado ? !b[i].startsWith(a[i]) : a[i] !== b[i]) return false;
  }
  return true;
}
function limparNome(raw) {
  return String(raw || "")
    .replace(/\s+(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}|\d{3}\.\d{3}\.\d{3}-\d{2}|\*{3}\.?\d{3}\.\d{3}-\*{2}|\d{4})\s*$/, "")
    .replace(/\s+/g, " ").trim();
}
function metodoDe(op) {
  const o = normTxt(op);
  if (o.includes("boleto") || o.includes("pagamento recebido")) return "Boleto";
  if (o.includes("fatura")) return "Fatura cartão";
  if (o.includes("deposito")) return "Link de cartão";
  if (o.includes("pix") || o.includes("transf")) return "Pix";
  return "Outro";
}

const fmtBRL = v => "R$ " + Number(v || 0).toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
function mesAnterior(m) { let y = +m.slice(0, 4), mo = +m.slice(5) - 1; if (mo === 0) { y--; mo = 12; } return `${y}-${String(mo).padStart(2, "0")}`; }
// Competência da Clínica Social: dia 1 até o corte = mês anterior; depois do corte = mês corrente
function compDe(data, corte) { const c = +(corte || 15); return +data.slice(8, 10) > c ? data.slice(0, 7) : mesAnterior(data.slice(0, 7)); }

// Aceita o extrato da Cora em qualquer formato de cópia:
// colunas (tela da Cora), uma linha por movimento (PDF) ou um campo por linha (PDF copiado no navegador)
const RE_VALOR = /([+\-−])?\s*R\$\s*([+\-−])?\s*([\d.]+,\d{2})\s*$/;
const RE_DATA = /(\d{2})\/(\d{2})\/(\d{4})/g;
const RE_LIXO = /^(tipo de transa|data$|valor|descri|extrato|per[ií]odo|ag[eê]ncia|conta|cnpj|cpf|p[aá]gina|\d+\s*(de|\/)\s*\d+$|movimenta|entradas|sa[ií]das|total|lan[cç]amentos|emitido|gerado)/i;
function acharOp(txt) {
  const t = normTxt(txt); let best = "";
  for (const o of OPS) { const n = normTxt(o); if (t.includes(n) && n.length > normTxt(best).length) best = o; }
  return best;
}
function tirarOp(txt, op) {
  if (!op) return txt;
  const i = normTxt(txt).indexOf(normTxt(op));
  return i < 0 ? txt : (txt.slice(0, i) + " " + txt.slice(i + op.length));
}
const isoDe = d => `${d.slice(6, 10)}-${d.slice(3, 5)}-${d.slice(0, 2)}`;
function parseExtrato(texto) {
  const itens = [], saldos = {};
  let dia = null, buf = [];
  for (const raw of String(texto).split(/\r?\n/)) {
    const l = raw.replace(/ /g, " ").trim();
    if (!l) continue;
    const sd = l.match(/^(\d{2}\/\d{2}\/\d{4})\s+Saldo do dia\s+R\$\s*(-?[\d.]+,\d{2})/i);
    if (sd) { dia = isoDe(sd[1]); saldos[dia] = brl2n(sd[2]); buf = []; continue; }
    const vm = l.match(RE_VALOR);
    if (!vm) {
      const so = l.match(/^(\d{2}\/\d{2}\/\d{4})$/);
      if (so) dia = isoDe(so[1]);
      if (!RE_LIXO.test(l)) { buf.push(l); if (buf.length > 6) buf.shift(); }
      continue;
    }
    // linha com valor: junta com o que veio antes (quando o PDF quebra um campo por linha)
    const resto = l.slice(0, vm.index).trim();
    if (/saldo/i.test(resto)) { buf = []; continue; }
    const op0 = acharOp(resto);
    const linhaCompleta = tirarOp(resto, op0).replace(RE_DATA, "").replace(/\s+/g, " ").trim().length > 2;
    const fonte = linhaCompleta ? [resto] : [...buf, resto].filter(Boolean);
    buf = [];
    const junto = fonte.join("  ");
    const datas = [...junto.matchAll(RE_DATA)].map(m => m[0]);
    const data = datas.length ? isoDe(datas[datas.length - 1]) : dia;
    if (!data) continue;
    const op = acharOp(junto);
    // nome: o pedaço que não é data, operação nem valor
    // coluna que começa com a operação é descartada inteira (evita sobras como "via chave")
    const cols = fonte.flatMap(f => f.split(/\t| {2,}/));
    const pedacos = cols.filter(x => !(op && cols.length > 1 && normTxt(x.trim()).startsWith(normTxt(op))))
      .map(x => tirarOp(x, op).replace(RE_DATA, "").replace(/\s+/g, " ").trim()).filter(x => x && !RE_LIXO.test(x));
    const nome = pedacos.join(" ").trim();
    const sinal = vm[1] || vm[2] || "";
    const saida = sinal ? /[\-−]/.test(sinal) : /enviad|pago|fatura|pagamento enviado|qr code|tarifa|d[eé]bito/i.test(op);
    itens.push({ data, tipo: saida ? "S" : "E", operacao: op || "Outro", nome: limparNome2(nome || op), cnpj: "", valor: brl2n(vm[3]) });
  }
  return { itens, saldos };
}
// "Hoje - 16/11/2026" e "Ontem - ..." aparecem na tela da Cora no lugar da data
function limparNome2(n) { return limparNome(String(n || "").replace(/\b(hoje|ontem)\s*-?\s*/gi, " ")).replace(/^\d{5,}\s+/, "").replace(/\s+\d{5,}$/, "").trim(); }

// Comparação de nomes para pacientes
const STOP = new Set(["de", "da", "do", "das", "dos", "e", "grupo", "gm", "superv", "neto", "junior", "filho", "ltda", "me"]);
function tkNome(s) { return tokens(String(s || "").replace(/\([^)]*\)?/g, " ")).filter(t => t.length > 1 && !STOP.has(t) && !/^\d+$/.test(t)); }
// 100 = nome igual; 50+ = primeiro nome e mais um nome batem; 30 = só o primeiro nome (cadastro com um nome só)
function scoreNome(pagador, ref) {
  const a = tkNome(pagador), b = tkNome(ref);
  if (!a.length || !b.length) return 0;
  if (a.join(" ") === b.join(" ")) return 100;
  if (a[0] !== b[0]) return 0;
  if (b.length === 1) return 30;
  const extra = b.slice(1).filter(t => a.includes(t)).length;
  return extra ? 50 + extra * 10 : 0;
}
function acharPaciente(pagador, pacs) {
  let best = null, sc = 0, empate = false;
  for (const p of pacs || []) {
    const s = Math.max(scoreNome(pagador, p.nome), ...(p.apelidos || []).map(a => scoreNome(pagador, a)));
    if (s > sc) { best = p; sc = s; empate = false; } else if (s === sc && s > 0) empate = true;
  }
  return best ? { p: best, score: sc, empate } : null;
}

// ----- Regras do cadastro -----
// Cada regra: { tipo: "E"|"S", contem: "trecho do nome", op: "trecho da operação", valor, min, max,
//   comecaNumero, cat, desc, revisar, fase: "antes"|"depois" }
// "antes" vale antes da busca de terapeutas e professores; "depois" só se a pessoa não for encontrada.
function regraBate(r, it) {
  if (!r || !r.cat) return false;
  if (r.tipo && r.tipo !== it.tipo) return false;
  if (!r.contem && !r.op) return false;
  const n = normTxt(it.nome), op = normTxt(it.operacao), v = +it.valor || 0;
  if (r.contem && !n.includes(normTxt(r.contem))) return false;
  if (r.op && !op.includes(normTxt(r.op))) return false;
  if (r.valor !== undefined && r.valor !== null && r.valor !== "" && +r.valor > 0 && Math.abs(v - +r.valor) >= 1) return false;
  if (r.min !== undefined && r.min !== null && r.min !== "" && v < +r.min) return false;
  if (r.max !== undefined && r.max !== null && r.max !== "" && v > +r.max) return false;
  if (r.comecaNumero && !/^\d/.test(n)) return false;
  return true;
}
function aplicarRegras(it, cad, fase) {
  for (const r of (cad && cad.regras) || []) {
    if ((r.fase || "antes") === fase && regraBate(r, it)) return { cat: r.cat, desc: r.desc || it.operacao || r.cat, revisar: !!r.revisar };
  }
  return null;
}
const GRUPO_E = { "Reembolsos": "reemb", "Formação AB": "formacao", "CFGM": "cfgm", "Clínica Social": "clinica", "GM / Cursos extras": "gm",
  "Link de cartão (Zoop)": "zoop", "Não identificado": "naoid" };

// Classificação das entradas. grupo define o bloco da conferência semanal.
function classificar(it, cad) {
  cad = cad || DEFAULT_CAD;
  const v = it.valor, n = normTxt(it.nome), op = normTxt(it.operacao);
  const R = (grupo, cat, desc, extra) => ({ grupo, cat, desc, revisar: false, pacId: "", aviso: "", ...extra });
  if (it.tipo !== "E") return { grupo: "saida", pacId: "", aviso: "", ...classificarSaida(it, cad) };
  if (n.includes("zoop")) return R("zoop", "Link de cartão (Zoop)", "Repasse maquininha / link de cartão");
  if (op.startsWith("devolucao")) return R("outros", "Outras entradas", it.operacao, { revisar: true });
  const pre = aplicarRegras(it, cad, "antes");
  if (pre) return R(GRUPO_E[pre.cat] || "outros", pre.cat, pre.desc, { revisar: pre.revisar });
  for (const a of cad.alunos || []) {
    if ((nomeBate(it.nome, a.nome) || scoreNome(it.nome, a.nome) >= 50) && Math.abs(v - a.valor) <= 2) return R("formacao", "Formação AB", a.meses && a.meses.length ? "Pagamento trimestral Formação AB" : "Mensalidade Formação AB");
  }
  if ([1018.5, 509.25].some(x => Math.abs(v - x) < 0.01)) return R("formacao", "Formação AB", "Mensalidade Formação AB", { aviso: "Aluno ainda não cadastrado na Formação" });
  for (const c of cad.cfgm || []) {
    if ((nomeBate(it.nome, c.nome) || scoreNome(it.nome, c.nome) >= 50) && v >= c.valor * 0.9 && v <= c.valor + 1) return R("cfgm", "CFGM", "Parcela CFGM (boleto)");
  }
  if (metodoDe(it.operacao) === "Boleto") return R("cfgm", "CFGM", "Parcela CFGM (boleto)", { revisar: true, aviso: "Boleto de alguém fora do cadastro do CFGM" });
  const m = acharPaciente(it.nome, cad.pacientes);
  const esp = m ? +m.p.valor || 0 : 0;
  // 35 a 70 é GM ou curso extra, a não ser que o paciente pague exatamente isso
  if (v >= 35 && v <= 70 && !(m && m.score >= 30 && Math.abs(v - esp) < 0.5)) {
    return R("gm", "GM / Cursos extras", "Grupo de movimento / curso extra", m && m.score >= 30 ? { aviso: `Nome parecido com ${m.p.nome}` } : {});
  }
  if (m && m.score >= 30) {
    let aviso = "", rev = m.score < 50 || m.empate;
    if (esp && Math.abs(v - esp) > 0.5) {
      const k = Math.round(v / esp * 100) / 100;
      // Múltiplo exato do valor = pagamento antecipado, dividido entre os meses seguintes
      if (Number.isInteger(k) && k > 1 && k <= 6 && !(m.score < 50 || m.empate)) {
        return R("clinica", "Clínica Social", "Paciente clínica social", { pacId: m.p.id, mult: k, aviso: `Pagamento antecipado de ${k} meses (${fmtBRL(esp)} cada)` });
      }
      aviso = `Valor esperado ${fmtBRL(esp)}`;
      rev = true;
    } else if (rev) aviso = "Nome parecido. Confirme o paciente";
    return R("clinica", "Clínica Social", "Paciente clínica social", { pacId: m.p.id, revisar: rev, aviso });
  }
  if (v >= 100 && v <= 250) return R("novo", "Clínica Social", "Possível paciente novo", { revisar: true, aviso: "Não está na lista de pacientes" });
  return R("naoid", "Não identificado", "Pagamento não identificado", { revisar: true });
}

// Saídas: regras do cadastro primeiro, depois repasse da clínica e professores
function classificarSaida(it, cad) {
  cad = cad || DEFAULT_CAD;
  const n = normTxt(it.nome), op = normTxt(it.operacao), dia = +String(it.data).slice(8, 10);
  const r = (cat, desc, revisar) => ({ cat, desc, revisar: !!revisar });
  if (op.startsWith("devolucao")) return r("Devolução", "Devolução Pix");
  const pre = aplicarRegras(it, cad, "antes"); if (pre) return pre;
  if (n.includes("darf")) return r("Imposto", "DARF");
  if (op.includes("fatura")) return r("Cartão de crédito", "Fatura cartão Cora");
  if (n.includes("mercado")) return r("Workshop", "Coffee break", true);
  const quem = lista => (lista || []).some(x => scoreNome(it.nome, x) >= 50);
  const terapeutas = [...new Set((cad.pacientes || []).map(p => p.terapeuta).filter(Boolean)), ...(cad.terapeutasExtra || [])];
  const [d1, d2] = cad.diaRepasse || [13, 15];
  const pessoa = !/ltda|mercado|scfi|intermediacao/.test(n) || quem(terapeutas) || quem(cad.profFormacao);
  if (dia >= d1 && dia <= d2 && pessoa && (quem(terapeutas) || quem(cad.profCfgm))) return r("Terapeutas", "Repasse terapeuta (clínica social)");
  if (quem(cad.profCfgm)) return r("Professores CFGM", "Pagamento professor CFGM");
  if (quem(cad.profFormacao)) return r("Professores Formação", "Pagamento professor Formação");
  const pos = aplicarRegras(it, cad, "depois"); if (pos) return pos;
  if (quem(terapeutas)) return r("Terapeutas", "Ajuste repasse terapeuta", true);
  return r("Outras saídas", it.operacao || "Saída não identificada", true);
}

// Destino inicial na conferência
function destIni(c) { return c.grupo === "clinica" ? "p:" + c.pacId : c.grupo === "novo" ? "pend" : "cat:" + c.cat; }

if (typeof module !== "undefined") module.exports = { CATS, GRUPO_S, DEFAULT_CAD, parseExtrato, classificar, classificarSaida, regraBate, destIni, compDe, acharPaciente, scoreNome, metodoDe, nomeBate, normTxt };
