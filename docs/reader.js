/* Λεξικόν — leitor de textos gregos com cada palavra ligada ao dicionário.
   Texto: First1KGreek / Perseus (CC BY-SA 4.0). Lemas, morfologia e sintaxe: GLAUx (CC BY-SA 4.0),
   anotação automática. Usa as variáveis e funções globais de app.js (E, byId, keys, renderDef…). */
"use strict";

const TEXTS_URL = "textos/index.json";
let textIndex = null;          // {textos: [...]}
const textCache = new Map();   // id -> documento carregado
let R = null;                  // estado do leitor aberto

/* ---------- morfologia (etiquetas AGDT de 9 posições) ---------- */

const POS = { n: "substantivo", v: "verbo", a: "adjetivo", d: "advérbio", l: "artigo", g: "partícula",
  c: "conjunção", r: "preposição", p: "pronome", m: "numeral", i: "interjeição", e: "exclamação", x: "irregular" };
const PERSON = { 1: "1ª pessoa", 2: "2ª pessoa", 3: "3ª pessoa" };
const NUMBER = { s: "singular", p: "plural", d: "dual" };
const TENSE = { p: "presente", i: "imperfeito", r: "perfeito", l: "mais-que-perfeito", t: "futuro perfeito", f: "futuro", a: "aoristo" };
const MOOD = { i: "indicativo", s: "subjuntivo", o: "optativo", n: "infinitivo", m: "imperativo", p: "particípio" };
const VOICE = { a: "voz ativa", p: "voz passiva", m: "voz média", e: "voz médio-passiva" };
const GENDER = { m: "masculino", f: "feminino", n: "neutro", c: "comum" };
const CASE = { n: "nominativo", g: "genitivo", d: "dativo", a: "acusativo", v: "vocativo", l: "locativo" };
const DEGREE = { c: "comparativo", s: "superlativo" };

function morph(tag) {
  if (!tag) return "";
  let [p, pe, nu, te, mo, vo, ge, ca, de] = tag;
  // presente, imperfeito, perfeito e mais-que-perfeito têm a mesma forma na média e na passiva
  if ("pirl".includes(te) && "mpe".includes(vo) && vo !== "-") vo = "e";
  const out = [POS[p] || ""];
  if (p === "v") {
    if (mo === "p") out.push([TENSE[te], MOOD[mo], VOICE[vo]].filter(Boolean).join(" "), [GENDER[ge], NUMBER[nu], CASE[ca]].filter(Boolean).join(" "));
    else if (mo === "n") out.push([TENSE[te], MOOD[mo], VOICE[vo]].filter(Boolean).join(" "));
    else out.push([PERSON[pe], NUMBER[nu]].filter(Boolean).join(" "), [TENSE[te], MOOD[mo]].filter(Boolean).join(" do "), VOICE[vo]);
  } else {
    out.push([GENDER[ge], NUMBER[nu], CASE[ca]].filter(Boolean).join(" "), DEGREE[de]);
  }
  return out.filter(Boolean).join(" · ");
}

const REL = {
  PRED: "predicado (verbo principal)", SBJ: "sujeito", OBJ: "objeto", ATR: "adjunto adnominal (atributo)",
  ADV: "adjunto adverbial", PNOM: "predicativo", OCOMP: "predicativo do objeto", APOS: "aposto",
  COORD: "conjunção coordenativa", AuxP: "preposição", AuxC: "conjunção subordinativa",
  AuxY: "advérbio ou partícula de frase", AuxZ: "partícula de ênfase", AuxV: "verbo auxiliar",
  AuxG: "sinal de agrupamento", ExD: "termo de oração elíptica", MWE: "parte de expressão fixa",
  CO: "membro de coordenação", UNLINKED: "sem ligação",
};
function relLabel(r) {
  if (!r) return "";
  const co = r.endsWith("_CO") && r !== "CO";
  const base = co ? r.slice(0, -3) : r;
  return (REL[base] || base) + (co ? " (coordenado)" : "");
}

/* ---------- carregamento ---------- */

