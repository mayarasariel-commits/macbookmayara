// ================= Conciliação semanal, Clínica Social e Relatórios =================
const pacs = () => CAD.pacientes || [];
const pacPorId = id => pacs().find(p => p.id === id);
const compOf = x => x.comp || compDe(x.data, CAD.corte);
// Valor de um lançamento que cai numa competência (pagamento antecipado é dividido em parcelas)
function valorNaComp(x, m) {
  if (x.parcelas && x.parcelas.length) return x.parcelas.filter(p => p.comp === m).reduce((s, p) => s + (+p.valor || 0), 0);
  return compOf(x) === m ? +x.valor || 0 : 0;
}
const mesesDe = i => i.meses != null ? i.meses : (i.mult || 1);
function janela(m) {
  const c = +(CAD.corte || 15), prox = addMes(m, 1);
  return [`${m}-${String(c + 1).padStart(2, "0")}`, `${prox}-${String(c).padStart(2, "0")}`];
}
const ehDaClinicaSemPaciente = x => x.cat === "Clínica Social" && !x.pacId;
function naoIdent(m) {
  return L.filter(x => x.tipo === "E" && x.status === "realizado" && (x.cat === "Não identificado" || ehDaClinicaSemPaciente(x)) && compOf(x) === m)
    .sort((a, b) => a.data.localeCompare(b.data));
}
function jaConhece(nome, p) { return scoreNome(nome, p.nome) === 100 || (p.apelidos || []).some(a => scoreNome(nome, a) === 100); }
function titulo(s) {
  return String(s || "").toLowerCase().replace(/\s+/g, " ").trim().split(" ")
    .map(w => ["de", "da", "do", "das", "dos", "e"].includes(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}
const novoPacId = () => "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

// Resolve o destino escolhido: categoria, paciente e se o cadastro de pacientes mudou
function destino(i) {
  const d = i.dest || "";
  if (i.tipo === "S") return { cat: d.startsWith("cat:") ? d.slice(4) : i.cat, pacId: "", novoPac: false, mudou: false };
  if (d === "novo") {
    const p = { id: novoPacId(), nome: titulo(i.nome), terapeuta: "", valor: i.valor, apelidos: [i.nome] };
    CAD.pacientes = [...pacs(), p];
    return { cat: "Clínica Social", pacId: p.id, novoPac: false, mudou: true, criado: true };
  }
  if (d === "pend") return { cat: "Clínica Social", pacId: "", novoPac: true, mudou: false };
  if (d.startsWith("p:")) {
    const p = pacPorId(d.slice(2)); let mudou = false;
    if (p && i.nome && !jaConhece(i.nome, p)) { p.apelidos = [...(p.apelidos || []), i.nome]; mudou = true; }
    return { cat: "Clínica Social", pacId: p ? p.id : "", novoPac: !p, mudou };
  }
  return { cat: d.startsWith("cat:") ? d.slice(4) : i.cat, pacId: "", novoPac: false, mudou: false };
}

function destOpts(i) {
  const cur = i.dest;
  const o = (v, t) => `<option value="${esc(v)}" ${v === cur ? "selected" : ""}>${esc(t)}</option>`;
  if (i.tipo === "S") return CATS.S.map(c => o("cat:" + c, c)).join("");
  return `<optgroup label="Separar">${o("cat:Não identificado", "Não identificado (separar)")}${o("pend", "Possível paciente novo (decidir depois)")}${o("novo", "Cadastrar agora como paciente novo")}</optgroup>
    <optgroup label="Paciente da Clínica Social">${pacs().map(p => o("p:" + p.id, p.nome)).join("")}</optgroup>
    <optgroup label="Outras receitas">${CATS.E.filter(c => c !== "Clínica Social" && c !== "Não identificado").map(c => o("cat:" + c, c)).join("")}</optgroup>`;
}
const mesCurto = m => MN[+m.slice(5) - 1].slice(0, 3) + "/" + m.slice(2, 4);

// ---------- Aba: Conciliar semana ----------
const GRUPOS = [
  ["naoid", "Não identificados", "Escolha o paciente ou deixe separado.", "bad", true],
  ["novo", "Possíveis pacientes novos", "Entre R$ 100 e R$ 250, fora da lista de pacientes.", "warn", true],
  ["clinrev", "Clínica Social para conferir", "Paciente encontrado, mas valor ou nome pedem confirmação.", "warn", true],
  ["outros", "Outras entradas", "", "warn", true],
  ["clinica", "Clínica Social", "Pacientes identificados.", "ok", false],
  ["formacao", "Formação AB", "Mensalidades e pagamentos trimestrais.", "ok", false],
  ["cfgm", "CFGM", "Boletos do curso.", "ok", false],
  ["gm", "GM e cursos extras", "Pessoas cadastradas como GM.", "ok", false],
  ["aula", "Aulas abertas", "Inscrições de R$ 100 ou R$ 120.", "ok", false],
  ["inter", "Intervisão", "Entre R$ 20 e R$ 70, sem cadastro.", "ok", false],
  ["anuid", "Anuidades", "", "ok", false],
  ["consult", "Consultório", "Rateio de secretária e despesas do consultório.", "ok", false],
  ["transf", "Transferências e aplicações", "Dinheiro mudando de conta: não é receita nem despesa.", "ok", false],
  ["zoop", "Maquininha e link de cartão", "", "ok", false],
  ["reemb", "Reembolsos", "Parcelamento (Jose Carlos) e contas compartilhadas.", "ok", false],
  ["saida", "Saídas", "", "ok", false]
];
const grupoDe = i => (i.grupo === "clinica" && i.revisar) ? "clinrev" : (i.grupo === "cfgm" && i.revisar) ? "outros" : (i.grupo || (i.tipo === "S" ? "saida" : "outros"));

function linhaImp(i, k) {
  const p = (i.dest || "").startsWith("p:") ? pacPorId(i.dest.slice(2)) : null;
  const lembra = p && i.nome && !jaConhece(i.nome, p);
  const ehClin = i.tipo === "E" && (p || i.dest === "novo" || i.dest === "pend");
  const comps = [-1, 0, 1].map(n => addMes(i.comp0, n));
  return `<tr class="${i.revisar ? "rev" : ""}"><td class="num">${dBR(i.data)}</td>
    <td><div class="who">${esc(i.nome || i.desc)}<small>${esc(i.operacao)}${i.aviso ? ` · <span class="${i.revisar ? "warnt" : ""}">${esc(i.aviso)}</span>` : ""}${lembra ? ` · da próxima vez já vai reconhecer como ${esc(p.nome)}` : ""}</small></div></td>
    <td><select data-sd="${k}" aria-label="Destino">${destOpts(i)}</select></td>
    <td>${ehClin ? `<select data-scp="${k}" aria-label="Competência">${comps.map(m => `<option value="${m}" ${m === i.comp ? "selected" : ""}>${mesCurto(m)}</option>`).join("")}</select>${p ? ` <select data-sme="${k}" aria-label="Meses pagos">${[1, 2, 3, 4, 5, 6].map(n => `<option value="${n}" ${n === mesesDe(i) ? "selected" : ""}>${n === 1 ? "1 mês" : n + " meses"}</option>`).join("")}</select>` : ""}` : '<span class="muted">–</span>'}</td>
    <td class="r num ${i.tipo === "E" ? "in" : "out"}">${i.tipo === "E" ? "+" : "−"} ${R$(i.valor)}</td></tr>`;
}

function vSemana() {
  const imp = UI.imp;
  if (imp) return `<div class="panel"><div class="ph"><div><h2>Conferência da semana</h2><p>Tudo já veio separado. Confira só os blocos abertos, ajuste o destino se precisar e salve.</p></div></div>${vSemRes(imp)}</div>`;
  return `<div class="panel"><div class="ph"><div><h2>Conciliação</h2><p>Uma vez por semana: envie o PDF do extrato da Cora ou cole as movimentações. O sistema separa tudo sozinho.</p></div></div>
    <ol class="passos"><li>Na Cora, baixe o PDF do extrato da semana ou copie a lista de movimentações.</li><li>Envie o PDF pelo botão ou cole o texto no campo abaixo.</li><li>Confira os blocos em amarelo e vermelho e clique em Salvar.</li></ol>
    <textarea id="impTxt" class="big" placeholder="Cole aqui o extrato da semana"></textarea>
    <div class="acts2"><label class="btn w" style="cursor:pointer">${UI.pdfBusy ? "Lendo o PDF…" : "Enviar o PDF do extrato"}<input type="file" id="impPdf" accept="application/pdf,.pdf" hidden></label>${imgOK ? `<label class="btn w" style="cursor:pointer">${UI.impBusy ? "Lendo os prints…" : "Enviar prints"}<input type="file" id="impImg" accept="image/*" multiple hidden></label>` : ""}<button class="pri w" id="impTxtGo">Conciliar texto colado</button></div>
    ${UI.lastRes ? vUltimo(UI.lastRes) : ""}</div>
    ${painelSaldosDia()}`;
}
// Saldo dia a dia (antiga aba Conciliação diária), agora dentro da aba Conciliação
function painelSaldosDia() {
  const h = vConc(), i = h.indexOf('<div class="panel"><div class="ph"><div><h2>Conciliação de');
  return i < 0 ? "" : h.slice(i);
}
function vSemRes(imp) {
  const its = imp.itens.map((i, k) => ({ i, k }));
  const ja = its.filter(x => x.i.acao === "ja"), ativos = its.filter(x => x.i.acao !== "ja");
  const E = ativos.filter(x => x.i.tipo === "E"), S = ativos.filter(x => x.i.tipo === "S");
  const conf = ativos.filter(x => ["naoid", "novo", "clinrev", "outros"].includes(grupoDe(x.i))).length;
  const blocos = GRUPOS.map(([g, t, d, tom, abre]) => {
    const a = ativos.filter(x => grupoDe(x.i) === g); if (!a.length) return "";
    const tot = a.reduce((s, x) => s + x.i.valor, 0);
    return `<details class="grp" ${abre ? "open" : ""}><summary><span class="chip ${tom}">${a.length}</span><b>${t}</b>${d ? `<span class="muted">${esc(d)}</span>` : ""}<span class="num">${R$(tot)}</span></summary>
      <div class="tblwrap"><table><thead><tr><th>Data</th><th>Quem pagou</th><th>Destino</th><th>Competência</th><th class="r">Valor</th></tr></thead><tbody>${a.map(x => linhaImp(x.i, x.k)).join("")}</tbody></table></div></details>`;
  }).join("");
  return `<div class="kpis"><div class="kpi"><span>Movimentos novos</span><b class="num">${ativos.length}</b><em>${ja.length ? ja.length + " já estavam lançados" : "nenhum repetido"}</em></div>
    <div class="kpi"><span>Entradas</span><b class="num in">${R$(E.reduce((s, x) => s + x.i.valor, 0))}</b><em>${E.length} recebimentos</em></div>
    <div class="kpi"><span>Saídas</span><b class="num out">${R$(S.reduce((s, x) => s + x.i.valor, 0))}</b><em>${S.length} pagamentos</em></div>
    <div class="kpi"><span>Para você conferir</span><b class="num">${conf}</b><em>blocos abertos abaixo</em></div></div>
    ${blocos || '<div class="empty">Todos os movimentos colados já estavam lançados.</div>'}
    <div class="acts2"><button id="impCancel">Descartar</button><button class="pri w" id="impApply" ${ativos.length ? "" : "disabled"}>Salvar conciliação</button></div>`;
}
function vUltimo(r) {
  return `<div class="okbox"><h3>Semana conciliada</h3><p>${r.n} movimentos salvos. Clínica Social: ${r.clin} pagamentos identificados${r.criados ? `, ${r.criados} pacientes cadastrados` : ""}${r.pend ? `, ${r.pend} possíveis pacientes novos separados` : ""}${r.naoid ? `, ${r.naoid} não identificados separados` : ""}${r.antecipados ? `, ${r.antecipados} pagamentos antecipados divididos entre os meses` : ""}.</p>
    <div class="acts2" style="justify-content:flex-start">${r.comps.map(m => `<button data-goclin="${m}">Ver Clínica Social de ${mesNome(m)}</button>`).join("")}<button class="ghost" id="semNova">Fechar aviso</button></div></div>`;
}

// Substitui a aplicação antiga: vale para esta aba e para a Conciliação diária
async function aplicarImp() {
  const imp = UI.imp; if (!imp) return;
  const b = $("#impApply"); if (b) { b.disabled = true; b.textContent = "Salvando…"; }
  const r = { n: 0, clin: 0, criados: 0, pend: 0, naoid: 0, comps: new Set() }; let cadMudou = false;
  for (const i of imp.itens) {
    if (i.acao === "ja") continue;
    const f = destino(i); if (f.mudou) cadMudou = true; if (f.criado) r.criados++;
    const clin = f.cat === "Clínica Social";
    const nm = clin && f.pacId ? mesesDe(i) : 1;
    const parcelas = nm > 1 ? Array.from({ length: nm }, (_, j) => ({ comp: addMes(i.comp, j), valor: Math.round(i.valor / nm * 100) / 100 })) : [];
    const base = { cat: f.cat, pacId: f.pacId || "", novoPac: !!f.novoPac, comp: clin ? i.comp : "", parcelas, revisar: false };
    let ok = false;
    if (i.acao === "conc") ok = await W(i.match.id, { conc: true, ...base });
    else if (i.acao === "prev") ok = await W(i.match.id, { status: "realizado", conc: true, data: i.data, mes: i.data.slice(0, 7), pessoa: i.match.pessoa || i.nome, pagoEm: i.data, ...base });
    else ok = await W(novoId(), { data: i.data, mes: i.data.slice(0, 7), tipo: i.tipo, desc: f.criado ? "Paciente clínica social" : i.desc, pessoa: i.nome, operacao: i.operacao, valor: i.valor,
      metodo: metodoDe(i.operacao), status: "realizado", conc: true, origem: "importacao", aprov: "", obs: i.aviso || "", criadoEm: new Date().toISOString(),
      ...(contas() ? { conta: contaConc(i.data.slice(0, 7)) } : {}), ...base }, true);
    if (!ok) continue;
    r.n++;
    if (clin) { r.comps.add(i.comp); if (f.pacId) r.clin++; else r.pend++; }
    if (nm > 1) r.antecipados = (r.antecipados || 0) + 1;
    if (f.cat === "Não identificado") { r.naoid++; r.comps.add(compDe(i.data, CAD.corte)); }
  }
  const porMes = {}; Object.entries(imp.saldos || {}).forEach(([d, v]) => { (porMes[d.slice(0, 7)] = porMes[d.slice(0, 7)] || {})[d] = v; });
  for (const [m, sc] of Object.entries(porMes)) await gravarSaldosBanco(m, contas() ? contaConc(m) : null, sc);
  if (cadMudou) await salvarPacs(true);
  UI.imp = null; UI.lastRes = { ...r, comps: [...r.comps].sort() };
  toast(r.n + " movimentos salvos"); render();
}

// ---------- Aba: Clínica Social ----------
// Filtro por situação: pagos inclui quem pagou valor diferente; não pagos é quem não pagou nada
// "Todos" mostra só quem está ativo no mês; cancelados ficam no filtro próprio
const filtraSit = (lin, f) => lin.filter(x => f === "todos" ? x.st !== "canc" : f === "pagos" ? (x.st === "ok" || x.st === "dif") : x.st === f);
const ST_CLIN = { ok: "Pago", dif: "Valor diferente", sem: "Não pago", canc: "Cancelado" };
const TIT_F = { todos: "Pacientes", pagos: "Pacientes pagos", sem: "Pacientes não pagos", dif: "Pacientes com valor diferente", canc: "Pacientes cancelados" };
function linhasClin(m) {
  return pacs().map(p => {
    const pg = L.filter(x => x.tipo === "E" && x.status === "realizado" && x.cat === "Clínica Social" && x.pacId === p.id && valorNaComp(x, m) > 0).sort((a, b) => a.data.localeCompare(b.data));
    const rec = pg.reduce((s, x) => s + valorNaComp(x, m), 0), esp = +p.valor || 0;
    // fim = último mês de atendimento (paciente cancelado); inicio = primeiro mês
    const fora = (p.fim && m > p.fim) || (p.inicio && m < p.inicio);
    const st = fora && !rec ? "canc" : !rec ? "sem" : (!esp || Math.abs(rec - esp) < 0.5) ? "ok" : "dif";
    return { p, pg, rec, esp, st };
  });
}
function vClin() {
  const m = UI.mes, [ini, fim] = janela(m), lin = linhasClin(m), ni = naoIdent(m), cl = clinica(m);
  const f = UI.cf || "todos", q = normTxt(UI.cq || "");
  const vis = filtraSit(lin, f).filter(x => !q || normTxt(x.p.nome + " " + (x.p.terapeuta || "")).includes(q));
  const nPag = lin.filter(x => x.st === "ok" || x.st === "dif").length, nSem = lin.filter(x => x.st === "sem").length, nDif = lin.filter(x => x.st === "dif").length, nCanc = lin.filter(x => x.st === "canc").length;
  const stChip = { ok: '<span class="chip ok">Pago</span>', dif: '<span class="chip warn">Valor diferente</span>', sem: '<span class="chip bad">Sem pagamento</span>', canc: '<span class="chip">Cancelado</span>' };
  const seg = (k, t, n) => `<button data-cf="${k}" aria-pressed="${f === k}">${t} <span class="cnt">${n}</span></button>`;
  return `<div class="kpis">
    <div class="kpi"><span>Recebido de pacientes</span><b class="num in">${R$(cl.bruto)}</b><em>${dBR(ini)} a ${dBR(fim)}</em></div>
    <div class="kpi"><span>Pacientes pagos</span><b class="num">${nPag} de ${lin.length - nCanc}</b><em>${nSem} sem pagamento${nCanc ? ` · ${nCanc} cancelados` : ""}</em></div>
    <div class="kpi"><span>Para resolver</span><b class="num">${ni.length}</b><em>não identificados e possíveis novos</em></div>
    <div class="kpi"><span>Terapeutas (${cl.p.terapeutas}%)</span><b class="num">${R$(cl.ter)}</b><em>SOBAB ${R$(cl.sobab)} · poupança ${R$(cl.poup)}</em></div></div>
  ${ni.length ? `<div class="panel"><div class="ph"><div><h2>Para resolver em ${mesNome(m)}</h2><p>Pagamentos separados na conciliação. Ao escolher o paciente, o sistema aprende quem paga por ele.</p></div></div>
    <div class="tblwrap"><table><thead><tr><th>Data</th><th>Quem pagou</th><th>Situação</th><th>Destino</th><th class="r">Valor</th></tr></thead><tbody>
    ${ni.map(x => `<tr class="rev"><td class="num">${dBR(x.data)}</td><td><div class="who">${esc(x.pessoa || x.desc)}<small>${esc(x.operacao || "")}</small></div></td>
      <td>${x.cat === "Não identificado" ? '<span class="chip bad">Não identificado</span>' : '<span class="chip warn">Possível paciente novo</span>'}</td>
      <td><select data-nid="${x.id}" aria-label="Destino">${destOpts({ tipo: "E", dest: x.cat === "Não identificado" ? "cat:Não identificado" : "pend" })}</select></td>
      <td class="r num in">${R$(x.valor)}</td></tr>`).join("")}</tbody></table></div></div>` : ""}
  <div class="panel"><div class="ph"><div><h2>Clínica Social · competência ${mesNome(m)}</h2><p>Pagamentos de ${dBR(ini)} a ${dBR(fim)}, na mesma ordem da sua planilha.</p></div>
    <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="pri" id="clCopy">Copiar valores para a planilha</button><button id="clXlsx">Baixar .xlsx</button></div></div>
    <div class="filters fbar"><span class="flab">Filtrar</span><div class="seg" role="group" aria-label="Filtrar pacientes">${seg("todos", "Todos", lin.length)}${seg("pagos", "Pagos", nPag)}${seg("sem", "Não pagos", nSem)}${seg("dif", "Valor diferente", nDif)}${nCanc ? seg("canc", "Cancelados", nCanc) : ""}</div>
      <input type="search" id="clBusca" value="${esc(UI.cq || "")}" placeholder="Buscar paciente ou terapeuta" aria-label="Buscar paciente ou terapeuta"></div>
    <div class="tblwrap"><table><thead><tr><th>Paciente</th><th>Terapeuta</th><th class="r">Esperado</th><th class="r">Recebido</th><th>Data e quem pagou</th><th>Situação</th></tr></thead><tbody>
    ${vis.map(x => `<tr><td>${esc(x.p.nome)}</td><td class="muted">${esc(x.p.terapeuta || "")}</td><td class="r num">${x.esp ? R$(x.esp) : "–"}</td><td class="r num">${x.rec ? R$(x.rec) : "–"}</td>
      <td><div class="who">${x.pg.map(g => `<span>${dBR(g.data)} · ${R$(valorNaComp(g, m))}${g.parcelas && g.parcelas.length ? ` <small>antecipado ${g.parcelas.findIndex(q => q.comp === m) + 1}/${g.parcelas.length}</small>` : ""}${scoreNome(g.pessoa, x.p.nome) ? "" : ` <small>por ${esc(g.pessoa)}</small>`}</span>`).join("") || "–"}</div></td><td>${stChip[x.st]}</td></tr>`).join("") || '<tr><td colspan="6" class="empty">Nenhum paciente neste filtro.</td></tr>'}
    </tbody><tfoot><tr><td colspan="3">${vis.length} pacientes</td><td class="r num">${R$(vis.reduce((s, x) => s + x.rec, 0))}</td><td colspan="2"></td></tr></tfoot></table></div>
    <p class="muted" style="margin:10px 0 0;font-size:.82rem">O botão copia um valor por linha, na ordem do cadastro abaixo (vazio para quem não pagou). Clique na primeira célula do mês na planilha e cole.</p></div>
  <details class="panel" id="cadPac" ${UI.cadOpen ? "open" : ""}><summary style="cursor:pointer"><b>Cadastro de pacientes (${pacs().length})</b> <span class="muted">· nomes, terapeuta, valor e quem costuma pagar</span></summary>
    <div class="filters" style="margin-top:12px"><label class="f">Dia de corte<input type="number" min="1" max="28" id="pCorte" value="${+(CAD.corte || 15)}" style="max-width:90px"></label><span class="muted" style="font-size:.82rem;align-self:center">Pagamento até esse dia conta para o mês anterior.</span></div>
    <div class="tblwrap"><table><thead><tr><th>Paciente (como na planilha)</th><th>Terapeuta</th><th>Valor</th><th>Quem paga (outros nomes, separados por ;)</th><th>Saiu em</th><th></th></tr></thead><tbody>
    ${pacs().map((p, k) => `<tr><td><input class="pin" data-pk="${k}" data-pf="nome" value="${esc(p.nome)}"></td><td><input class="pin" data-pk="${k}" data-pf="terapeuta" value="${esc(p.terapeuta || "")}"></td>
      <td><input class="pin num" type="number" step="0.01" data-pk="${k}" data-pf="valor" value="${p.valor || ""}" style="max-width:100px"></td><td><input class="pin" data-pk="${k}" data-pf="apelidos" value="${esc((p.apelidos || []).join("; "))}"></td>
      <td><input class="pin" type="month" data-pk="${k}" data-pf="fim" value="${esc(p.fim || "")}" aria-label="Último mês de atendimento" title="Último mês de atendimento (paciente cancelado)" style="min-width:130px"></td>
      <td><button class="ghost w" data-prm="${k}">Remover</button></td></tr>`).join("")}</tbody></table></div>
    <div class="acts2"><button class="w" id="pAdd">Adicionar paciente</button><button class="pri w" id="pSave">Salvar pacientes</button></div></details>`;
}

function lerPacs() {
  document.querySelectorAll("[data-pk]").forEach(el => {
    const p = pacs()[+el.dataset.pk]; if (!p) return; const k = el.dataset.pf;
    p[k] = k === "valor" ? (+el.value || 0) : k === "apelidos" ? el.value.split(";").map(s => s.trim()).filter(Boolean) : el.value.trim();
  });
  const c = $("#pCorte"); if (c) CAD.corte = Math.min(28, Math.max(1, +c.value || 15));
}
async function salvarPacs(silencioso) {
  if (!silencioso) lerPacs();
  CAD.pacientes = pacs().filter(p => p.nome);
  try { await db.doc("cad/geral").set(CAD); if (!silencioso) toast("Pacientes salvos"); } catch (e) { toast(semPermissao(e) ? "Seu acesso não permite alterar pacientes." : "Não foi possível salvar os pacientes."); }
}
async function copiar(t, msg = "Copiado. Cole na primeira linha do mês na planilha.") {
  try { await navigator.clipboard.writeText(t); toast(msg); return; } catch (e) {}
  const ta = document.createElement("textarea"); ta.value = t; ta.style.position = "fixed"; ta.style.opacity = "0"; document.body.appendChild(ta); ta.select();
  let ok = false; try { ok = document.execCommand("copy"); } catch (e) {} ta.remove();
  toast(ok ? msg : "Não consegui copiar. Use o Baixar .xlsx.");
}
async function exportClin(m) {
  const lin = linhasClin(m), wb = XLSX.utils.book_new();
  const st = { ok: "Pago", dif: "Valor diferente", sem: "Sem pagamento" };
  const rows = [["Paciente", "Terapeuta", "Esperado", "Recebido", "Datas", "Quem pagou", "Situação"],
    ...lin.map(x => [x.p.nome, x.p.terapeuta || "", x.esp, x.rec || "", x.pg.map(g => dBR(g.data)).join(", "), [...new Set(x.pg.map(g => g.pessoa))].join(", "), st[x.st]])];
  XLSX.utils.book_append_sheet(wb, sheet(rows, [34, 24, 12, 12, 16, 34, 16], [2, 3]), "Clínica Social");
  const ni = naoIdent(m);
  XLSX.utils.book_append_sheet(wb, sheet([["Data", "Quem pagou", "Situação", "Valor"], ...ni.map(x => [dFull(x.data), x.pessoa, x.cat === "Não identificado" ? "Não identificado" : "Possível paciente novo", +x.valor])], [12, 36, 24, 12], [3]), "Para resolver");
  await salvarArquivo(wb, `SOBAB_clinica_social_${m}.xlsx`);
}

// ---------- Eventos ----------
document.addEventListener("toggle", e => { if (e.target.id === "cadPac") UI.cadOpen = e.target.open; }, true);
document.addEventListener("change", async e => {
  const t = e.target, d = t.dataset;
  if (d.sd !== undefined && UI.imp) { UI.imp.itens[+d.sd].dest = t.value; render(); return; }
  if (d.scp !== undefined && UI.imp) { UI.imp.itens[+d.scp].comp = t.value; return; }
  if (d.sme !== undefined && UI.imp) { UI.imp.itens[+d.sme].meses = +t.value; return; }
  if (t.id === "impImg" && UI.tab === "semana" && t.files && t.files.length) { lerPrints(); return; }
  if (d.nid) {
    const x = L.find(y => y.id === d.nid); if (!x) return;
    const f = destino({ tipo: "E", nome: x.pessoa, valor: x.valor, cat: x.cat, dest: t.value });
    const ok = await W(x.id, { cat: f.cat, pacId: f.pacId || "", novoPac: !!f.novoPac, comp: f.cat === "Clínica Social" ? compOf(x) : "", revisar: false });
    if (ok && f.mudou) await salvarPacs(true);
    if (ok) toast(f.pacId ? "Pagamento vinculado ao paciente" : "Destino atualizado");
  }
});
document.addEventListener("click", async e => {
  const b = e.target.closest("button"); if (!b) return; const d = b.dataset;
  if (d.goclin) { UI.mes = d.goclin; UI.tab = "clin"; saveUI(); render(); window.scrollTo(0, 0); return; }
  if (d.cf) { UI.cf = d.cf; render(); return; }
  if (d.prm !== undefined) { lerPacs(); CAD.pacientes.splice(+d.prm, 1); render(); return; }
  if (b.id === "semNova") { UI.lastRes = null; render(); return; }
  if (b.id === "pAdd") { lerPacs(); CAD.pacientes = [...pacs(), { id: novoPacId(), nome: "", terapeuta: "", valor: 0, apelidos: [] }]; render(); return; }
  if (b.id === "pSave") { await salvarPacs(); return; }
  if (b.id === "clCopy") { await copiar(linhasClin(UI.mes).map(x => x.rec ? R$(x.rec).replace(/ /g, " ") : "").join("\n")); return; }
  if (b.id === "clXlsx") { await exportClin(UI.mes); return; }
});

// ---------- Aba: Relatórios separados por receita ----------
const RELS = [["resumo", "Resumo do mês"], ["rep", "Repasses e professores"], ["clin", "Clínica Social"], ["form", "Formação AB"], ["cfgm", "CFGM"], ["gm", "GM e cursos extras"], ["zoop", "Maquininha"], ["reemb", "Reembolsos"], ["ni", "Não identificados"]];
const ST_MENS = { pago: "Pago", parcial: "Parcial", aberto: "Em aberto", na: "Sem parcela no mês" };
// Formação e CFGM usam o mês de referência (ref) quando a mensalidade foi paga em outro mês
const lancsCat = (cats, m) => L.filter(x => (x.ref || x.mes) === m).filter(x => x.tipo === "E" && x.status === "realizado" && cats.includes(x.cat)).sort((a, b) => a.data.localeCompare(b.data));
const tabPagamentos = (titulo, its) => ({ titulo, cols: ["Data", "Quem pagou", "Descrição", "Valor"], money: [3], total: true, rows: its.map(x => [dFull(x.data), x.pessoa || "", x.desc || "", +x.valor]) });

// ---------- Conferência de repasses: devido x pago ----------
// Terapeutas: a competência m (pagamentos de pacientes do dia 16 de m ao dia 15 de m+1) é repassada no mês seguinte.
const PCT = () => ((CAD.clinica || {}).terapeutas || 85) / 100;
// Também vale o nome entre parênteses do cadastro: "Ana (Maria Souza)" bate com quem recebe como Maria Souza
const mesmaPessoa = (pagou, nome) => [nome, ...((String(nome || "").match(/\(([^)]+)\)/) || []).slice(1))].some(n => { const sc = scoreNome(pagou, n); return sc >= 50 || (sc >= 30 && tkNome(n).length === 1); });
const situacao = dif => Math.abs(dif) < 1 ? "Conferido" : dif > 0 ? "Pago a menos" : "Pago a mais";
// Devido: "Total a receber" da planilha da clínica (CAD.repasses) quando existe; senão 85% do que os pacientes pagaram.
function conferenciaTerapeutas(comp) {
  const mesPg = addMes(comp, 1), porT = {}, planilha = (CAD.repasses || []).filter(r => r.comp === comp);
  for (const r of planilha) porT[r.nome] = { nome: r.nome, n: 0, rec: 0, pago: 0, datas: [], devidoPlanilha: +r.devido || 0 };
  for (const x of linhasClin(comp)) {
    if (!x.rec) continue; const t = x.p.terapeuta || "Sem terapeuta";
    const alvo = planilha.length ? Object.values(porT).find(o => mesmaPessoa(t, o.nome) || mesmaPessoa(o.nome, t)) : null;
    const o = alvo || (porT[t] = porT[t] || { nome: t, n: 0, rec: 0, pago: 0, datas: [] }); o.n++; o.rec += x.rec;
  }
  const pagos = doMes(mesPg).filter(x => x.tipo === "S" && x.status === "realizado" && x.cat === "Terapeutas");
  const sobra = [];
  for (const x of pagos) {
    const alvo = Object.values(porT).find(o => mesmaPessoa(x.pessoa, o.nome));
    if (alvo) { alvo.pago += +x.valor || 0; alvo.datas.push(dBR(x.data)); } else sobra.push(x);
  }
  const extras = {};
  for (const x of sobra) { const k = x.pessoa || x.desc; const o = extras[k] = extras[k] || { nome: k, n: 0, rec: 0, pago: 0, datas: [], semPrevisao: true }; o.pago += +x.valor || 0; o.datas.push(dBR(x.data)); }
  return [...Object.values(porT), ...Object.values(extras)].map(o => {
    const devido = o.devidoPlanilha !== undefined ? o.devidoPlanilha : planilha.length && !o.semPrevisao ? 0 : Math.round(o.rec * PCT() * 100) / 100;
    return { ...o, devido, fonte: o.devidoPlanilha !== undefined ? "planilha" : "calculo", dif: Math.round((devido - o.pago) * 100) / 100 }; })
    .sort((a, b) => a.nome.localeCompare(b.nome));
}
// Professores: o devido de cada mês fica em Cadastros (CAD.professores) e é comparado ao que saiu no mesmo mês
function conferenciaProfessores(m) {
  const cats = ["Professores", "Professores Formação", "Professores CFGM", "Professores Aula Aberta"];
  const pagos = doMes(m).filter(x => x.tipo === "S" && x.status === "realizado" && cats.includes(x.cat)), usados = new Set();
  const linhas = (CAD.professores || []).filter(p => p.mes === m).map(p => {
    const pg = pagos.filter(x => !usados.has(x.id) && mesmaPessoa(x.pessoa, p.nome)); pg.forEach(x => usados.add(x.id));
    const pago = sum(pg), devido = +p.devido || 0;
    return { nome: p.nome, funcao: p.funcao || "", devido, pago, datas: pg.map(x => dBR(x.data)).join(", "), dif: Math.round((devido - pago) * 100) / 100 };
  });
  for (const x of pagos.filter(x => !usados.has(x.id))) linhas.push({ nome: x.pessoa || x.desc, funcao: x.cat, devido: 0, pago: +x.valor, datas: dBR(x.data), dif: -(+x.valor), semPrevisao: true });
  return linhas;
}

function dadosRel(r, m, f) {
  f = f || "todos";
  if (r === "resumo") return dadosResumo(m);
  if (r === "rep") {
    const comp = addMes(m, -1), t = conferenciaTerapeutas(comp), pr = conferenciaProfessores(m);
    const tot = (a, k) => a.reduce((s, x) => s + (+x[k] || 0), 0);
    return {
      titulo: "Repasses e professores", periodo: `Pagos em ${mesNome(m)}. Terapeutas: competência ${mesNome(comp)}`,
      kpis: [["Devido aos terapeutas", tot(t, "devido"), t.some(x => x.fonte === "planilha") ? "planilha da clínica" : `${Math.round(PCT() * 100)}% do recebido`, 1], ["Pago aos terapeutas", tot(t, "pago"), mesNome(m), 1],
        ["Devido aos professores", tot(pr, "devido"), "pela planilha de cálculo", 1], ["Pago aos professores", tot(pr, "pago"), mesNome(m), 1],
        ["Para conferir", [...t, ...pr].filter(x => Math.abs(x.dif) >= 1).length, "pessoas com diferença", 0]],
      tabelas: [
        { titulo: `Terapeutas · competência ${mesNome(comp)}`, cols: ["Terapeuta", "Pacientes pagos", "Recebido", "Devido", "Pago", "Datas", "Diferença", "Situação"], money: [2, 3, 4, 6], total: true,
          rows: t.map(x => [x.nome, x.n || "", x.rec || "", x.devido, x.pago || "", x.datas.join(", "), x.dif, x.semPrevisao ? "Pago sem valor devido na competência" : situacao(x.dif)]) },
        { titulo: `Professores · ${mesNome(m)}`, cols: ["Professor", "Função", "Devido", "Pago", "Datas", "Diferença", "Situação"], money: [2, 3, 5], total: true,
          rows: pr.map(x => [x.nome, x.funcao, x.devido || "", x.pago || "", x.datas, x.dif, x.semPrevisao ? "Pago sem previsão no cadastro" : situacao(x.dif)]) }
      ]
    };
  }
  if (r === "clin") {
    const [ini, fim] = janela(m), lin = linhasClin(m), cl = clinica(m), ni = naoIdent(m);
    const porT = {};
    lin.filter(x => x.rec).forEach(x => { const t = x.p.terapeuta || "Sem terapeuta"; (porT[t] = porT[t] || { n: 0, v: 0 }); porT[t].n++; porT[t].v += x.rec; });
    const pt = cl.p.terapeutas / 100;
    return {
      titulo: "Clínica Social", periodo: `Competência ${mesNome(m)}: pagamentos de ${dFull(ini)} a ${dFull(fim)}`,
      kpis: [["Recebido de pacientes", cl.bruto, `${lin.filter(x => x.rec).length} de ${lin.length} pacientes`, 1], [`Terapeutas (${cl.p.terapeutas}%)`, cl.ter, "", 1], [`SOBAB (${cl.p.sobab}%)`, cl.sobab, "", 1], [`Poupança (${cl.p.poupanca}%)`, cl.poup, "", 1]],
      tabelas: [
        { titulo: "Repasse por terapeuta", cols: ["Terapeuta", "Pacientes pagos", "Recebido", `Repasse (${cl.p.terapeutas}%)`], money: [2, 3], total: true,
          rows: Object.entries(porT).sort((a, b) => a[0].localeCompare(b[0])).map(([t, o]) => [t, o.n, o.v, Math.round(o.v * pt * 100) / 100]) },
        { titulo: TIT_F[f], cols: ["Paciente", "Terapeuta", "Esperado", "Recebido", "Datas", "Quem pagou", "Situação"], money: [2, 3], total: true,
          rows: filtraSit(lin, f).map(x => [x.p.nome, x.p.terapeuta || "", x.esp, x.rec || "", x.pg.map(g => dBR(g.data) + (g.parcelas && g.parcelas.length ? " (antecipado)" : "")).join(", "), [...new Set(x.pg.map(g => g.pessoa))].join(", "), ST_CLIN[x.st]]) },
        { titulo: "Para resolver", cols: ["Data", "Quem pagou", "Situação", "Valor"], money: [3], total: true,
          rows: ni.map(x => [dFull(x.data), x.pessoa || "", x.cat === "Não identificado" ? "Não identificado" : "Possível paciente novo", +x.valor]) }
      ]
    };
  }
  if (r === "form" || r === "cfgm") {
    const ms = mensal(m), a = r === "form" ? ms.fo : ms.cf, cat = r === "form" ? "Formação AB" : "CFGM", its = lancsCat([cat], m);
    const esp = a.reduce((s, x) => s + x.esp, 0), rec = sum(its);
    return {
      titulo: r === "form" ? "Formação em Análise Bioenergética" : "CFGM", periodo: `Recebimentos de ${mesNome(m)}`,
      kpis: [["Esperado no mês", esp, "", 1], ["Recebido", rec, `${its.length} pagamentos`, 1], ["Em aberto", a.filter(x => x.st === "aberto" || x.st === "parcial").length, "alunos", 0]],
      tabelas: [
        { titulo: f === "todos" ? "Situação por aluno" : f === "pagos" ? "Alunos que pagaram" : "Alunos em aberto", cols: ["Aluno", "Esperado", "Recebido", "Datas", "Situação"], money: [1, 2], total: true,
          rows: a.filter(x => f === "todos" || (f === "pagos" ? x.st === "pago" : (x.st === "aberto" || x.st === "parcial"))).map(x => [x.nome, x.esp, x.rec, x.datas, ST_MENS[x.st]]) },
        tabPagamentos("Todos os pagamentos", its)
      ]
    };
  }
  const cfg = { gm: ["GM e cursos extras", ["GM / Cursos extras"]], zoop: ["Maquininha e link de cartão", ["Link de cartão (Zoop)"]], reemb: ["Reembolsos", ["Reembolsos"]], ni: ["Não identificados", ["Não identificado"]] }[r];
  const its = r === "ni" ? doMes(m).filter(x => x.tipo === "E" && x.status === "realizado" && (x.cat === "Não identificado" || ehDaClinicaSemPaciente(x))).sort((a, b) => a.data.localeCompare(b.data)) : lancsCat(cfg[1], m);
  return { titulo: cfg[0], periodo: `Recebimentos de ${mesNome(m)}`, kpis: [["Total recebido", sum(its), `${its.length} pagamentos`, 1]], tabelas: [tabPagamentos("Pagamentos", its)] };
}
function tabelaHTML(t) {
  const fmtC = (v, j) => t.money.includes(j) ? (v === "" || v == null ? "–" : R$(v)) : esc(v);
  const tot = t.total ? t.cols.map((_, j) => t.money.includes(j) ? t.rows.reduce((s, r) => s + (+r[j] || 0), 0) : null) : null;
  return `<div class="tblwrap"><table><thead><tr>${t.cols.map((c, j) => `<th class="${t.money.includes(j) ? "r" : ""}">${esc(c)}</th>`).join("")}</tr></thead><tbody>
    ${t.rows.map(r => `<tr>${r.map((v, j) => `<td class="${t.money.includes(j) ? "r num" : ""}">${fmtC(v, j)}</td>`).join("")}</tr>`).join("") || `<tr><td colspan="${t.cols.length}" class="empty">Nada neste período.</td></tr>`}</tbody>
    ${tot && t.rows.length ? `<tfoot><tr>${tot.map((v, j) => `<td class="${v !== null ? "r num" : ""}">${v !== null ? R$(v) : j === 0 ? t.rows.length + " linhas" : ""}</td>`).join("")}</tr></tfoot>` : ""}</table></div>`;
}
function vRel() {
  const r = UI.rel || "resumo", f = UI.relF || "todos", d = dadosRel(r, UI.mes, f);
  const comFiltro = ["clin", "form", "cfgm"].includes(r);
  const fl = [["todos", "Todos"], ["pagos", "Pagos"], ["sem", "Não pagos"], ...(r === "clin" ? [["canc", "Cancelados"]] : [])];
  return `<div class="panel"><div class="ph"><div><h2>Relatório · ${esc(d.titulo)}</h2><p>${esc(d.periodo)}. Troque o mês no topo da página.</p></div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">${r === "resumo" ? `<button class="pri" id="resCopy">Copiar valores para a planilha</button>` : ""}<button id="relCopy">Copiar relatório</button><button class="${r === "resumo" ? "" : "pri"}" id="relXlsx">Baixar .xlsx</button></div></div>
    <div class="filters"><div class="seg" role="group" aria-label="Tipo de relatório">${RELS.map(([k, t]) => `<button data-rel="${k}" aria-pressed="${r === k}">${t}</button>`).join("")}</div></div>
    ${comFiltro ? `<div class="filters fbar"><span class="flab">Filtrar</span><div class="seg" role="group" aria-label="Filtrar por situação">${fl.map(([k, t]) => `<button data-relf="${k}" aria-pressed="${f === k}">${t}</button>`).join("")}</div></div>` : ""}
    <div class="kpis">${d.kpis.map(([a, v, sub, money]) => `<div class="kpi"><span>${esc(a)}</span><b class="num">${money ? R$(v) : v}</b><em>${esc(sub || "")}</em></div>`).join("")}</div>
    ${d.tabelas.map(t => `<h3 style="margin:20px 0 8px">${esc(t.titulo)}</h3>${tabelaHTML(t)}`).join("")}</div>`;
}
function textoRel(d) {
  const f = (v, money) => money ? R$(v).replace(/ /g, " ") : String(v ?? "");
  const out = [`SOBAB · ${d.titulo}`, d.periodo, ""];
  d.kpis.forEach(([a, v, sub, money]) => out.push(`${a}: ${f(v, money)}${sub ? " (" + sub + ")" : ""}`));
  d.tabelas.forEach(t => { out.push("", t.titulo.toUpperCase(), t.cols.join("\t")); t.rows.forEach(r => out.push(r.map((v, j) => f(v, t.money.includes(j))).join("\t"))); });
  return out.join("\n");
}
async function exportRel(r, m, f) {
  const d = dadosRel(r, m, f), wb = XLSX.utils.book_new();
  const res = [[`SOBAB · ${d.titulo}`, ""], [d.periodo, ""], ["", ""], ...d.kpis.map(([a, v]) => [a, v])];
  XLSX.utils.book_append_sheet(wb, sheet(res, [40, 18], [1]), "Resumo");
  d.tabelas.forEach(t => {
    const rows = [t.cols, ...t.rows];
    if (t.total && t.rows.length) rows.push(t.cols.map((_, j) => t.money.includes(j) ? t.rows.reduce((s, x) => s + (+x[j] || 0), 0) : j === 0 ? "TOTAL" : ""));
    XLSX.utils.book_append_sheet(wb, sheet(rows, t.cols.map((_, j) => j === 0 ? 34 : 18), t.money), t.titulo.slice(0, 31));
  });
  await salvarArquivo(wb, `SOBAB_${r === "clin" ? "clinica_social" : r === "form" ? "formacao" : r}_${m}${f && f !== "todos" ? "_" + (f === "pagos" ? "pagos" : "nao_pagos") : ""}.xlsx`);
}
document.addEventListener("click", async e => {
  const b = e.target.closest("button"); if (!b) return;
  if (b.dataset.rel) { UI.rel = b.dataset.rel; render(); return; }
  if (b.dataset.relf) { UI.relF = b.dataset.relf; render(); return; }
  if (b.id === "relCopy") { await copiar(textoRel(dadosRel(UI.rel || "resumo", UI.mes, UI.relF)), "Relatório copiado."); return; }
  if (b.id === "relXlsx") { await exportRel(UI.rel || "resumo", UI.mes, UI.relF); return; }
  if (b.id === "resCopy") { const v = valoresResumo(UI.mes), f = n => n ? R$(n).replace(/\u00a0/g, " ") : "";
    await copiar([v.cfgm, v.sobab, v.form, v.aula, v.inter].map(f).join("\n"), "Copiado: CFGM, Clínica Social (SOBAB 10%), Formação AB, Aula aberta e Intervisão, nessa ordem."); return; }
});

// Busca na Clínica Social sem perder o foco do campo
document.addEventListener("input", e => {
  if (e.target.id !== "clBusca") return;
  UI.cq = e.target.value; clearTimeout(UI.cqT);
  UI.cqT = setTimeout(() => { render(); const q = $("#clBusca"); if (q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); } }, 300);
});

