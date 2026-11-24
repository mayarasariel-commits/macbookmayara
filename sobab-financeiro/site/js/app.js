// ================= Estado =================
// db: Firestore (compat). Os dados só carregam depois do login (ver acesso.js).
let db = null, meId = null, PAPEL = "", canWrite = false, canApprove = false, USERS = {};
const imgOK = false; // leitura de prints por IA só existia dentro do Claude
let L = [], MESES = {}, CAD = JSON.parse(JSON.stringify(DEFAULT_CAD));
let ready = { l: false, m: false, c: false };
const UI = { tab: "semana", mes: null, f: { tipo: "", cat: "", status: "", rev: false, nconc: false, q: "" }, imp: null, impBusy: false };
try { const s = JSON.parse(localStorage.getItem("sobab-ui3") || "{}"); if (s.tab) UI.tab = s.tab; if (s.mes) UI.mes = s.mes; } catch (e) {}
const $ = s => document.querySelector(s);
const fmt = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const R$ = v => fmt.format(v || 0);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const hoje = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const dBR = d => d ? d.slice(8, 10) + "/" + d.slice(5, 7) : "";
const MN = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const mesNome = m => MN[+m.slice(5) - 1] + "/" + m.slice(0, 4);
const addMes = (m, n) => { let y = +m.slice(0, 4), mo = +m.slice(5) - 1 + n; y += Math.floor(mo / 12); mo = ((mo % 12) + 12) % 12; return `${y}-${String(mo + 1).padStart(2, "0")}`; };
function toast(t) { const el = $("#toast"); el.textContent = t; el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => el.hidden = true, 3600); }
function saveUI() { try { localStorage.setItem("sobab-ui3", JSON.stringify({ tab: UI.tab, mes: UI.mes })); } catch (e) {} }

// ================= Cálculos =================
const doMes = m => L.filter(x => x.mes === m);
const sum = (a, f = () => true) => a.filter(f).reduce((s, x) => s + (+x.valor || 0), 0);
const sinal = x => x.tipo === "E" ? +x.valor : -x.valor;
function grupoS(c) { return GRUPO_S[c] || "Variáveis"; }
// ----- Contas bancárias -----
// Com CAD.contas preenchido, cada conta tem saldo próprio (conferido com o extrato dela)
// e o caixa da SOBAB é a soma das contas. Sem contas, vale o modo antigo de saldo único.
const contas = () => (CAD.contas && CAD.contas.length ? CAD.contas : null);
const contaDe = x => x.conta || "cora";
const nomeConta = id => { const c = (contas() || []).find(k => k.id === id); return c ? c.nome : id; };
const ehNeutro = x => NEUTRAS.has(x.cat);
const fimDoMes = m => `${m}-${String(new Date(+m.slice(0, 4), +m.slice(5), 0).getDate()).padStart(2, "0")}`;
const contaAtiva = () => { const cs = contas(); if (!cs) return "cora"; return (cs.find(c => !c.encerrada) || cs[cs.length - 1]).id; };
function saldoContaAte(id, dia) {
  const c = (contas() || []).find(k => k.id === id);
  return (c ? +c.saldoInicial || 0 : 0) + L.filter(x => contaDe(x) === id && x.status === "realizado" && x.data <= dia && (!c || !c.desde || x.data >= c.desde))
    .reduce((s, x) => s + sinal(x), 0);
}
const saldoContasAte = dia => contas().reduce((s, c) => s + saldoContaAte(c.id, dia), 0);
function saldoIni(m, guard = 0) {
  if (contas()) return saldoContasAte(fimDoMes(addMes(m, -1)));
  const md = MESES[m]; if (md && typeof md.saldoInicial === "number") return md.saldoInicial;
  if (guard > 36) return 0; const p = addMes(m, -1);
  const temAntes = Object.keys(MESES).some(k => k <= p) || L.some(x => x.mes <= p);
  return temAntes ? saldoFim(p, guard + 1) : 0;
}
function saldoFim(m, g = 0) { return contas() ? saldoContasAte(fimDoMes(m)) : saldoIni(m, g) + doMes(m).filter(x => x.status === "realizado").reduce((s, x) => s + sinal(x), 0); }
function saldoAte(m, dia) { return contas() ? saldoContasAte(dia) : saldoIni(m) + doMes(m).filter(x => x.status === "realizado" && x.data <= dia).reduce((s, x) => s + sinal(x), 0); }
// Saldo do dia informado pelo banco, por conta. O campo antigo saldosCora vale como conta "cora".
function saldosBanco(m) { const md = MESES[m] || {}; const o = { ...(md.saldosBanco || {}) }; if (md.saldosCora) o.cora = { ...md.saldosCora, ...(o.cora || {}) }; return o; }
// Contas com movimento ou saldo informado no mês
function contasDoMes(m) {
  const cs = contas(); if (!cs) return [];
  const sb = saldosBanco(m);
  return cs.filter(c => doMes(m).some(x => contaDe(x) === c.id) || Object.keys(sb[c.id] || {}).length);
}
function contaConc(m) { const us = contasDoMes(m); return ((us.find(c => c.id === UI.conta) || us.find(c => c.id === contaAtiva()) || us[0] || {}).id) || contaAtiva(); }
function meses() {
  const set = new Set([hoje().slice(0, 7), ...Object.keys(MESES), ...L.map(x => x.mes)]);
  if (UI.mes) set.add(UI.mes);
  const a = [...set].filter(Boolean).sort(); const out = []; let m = a[0]; while (m <= a[a.length - 1]) { out.push(m); m = addMes(m, 1); } return out;
}
function esperadoAluno(a, m) { const mo = +m.slice(5); if (a.meses && a.meses.length) return a.meses.includes(mo) ? a.valor : 0; return a.valor; }
function pagosDe(nome, cats, m) { return L.filter(x => (x.ref || x.mes) === m).filter(x => x.tipo === "E" && cats.includes(x.cat) && x.status === "realizado" && (nomeBate(x.pessoa, nome) || normTxt(x.pessoa).includes(normTxt(nome)) || scoreNome(x.pessoa, nome) >= 50)); }
function mensal(m) {
  const fo = (CAD.alunos || []).map(a => { const pg = pagosDe(a.nome, ["Formação AB"], m); const esp = esperadoAluno(a, m); const rec = sum(pg);
    return { nome: a.nome, esp, rec, datas: pg.map(p => dBR(p.data)).join(", "), st: esp === 0 ? (rec ? "pago" : "na") : rec >= esp - 1 ? "pago" : rec > 0 ? "parcial" : "aberto" }; });
  const cf = (CAD.cfgm || []).map(a => { const pg = pagosDe(a.nome, ["CFGM"], m); const rec = sum(pg);
    const antes = a.inicio && m < a.inicio;
    return { nome: a.nome, esp: antes ? 0 : a.valor, rec, datas: pg.map(p => dBR(p.data)).join(", "), st: antes ? (rec ? "pago" : "na") : rec >= a.valor * 0.95 ? "pago" : rec > 0 ? "parcial" : "aberto" }; });
  return { fo, cf };
}
// Conferência dia a dia de uma conta: saldo do sistema x saldo do banco
function diasConc(m, conta) {
  const multi = !!contas(); conta = multi ? (conta || contaConc(m)) : null;
  const real = doMes(m).filter(x => x.status === "realizado" && (!multi || contaDe(x) === conta));
  const ds = new Set(real.map(x => x.data));
  const sc = multi ? (saldosBanco(m)[conta] || {}) : ((MESES[m] && MESES[m].saldosCora) || {}); Object.keys(sc).forEach(d => ds.add(d));
  return [...ds].sort().reverse().map(d => { const its = real.filter(x => x.data === d);
    const sis = multi ? saldoContaAte(conta, d) : saldoAte(m, d); const cora = typeof sc[d] === "number" ? sc[d] : null;
    return { d, its, sis, cora, dif: cora === null ? null : Math.round((cora - sis) * 100) / 100, nc: its.filter(x => !x.conc).length }; });
}
const diasComDiferenca = m => (contas() ? contasDoMes(m).map(c => c.id) : [null]).reduce((n, c) => n + diasConc(m, c).filter(d => d.dif !== null && Math.abs(d.dif) >= 0.01).length, 0);
function pend(m) {
  const its = doMes(m);
  return { rev: its.filter(x => x.revisar).length,
    aprov: its.filter(x => x.tipo === "S" && x.status === "previsto" && x.aprov === "pendente").length,
    nconc: its.filter(x => x.status === "realizado" && !x.conc).length,
    dif: diasComDiferenca(m),
    abertos: mensal(m).fo.filter(a => a.st === "aberto" || a.st === "parcial").length + mensal(m).cf.filter(a => a.st !== "pago").length };
}
function clinica(m) { const b = L.filter(x => x.tipo === "E" && x.cat === "Clínica Social" && x.status === "realizado").reduce((s, x) => s + valorNaComp(x, m), 0); const p = CAD.clinica || { sobab: 10, poupanca: 5, terapeutas: 85 };
  const rep = sum(doMes(m), x => x.tipo === "S" && x.cat === "Terapeutas" && x.status === "realizado");
  return { bruto: b, sobab: b * p.sobab / 100, poup: b * p.poupanca / 100, ter: b * p.terapeutas / 100, rep, p }; }