async function loadTextIndex() {
  if (textIndex) return textIndex;
  const res = await fetch(TEXTS_URL, { cache: "no-cache" }).catch(() => fetch(TEXTS_URL));
  if (!res.ok) throw new Error("HTTP " + res.status);
  textIndex = await res.json();
  return textIndex;
}

async function loadText(id) {
  if (textCache.has(id)) return textCache.get(id);
  const meta = (await loadTextIndex()).textos.find(t => t.id === id);
  if (!meta) throw new Error("texto não encontrado");
  const res = await fetch(`textos/${id}.json?v=${meta.versao}`);
  if (!res.ok) throw new Error("HTTP " + res.status);
  const doc = await res.json();
  // índice plano das palavras: [forma, análises]
  doc.words = [];
  for (const b of doc.blocos) for (const it of b.x || []) if (Array.isArray(it)) doc.words.push(it);
  doc.byLemma = new Map();
  doc.words.forEach((w, i) => {
    for (const a of w[1]) {
      if (!a[1]) continue;  // análise de palavra inteira (crase, οὐδέ…) não conta como ocorrência
      if (!doc.byLemma.has(a[0])) doc.byLemma.set(a[0], []);
      const l = doc.byLemma.get(a[0]);
      if (l[l.length - 1] !== i) l.push(i);
    }
  });
  indexText(doc);
  textCache.set(id, doc);
  return doc;
}

/* Divide o texto em partes (livros) e indexa referências → parte.
   Texto com um só nível de divisão (as Categorias) é uma parte só. */
function indexText(doc) {
  // um livro por vez quando a obra se divide em livros (Metafísica, República) ou tem dois níveis
  const top = (doc.meta.niveis || [])[0];
  doc.paged = doc.blocos.some(b => b.t === "c" && b.lv > 0) || !!(top && top.nome === "Livro");
  doc.parts = []; doc.chapters = [];
  doc.refPart = new Map(); doc.refs = [];
  let wi = 0, cur = null;
  const addRef = r => { if (r && !doc.refPart.has(r.toLowerCase())) { doc.refPart.set(r.toLowerCase(), doc.parts.length - 1); doc.refs.push(r); } };
  doc.blocos.forEach((b, bi) => {
    if (b.t === "c" && (b.lv === 0 || b.lv === undefined) && (doc.paged || !cur)) {
      if (cur) cur.b1 = bi;
      cur = { b0: bi, b1: doc.blocos.length, wStart: wi, c: b.c, rot: b.rot || b.c, chip: b.chip || b.c, chapters: [] };
      if (!doc.paged) { cur.c = ""; cur.rot = ""; }
      doc.parts.push(cur);
    } else if (!cur) {
      cur = { b0: 0, b1: doc.blocos.length, wStart: 0, c: "", rot: "", chip: "", chapters: [] };
      doc.parts.push(cur);
    }
    if (b.t === "c") {
      const ch = { c: b.c, chip: b.chip || b.c };
      if (doc.paged ? b.lv > 0 : true) (doc.paged ? cur.chapters : doc.chapters).push(ch);
      addRef(b.c);
      return;
    }
    b.w0 = wi;
    for (const it of b.x) {
      if (Array.isArray(it)) wi++;
      else if (it && it.s) addRef(it.s);
    }
  });
}

/* ---------- biblioteca ---------- */