// ---------- Resumo do mês (entradas para o fechamento) ----------
// Formação, CFGM, Aula aberta e Intervisão: mês de referência. Clínica Social: competência (corte), só a parte da SOBAB.
function valoresResumo(m) {
  const tot = cat => L.filter(x => x.tipo === "E" && x.status === "realizado" && x.cat === cat && (x.ref || x.mes) === m).reduce((s, x) => s + (+x.valor || 0), 0);
  const cl = clinica(m);
  return { cfgm: tot("CFGM"), form: tot("Formação AB"), aula: tot("Aula Aberta"), inter: tot("Intervisão"), sobab: cl.sobab, poup: cl.poup, bruto: cl.bruto, ter: cl.ter, p: cl.p };
}
// Saídas pagas no mês (valor que realmente saiu da conta), agrupadas como na planilha de contas a pagar
const saidasMes = (m, f) => doMes(m).filter(x => x.tipo === "S" && x.status === "realizado" && f(grupoS(x.cat), x.cat)).sort((a, b) => a.data.localeCompare(b.data));
const saidasRows = (m, f) => saidasMes(m, f).map(x => [dBR(x.data), x.desc + (x.pessoa && !/darf|cora|vivo|pref/i.test(x.pessoa) ? " · " + x.pessoa : ""), x.cat, +x.valor]);
const saidasTotal = (m, f) => saidasMes(m, f).reduce((s, x) => s + (+x.valor || 0), 0);
function dadosResumo(m) {
  const v = valoresResumo(m), [ini, fim] = janela(m), total = v.cfgm + v.sobab + v.form + v.aula + v.inter;
  const fx = saidasTotal(m, g => g === "Fixas"), vr = saidasTotal(m, g => g === "Variáveis"), pr = saidasTotal(m, (g, c) => g === "Repasses" && c !== "Terapeutas");
  const cal = `${mesNome(m)}`, comp = `competência ${dBR(ini)} a ${dBR(fim)}`;
  return {
    titulo: "Resumo do mês", periodo: `Entradas de ${mesNome(m)} para o fechamento`,
    kpis: [["CFGM", v.cfgm, cal, 1], ["Formação AB", v.form, cal, 1], [`Clínica Social · SOBAB (${v.p.sobab}%)`, v.sobab, comp, 1],
      ["Total de entradas", total, "CFGM + Formação + SOBAB", 1], ["Saídas do mês", fx + vr + pr, "fixas + variáveis + professores", 1],
      ["Resultado do mês", total - fx - vr - pr, total - fx - vr - pr >= 0 ? "positivo" : "negativo", 1], [`Poupança da clínica (${v.p.poupanca}%)`, v.poup, "fica separada, fora do total", 1]],
    tabelas: [
      { titulo: "Entradas do mês (como na planilha)", cols: ["Descrição", "Período", "Valor líquido"], money: [2], total: true,
        rows: [["CFGM", cal, v.cfgm], [`Clínica Social (SOBAB ${v.p.sobab}%)`, comp, v.sobab], ["Formação AB", cal, v.form], ["Aula aberta", cal, v.aula], ["Intervisão", cal, v.inter]] },
      { titulo: "Despesas fixas", cols: ["Data", "Descrição", "Categoria", "Valor pago"], money: [3], total: true, rows: saidasRows(m, g => g === "Fixas") },
      { titulo: "Despesas variáveis", cols: ["Data", "Descrição", "Categoria", "Valor pago"], money: [3], total: true, rows: saidasRows(m, (g, c) => g === "Variáveis") },
      { titulo: "Despesas professores", cols: ["Data", "Descrição", "Categoria", "Valor pago"], money: [3], total: true, rows: saidasRows(m, (g, c) => g === "Repasses" && c !== "Terapeutas") },
      { titulo: "Clínica Social (separada)", cols: ["Descrição", "Valor"], money: [1], total: false,
        rows: [["Total bruto (pacientes)", v.bruto], [`SOBAB (${v.p.sobab}%)`, v.sobab], [`Poupança clínica (${v.p.poupanca}%)`, v.poup], [`Terapeutas (${v.p.terapeutas}%)`, v.ter],
          ["Repassado aos terapeutas no mês", saidasTotal(m, (g, c) => c === "Terapeutas")]] },
      { titulo: "Resumo consolidado do mês", cols: ["Descrição", "Valor"], money: [1], total: false,
        rows: [["(+) Entradas totais", total], ["(-) Despesas fixas", fx], ["(-) Despesas variáveis", vr], ["(-) Despesas professores", pr], ["(=) Resultado do mês", total - fx - vr - pr]] }
    ]
  };
}