// ================= Escrita =================
const semPermissao = e => e && (e.code === "permission-denied" || e.code === "unauthenticated");
async function W(id, patch, create) {
  if (!db) { toast("Sem conexão com o banco de dados."); return false; }
  try { const ref = db.collection("lanc").doc(id); if (create) await ref.set(patch); else await ref.update(patch); return true; }
  catch (e) { toast(semPermissao(e) ? "Seu acesso não permite fazer essa alteração." : "Não foi possível salvar. Confira a internet e tente de novo."); return false; }
}
async function WM(m, patch) {
  try { await db.collection("meses").doc(m).set({ ...(MESES[m] || {}), ...patch }); return true; }
  catch (e) { toast(semPermissao(e) ? "Seu acesso não permite alterar o mês." : "Não foi possível salvar o mês."); return false; }
}
// Saldo do dia do banco: por conta quando há várias contas, no campo antigo (saldosCora) quando há uma só
async function gravarSaldosBanco(m, conta, saldos) {
  if (!conta) return WM(m, { saldosCora: { ...((MESES[m] || {}).saldosCora || {}), ...saldos } });
  const sb = saldosBanco(m); return WM(m, { saldosBanco: { ...sb, [conta]: { ...(sb[conta] || {}), ...saldos } } });
}
async function gravarSaldoDia(m, conta, dia, v) {
  if (!conta) { const sc = { ...((MESES[m] || {}).saldosCora || {}) }; if (v === null) delete sc[dia]; else sc[dia] = v; return WM(m, { saldosCora: sc }); }
  const sb = saldosBanco(m), sc = { ...(sb[conta] || {}) }; if (v === null) delete sc[dia]; else sc[dia] = v;
  return WM(m, { saldosBanco: { ...sb, [conta]: sc } });
}
const novoId = () => "m" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

// ================= Abas por papel =================
// Quem só acompanha (diretoria e leitura) vê menos abas, com o Painel primeiro.
const TABS = [
  ["semana", "Conciliação", "edita"], ["clin", "Clínica Social <span class=\"badge\" id=\"bNi\" hidden></span>", "edita"],
  ["painel", "Painel", "todos"], ["pagar", "Contas a pagar <span class=\"badge\" id=\"bAprov\" hidden></span>", "todos"],
  ["rel", "Relatórios", "todos"], ["lanc", "Lançamentos <span class=\"badge\" id=\"bRev\" hidden></span>", "todos"],
  ["mens", "Mensalidades", "todos"], ["fech", "Fechamento", "todos"], ["cad", "Cadastros", "edita"], ["acessos", "Acessos", "admin"]
];
const ORDEM_LEITURA = ["painel", "pagar", "rel", "fech", "mens", "lanc"];
function podeVer(k) {
  const t = TABS.find(x => x[0] === k); if (!t) return false;
  return t[2] === "todos" || (t[2] === "edita" && canWrite) || (t[2] === "admin" && PAPEL === "admin");
}
function montarAbas() {
  const lista = canWrite ? TABS : ORDEM_LEITURA.map(k => TABS.find(t => t[0] === k));
  $("#tabs").innerHTML = lista.map(([k, t]) => `<button data-t="${k}" ${podeVer(k) ? "" : "hidden"}>${t}</button>`).join("");
  if (!podeVer(UI.tab)) UI.tab = canWrite ? "semana" : "painel";
}

// ================= Render =================
function render() {
  if (!db || !(ready.l && ready.m && ready.c)) return;
  const ms = meses(); if (!UI.mes || !ms.includes(UI.mes)) UI.mes = ms.includes(hoje().slice(0, 7)) ? hoje().slice(0, 7) : ms[ms.length - 1];
  const sel = $("#mes"); sel.innerHTML = ms.map(m => `<option value="${m}" ${m === UI.mes ? "selected" : ""}>${mesNome(m)}</option>`).join("");
  $("#contaDesc").textContent = CAD.conta || "Fluxo de caixa e conciliação";
  const p = pend(UI.mes); const bR = $("#bRev"), bA = $("#bAprov"), bN = $("#bNi");
  if (bR) { bR.hidden = !p.rev || !canWrite; bR.textContent = p.rev; }
  if (bN) { const nN = naoIdent(UI.mes).length; bN.hidden = !nN; bN.textContent = nN; }
  if (bA) { bA.hidden = !p.aprov; bA.textContent = p.aprov; }
  document.querySelectorAll("#tabs button").forEach(b => b.setAttribute("aria-selected", b.dataset.t === UI.tab));
  const fn = { semana: vSemana, clin: vClin, rel: vRel, painel: vPainel, lanc: vLanc, conc: vSemana, pagar: vPagar, mens: vMens, fech: vFech, cad: vCad, acessos: vAcessos }[UI.tab] || vPainel;
  const y = window.scrollY; $("#app").innerHTML = `<section class="tab">${fn()}</section>`; window.scrollTo(0, y);
  afterRender(); resolveNames();
}
function chipSt(x) {
  if (x.status === "previsto") return x.tipo === "S" ? (x.aprov === "aprovado" ? '<span class="chip acc">Aprovado</span>' : x.aprov === "reprovado" ? '<span class="chip bad">Reprovado</span>' : '<span class="chip warn">Aguardando aprovação</span>') : '<span class="chip">Previsto</span>';
  return x.conc ? '<span class="chip ok">Conciliado</span>' : '<span class="chip warn">Não conciliado</span>';
}
function catOpts(tipo, cur) { return CATS[tipo].map(c => `<option ${c === cur ? "selected" : ""}>${esc(c)}</option>`).join(""); }

function vPainel() {
  const m = UI.mes, its = doMes(m), real = its.filter(x => x.status === "realizado");
  // Transferências entre contas e aplicações mexem no saldo, mas não são receita nem despesa
  const ini = saldoIni(m), e = sum(real, x => x.tipo === "E" && !ehNeutro(x)), s = sum(real, x => x.tipo === "S" && !ehNeutro(x));
  const nt = real.filter(ehNeutro).reduce((t, x) => t + sinal(x), 0), fim = ini + e - s + nt;
  const porConta = contasDoMes(m).length > 1 ? contasDoMes(m).map(c => `${c.nome} ${R$(saldoContaAte(c.id, fimDoMes(m) < hoje() ? fimDoMes(m) : hoje()))}`).join(" · ") : "";
  const prevS = sum(its, x => x.tipo === "S" && x.status === "previsto" && x.aprov !== "reprovado"), prevE = sum(its, x => x.tipo === "E" && x.status === "previsto");
  const p = pend(m), dc = diasConc(m), ult = dc.find(d => d.cora !== null);
  const byE = CATS.E.filter(c => !NEUTRAS.has(c)).map(c => [c, sum(real, x => x.tipo === "E" && x.cat === c)]).filter(x => x[1] > 0).sort((a, b) => b[1] - a[1]);
  const byS = ["Repasses", "Fixas", "Variáveis"].map(g => [g, sum(real, x => x.tipo === "S" && grupoS(x.cat) === g)]);
  const maxB = Math.max(1, ...byE.map(x => x[1]), ...byS.map(x => x[1]));
  const bar = (l, v, c) => `<div class="barrow"><span>${esc(l)}</span><div class="track"><div class="fill" style="width:${(v / maxB * 100).toFixed(1)}%;background:${c}"></div></div><span class="num">${R$(v)}</span></div>`;
  const pl = [];
  if (p.aprov && canApprove) pl.push(`<li><span><b>${p.aprov}</b> pagamentos aguardando aprovação da diretoria</span><button class="pri" data-go="pagar">Ver e aprovar</button></li>`);
  if (canWrite) {
    if (p.rev) pl.push(`<li><span><b>${p.rev}</b> lançamentos com categoria sugerida para revisar</span><button data-go="lanc" data-rev="1">Revisar</button></li>`);
    if (p.dif) pl.push(`<li><span><b>${p.dif}</b> dias com diferença entre sistema e banco</span><button data-go="conc">Conciliar</button></li>`);
    if (p.nconc) pl.push(`<li><span><b>${p.nconc}</b> lançamentos realizados ainda sem conferência no extrato</span><button data-go="lanc" data-nconc="1">Ver</button></li>`);
  }
  if (p.abertos) pl.push(`<li><span><b>${p.abertos}</b> mensalidades/parcelas em aberto no mês</span><button data-go="mens">Ver alunos</button></li>`);
  return `
  <div class="kpis">
    <div class="kpi"><span>Saldo inicial</span><b class="num">${R$(ini)}</b><em>${contas() ? "soma das contas" : MESES[m] && typeof MESES[m].saldoInicial === "number" ? "informado" : "herdado do mês anterior"}</em></div>
    <div class="kpi"><span>Entradas</span><b class="num in">${R$(e)}</b><em>${real.filter(x => x.tipo === "E" && !ehNeutro(x)).length} recebimentos</em></div>
    <div class="kpi"><span>Saídas</span><b class="num out">${R$(s)}</b><em>${real.filter(x => x.tipo === "S" && !ehNeutro(x)).length} pagamentos${Math.abs(nt) >= 0.01 ? ` · transferências ${R$(nt)}` : ""}</em></div>
    <div class="kpi"><span>Saldo atual</span><b class="num">${R$(fim)}</b><em>${porConta || (ult ? (Math.abs(ult.dif) < 0.01 ? "bate com o banco em " + dBR(ult.d) : "banco " + dBR(ult.d) + ": " + R$(ult.cora)) : "sem saldo do banco informado")}</em></div>
    <div class="kpi"><span>A pagar no mês</span><b class="num out">${R$(prevS)}</b><em>saldo projetado ${R$(fim + prevE - prevS)}</em></div>
  </div>
  <div class="panel"><div class="ph"><div><h2>${canWrite ? "Pendências" : "O que precisa da sua atenção"} em ${mesNome(m)}</h2><p>${canWrite ? "O que precisa de ação para o caixa ficar fechado e confiável." : "Aprovações e mensalidades em aberto no mês."}</p></div><button class="pri w" data-novo="1">Novo lançamento</button></div>
    ${pl.length ? `<ul class="list">${pl.join("")}</ul>` : '<div class="empty">Nenhuma pendência neste mês.</div>'}</div>
  <div class="panel"><div class="ph"><div><h2>Saldo dia a dia</h2><p>Saldo do caixa${contas() ? " (soma das contas)" : ""}; pontos marcam os dias com saldo do banco informado.</p></div></div>${chartSaldo(m)}</div>
  <div class="grid2">
    <div class="panel"><h3 style="margin-bottom:12px">Entradas por origem</h3><div class="bars">${byE.length ? byE.map(([c, v]) => bar(c, v, "var(--in)")).join("") : '<div class="empty">Sem entradas realizadas no mês.</div>'}</div></div>
    <div class="panel"><h3 style="margin-bottom:12px">Saídas por grupo</h3><div class="bars">${byS.map(([c, v]) => bar(c === "Repasses" ? "Terapeutas e professores" : c === "Fixas" ? "Despesas fixas" : "Despesas variáveis", v, "var(--out)")).join("")}</div></div>
  </div>`;
}
function chartSaldo(m) {
  const dias = [...new Set(doMes(m).filter(x => x.status === "realizado").map(x => x.data))].sort();
  if (dias.length < 2) return '<div class="empty">O gráfico aparece quando houver movimentação em pelo menos dois dias.</div>';
  const pts = [[m + "-01", saldoIni(m)], ...dias.map(d => [d, saldoAte(m, d)])];
  const cm = contasDoMes(m), sc = contas() ? (cm.length === 1 ? saldosBanco(m)[cm[0].id] || {} : {}) : (MESES[m] && MESES[m].saldosCora) || {};
  const vals = pts.map(p => p[1]); let lo = Math.min(...vals), hi = Math.max(...vals); const pad = (hi - lo) * .15 || 1000; lo -= pad; hi += pad;
  const W0 = 700, H0 = 150, l = 64, r = 8, t = 8, b = 22; const X = d => l + ((+d.slice(8)) - 1) / 30 * (W0 - l - r); const Y = v => t + (hi - v) / (hi - lo) * (H0 - t - b);
  let path = ""; pts.forEach((p, i) => { const x = X(p[0]), y = Y(p[1]); path += (i ? ` H${x.toFixed(1)} V${y.toFixed(1)}` : `M${x.toFixed(1)} ${y.toFixed(1)}`); });
  const last = pts[pts.length - 1]; const area = path + ` H${X(last[0]).toFixed(1)} V${H0 - b} H${l} Z`;
  const ticks = [lo + pad, (lo + hi) / 2, hi - pad].map(v => `<line x1="${l}" x2="${W0 - r}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--line)"/><text x="${l - 6}" y="${Y(v) + 4}" text-anchor="end">${(v / 1000).toFixed(1)}k</text>`).join("");
  const xt = [1, 8, 15, 22, 29].map(d => `<text x="${X(m + "-" + String(d).padStart(2, "0"))}" y="${H0 - 6}" text-anchor="middle">${String(d).padStart(2, "0")}</text>`).join("");
  const dots = Object.keys(sc).filter(d => d.startsWith(m)).map(d => `<circle cx="${X(d)}" cy="${Y(sc[d])}" r="3" fill="var(--surface)" stroke="var(--accent)" stroke-width="1.5"><title>${dBR(d)} Cora ${R$(sc[d])}</title></circle>`).join("");
  return `<svg class="chart" viewBox="0 0 ${W0} ${H0}" preserveAspectRatio="none" role="img" aria-label="Saldo diário de ${mesNome(m)}">${ticks}${xt}<path d="${area}" fill="var(--accent-soft)" opacity=".7"/><path d="${path}" fill="none" stroke="var(--accent)" stroke-width="2"/>${dots}<circle cx="${X(last[0])}" cy="${Y(last[1])}" r="4" fill="var(--accent)"/></svg>`;
}