async function viewTexts() {
  setActiveLetter(null);
  document.body.classList.remove("reading");
  main.innerHTML = `<div class="loading"><div>Carregando a biblioteca…</div></div>`;
  let idx;
  try { idx = await loadTextIndex(); } catch (err) {
    main.innerHTML = `<div class="empty">Não foi possível carregar a lista de textos (${esc(String(err.message || err))}).</div>`;
    return;
  }
  let lastAuthor = null;
  const cards = idx.textos.map(t => {
    const head = t.autor !== lastAuthor ? `<li class="tauthor" lang="pt">${esc(t.autor)} <span lang="grc">${esc(t.autorGr)}</span></li>` : "";
    lastAuthor = t.autor;
    const pos = store.get("lx.read." + t.id, null);
    return head + `<li class="tcard">
      <a href="#/t/${t.id}">
        <span class="tcard-gr" lang="grc">${esc(t.tituloGr)}</span>
        <span class="tcard-pt">${esc(t.autor)}, <i>${esc(t.titulo)}</i></span>
        <span class="tcard-desc">${esc(t.descricao)}</span>
        <span class="tcard-meta">${t.edicaoCurta ? esc(t.edicaoCurta) + " · " : ""}${t.palavras.toLocaleString("pt-BR")} palavras${pos ? ` · parou em ${esc(/^\d+[ab]/.test(pos) ? pos : "§" + pos)}` : ""}</span>
      </a></li>`;
  }).join("");
  main.innerHTML = `<div class="page">
    <h2>Textos</h2>
    <p class="home-intro">Toque numa palavra para ver o lema, a análise morfológica e o verbete do dicionário.
      As análises vêm do corpus <a href="https://github.com/alekkeersmaekers/glaux" target="_blank" rel="noopener">GLAUx</a>
      e são, em geral, automáticas: confira-as, sobretudo a sintaxe. A <i>Apologia</i> é exceção: sua anotação foi feita à mão
      (treebank de Vanessa Gorman).</p>
    <ul class="tlist">${cards}</ul>
  </div>`;
}

/* ---------- leitor ---------- */

async function viewReader(id, target) {
  setActiveLetter(null);
  document.body.classList.add("reading");
  if (!R || R.id !== id || !$("#rtext", main)) {
    main.innerHTML = `<div class="loading"><div class="loading-gr">ἀναγιγνώσκεται…</div><div>Carregando o texto</div></div>`;
    let doc;
    try { doc = await loadText(id); } catch (err) {
      main.innerHTML = `<div class="empty">Não foi possível carregar o texto (${esc(String(err.message || err))}).</div>`;
      return;
    }
    if (location.hash.split("/")[2] !== id) return;   // o usuário já mudou de página
    R = { id, doc, sel: -1, entry: null, part: -1 };
    renderReader();
  }
  const ref = target ? resolveRef(target) : null;
  if (target && !ref) {
    showPart(R.part >= 0 ? R.part : 0);
    toast(`Referência “${target}” não encontrada neste texto.`);
    return;
  }
  if (ref) {
    showPart(R.doc.refPart.get(ref.toLowerCase()));
    const el = main.querySelector(`#rtext [data-s="${CSS.escape(ref)}"]`);
    if (el) { el.scrollIntoView({ block: "start" }); scrollBy(0, -scrollOffset()); flash(el); }
  } else if (R.part < 0) {
    showPart(0);
    scrollTo(0, 0);
  }
}

/* Aceita a referência exata (5.3, 7, 7.3, 1028a10) ou uma de Bekker incompleta ou entre marcos
   (1028, 1028a, 1072b14 → último marco de linha da página até a linha 14) */
function resolveRef(t) {
  t = t.trim().toLowerCase().replace(/\s+/g, "");
  const { refPart, refs } = R.doc;
  if (refPart.has(t)) return t;
  const m = /^(\d+)([ab])?(\d+)?$/.exec(t);
  if (m && refs.some(isBekker)) {
    const [, pg, col, line] = m;
    const onPage = refs.filter(r => { const x = /^(\d+)([ab])(\d+)$/.exec(r); return x && x[1] === pg && (!col || x[2] === col); });
    if (onPage.length) {
      if (!line) return onPage[0];
      const n = +line;
      const before = onPage.filter(r => +/\d+$/.exec(r)[0] <= n);
      return before.length ? before[before.length - 1] : onPage[0];
    }
  }
  return refs.find(r => r.toLowerCase().startsWith(t)) || null;
}

function scrollOffset() {
  const s = $(".search-wrap");
  return (s ? s.offsetHeight : 0) + 12;
}

function flash(el) {
  el.classList.remove("flash"); void el.offsetWidth; el.classList.add("flash");
}

function toast(msg) {
  const t = document.createElement("div");
  t.className = "toast"; t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3200);
}

