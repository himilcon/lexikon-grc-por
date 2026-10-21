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
  textCache.set(id, doc);
  return doc;
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
  const cards = idx.textos.map(t => {
    const pos = store.get("lx.read." + t.id, null);
    return `<li class="tcard">
      <a href="#/t/${t.id}">
        <span class="tcard-gr" lang="grc">${esc(t.autorGr)} · ${esc(t.tituloGr)}</span>
        <span class="tcard-pt">${esc(t.autor)}, <i>${esc(t.titulo)}</i></span>
        <span class="tcard-desc">${esc(t.descricao)}</span>
        <span class="tcard-meta">${t.palavras.toLocaleString("pt-BR")} palavras${pos ? ` · parou em §${esc(pos)}` : ""}</span>
      </a></li>`;
  }).join("");
  main.innerHTML = `<div class="page">
    <h2>Textos</h2>
    <p class="home-intro">Toque numa palavra para ver o lema, a análise morfológica e o verbete do dicionário.
      As análises vêm do corpus <a href="https://github.com/alekkeersmaekers/glaux" target="_blank" rel="noopener">GLAUx</a>
      e são automáticas: confira-as, sobretudo a sintaxe.</p>
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
    R = { id, doc, sel: -1, entry: null };
    renderReader();
  }
  const sec = target || null;
  if (sec) {
    const el = main.querySelector(`[data-s="${CSS.escape(sec)}"]`);
    if (el) { el.scrollIntoView({ block: "start" }); scrollBy(0, -scrollOffset()); flash(el); }
  } else if (!R.scrolled) {
    scrollTo(0, 0);
  }
  R.scrolled = true;
}

function scrollOffset() {
  const s = $(".search-wrap");
  return (s ? s.offsetHeight : 0) + 12;
}

function flash(el) {
  el.classList.remove("flash"); void el.offsetWidth; el.classList.add("flash");
}

function renderReader() {
  const { doc } = R;
  const m = doc.meta;
  let wi = 0, html = "";
  const chapters = [];
  for (const b of doc.blocos) {
    if (b.t === "c") {
      chapters.push(b.c);
      html += `<h2 class="cap" id="cap-${esc(b.c)}" data-s="${esc(b.c)}">${esc(b.c)}</h2>`;
      continue;
    }
    let inner = "";
    for (const it of b.x) {
      if (typeof it === "string") inner += esc(it);
      else if (Array.isArray(it)) {
        inner += `<span class="w${it[1].length ? "" : " nx"}" data-i="${wi}">${esc(it[0])}</span>`;
        wi++;
      } else if (it.s) inner += `<a class="sec" href="#/t/${R.id}/${esc(it.s)}" data-s="${esc(it.s)}" title="§${esc(it.s)}">${esc(it.s.split(".").pop())}</a>`;
      else if (it.pb) inner += `<span class="pb" title="página ${esc(it.pb)} da ed. de Bekker (Oxford, 1837)">${esc(it.pb)}</span>`;
    }
    html += b.t === "h" ? `<h1 class="rtitle" lang="grc">${inner}</h1>` : `<p lang="grc">${inner}</p>`;
  }
  const last = store.get("lx.read." + R.id, null);
  main.innerHTML = `
    <div class="reader">
      <div class="rcol">
        <header class="rhead">
          <a class="rback" href="#/textos">← Textos</a>
          <div class="rmeta"><span lang="grc">${esc(m.autorGr)}</span> · ${esc(m.autor)}, <i>${esc(m.titulo)}</i></div>
          <nav class="rcaps" aria-label="Capítulos">${chapters.map(c => `<a href="#/t/${R.id}/${esc(c)}">${esc(c)}</a>`).join("")}</nav>
          ${last && last !== chapters[0] + ".1" ? `<a class="rcont" href="#/t/${R.id}/${esc(last)}">continuar em §${esc(last)} →</a>` : ""}
        </header>
        <article class="rtext" id="rtext">${html}</article>
        <footer class="rsrc">
          <p><b>Texto:</b> ${esc(m.edicao)} Transcrição digital: <a href="${esc(m.fonteTexto.url)}" target="_blank" rel="noopener">${esc(m.fonteTexto.nome)}</a>, ${esc(m.fonteTexto.licenca)}.</p>
          <p><b>Lemas, morfologia e sintaxe:</b> <a href="${esc(m.fonteAnotacao.url)}" target="_blank" rel="noopener">${esc(m.fonteAnotacao.nome)}</a>, ${esc(m.fonteAnotacao.licenca)}. ${esc(m.fonteAnotacao.nota)}</p>
          <p>Os números à margem do texto são as seções (capítulo.seção) da edição digital; os números pequenos e apagados, as páginas da edição de Bekker de 1837.
            ${doc.estat.lemas_sem_verbete} dos ${doc.estat.lemas} lemas do texto não constam do DDGP; nesses casos o painel mostra só a análise.</p>
        </footer>
      </div>
      <aside class="rpanel" id="rpanel" aria-live="polite" hidden></aside>
    </div>`;
  $("#rtext").addEventListener("click", onWordClick);
  $("#rpanel").addEventListener("click", onPanelClick);
}

function onWordClick(ev) {
  const w = ev.target.closest(".w");
  if (!w) return;
  selectWord(+w.dataset.i);
}

function wordEl(i) { return main.querySelector(`.w[data-i="${i}"]`); }

function clearMarks() {
  main.querySelectorAll(".w.sel, .w.same, .w.head, .w.dep").forEach(el => el.classList.remove("sel", "same", "head", "dep"));
}

function selectWord(i) {
  if (!R) return;
  const w = R.doc.words[i];
  if (!w) return;
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
  let s = null, n = el;
  // procura o marcador de seção anterior à palavra
  const marks = [...main.querySelectorAll("#rtext [data-s]")];
  for (const m of marks) {
    if (m.compareDocumentPosition(n) & Node.DOCUMENT_POSITION_FOLLOWING) s = m.dataset.s; else break;
  }
  if (s) store.set("lx.read." + R.id, s.includes(".") ? s : s + ".1");
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
    <div class="rp-note">Análise automática (GLAUx): lemas ≈ 99%, morfologia ≈ 97%, sintaxe ≈ 80% de acerto.</div>`;
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