function filtrados() {
  const f = UI.f, q = normTxt(f.q);
  return doMes(UI.mes).filter(x => (!f.tipo || x.tipo === f.tipo) && (!f.cat || x.cat === f.cat) && (!f.status || x.status === f.status) && (!f.rev || x.revisar) && (!f.nconc || (x.status === "realizado" && !x.conc))
    && (!q || normTxt(x.pessoa + " " + x.desc + " " + x.obs + " " + x.cat).includes(q))).sort((a, b) => b.data.localeCompare(a.data) || a.tipo.localeCompare(b.tipo));
}
function vLanc() {
  const f = UI.f, rows = filtrados(); const allCats = [...CATS.E, ...CATS.S];
  const e = sum(rows, x => x.tipo === "E"), s = sum(rows, x => x.tipo === "S"); const nrev = rows.filter(x => x.revisar).length;
  return `<div class="panel"><div class="ph"><div><h2>Lançamentos de ${mesNome(UI.mes)}</h2><p>${canWrite ? "Troque a categoria direto na tabela. A faixa amarela marca categoria sugerida automaticamente." : "Todas as entradas e saídas do mês."}</p></div>
   <div style="display:flex;gap:8px;flex-wrap:wrap">${nrev && canWrite ? `<button class="w" id="okAll">Confirmar ${nrev} sugestões filtradas</button>` : ""}<button class="pri w" data-novo="1">Novo lançamento</button></div></div>
  <div class="filters">
    <label class="f">Tipo<select id="fTipo"><option value="">Todos</option><option value="E" ${f.tipo === "E" ? "selected" : ""}>Entradas</option><option value="S" ${f.tipo === "S" ? "selected" : ""}>Saídas</option></select></label>
    <label class="f">Categoria<select id="fCat"><option value="">Todas</option>${allCats.map(c => `<option ${c === f.cat ? "selected" : ""}>${esc(c)}</option>`).join("")}</select></label>
    <label class="f">Situação<select id="fSt"><option value="">Todas</option><option value="realizado" ${f.status === "realizado" ? "selected" : ""}>Realizado</option><option value="previsto" ${f.status === "previsto" ? "selected" : ""}>Previsto</option></select></label>
    <label class="f">Buscar<input id="fQ" value="${esc(f.q)}" placeholder="Nome, descrição…"></label>
    <label class="f w" style="flex-direction:row;align-items:center;gap:6px"><input type="checkbox" id="fRev" ${f.rev ? "checked" : ""}> Só a revisar</label>
    <label class="f" style="flex-direction:row;align-items:center;gap:6px"><input type="checkbox" id="fNc" ${f.nconc ? "checked" : ""}> Só não conciliados</label>
  </div>
  <div class="tblwrap"><table><thead><tr><th>Data</th><th>Pessoa / descrição</th><th>Categoria</th><th>Situação</th><th class="r">Valor</th><th class="w"></th></tr></thead><tbody>
  ${rows.map(x => `<tr class="${x.revisar && canWrite ? "rev" : ""}"><td class="num">${dBR(x.data)}</td>
    <td><div class="who">${esc(x.pessoa || x.desc)}<small>${esc(x.pessoa ? x.desc : "")}${x.obs ? " · " + esc(x.obs) : ""}${contasDoMes(UI.mes).length > 1 ? " · " + esc(nomeConta(contaDe(x))) : ""}</small></div></td>
    <td>${canWrite ? `<select data-cat="${x.id}" aria-label="Categoria">${catOpts(x.tipo, x.cat)}</select>${x.revisar ? ` <button class="ghost w" data-ok="${x.id}" title="Confirmar categoria">✓</button>` : ""}` : esc(x.cat)}</td>
    <td>${chipSt(x)}</td><td class="r num ${x.tipo === "E" ? "in" : "out"}">${x.tipo === "E" ? "+" : "−"} ${R$(x.valor)}</td>
    <td class="w"><button class="ghost w" data-ed="${x.id}">Editar</button></td></tr>`).join("") || `<tr><td colspan="6" class="empty">Nenhum lançamento neste filtro.</td></tr>`}
  </tbody><tfoot><tr><td colspan="4">${rows.length} lançamentos</td><td class="r num">${R$(e - s)}</td><td class="w"></td></tr></tfoot></table></div></div>`;
}