const isBekker = s => /^\d+[ab]/.test(s);
const refLabel = s => (isBekker(s) ? s : "§" + s);

function renderReader() {
  const { doc } = R;
  const m = doc.meta;
  const last = store.get("lx.read." + R.id, null);
  main.innerHTML = `
    <div class="reader">
      <div class="rcol">
        <header class="rhead">
          <a class="rback" href="#/textos">← Textos</a>
          <div class="rmeta"><span lang="grc">${esc(m.autorGr)}</span> · ${esc(m.autor)}, <i>${esc(m.titulo)}</i>${m.edicaoCurta ? ` <span class="rmeta-ed">(${esc(m.edicaoCurta)})</span>` : ""}</div>
          <nav class="rcaps" id="rparts" data-label="${doc.paged ? "Livros" : "Capítulos"}" aria-label="${doc.paged ? "Livros" : "Capítulos"}">${doc.parts.length > 1
            ? doc.parts.map((p, i) => `<a href="#/t/${R.id}/${esc(p.c)}" data-p="${i}" title="${esc(p.rot)}" lang="grc">${esc(p.chip)}</a>`).join("")
            : doc.chapters.map(c => `<a href="#/t/${R.id}/${esc(c.c)}">${esc(c.chip)}</a>`).join("")}</nav>
          ${doc.paged ? `<nav class="rcaps rsub" id="rchaps" data-label="Capítulos" aria-label="Capítulos"></nav>` : ""}
          <div class="rtools">
            ${m.referencia ? `<form class="rgo" id="rgo"><input id="rgo-in" placeholder="${esc(m.referencia)}: ${esc(m.exemploRef || "")}" aria-label="Ir para a referência de ${esc(m.referencia)}" autocomplete="off" spellcheck="false" inputmode="text"><button>ir</button></form>` : ""}
            ${last ? `<a class="rcont" href="#/t/${R.id}/${esc(last)}">continuar em ${esc(refLabel(last))} →</a>` : ""}
          </div>
        </header>
        <article class="rtext" id="rtext"></article>
        <nav class="rpager" id="rpager"></nav>
        <footer class="rsrc">
          <p><b>Texto:</b> ${esc(m.edicao)} Transcrição digital: <a href="${esc(m.fonteTexto.url)}" target="_blank" rel="noopener">${esc(m.fonteTexto.nome)}</a>, ${esc(m.fonteTexto.licenca)}.</p>
          <p><b>Lemas, morfologia e sintaxe:</b> <a href="${esc(m.fonteAnotacao.url)}" target="_blank" rel="noopener">${esc(m.fonteAnotacao.nome)}</a>, ${esc(m.fonteAnotacao.licenca)}. ${esc(m.fonteAnotacao.nota)}</p>
          <p>${m.notaEdicao ? esc(m.notaEdicao) : "Os números à margem do texto são as seções (capítulo.seção) da edição digital; os números pequenos e apagados, as páginas da edição de Bekker de 1837."}
            ${doc.estat.lemas_sem_verbete} dos ${doc.estat.lemas} lemas do texto não constam do DDGP; nesses casos o painel mostra só a análise e um link ao Logeion.</p>
        </footer>
      </div>
      <aside class="rpanel" id="rpanel" aria-live="polite" hidden></aside>
    </div>`;
  $("#rtext").addEventListener("click", onWordClick);
  $("#rpanel").addEventListener("click", onPanelClick);
  const go = $("#rgo");
  if (go) go.addEventListener("submit", ev => {
    ev.preventDefault();
    const v = $("#rgo-in").value.trim();
    if (v) location.hash = `#/t/${R.id}/${encodeURIComponent(v.replace(/\s+/g, ""))}`;
  });
}