// ---------- Leitura do PDF do extrato (pdf.js) ----------
const PDFJS = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/";
function carregarScript(src) {
  return new Promise((ok, erro) => { const sc = document.createElement("script"); sc.src = src; sc.onload = ok; sc.onerror = erro; document.head.appendChild(sc); });
}
// Remonta as linhas do PDF pela posição do texto; colunas separadas por tabulação
async function textoDoPdf(file) {
  if (!window.pdfjsLib) { await carregarScript(PDFJS + "pdf.min.js"); window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS + "pdf.worker.min.js"; }
  const pdf = await window.pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const linhas = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const tc = await (await pdf.getPage(n)).getTextContent();
    const its = tc.items.filter(i => i.str && i.str.trim()).map(i => ({ x: i.transform[4], y: i.transform[5], w: i.width, s: i.str })).sort((a, b) => b.y - a.y || a.x - b.x);
    const grupos = [];
    for (const i of its) { const g = grupos[grupos.length - 1]; if (g && Math.abs(g.y - i.y) < 3) g.its.push(i); else grupos.push({ y: i.y, its: [i] }); }
    for (const g of grupos) {
      g.its.sort((a, b) => a.x - b.x); let out = "", fim = null;
      for (const i of g.its) { if (fim !== null) out += i.x - fim > 6 ? "\t" : " "; out += i.s; fim = i.x + i.w; }
      linhas.push(out.trim());
    }
  }
  return linhas.join("\n");
}
document.addEventListener("change", async e => {
  if (e.target.id !== "impPdf" || !e.target.files || !e.target.files[0]) return;
  UI.pdfBusy = true; render();
  try {
    const r = parseExtrato(await textoDoPdf(e.target.files[0]));
    if (!r.itens.length) toast("Não encontrei movimentos nesse PDF. Confira se é o extrato da Cora.");
    else { UI.imp = { itens: casar(r.itens), saldos: r.saldos }; toast(r.itens.length + " movimentos lidos do PDF"); }
  } catch (err) { toast("Não consegui abrir esse PDF. Tente copiar o texto e colar."); }
  UI.pdfBusy = false; render();
});