function vConc() {
  const m = UI.mes, conta = contas() ? contaConc(m) : null, dc = diasConc(m, conta), imp = UI.imp, banco = conta ? nomeConta(conta) : "Cora";
  const iniRow = conta ? `Saldo da conta ${esc(banco)} no início do mês: <b class="num">${R$(saldoContaAte(conta, fimDoMes(addMes(m, -1))))}</b>` : `Saldo inicial do mês: <b class="num">${R$(saldoIni(m))}</b>`;
  const cm = contasDoMes(m), seletor = cm.length > 1 ? `<div class="filters fbar"><span class="flab">Conta</span><div class="seg" role="group" aria-label="Conta">${cm.map(c => `<button data-conta="${c.id}" aria-pressed="${c.id === conta}">${esc(c.nome)}</button>`).join("")}</div></div>` : "";
  return `<div class="panel"><div class="ph"><div><h2>Importar movimentação da Cora</h2><p>Cole o texto do extrato mensal. O sistema confere o que já está lançado e propõe o resto.</p></div></div>
    <div class="drop"><b>Texto do extrato (PDF da Cora)</b><textarea id="impTxt" placeholder="Abra o PDF do extrato, copie tudo (Ctrl+A, Ctrl+C) e cole aqui."></textarea><button class="pri w" id="impTxtGo">Conferir texto</button></div>
    ${imp ? vImp(imp) : ""}
  </div>
  <div class="panel"><div class="ph"><div><h2>Conciliação de ${mesNome(m)}</h2><p>${iniRow}. Informe o saldo do dia que aparece no extrato; a diferença tem que ficar em zero.</p></div></div>
    ${seletor}<div class="days">${dc.length ? dc.map(d => `<details class="day" ${UI.open === d.d ? "open" : ""} data-day="${d.d}"><summary>
      <b class="num">${dBR(d.d)}</b>
      <span class="who"><small>Sistema</small><span class="num">${R$(d.sis)}</span></span>
      <span class="who"><small>${esc(banco)}</small><input type="number" step="0.01" class="num w" data-sc="${d.d}" value="${d.cora ?? ""}" placeholder="saldo do dia" style="max-width:130px" aria-label="Saldo ${esc(banco)} em ${dBR(d.d)}"></span>
      <span>${d.dif === null ? '<span class="chip">Sem saldo do banco</span>' : Math.abs(d.dif) < 0.01 ? '<span class="chip ok">Bate</span>' : `<span class="chip bad">Diferença ${R$(d.dif)}</span>`}</span>
      <span>${d.nc ? `<span class="chip warn">${d.nc} a conferir</span>` : `<span class="chip ok">${d.its.length} conferidos</span>`}</span></summary>
      <div class="inner"><div class="tblwrap"><table><tbody>${d.its.map(x => `<tr><td><input type="checkbox" class="w" data-cc="${x.id}" ${x.conc ? "checked" : ""} aria-label="Conciliado"></td><td><div class="who">${esc(x.pessoa || x.desc)}<small>${esc(x.cat)}</small></div></td><td class="r num ${x.tipo === "E" ? "in" : "out"}">${x.tipo === "E" ? "+" : "−"} ${R$(x.valor)}</td></tr>`).join("") || '<tr><td class="empty">Sem lançamentos realizados neste dia.</td></tr>'}</tbody></table></div></div></details>`).join("") : '<div class="empty">Ainda não há movimentação neste mês. Importe o extrato ou registre um lançamento.</div>'}</div>
  </div>`;
}
function vImp(imp) {
  const n = { conc: 0, prev: 0, novo: 0, ja: 0 }; imp.itens.forEach(i => n[i.acao]++);
  const lab = { conc: '<span class="chip acc">Conciliar</span>', prev: '<span class="chip acc">Baixar previsto</span>', novo: '<span class="chip warn">Novo</span>', ja: '<span class="chip ok">Já conciliado</span>' };
  return `<div style="margin-top:16px"><div class="ph"><div><h3>Resultado da leitura</h3><p>${imp.itens.length} movimentos · ${n.novo} novos · ${n.conc + n.prev} já lançados para conferir · ${n.ja} já conciliados${Object.keys(imp.saldos).length ? ` · ${Object.keys(imp.saldos).length} saldos do dia` : ""}</p></div>
  <div style="display:flex;gap:8px"><button id="impCancel">Descartar</button><button class="pri w" id="impApply">Aplicar ${n.novo + n.conc + n.prev} movimentos</button></div></div>
  <div class="tblwrap"><table><thead><tr><th>Data</th><th>Movimento</th><th>Categoria</th><th>Ação</th><th class="r">Valor</th></tr></thead><tbody>
  ${imp.itens.map((i, k) => `<tr class="${i.acao === "novo" && i.revisar ? "rev" : ""}"><td class="num">${dBR(i.data)}</td><td><div class="who">${esc(i.nome)}<small>${esc(i.operacao)}</small></div></td>
   <td>${i.acao === "novo" ? `<select data-ic="${k}">${catOpts(i.tipo, i.cat)}</select>` : esc(i.match ? i.match.cat : "")}</td><td>${lab[i.acao]}</td><td class="r num ${i.tipo === "E" ? "in" : "out"}">${i.tipo === "E" ? "+" : "−"} ${R$(i.valor)}</td></tr>`).join("")}
  </tbody></table></div></div>`;
}

function vPagar() {
  const m = UI.mes, its = doMes(m).filter(x => x.tipo === "S").sort((a, b) => (a.status === b.status ? 0 : a.status === "previsto" ? -1 : 1) || a.data.localeCompare(b.data));
  const prev = its.filter(x => x.status === "previsto"), pagas = its.filter(x => x.status === "realizado");
  const tot = sum(prev, x => x.aprov !== "reprovado");
  const valor = x => canWrite
    ? `<input type="number" step="0.01" class="num" data-vl="${x.id}" value="${x.valor || ""}" placeholder="definir" style="max-width:110px;text-align:right" aria-label="Valor">`
    : `<span class="num">${x.valor ? R$(x.valor) : "a definir"}</span>`;
  const row = x => `<tr><td class="num">${dBR(x.data)}</td><td><div class="who">${esc(x.desc)}<small>${esc(x.cat)}${x.pessoa ? " · " + esc(x.pessoa) : ""}${x.obs ? " · " + esc(x.obs) : ""}</small></div></td>
   <td class="r">${valor(x)}</td>
   <td>${chipSt(x)}${x.aprovPor ? `<div class="muted" style="font-size:.78rem">por <span data-name="${esc(x.aprovPor)}">…</span></div>` : ""}</td>
   <td class="acoes">${x.aprov !== "aprovado" ? `<button class="ap pri" data-ap="${x.id}">Aprovar</button> ` : ""}${x.aprov === "pendente" ? `<button class="ap" data-rp="${x.id}">Reprovar</button> ` : ""}<button class="${canWrite ? "pri" : ""} w" data-pg="${x.id}" ${x.aprov !== "aprovado" ? "disabled title='Aprove antes de pagar'" : ""}>Marcar pago</button></td></tr>`;
  return `<div class="panel"><div class="ph"><div><h2>Contas a pagar · ${mesNome(m)}</h2><p>${canWrite ? "A diretoria aprova, você paga e marca como pago. Depois a conciliação confere com o extrato." : "Confira cada conta e clique em Aprovar ou Reprovar. O financeiro só paga o que estiver aprovado."}</p></div>
   <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="w" id="genFix">Gerar contas fixas do mês</button><button class="pri w" data-novo="S">Nova conta ou repasse</button></div></div>
   <div class="tblwrap"><table><thead><tr><th>Venc.</th><th>Conta</th><th class="r">Valor</th><th>Aprovação</th><th></th></tr></thead><tbody>${prev.map(row).join("") || '<tr><td colspan="5" class="empty">Nenhuma conta prevista neste mês.</td></tr>'}</tbody>
   <tfoot><tr><td colspan="2">${prev.length} contas previstas</td><td class="r num">${R$(tot)}</td><td colspan="2"></td></tr></tfoot></table></div></div>
  <div class="panel"><div class="ph"><div><h2>Pagas no mês</h2><p>${pagas.length} pagamentos · ${R$(sum(pagas))}</p></div></div>
   <div class="tblwrap"><table><thead><tr><th>Data</th><th>Favorecido</th><th>Categoria</th><th class="r">Valor</th></tr></thead><tbody>
   ${pagas.map(x => `<tr class="${x.revisar && canWrite ? "rev" : ""}"><td class="num">${dBR(x.data)}</td><td><div class="who">${esc(x.pessoa || x.desc)}<small>${esc(x.pessoa ? x.desc : "")}</small></div></td><td>${esc(x.cat)}</td><td class="r num out">${R$(x.valor)}</td></tr>`).join("") || '<tr><td colspan="4" class="empty">Nenhum pagamento realizado ainda.</td></tr>'}</tbody></table></div></div>`;
}

function vMens() {
  const m = UI.mes, { fo, cf } = mensal(m);
  const st = { pago: '<span class="chip ok">Pago</span>', parcial: '<span class="chip warn">Parcial</span>', aberto: '<span class="chip bad">Em aberto</span>', na: '<span class="chip">Sem parcela no mês</span>' };
  const tb = (a, t) => `<div class="panel"><div class="ph"><div><h2>${t}</h2><p>Esperado ${R$(a.reduce((s, x) => s + x.esp, 0))} · recebido ${R$(a.reduce((s, x) => s + x.rec, 0))}</p></div></div>
   <div class="tblwrap"><table><thead><tr><th>Aluno</th><th class="r">Esperado</th><th class="r">Recebido</th><th>Data</th><th>Situação</th></tr></thead><tbody>
   ${a.map(x => `<tr><td>${esc(x.nome)}</td><td class="r num">${x.esp ? R$(x.esp) : "–"}</td><td class="r num">${x.rec ? R$(x.rec) : "–"}</td><td class="num">${x.datas || "–"}</td><td>${st[x.st]}</td></tr>`).join("") || '<tr><td colspan="5" class="empty">Nenhum aluno cadastrado.</td></tr>'}</tbody></table></div></div>`;
  return tb(fo, "Formação em Análise Bioenergética") + tb(cf, "CFGM · boletos parcelados") +
   `<p class="muted" style="margin:0">O pagamento conta para o aluno quando o lançamento está na categoria certa e o nome do pagador bate com o cadastro. Se um aluno pagou por outra pessoa, edite o lançamento e coloque o nome do aluno em “Pessoa”.</p>`;
}