/* Desenha uma parte (um livro) do texto; textos sem livros têm uma parte só */
function showPart(p) {
  if (p === undefined || p === R.part) return;
  const { doc } = R;
  const part = doc.parts[p];
  closePanel();
  R.part = p;
  let html = "";
  for (let bi = part.b0; bi < part.b1; bi++) {
    const b = doc.blocos[bi];
    if (b.t === "c") {
      const tag = doc.paged && b.lv === 0 ? "h2" : doc.paged ? "h3" : "h2";
      const cls = doc.paged && b.lv === 0 ? "book" : "cap";
      html += `<${tag} class="${cls}" data-s="${esc(b.c)}">${esc(b.rot || b.c)}</${tag}>`;
      continue;
    }
    let wi = b.w0, inner = "";
    for (const it of b.x) {
      if (typeof it === "string") inner += esc(it);
      else if (Array.isArray(it)) inner += `<span class="w${it[1].length ? "" : " nx"}" data-i="${wi++}">${esc(it[0])}</span>`;
      else if (it.br) inner += "<br>";
      else if (it.lab) inner += `<span class="lab">${esc(it.lab)}</span> `;
      else if (it.s) {
        const bk = isBekker(it.s);
        const lab = it.d || it.s.split(".").pop();
        inner += `<a class="sec${bk ? " bk" : ""}${bk && it.d && it.d === it.s ? " bkp" : ""}" href="#/t/${R.id}/${esc(it.s)}" data-s="${esc(it.s)}" title="${esc(refLabel(it.s))}">${esc(lab)}</a>`;
      }
      else if (it.pb) inner += `<span class="pb" title="página ${esc(it.pb)} da edição impressa">${esc(it.pb)}</span>`;
    }
    html += b.t === "h" ? `<h1 class="rtitle" lang="grc">${inner}</h1>` : `<p lang="grc">${inner}</p>`;
  }
  $("#rtext").innerHTML = html;
  // navegação: parte atual, capítulos dela, parte anterior/seguinte
  main.querySelectorAll("#rparts a[data-p]").forEach(a => a.classList.toggle("on", +a.dataset.p === p));
  const ch = $("#rchaps");
  if (ch) ch.innerHTML = part.chapters.map(c => `<a href="#/t/${R.id}/${esc(c.c)}">${esc(c.chip)}</a>`).join("");
  const prev = doc.parts[p - 1], next = doc.parts[p + 1];
  $("#rpager").innerHTML = doc.parts.length > 1
    ? `${prev ? `<a href="#/t/${R.id}/${esc(prev.c)}">← ${esc(prev.rot)}</a>` : "<span></span>"}
       ${next ? `<a href="#/t/${R.id}/${esc(next.c)}">${esc(next.rot)} →</a>` : "<span></span>"}`
    : "";
}

function partOfWord(i) {
  const ps = R.doc.parts;
  for (let p = ps.length - 1; p >= 0; p--) if (i >= ps[p].wStart) return p;
  return 0;
}

function onWordClick(ev) {
  const w = ev.target.closest(".w");
  if (!w) return;
  selectWord(+w.dataset.i);
}

function wordEl(i) { return main.querySelector(`#rtext .w[data-i="${i}"]`); }

function clearMarks() {
  main.querySelectorAll(".w.sel, .w.same, .w.head, .w.dep").forEach(el => el.classList.remove("sel", "same", "head", "dep"));
}

function selectWord(i) {
  if (!R) return;
  const w = R.doc.words[i];
  if (!w) return;
  const p = partOfWord(i);
  if (p !== R.part) showPart(p);
  clearMarks();
  R.sel = i;
  const el = wordEl(i);
  if (el) el.classList.add("sel");
  // lema principal: primeiro com verbete no DDGP (a palavra inteira vem antes das partes)
  const an = w[1];
  const main0 = an.find(a => R.doc.lemas[a[0]][1].length) || an[0];
  R.entry = main0 ? { lem: main0[0], k: 0 } : null;
  if (main0 && main0[1]) markSame(main0[0]);
  for (const a of an) {
    if (a[3] >= 0) { const h = wordEl(a[3]); if (h) h.classList.add("head"); }
  }
  renderPanel();
  saveSection(el);
  if (el) keepVisible(el);
}