function fech(m) {
  const its = doMes(m), real = its.filter(x => x.status === "realizado");
  // Transferências entre contas e aplicações ficam fora de entradas e despesas, numa linha própria
  const E = real.filter(x => x.tipo === "E" && !ehNeutro(x)), S = real.filter(x => x.tipo === "S" && !ehNeutro(x));
  const g = k => S.filter(x => grupoS(x.cat) === k);
  const nt = real.filter(ehNeutro).reduce((t, x) => t + sinal(x), 0);
  const ini = saldoIni(m), te = sum(E), fx = sum(g("Fixas")), vr = sum(g("Variáveis")), rp = sum(g("Repasses"));
  const fim = ini + te - fx - vr - rp + nt; const conta = contas() ? contaConc(m) : null; const dc = diasConc(m, conta); const lastC = dc.find(d => d.cora !== null);
  return { its, real, E, S, ini, te, fx, vr, rp, nt, fim, lastC, banco: conta ? nomeConta(conta) : "Cora", cl: clinica(m), byE: CATS.E.filter(c => !NEUTRAS.has(c)).map(c => [c, sum(E, x => x.cat === c)]).filter(x => x[1]),
    byS: CATS.S.filter(c => !NEUTRAS.has(c)).map(c => [c, grupoS(c), sum(S, x => x.cat === c)]).filter(x => x[2]), dc, mens: mensal(m) };
}
function vFech() {
  const m = UI.mes, F = fech(m); const md = MESES[m] || {};
  const li = (a, f) => a.map(f).join("");
  return `<div class="panel"><div class="ph"><div><h2>Fechamento de ${mesNome(m)}</h2><p>${md.fechado ? "Mês fechado. O saldo final já foi levado para o mês seguinte." : "Confira e baixe a planilha do mês."}</p></div>
   <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="pri" id="xMes">Baixar fechamento (.xlsx)</button><button id="xAll">Baixar base completa (.xlsx)</button>${md.fechado ? "" : `<button class="w" id="fechar">Fechar mês</button>`}</div></div>
   <div class="grid2"><div><h3 style="margin-bottom:10px">Resumo consolidado</h3><div class="resumo">
     <span>Saldo inicial</span><span class="num">${R$(F.ini)}</span>
     <span>(+) Entradas totais</span><span class="num in">${R$(F.te)}</span>
     <span>(−) Despesas fixas</span><span class="num out">${R$(F.fx)}</span>
     <span>(−) Despesas variáveis</span><span class="num out">${R$(F.vr)}</span>
     <span>(−) Terapeutas e professores</span><span class="num out">${R$(F.rp)}</span>
     ${Math.abs(F.nt) >= 0.01 ? `<span>(±) Transferências entre contas e aplicações</span><span class="num">${R$(F.nt)}</span>` : ""}
     <span class="tot">(=) Saldo final</span><span class="tot num">${R$(F.fim)}</span>
     <span>Saldo ${esc(F.banco)} ${F.lastC ? "em " + dBR(F.lastC.d) : ""}</span><span class="num">${F.lastC ? R$(F.lastC.cora) : "não informado"}</span>
     <span>Situação</span><span>${F.fim >= 0 ? '<span class="chip ok">Positivo</span>' : '<span class="chip bad">Negativo</span>'} ${F.lastC && Math.abs(F.lastC.dif) < 0.01 ? '<span class="chip ok">Conciliado</span>' : '<span class="chip warn">Conferir</span>'}</span>
   </div></div>
   <div><h3 style="margin-bottom:10px">Clínica Social</h3><div class="split">
     <div><span>Total bruto (pacientes)</span><b class="num">${R$(F.cl.bruto)}</b></div>
     <div><span>SOBAB (${F.cl.p.sobab}%)</span><b class="num">${R$(F.cl.sobab)}</b></div>
     <div><span>Poupança clínica (${F.cl.p.poupanca}%)</span><b class="num">${R$(F.cl.poup)}</b></div>
     <div><span>Terapeutas (${F.cl.p.terapeutas}%)</span><b class="num">${R$(F.cl.ter)}</b></div>
     <div><span>Repassado a terapeutas</span><b class="num">${R$(F.cl.rep)}</b></div>
   </div></div></div></div>
  <div class="grid2">
   <div class="panel"><h3 style="margin-bottom:10px">Entradas por categoria</h3><div class="tblwrap"><table><tbody>${li(F.byE, ([c, v]) => `<tr><td>${esc(c)}</td><td class="r num in">${R$(v)}</td></tr>`)}</tbody><tfoot><tr><td>Total</td><td class="r num">${R$(F.te)}</td></tr></tfoot></table></div></div>
   <div class="panel"><h3 style="margin-bottom:10px">Saídas por categoria</h3><div class="tblwrap"><table><tbody>${li(F.byS, ([c, gr, v]) => `<tr><td>${esc(c)} <span class="muted">· ${gr}</span></td><td class="r num out">${R$(v)}</td></tr>`)}</tbody><tfoot><tr><td>Total</td><td class="r num">${R$(F.fx + F.vr + F.rp)}</td></tr></tfoot></table></div></div>
  </div>`;
}

function vCad() {
  const md = MESES[UI.mes] || {};
  const al = (CAD.alunos || []).map((a, i) => `<tr><td><input data-a="${i}" data-k="nome" value="${esc(a.nome)}"></td><td><input type="number" step="0.01" data-a="${i}" data-k="valor" value="${a.valor}" style="max-width:110px"></td><td><input data-a="${i}" data-k="meses" value="${(a.meses || []).join(",")}" placeholder="todos" style="max-width:90px"></td><td><button class="ghost" data-rmv="alunos:${i}">Remover</button></td></tr>`).join("");
  const cf = (CAD.cfgm || []).map((a, i) => `<tr><td><input data-c="${i}" data-k="nome" value="${esc(a.nome)}"></td><td><input type="number" step="0.01" data-c="${i}" data-k="valor" value="${a.valor}" style="max-width:110px"></td><td><input type="month" data-c="${i}" data-k="inicio" value="${esc(a.inicio || "")}" style="min-width:130px"></td><td><button class="ghost" data-rmv="cfgm:${i}">Remover</button></td></tr>`).join("");
  const fx = (CAD.fixas || []).map((a, i) => `<tr><td><input type="number" min="1" max="31" data-x="${i}" data-k="dia" value="${a.dia}" style="max-width:60px"></td><td><input data-x="${i}" data-k="desc" value="${esc(a.desc)}"></td><td><select data-x="${i}" data-k="cat">${catOpts("S", a.cat)}</select></td><td><input type="number" step="0.01" data-x="${i}" data-k="valor" value="${a.valor || ""}" placeholder="variável" style="max-width:110px"></td><td><input data-x="${i}" data-k="obs" value="${esc(a.obs)}"></td><td><button class="ghost" data-rmv="fixas:${i}">Remover</button></td></tr>`).join("");
  const lst = k => esc((CAD[k] || []).join("; "));
  const rg = (CAD.regras || []).map((a, i) => `<tr>
    <td><select data-g="${i}" data-k="tipo"><option value="S" ${a.tipo !== "E" ? "selected" : ""}>Saída</option><option value="E" ${a.tipo === "E" ? "selected" : ""}>Entrada</option></select></td>
    <td><input data-g="${i}" data-k="contem" value="${esc(a.contem || "")}" placeholder="ex.: vivo"></td>
    <td><input type="number" step="0.01" data-g="${i}" data-k="valor" value="${a.valor ?? ""}" placeholder="qualquer" style="max-width:100px"></td>
    <td><select data-g="${i}" data-k="cat">${catOpts(a.tipo === "E" ? "E" : "S", a.cat)}</select></td>
    <td><input data-g="${i}" data-k="desc" value="${esc(a.desc || "")}"></td>
    <td><label style="display:flex;gap:4px;align-items:center"><input type="checkbox" data-g="${i}" data-k="revisar" ${a.revisar ? "checked" : ""}> conferir</label></td>
    <td><button class="ghost" data-rmv="regras:${i}">Remover</button></td></tr>`).join("");
  const p = CAD.clinica || {};
  const pp = (CAD.professores || []).map((a, i) => ({ a, i })).sort((x, y) => (y.a.mes || "").localeCompare(x.a.mes || "")).map(({ a, i }) => `<tr>
    <td><input type="month" data-pp="${i}" data-k="mes" value="${esc(a.mes || "")}" style="min-width:130px"></td><td><input data-pp="${i}" data-k="nome" value="${esc(a.nome || "")}"></td>
    <td><input data-pp="${i}" data-k="funcao" value="${esc(a.funcao || "")}" placeholder="Trainer, assistente…" style="max-width:140px"></td>
    <td><input type="number" step="0.01" data-pp="${i}" data-k="devido" value="${a.devido ?? ""}" style="max-width:120px"></td><td><button class="ghost" data-rmv="professores:${i}">Remover</button></td></tr>`).join("");
  const ct = (CAD.contas || []).map((c, i) => `<tr><td><input data-q="${i}" data-k="nome" value="${esc(c.nome)}" style="max-width:140px"></td>
    <td><input type="number" step="0.01" data-q="${i}" data-k="saldoInicial" value="${c.saldoInicial ?? 0}" style="max-width:130px"></td>
    <td><input type="date" data-q="${i}" data-k="desde" value="${esc(c.desde || "")}"></td><td><input type="date" data-q="${i}" data-k="encerrada" value="${esc(c.encerrada || "")}"></td>
    <td class="num">${R$(saldoContaAte(c.id, hoje()))}</td></tr>`).join("");
  return `${contas() ? `<div class="panel"><div class="ph"><div><h2>Contas bancárias</h2><p>Saldo inicial é o saldo da conta no dia anterior à data “Desde”. O caixa da SOBAB é a soma das contas.</p></div></div>
   <div class="tblwrap"><table><thead><tr><th>Conta</th><th>Saldo inicial</th><th>Desde</th><th>Encerrada em</th><th>Saldo hoje</th></tr></thead><tbody>${ct}</tbody></table></div></div>`
  : `<div class="panel"><div class="ph"><div><h2>Saldo inicial de ${mesNome(UI.mes)}</h2><p>Deixe em branco para herdar o saldo final do mês anterior.</p></div></div>
   <div class="filters"><label class="f">Saldo inicial (R$)<input type="number" step="0.01" id="cIni" value="${typeof md.saldoInicial === "number" ? md.saldoInicial : ""}" placeholder="${saldoIni(UI.mes).toFixed(2)}"></label><button class="pri w" id="cIniSave">Salvar saldo</button></div></div>`}
  <div class="panel"><div class="ph"><div><h2>Conta bancária</h2><p>Aparece embaixo do nome do sistema.</p></div></div>
   <div class="filters"><label class="f" style="flex:1">Descrição da conta<input id="cConta" value="${esc(CAD.conta || "")}" placeholder="Ex.: Conta Cora · Ag 0001 · CC 000000-0"></label></div></div>
  <div class="panel"><div class="ph"><div><h2>Alunos da Formação</h2><p>“Meses” só para quem paga em parcelas específicas (ex.: 1,6,11). Vazio = todo mês.</p></div><button class="w" data-aadd="alunos">Adicionar aluno</button></div>
   <div class="tblwrap"><table><thead><tr><th>Nome</th><th>Mensalidade</th><th>Meses</th><th></th></tr></thead><tbody>${al}</tbody></table></div></div>
  <div class="panel"><div class="ph"><div><h2>CFGM · boletos parcelados</h2><p>“Começa em” evita cobrar parcelas de antes da entrada do aluno.</p></div><button class="w" data-aadd="cfgm">Adicionar</button></div>
   <div class="tblwrap"><table><thead><tr><th>Nome</th><th>Parcela</th><th>Começa em</th><th></th></tr></thead><tbody>${cf}</tbody></table></div></div>
  <div class="panel"><div class="ph"><div><h2>Despesas fixas</h2><p>Base do botão “Gerar contas fixas do mês”.</p></div><button class="w" data-aadd="fixas">Adicionar conta</button></div>
   <div class="tblwrap"><table><thead><tr><th>Dia</th><th>Conta</th><th>Categoria</th><th>Valor</th><th>Observação</th><th></th></tr></thead><tbody>${fx}</tbody></table></div></div>
  <div class="panel"><div class="ph"><div><h2>Classificação automática por nome</h2><p>Quando o nome no extrato contém o texto, o lançamento já entra na categoria escolhida. Valor vazio vale para qualquer valor. As regras valem de cima para baixo.</p></div><button class="w" data-aadd="regras">Adicionar regra</button></div>
   <div class="tblwrap"><table><thead><tr><th>Tipo</th><th>Nome contém</th><th>Valor</th><th>Categoria</th><th>Descrição</th><th>Conferir</th><th></th></tr></thead><tbody>${rg || '<tr><td colspan="7" class="empty">Nenhuma regra cadastrada.</td></tr>'}</tbody></table></div></div>
  <div class="panel"><div class="ph"><div><h2>Professores e terapeutas</h2><p>Nomes separados por ponto e vírgula. Usados para reconhecer repasses e pagamentos de professores.</p></div></div>
   <div class="filters" style="flex-direction:column;align-items:stretch">
    <label class="f">Professores da Formação<textarea id="lProfF" class="lista">${lst("profFormacao")}</textarea></label>
    <label class="f">Professores do CFGM<textarea id="lProfC" class="lista">${lst("profCfgm")}</textarea></label>
    <label class="f">Terapeutas que não aparecem no cadastro de pacientes<textarea id="lTer" class="lista">${lst("terapeutasExtra")}</textarea></label>
    <label class="f">Dias do repasse aos terapeutas<span style="display:flex;gap:8px;align-items:center"><input type="number" id="dR1" min="1" max="31" value="${(CAD.diaRepasse || [13, 15])[0]}" style="max-width:80px"> a <input type="number" id="dR2" min="1" max="31" value="${(CAD.diaRepasse || [13, 15])[1]}" style="max-width:80px"></span></label>
   </div></div>
  <div class="panel"><div class="ph"><div><h2>Pagamento de professores</h2><p>Valor líquido devido a cada professor no mês. O relatório “Repasses e professores” compara com o que saiu da conta.</p></div><button class="w" data-aadd="professores">Adicionar</button></div>
   <div class="tblwrap"><table><thead><tr><th>Mês</th><th>Professor</th><th>Função</th><th>Devido (R$)</th><th></th></tr></thead><tbody>${pp || '<tr><td colspan="5" class="empty">Nenhum pagamento cadastrado.</td></tr>'}</tbody></table></div></div>
  <div class="panel"><div class="ph"><div><h2>Divisão da Clínica Social</h2></div></div>
   <div class="filters"><label class="f">SOBAB %<input type="number" id="pS" value="${p.sobab}" style="max-width:90px"></label><label class="f">Poupança %<input type="number" id="pP" value="${p.poupanca}" style="max-width:90px"></label><label class="f">Terapeutas %<input type="number" id="pT" value="${p.terapeutas}" style="max-width:90px"></label></div></div>
  <div class="salvarbar"><button class="pri w" id="cadSave">Salvar cadastros</button></div>`;
}

// ================= Interações =================
function afterRender() {
  document.body.classList.toggle("readonly", !canWrite);
  document.body.classList.toggle("noap", !canApprove);
  const on = (s, ev, fn) => { const el = $(s); if (el) el.addEventListener(ev, fn); };
  on("#fTipo", "change", e => { UI.f.tipo = e.target.value; render(); }); on("#fCat", "change", e => { UI.f.cat = e.target.value; render(); });
  on("#fSt", "change", e => { UI.f.status = e.target.value; render(); }); on("#fRev", "change", e => { UI.f.rev = e.target.checked; render(); });
  on("#fNc", "change", e => { UI.f.nconc = e.target.checked; render(); });
  on("#fQ", "input", e => { UI.f.q = e.target.value; clearTimeout(on.t); on.t = setTimeout(() => { render(); const q = $("#fQ"); if (q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); } }, 350); });
  on("#okAll", "click", async e => { e.target.disabled = true; const rs = filtrados().filter(x => x.revisar); for (const x of rs) await W(x.id, { revisar: false }); toast(rs.length + " categorias confirmadas"); });
  on("#impTxtGo", "click", lerTexto);
  on("#impCancel", "click", () => { UI.imp = null; render(); }); on("#impApply", "click", aplicarImp);
  on("#genFix", "click", gerarFixas); on("#xMes", "click", () => exportMes(UI.mes)); on("#xAll", "click", exportTudo);
  on("#fechar", "click", fecharMes); on("#cIniSave", "click", async () => { const v = $("#cIni").value; const r = await WM(UI.mes, { saldoInicial: v === "" ? null : +v }); if (r) toast("Saldo inicial salvo"); });
  on("#cadSave", "click", salvarCad);
  if (UI.tab === "acessos") afterAcessos();
}
document.addEventListener("click", async e => {
  const b = e.target.closest("button,[data-day]"); if (!b) return; const d = b.dataset;
  if (b.closest("#tabs") && d.t) { UI.tab = d.t; saveUI(); render(); window.scrollTo(0, 0); return; }
  if (d.go) { const alvo = d.go === "conc" ? "semana" : d.go; if (!podeVer(alvo)) return; UI.tab = alvo; if (d.rev) { UI.f = { ...UI.f, rev: true, nconc: false }; } if (d.nconc) { UI.f = { ...UI.f, nconc: true, rev: false }; } saveUI(); render(); window.scrollTo(0, 0); return; }
  if (d.conta) { UI.conta = d.conta; UI.open = null; render(); return; }
  if (d.novo) { abrir(null, d.novo === "S" ? "S" : "E", d.novo === "S"); return; }
  if (d.ed) { abrir(L.find(x => x.id === d.ed)); return; }
  if (d.ok) { await W(d.ok, { revisar: false }); return; }
  if (d.ap) { b.disabled = true; if (await W(d.ap, { aprov: "aprovado", aprovPor: meId || "", aprovEm: new Date().toISOString() })) toast("Pagamento aprovado"); else b.disabled = false; return; }
  if (d.rp) { b.disabled = true; if (await W(d.rp, { aprov: "reprovado", aprovPor: meId || "", aprovEm: new Date().toISOString() })) toast("Pagamento reprovado"); else b.disabled = false; return; }
  if (d.pg) { const x = L.find(y => y.id === d.pg); if (!x.valor) { toast("Informe o valor antes de marcar como pago."); return; }
    if (await W(d.pg, { status: "realizado", conc: false, pagoEm: hoje() })) toast("Marcado como pago. Confira depois na conciliação."); return; }
  if (d.aadd) { const k = d.aadd; lerCad(); const novo = k === "fixas" ? { dia: 1, desc: "", cat: "Outras saídas", metodo: "Pix", valor: 0, obs: "" } : k === "regras" ? { tipo: "S", contem: "", cat: "Outras saídas", desc: "", revisar: false } : k === "professores" ? { mes: UI.mes, nome: "", funcao: "Trainer", devido: 0 } : { nome: "", valor: 0, meses: [] };
    CAD[k] = [...(CAD[k] || []), novo]; render(); return; }
  if (d.rmv) { const [k, i] = d.rmv.split(":"); lerCad(); CAD[k].splice(+i, 1); render(); return; }
});
document.addEventListener("change", async e => {
  const t = e.target, d = t.dataset;
  if (t.id === "mes") { UI.mes = t.value; UI.imp = null; saveUI(); render(); return; }
  if (d.cat) { await W(d.cat, { cat: t.value, revisar: false }); return; }
  if (d.cc) { await W(d.cc, { conc: t.checked }); return; }
  if (d.vl) { await W(d.vl, { valor: +t.value || 0 }); return; }
  if (d.sc) { const v = t.value === "" ? null : +t.value; await gravarSaldoDia(UI.mes, contas() ? contaConc(UI.mes) : null, d.sc, v); return; }
  if (d.ic !== undefined && UI.imp) { UI.imp.itens[+d.ic].cat = t.value; UI.imp.itens[+d.ic].revisar = false; UI.imp.itens[+d.ic].dest = "cat:" + t.value; }
  if (d.g !== undefined && d.k === "tipo") { lerCad(); render(); }
});
document.addEventListener("toggle", e => { const el = e.target; if (el.dataset && el.dataset.day) { if (el.open) UI.open = el.dataset.day; else if (UI.open === el.dataset.day) UI.open = null; } }, true);
document.addEventListener("click", e => { if (e.target.matches("summary input")) e.preventDefault(); }, true);
$("#mPrev").onclick = () => { const ms = meses(), i = ms.indexOf(UI.mes); if (i > 0) { UI.mes = ms[i - 1]; saveUI(); render(); } };
$("#mNext").onclick = () => { const ms = meses(), i = ms.indexOf(UI.mes); if (i < ms.length - 1) { UI.mes = ms[i + 1]; saveUI(); render(); } };