/* mantém a palavra selecionada visível acima do painel (celular) ou abaixo da busca */
function keepVisible(el) {
  const r = el.getBoundingClientRect();
  const p = $("#rpanel");
  const top = scrollOffset();
  const sheet = p && getComputedStyle(p).position === "fixed" ? p.getBoundingClientRect().top : innerHeight;
  if (r.bottom > sheet - 16) scrollBy({ top: r.bottom - sheet + Math.min(120, (sheet - top) / 3), behavior: "smooth" });
  else if (r.top < top) scrollBy({ top: r.top - top - 16, behavior: "smooth" });
}

function markSame(li) {
  for (const j of R.doc.byLemma.get(li) || []) if (j !== R.sel) { const e = wordEl(j); if (e) e.classList.add("same"); }
}

function saveSection(el) {
  if (!el) return;
  let s = null;
  // procura o último marcador (seção, linha de Bekker ou capítulo) antes da palavra
  for (const m of main.querySelectorAll("#rtext [data-s]")) {
    if (m.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) s = m.dataset.s; else break;
  }
  if (s) store.set("lx.read." + R.id, s);
}

/* ---------- painel ---------- */

function exactIds(form) {
  const qn = normGr(form);
  const out = [];
  if (!qn) return out;
  for (let i = 0; i < E.length; i++) if (keys[i] === qn) out.push(E[i][0]);
  return out;
}

function renderPanel() {
  const p = $("#rpanel");
  if (!p) return;
  const w = R.doc.words[R.sel];
  const L = R.doc.lemas;
  let an = w[1];
  let fallback = null;
  if (!an.length) {
    fallback = exactIds(w[0]);
    if (fallback.length && !R.entry) R.entry = { ids: fallback, k: 0 };
  }
  const occ = li => (R.doc.byLemma.get(li) || []).length;
  const rows = an.map(a => {
    const [li, tag, rel, head, ell] = a;
    const [lemma, ids] = L[li];
    const isWhole = !tag;
    const on = R.entry && R.entry.lem === li;
    const n = occ(li);
    const headTxt = head >= 0 ? R.doc.words[head][0] : "";
    return `<div class="an${on ? " on" : ""}">
      <div class="an-top">
        ${ids.length ? `<button class="lem" data-lem="${li}" lang="grc">${esc(lemma)}</button>` : `<span class="lem nolem" lang="grc">${esc(lemma)}</span>`}
        ${isWhole ? `<span class="morph">palavra inteira (crase ou composto)</span>` : `<span class="morph">${esc(morph(tag))}</span>`}
      </div>
      ${rel && !isWhole ? `<div class="syn">${esc(relLabel(rel))}${headTxt ? ` → <button class="wref" data-w="${head}" lang="grc">${esc(headTxt)}</button>${ell ? ` <span class="ell" title="O GLAUx liga esta palavra a um termo subentendido (por ex. ἐστί), que por sua vez se liga a esta palavra.">via termo elíptico</span>` : ""}` : ""}</div>` : ""}
      ${!isWhole && n > 1 ? `<div class="occ"><button class="btn-link" data-occ="${li}">${n} ocorrências no texto</button></div>` : ""}
      ${!ids.length ? `<div class="miss">Lema não registrado no DDGP. <a href="https://logeion.uchicago.edu/${encodeURIComponent(lemma)}" target="_blank" rel="noopener">Ver no Logeion ↗</a></div>` : ""}
    </div>`;
  }).join("");

  // verbete mostrado
  let entryHtml = "";
  const ids = R.entry ? (R.entry.ids || (R.entry.lem !== undefined ? L[R.entry.lem][1] : [])) : [];
  if (ids.length) {
    const k = Math.min(R.entry.k || 0, ids.length - 1);
    const i = byId.get(ids[k]);
    if (i !== undefined) {
      const e = E[i];
      const tabs = ids.length > 1 ? `<div class="hom">${ids.map((id, j) => {
        const ix = byId.get(id);
        return ix === undefined ? "" : `<button class="${j === k ? "on" : ""}" data-k="${j}" lang="grc">${hwHtml(E[ix][1].split(",")[0])}</button>`;
      }).join("")}</div>` : "";
      entryHtml = `<div class="rentry">
        ${tabs}
        <h3 lang="grc">${hwHtml(e[1])}</h3>
        <div class="def" lang="pt">${renderDef(e[2]) || "<p><i>(sem definição)</i></p>"}</div>
        <a class="open" href="#/v/${e[0]}">abrir no dicionário →</a>
      </div>`;
    }
  } else if (!an.length) {
    entryHtml = `<div class="miss">Sem análise para esta palavra. <a href="#/grc/${encodeURIComponent(w[0])}">procurar “${esc(w[0])}” no dicionário</a></div>`;
  }

  p.innerHTML = `
    <div class="rp-head">
      <span class="rp-form" lang="grc">${esc(w[0])}</span>
      <span class="rp-nav">
        <button data-step="-1" title="palavra anterior (←)">‹</button>
        <button data-step="1" title="palavra seguinte (→)">›</button>
        <button data-close title="fechar (Esc)">✕</button>
      </span>
    </div>
    ${rows ? `<div class="ans">${rows}</div>` : ""}
    ${entryHtml}
    <div class="rp-note">${R.doc.meta.anotacaoManual
      ? "Análise manual (treebank de Vanessa Gorman, harmonizado pelo GLAUx)."
      : "Análise automática (GLAUx): lemas ≈ 99%, morfologia ≈ 97%, sintaxe ≈ 80% de acerto."}</div>`;
  p.hidden = false;
  p.scrollTop = 0;
  document.body.classList.add("panel-open");
}