// Formulário de lançamento
let edId = null;
function abrir(x, tipo, prev) {
  if (!canWrite) return;
  edId = x ? x.id : null; $("#dlgT").textContent = x ? "Editar lançamento" : "Novo lançamento";
  const tp = x ? x.tipo : tipo; $("#lTipo").value = tp; $("#lCat").innerHTML = catOpts(tp, x ? x.cat : CATS[tp][0]);
  $("#lData").value = x ? x.data : (UI.mes === hoje().slice(0, 7) ? hoje() : UI.mes + "-01"); $("#lValor").value = x ? x.valor : "";
  $("#lDesc").value = x ? x.desc : ""; $("#lPessoa").value = x ? x.pessoa : ""; $("#lMet").value = x ? x.metodo || "Pix" : "Pix";
  $("#lStatus").value = x ? x.status : (prev ? "previsto" : "realizado"); $("#lConc").value = x && x.conc ? "1" : "0"; $("#lObs").value = x ? x.obs || "" : "";
  const cs = contas(); $("#lContaBox").hidden = !cs;
  if (cs) { const cur = x ? contaDe(x) : contaAtiva(); $("#lConta").innerHTML = cs.map(c => `<option value="${esc(c.id)}" ${c.id === cur ? "selected" : ""}>${esc(c.nome)}</option>`).join(""); }
  $("#lDel").hidden = !x; $("#dlg").showModal();
}
$("#lTipo").onchange = e => { $("#lCat").innerHTML = catOpts(e.target.value); };
$("#lCancel").onclick = () => $("#dlg").close();
$("#lDel").onclick = async () => { const b = $("#lDel"); if (b.dataset.arm !== "1") { b.dataset.arm = "1"; b.textContent = "Confirmar exclusão"; return; }
  b.dataset.arm = ""; b.textContent = "Excluir"; try { await db.collection("lanc").doc(edId).delete(); $("#dlg").close(); toast("Lançamento excluído"); } catch (e) { toast("Não foi possível excluir."); } };
$("#fLanc").addEventListener("submit", async e => { e.preventDefault();
  const data = $("#lData").value, v = +$("#lValor").value; if (!data) { toast("Informe a data."); return; }
  const tipo = $("#lTipo").value, status = $("#lStatus").value, old = edId ? L.find(x => x.id === edId) : null;
  const o = { data, mes: data.slice(0, 7), tipo, cat: $("#lCat").value, desc: $("#lDesc").value.trim() || $("#lCat").value, pessoa: $("#lPessoa").value.trim(),
    valor: v, metodo: $("#lMet").value, status, ...(contas() ? { conta: $("#lConta").value } : {}), conc: $("#lConc").value === "1", obs: $("#lObs").value.trim(), revisar: false,
    aprov: tipo === "S" && status === "previsto" ? ((old && old.aprov) || "pendente") : (old ? old.aprov || "" : "") };
  const ok = edId ? await W(edId, o) : await W(novoId(), { ...o, origem: "manual", operacao: "", criadoEm: new Date().toISOString() }, true);
  if (ok) { $("#dlg").close(); toast(edId ? "Lançamento atualizado" : "Lançamento criado"); }
});

// ================= Importação =================
function casar(itens) {
  const usados = new Set(); const out = [];
  for (const it of itens) {
    const mesmos = L.filter(x => !usados.has(x.id) && x.tipo === it.tipo && Math.abs(x.valor - it.valor) < 0.01);
    let m = mesmos.find(x => x.status === "realizado" && x.data === it.data && x.conc && (!x.pessoa || nomeBate(it.nome, x.pessoa) || nomeBate(x.pessoa, it.nome) || normTxt(x.pessoa) === normTxt(it.nome)));
    let acao = "ja";
    if (!m) { m = mesmos.find(x => x.status === "realizado" && !x.conc && Math.abs(new Date(x.data) - new Date(it.data)) <= 3 * 864e5); acao = "conc"; }
    if (!m) { m = mesmos.find(x => x.status === "previsto" && Math.abs(new Date(x.data) - new Date(it.data)) <= 10 * 864e5); acao = "prev"; }
    if (m) usados.add(m.id);
    const c = classificar(it, CAD);
    const comp = m && m.comp ? m.comp : compDe(it.data, CAD.corte);
    out.push({ ...it, ...c, acao: m ? acao : "novo", match: m || null, dest: m ? (m.pacId ? "p:" + m.pacId : "cat:" + m.cat) : destIni(c), comp, comp0: comp });
  }
  return out;
}
function lerTexto() {
  const t = $("#impTxt").value; const r = parseExtrato(t);
  if (!r.itens.length) { toast("Não reconheci movimentos nesse texto. Use o botão Enviar o PDF do extrato."); return; }
  UI.imp = { itens: casar(r.itens), saldos: r.saldos }; render();
}
function lerPrints() { toast("Use o PDF do extrato ou cole o texto."); }

// ================= Contas fixas, cadastros, fechamento =================
async function gerarFixas() {
  const m = UI.mes; let n = 0;
  for (const [k, f] of (CAD.fixas || []).entries()) {
    const id = `fx-${m}-${String(k + 1).padStart(2, "0")}`; if (L.some(x => x.id === id)) continue;
    const dia = Math.min(f.dia, new Date(+m.slice(0, 4), +m.slice(5), 0).getDate());
    if (await W(id, { data: `${m}-${String(dia).padStart(2, "0")}`, mes: m, tipo: "S", cat: f.cat, desc: f.desc, pessoa: "", operacao: "", valor: +f.valor || 0, metodo: f.metodo || "Pix",
      conta: contaAtiva(), status: "previsto", conc: false, origem: "recorrente", revisar: false, aprov: "pendente", obs: (f.obs || "") + (+f.valor ? "" : (f.obs ? " · " : "") + "Valor a definir"), criadoEm: new Date().toISOString() }, true)) n++;
  }
  toast(n ? `${n} contas fixas criadas para ${mesNome(m)}` : "As contas fixas deste mês já foram geradas.");
}
const lista = s => String(s || "").split(/[;\n]+/).map(x => x.trim()).filter(Boolean);
function lerCad() {
  document.querySelectorAll("[data-a]").forEach(i => { const a = CAD.alunos[+i.dataset.a]; if (!a) return; const k = i.dataset.k; a[k] = k === "valor" ? +i.value || 0 : k === "meses" ? i.value.split(/[,; ]+/).map(Number).filter(n => n >= 1 && n <= 12) : i.value.trim(); });
  document.querySelectorAll("[data-c]").forEach(i => { const a = CAD.cfgm[+i.dataset.c]; if (!a) return; const k = i.dataset.k; if (k === "inicio") { if (i.value) a.inicio = i.value; else delete a.inicio; } else a[k] = k === "valor" ? +i.value || 0 : i.value.trim(); });
  document.querySelectorAll("[data-x]").forEach(i => { const a = CAD.fixas[+i.dataset.x]; if (!a) return; const k = i.dataset.k; a[k] = k === "valor" || k === "dia" ? +i.value || 0 : i.value.trim(); });
  document.querySelectorAll("[data-pp]").forEach(i => { const a = (CAD.professores || [])[+i.dataset.pp]; if (!a) return; const k = i.dataset.k; a[k] = k === "devido" ? +i.value || 0 : i.value.trim(); });
  document.querySelectorAll("[data-q]").forEach(i => { const c = (CAD.contas || [])[+i.dataset.q]; if (!c) return; const k = i.dataset.k;
    if (k === "saldoInicial") c.saldoInicial = +i.value || 0; else if (k === "encerrada" && !i.value) delete c.encerrada; else c[k] = i.value.trim(); });
  document.querySelectorAll("[data-g]").forEach(i => { const a = CAD.regras[+i.dataset.g]; if (!a) return; const k = i.dataset.k;
    if (k === "revisar") a.revisar = i.checked; else if (k === "valor") { if (i.value === "") delete a.valor; else a.valor = +i.value; } else a[k] = i.value.trim(); });
  const pS = $("#pS"); if (pS) CAD.clinica = { sobab: +pS.value || 0, poupanca: +$("#pP").value || 0, terapeutas: +$("#pT").value || 0 };
  const cc = $("#cConta"); if (cc) CAD.conta = cc.value.trim();
  if ($("#lProfF")) { CAD.profFormacao = lista($("#lProfF").value); CAD.profCfgm = lista($("#lProfC").value); CAD.terapeutasExtra = lista($("#lTer").value);
    CAD.diaRepasse = [Math.max(1, +$("#dR1").value || 13), Math.max(1, +$("#dR2").value || 15)]; }
}
async function salvarCad() { lerCad(); CAD.alunos = CAD.alunos.filter(a => a.nome); CAD.cfgm = CAD.cfgm.filter(a => a.nome); CAD.fixas = CAD.fixas.filter(a => a.desc);
  CAD.regras = (CAD.regras || []).filter(r => r.contem && r.cat); CAD.professores = (CAD.professores || []).filter(p => p.nome && p.mes);
  try { await db.doc("cad/geral").set(CAD); toast("Cadastros salvos"); } catch (e) { toast(semPermissao(e) ? "Seu acesso não permite alterar cadastros." : "Não foi possível salvar os cadastros."); } }
async function fecharMes() {
  const b = $("#fechar"); if (b.dataset.arm !== "1") { b.dataset.arm = "1"; b.textContent = "Confirmar: fechar " + mesNome(UI.mes); return; }
  const m = UI.mes, fim = saldoFim(m), nx = addMes(m, 1);
  if (await WM(m, { fechado: true, saldoFinal: fim, fechadoEm: new Date().toISOString() }) && await WM(nx, { saldoInicial: Math.round(fim * 100) / 100 })) toast(`${mesNome(m)} fechado. Saldo de ${R$(fim)} levado para ${mesNome(nx)}.`);
}