function closePanel() {
  const p = $("#rpanel");
  if (p) p.hidden = true;
  document.body.classList.remove("panel-open");
  clearMarks();
  if (R) R.sel = -1;
}

function onPanelClick(ev) {
  const t = ev.target;
  const btn = t.closest("button");
  const gr = t.closest("a.gr");
  if (gr) {
    // palavra grega dentro do verbete: mostra-a aqui mesmo, se houver verbete exato
    const qn = decodeURIComponent(gr.getAttribute("href").replace("#/w/", ""));
    const ids = [];
    for (let i = 0; i < E.length; i++) if (keys[i] === qn) ids.push(E[i][0]);
    if (ids.length) { ev.preventDefault(); R.entry = { ids, k: 0 }; renderPanel(); }
    return;
  }
  if (!btn) return;
  if (btn.dataset.close !== undefined) { closePanel(); return; }
  if (btn.dataset.step) { step(+btn.dataset.step); return; }
  if (btn.dataset.lem) {
    const li = +btn.dataset.lem;
    R.entry = { lem: li, k: 0 };
    clearMarks();
    const el = wordEl(R.sel); if (el) el.classList.add("sel");
    markSame(li);
    renderPanel();
    return;
  }
  if (btn.dataset.k) { R.entry.k = +btn.dataset.k; renderPanel(); return; }
  if (btn.dataset.w) { selectWord(+btn.dataset.w); return; }
  if (btn.dataset.occ) { nextOccurrence(+btn.dataset.occ); return; }
}

function step(d) {
  if (!R || R.sel < 0) return;
  const j = R.sel + d;
  if (j >= 0 && j < R.doc.words.length) selectWord(j);
}

function nextOccurrence(li) {
  const list = R.doc.byLemma.get(li) || [];
  if (!list.length) return;
  const next = list.find(j => j > R.sel) ?? list[0];
  const keep = R.entry;
  selectWord(next);
  if (keep && keep.lem === li) { R.entry = keep; renderPanel(); }
}

document.addEventListener("keydown", ev => {
  if (!document.body.classList.contains("reading") || !R) return;
  if (ev.target.closest && ev.target.closest("input, textarea")) return;
  if (ev.key === "Escape") closePanel();
  else if (ev.key === "ArrowRight" && R.sel >= 0) { ev.preventDefault(); step(1); }
  else if (ev.key === "ArrowLeft" && R.sel >= 0) { ev.preventDefault(); step(-1); }
});

function leaveReader() {
  document.body.classList.remove("reading", "panel-open");
}