// ================= Exportação =================
const cur = '"R$" #,##0.00;[Red]-"R$" #,##0.00';
function sheet(rows, widths, moneyCols) {
  const ws = XLSX.utils.aoa_to_sheet(rows); ws["!cols"] = widths.map(w => ({ wch: w }));
  const rg = XLSX.utils.decode_range(ws["!ref"]);
  for (let r = 0; r <= rg.e.r; r++) for (const c of moneyCols) { const a = XLSX.utils.encode_cell({ r, c }); if (ws[a] && typeof ws[a].v === "number") ws[a].z = cur; }
  return ws;
}
const dFull = d => d ? d.slice(8, 10) + "/" + d.slice(5, 7) + "/" + d.slice(0, 4) : "";
function linhasLanc(a) { return [["Data", "Mês", "Conta", "Tipo", "Categoria", "Grupo", "Descrição", "Pessoa / favorecido", "Forma", "Situação", "Conciliado", "Aprovação", "Valor", "Observação"],
  ...a.sort((x, y) => x.data.localeCompare(y.data)).map(x => [dFull(x.data), x.mes, nomeConta(contaDe(x)), x.tipo === "E" ? "Entrada" : "Saída", x.cat, ehNeutro(x) ? "Transferências" : x.tipo === "E" ? "Receita" : grupoS(x.cat), x.desc, x.pessoa, x.metodo, x.status === "realizado" ? "Realizado" : "Previsto", x.conc ? "Sim" : "Não", x.aprov || "", +x.valor, x.obs || ""])]; }
function baixar(blob, nome) {
  const url = URL.createObjectURL(blob), a = document.createElement("a");
  a.href = url; a.download = nome; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
async function salvarArquivo(wb, nome) {
  try { const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" }); baixar(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), nome); }
  catch (e) { toast("Não foi possível gerar o arquivo."); }
}
async function exportMes(m) {
  const F = fech(m), wb = XLSX.utils.book_new();
  const res = [["SOBAB · Fechamento de caixa", ""], ["Mês", mesNome(m)], ["", ""], ["Saldo inicial", F.ini], ["(+) Entradas totais", F.te], ["(-) Despesas fixas", F.fx], ["(-) Despesas variáveis", F.vr], ["(-) Terapeutas e professores", F.rp], ...(Math.abs(F.nt) >= 0.01 ? [["(±) Transferências entre contas e aplicações", F.nt]] : []), ["(=) Saldo final", F.fim],
    ["Saldo " + F.banco + " " + (F.lastC ? dFull(F.lastC.d) : ""), F.lastC ? F.lastC.cora : "não informado"], ["Status", F.fim >= 0 ? "POSITIVO" : "NEGATIVO"], ["", ""], ["ENTRADAS POR CATEGORIA", ""], ...F.byE, ["", ""], ["SAÍDAS POR CATEGORIA", ""], ...F.byS.map(([c, g, v]) => [c + " (" + g + ")", v]),
    ["", ""], ["CLÍNICA SOCIAL", ""], ["Total bruto (pacientes)", F.cl.bruto], [`SOBAB (${F.cl.p.sobab}%)`, F.cl.sobab], [`Poupança clínica (${F.cl.p.poupanca}%)`, F.cl.poup], [`Terapeutas (${F.cl.p.terapeutas}%)`, F.cl.ter], ["Repassado a terapeutas", F.cl.rep]];
  XLSX.utils.book_append_sheet(wb, sheet(res, [38, 18], [1]), "Resumo");
  const ent = [["Data", "Descrição", "Pessoa", "Categoria", "Forma", "Conciliado", "Valor", "Observação"], ...F.E.sort((a, b) => a.data.localeCompare(b.data)).map(x => [dFull(x.data), x.desc, x.pessoa, x.cat, x.metodo, x.conc ? "Sim" : "Não", +x.valor, x.obs || ""]), ["", "", "", "", "", "TOTAL", F.te, ""]];
  XLSX.utils.book_append_sheet(wb, sheet(ent, [12, 28, 30, 20, 14, 11, 14, 30], [6]), "Entradas");
  for (const g of ["Fixas", "Variáveis", "Repasses"]) {
    const a = F.S.filter(x => grupoS(x.cat) === g).sort((x, y) => x.data.localeCompare(y.data));
    const r = [["Data", "Descrição", "Favorecido", "Categoria", "Forma", "Conciliado", "Valor", "Observação"], ...a.map(x => [dFull(x.data), x.desc, x.pessoa, x.cat, x.metodo, x.conc ? "Sim" : "Não", +x.valor, x.obs || ""]), ["", "", "", "", "", "TOTAL", sum(a), ""]];
    XLSX.utils.book_append_sheet(wb, sheet(r, [12, 28, 30, 20, 14, 11, 14, 30], [6]), g === "Fixas" ? "Despesas fixas" : g === "Variáveis" ? "Despesas variáveis" : "Terapeutas e professores");
  }
  const prev = F.its.filter(x => x.status === "previsto");
  if (prev.length) XLSX.utils.book_append_sheet(wb, sheet([["Vencimento", "Conta", "Categoria", "Tipo", "Aprovação", "Valor", "Observação"], ...prev.map(x => [dFull(x.data), x.desc, x.cat, x.tipo === "E" ? "Entrada" : "Saída", x.aprov || "", +x.valor, x.obs || ""])], [12, 28, 20, 10, 14, 14, 30], [5]), "Previstos em aberto");
  const cc = [["Data", "Saldo sistema", "Saldo Cora", "Diferença", "Lançamentos", "Não conciliados"], ...F.dc.slice().reverse().map(d => [dFull(d.d), d.sis, d.cora ?? "", d.dif ?? "", d.its.length, d.nc])];
  XLSX.utils.book_append_sheet(wb, sheet(cc, [12, 16, 16, 14, 12, 16], [1, 2, 3]), "Conciliação diária");
  const ms = [["Curso", "Aluno", "Esperado", "Recebido", "Data", "Situação"], ...F.mens.fo.map(a => ["Formação AB", a.nome, a.esp, a.rec, a.datas, a.st]), ...F.mens.cf.map(a => ["CFGM", a.nome, a.esp, a.rec, a.datas, a.st])];
  XLSX.utils.book_append_sheet(wb, sheet(ms, [14, 34, 14, 14, 16, 12], [2, 3]), "Mensalidades");
  await salvarArquivo(wb, `SOBAB_fechamento_${m}.xlsx`);
}
async function exportTudo() {
  let all = L.slice();
  try { const s = await db.collection("lanc").get(); all = s.docs.map(d => ({ id: d.id, ...d.data() })); } catch (e) { all = L.slice(); }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet(linhasLanc(all), [12, 9, 10, 9, 22, 13, 28, 30, 14, 11, 10, 11, 14, 30], [12]), "Lançamentos");
  const res = [["Mês", "Saldo inicial", "Entradas", "Despesas fixas", "Despesas variáveis", "Terapeutas e professores", "Saldo final"], ...meses().map(m => { const F = fech(m); return [mesNome(m), F.ini, F.te, F.fx, F.vr, F.rp, F.fim]; })];
  XLSX.utils.book_append_sheet(wb, sheet(res, [16, 15, 15, 15, 17, 22, 15], [1, 2, 3, 4, 5, 6]), "Resumo por mês");
  await salvarArquivo(wb, `SOBAB_caixa_base_completa_${hoje()}.xlsx`);
}

// ================= Nomes de quem aprovou =================
function resolveNames() {
  document.querySelectorAll("[data-name]").forEach(e => { const u = USERS[e.dataset.name]; e.textContent = e.dataset.name === meId ? "você" : (u && u.nome) || "diretoria"; });
}

// ================= Dados (depois do login) =================
// Carrega os últimos 24 meses em tempo real; meses mais antigos continuam no banco e saem na base completa.
let pararDados = [];
function iniciarDados() {
  pararDados.forEach(f => f()); pararDados = []; ready = { l: false, m: false, c: false };
  const desde = addMes(hoje().slice(0, 7), -24);
  const erro = k => e => { console.error(e); ready[k] = true; if (semPermissao(e)) toast("Seu acesso foi desativado. Fale com a administradora."); render(); };
  pararDados.push(db.collection("lanc").where("mes", ">=", desde).onSnapshot(s => { L = s.docs.map(d => ({ id: d.id, ...d.data() })); ready.l = true; atualizar(); }, erro("l")));
  pararDados.push(db.collection("meses").onSnapshot(s => { MESES = {}; s.docs.forEach(d => MESES[d.id] = d.data()); ready.m = true; atualizar(); }, erro("m")));
  pararDados.push(db.doc("cad/geral").onSnapshot(s => { CAD = { ...JSON.parse(JSON.stringify(DEFAULT_CAD)), ...(s.exists ? JSON.parse(JSON.stringify(s.data())) : {}) }; ready.c = true; render(); }, erro("c")));
  pararDados.push(db.collection("usuarios").onSnapshot(s => { USERS = {}; s.docs.forEach(d => USERS[d.id] = d.data()); if (UI.tab === "acessos") render(); else resolveNames(); }, () => {}));
}
// Lançamento novo chegando do banco redesenha a tela: guarda antes o que ainda não foi salvo nos cadastros
function atualizar() {
  if (UI.tab === "cad" && $("#cadSave")) lerCad();
  if (UI.tab === "clin" && $("#pSave")) lerPacs();
  render();
}
function pararTudo() { pararDados.forEach(f => f()); pararDados = []; L = []; MESES = {}; USERS = {}; CAD = JSON.parse(JSON.stringify(DEFAULT_CAD)); }
