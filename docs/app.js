/* Λεξικόν — dicionário grego antigo–português (dados: DDGP, FCLAr/UNESP, CC BY-NC-SA 4.0) */
"use strict";

const DATA_URL = "data/ddgp.json?v=2022-3x-1";
const PAGE = 100;

const $ = (s, el = document) => el.querySelector(s);
const main = $("#main");
const qInput = $("#q");
const hint = $("#hint");

let E = [];            // [id, headword, definição]
let byId = new Map();  // id -> índice em E
let keys = [];         // chave normalizada principal (por índice)
let looseKeys = null;  // chaves sem distinção ε/η, ο/ω (busca por transliteração)
let alts = [];         // chaves secundárias (por índice)
let order = [];        // índices em ordem alfabética
let posInOrder = [];   // índice -> posição em `order`
let ptIndex = null;    // definições normalizadas (busca reversa, criada sob demanda)
let abbrMap = new Map();
let abbrRe = null;

/* ---------- normalização ---------- */

const GREEK_RUN = /[Ͱ-Ͽἀ-῿][Ͱ-Ͽἀ-῿̀-ͯʼ’᾽]*/g;
const HAS_GREEK = /[Ͱ-Ͽἀ-῿]/;
const HAS_LATIN = /[a-z]/i;

function normGr(s) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/ς/g, "σ").replace(/ϲ/g, "σ").replace(/[^α-ω]/g, "");
}
function normPt(s) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/* Transliteração / Beta Code -> grego sem diacríticos */
const DIGRAPHS = [["nkh", "γχ"], ["nch", "γχ"], ["ng", "γγ"], ["nk", "γκ"], ["nx", "γξ"],
  ["th", "θ"], ["ph", "φ"], ["ch", "χ"], ["kh", "χ"], ["ps", "ψ"], ["ks", "ξ"], ["rh", "ρ"]];
const SINGLE = { a: "α", b: "β", g: "γ", d: "δ", e: "ε", z: "ζ", h: "η", q: "θ", i: "ι", k: "κ",
  l: "λ", m: "μ", n: "ν", x: "ξ", o: "ο", p: "π", r: "ρ", s: "σ", t: "τ", u: "υ", y: "υ",
  f: "φ", c: "χ", w: "ω", v: "β", j: "ι" };

function latinToGreek(s) {
  s = s.toLowerCase().replace(/ē/g, "η").replace(/ō/g, "ω").replace(/ê/g, "η").replace(/ô/g, "ω");
  s = s.normalize("NFD").replace(/[̀-ͯ]/g, "");
  s = s.replace(/[*()\/\\=+|'’]/g, "");
  return s.split(/\s+/).map(w => {
    if (/^h[aeiouyw]/.test(w)) w = w.slice(1);           // h inicial + vogal = espírito áspero
    for (const [a, b] of DIGRAPHS) w = w.split(a).join(b);
    return [...w].map(c => SINGLE[c] ?? c).join("");
  }).join(" ");
}

/* ---------- dados ---------- */

async function loadData() {
  const pct = $("#load-pct");
  const res = await fetch(DATA_URL);
  if (!res.ok) throw new Error("HTTP " + res.status);
  let text;
  if (res.body && res.body.getReader) {
    const total = +res.headers.get("content-length") || 0;
    const reader = res.body.getReader();
    const chunks = [];
    let got = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value); got += value.length;
      pct.textContent = total ? `(${Math.min(100, Math.round(got / total * 100))}%)` : `(${(got / 1048576).toFixed(1)} MB)`;
    }
    const buf = new Uint8Array(got);
    let off = 0;
    for (const c of chunks) { buf.set(c, off); off += c.length; }
    text = new TextDecoder("utf-8").decode(buf);
  } else {
    text = await res.text();
  }
  return JSON.parse(text);
}

function buildIndex(data) {
  E = data.entries;
  // abreviaturas ambíguas (at. = Ateneu / ativo) mostram todos os sentidos
  const add = (k, desc) => {
    const cur = abbrMap.get(k);
    if (!cur) abbrMap.set(k, { desc });
    else if (!cur.desc.split(" · ").includes(desc)) cur.desc += " · " + desc;
  };
  for (const [ab, desc] of data.abbrev) add(ab, desc.trim());
  for (const [ab, desc] of data.abbrev) if (!data.abbrev.some(a => a[0] === ab.toLowerCase())) add(ab.toLowerCase(), desc.trim());
  const list = [...new Set(data.abbrev.map(a => a[0]))]
    .filter(a => a.length > 1)
    .sort((a, b) => b.length - a.length)
    .map(a => a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  abbrRe = list.join("|");

  E.forEach((e, i) => {
    byId.set(e[0], i);
    const hw = e[1];
    const first = (hw.split(",")[0].trim().split(/\s+/)[0] || hw);
    const k = normGr(first) || normGr(hw);
    keys[i] = k;
    const a = new Set();
    for (const tok of hw.match(GREEK_RUN) || []) {
      const t = normGr(tok);
      if (t && t !== k && t.length >= 4 && !k.endsWith(t)) a.add(t);
    }
    alts[i] = [...a];
  });
  order = E.map((_, i) => i).sort((x, y) =>
    keys[x] < keys[y] ? -1 : keys[x] > keys[y] ? 1 : E[x][0] - E[y][0]);
  order.forEach((ix, p) => { posInOrder[ix] = p; });
}

/* ---------- busca ---------- */

const loose = s => s.replace(/η/g, "ε").replace(/ω/g, "ο");

function searchGreek(qn, isLoose) {
  if (!qn) return [];
  if (isLoose) {
    if (!looseKeys) looseKeys = { k: keys.map(loose), a: alts.map(l => l.map(loose)) };
    qn = loose(qn);
  }
  const K = isLoose ? looseKeys.k : keys, A = isLoose ? looseKeys.a : alts;
  const out = [];
  for (let i = 0; i < E.length; i++) {
    const k = K[i];
    let s = -1;
    if (k === qn) s = 0;
    else if (k.startsWith(qn)) s = 2;
    else {
      for (const a of A[i]) {
        if (a === qn) { s = 1; break; }
        if (a.startsWith(qn)) s = 3;
      }
      if (s < 0 && qn.length >= 3 && k.includes(qn)) s = 4;
    }
    if (s >= 0) out.push([s, i]);
  }
  out.sort((a, b) => a[0] - b[0] || keys[a[1]].length - keys[b[1]].length || posInOrder[a[1]] - posInOrder[b[1]]);
  return out.map(x => x[1]);
}

function searchPortuguese(q) {
  const words = normPt(q).split(/[^a-z0-9À-ɏ]+/).filter(w => w.length >= 2);
  if (!words.length) return [];
  if (!ptIndex) ptIndex = E.map(e => normPt(e[2]));
  const res = words.map(w => new RegExp("(^|[^a-z0-9])" + w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), ""));
  const out = [];
  for (let i = 0; i < E.length; i++) {
    const h = ptIndex[i];
    let first = Infinity, ok = true;
    for (const re of res) {
      const m = re.exec(h);
      if (!m) { ok = false; break; }
      first = Math.min(first, m.index);
    }
    if (ok) {
      const w0 = words[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      // 0: acepção é só a palavra ("1 cão;"); 1: acepção começa por ela; 2: palavra inteira; 3: prefixo
      const rank = new RegExp("(^|\\n|\\d |; )" + w0 + "([;.,:\\n]|$)").test(h) ? 0
        : new RegExp("(^|\\n|\\d |; |: )" + w0 + " ").test(h) ? 1
        : new RegExp("(^|[^a-z0-9])" + w0 + "([^a-z0-9]|$)").test(h) ? 2 : 3;
      out.push([rank, first, i]);
    }
  }
  out.sort((a, b) => a[0] - b[0] || a[1] - b[1] || posInOrder[a[2]] - posInOrder[b[2]]);
  return out.map(x => x[2]);
}

/* ---------- renderização ---------- */

const esc = s => s.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function hwHtml(hw) {
  return esc(hw).replace(/([^\d\s,])(\d)(?=[\s,]|$)/g, "$1<sup>$2</sup>");
}

function firstGloss(def) {
  const line = def.split("\n").find(l => /^\d+ /.test(l)) || def.split("\n")[0] || "";
  return line.replace(/^\d+ /, "").replace(/〈[^〉]*〉/g, "").trim();
}

function inline(text) {
  const re = new RegExp(`(${GREEK_RUN.source})|(〈)|(〉)` + (abbrRe ? `|(${abbrRe})` : ""), "gi");
  let out = "", last = 0, m;
  while ((m = re.exec(text))) {
    const [tok, gr, open, close, ab] = m;
    if (ab) {
      const prev = text[m.index - 1] || " ";
      const next = text[m.index + tok.length] || " ";
      const info = abbrMap.get(tok) || abbrMap.get(tok.toLowerCase());
      if (/\p{L}/u.test(prev) || (!tok.endsWith(".") && /\p{L}/u.test(next)) || !info) continue;
      out += esc(text.slice(last, m.index)) +
        `<abbr data-t="${esc(info.desc.trim())}" title="${esc(info.desc.trim())}">${esc(tok)}</abbr>`;
    } else if (gr) {
      out += esc(text.slice(last, m.index)) +
        `<a class="gr" href="#/w/${encodeURIComponent(normGr(tok))}">${esc(tok)}</a>`;
    } else if (open) {
      out += esc(text.slice(last, m.index)) + `<span class="etym">〈`;
    } else if (close) {
      out += esc(text.slice(last, m.index)) + `〉</span>`;
    }
    last = m.index + tok.length;
  }
  out += esc(text.slice(last));
  // fecha um 〈 sem par, se houver
  const opens = (out.match(/<span class="etym">/g) || []).length, closes = (out.match(/〉<\/span>/g) || []).length;
  return out + "</span>".repeat(Math.max(0, opens - closes));
}

function renderDef(def) {
  let html = "", inList = false;
  for (const line of def.split("\n")) {
    const m = /^(\d{1,2}) (\D.*)$/.exec(line);
    if (m) {
      if (!inList) { html += "<ol>"; inList = true; }
      html += `<li><span class="n">${m[1]}</span><span>${inline(m[2])}</span></li>`;
      continue;
    }
    if (inList) { html += "</ol>"; inList = false; }
    if (line.startsWith("♦")) html += `<div class="grp">${inline(line.replace(/^♦\s*/, ""))}</div>`;
    else if (line.trim()) html += `<p>${inline(line)}</p>`;
  }
  if (inList) html += "</ol>";
  return html;
}

function resultList(idxs, opts = {}) {
  const shown = idxs.slice(0, opts.limit || PAGE);
  const mark = opts.mark ? new RegExp("(" + opts.mark + ")", "i") : null;
  const items = shown.map(i => {
    let gl = esc(opts.snippet ? snippet(E[i][2], opts.snippet) : firstGloss(E[i][2]));
    if (mark) gl = gl.replace(mark, "<mark>$1</mark>");
    return `<li><a href="#/v/${E[i][0]}"><span class="hw">${hwHtml(E[i][1])}</span><span class="gl">${gl}</span></a></li>`;
  }).join("");
  return `<ul class="results">${items}</ul>` +
    (idxs.length > shown.length ? `<button class="more" data-more="${shown.length + PAGE}">Mostrar mais (${idxs.length - shown.length} restantes)</button>` : "");
}

function snippet(def, word) {
  const flat = def.replace(/\n/g, " · ");
  const at = normPt(flat).search(new RegExp("(^|[^a-z0-9])" + word));
  if (at < 0) return firstGloss(def);
  const start = Math.max(0, at - 40);
  return (start ? "…" : "") + flat.slice(start, start + 140) + (start + 140 < flat.length ? "…" : "");
}

/* ---------- estado local (favoritos, histórico) ---------- */

const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sem armazenamento */ } },
};
const favs = () => store.get("lx.favs", []);
function toggleFav(id) {
  const f = favs(); const p = f.indexOf(id);
  if (p >= 0) f.splice(p, 1); else f.unshift(id);
  store.set("lx.favs", f); return p < 0;
}
function pushHistory(id) {
  const h = store.get("lx.hist", []).filter(x => x !== id);
  h.unshift(id); store.set("lx.hist", h.slice(0, 30));
}

/* ---------- páginas ---------- */

const ALPHA = "ΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩ";

function viewHome() {
  setActiveLetter(null);
  const hist = store.get("lx.hist", []).map(id => byId.get(id)).filter(i => i !== undefined);
  const chip = i => `<a href="#/v/${E[i][0]}">${hwHtml(E[i][1].split(",")[0])}</a>`;
  const examples = ["λόγος", "ἀρετή", "μῆνις", "ἄνθρωπος", "ψυχή", "θάλασσα", "πρόβατον", "λύκος"]
    .map(w => `<a href="#/w/${encodeURIComponent(normGr(w))}">${w}</a>`).join("");
  main.innerHTML = `
    <p class="home-intro">${E.length.toLocaleString("pt-BR")} verbetes do <i>Dicionário Grego-Português</i> (DDGP, FCLAr/UNESP).
      Digite em grego, com ou sem acentos, ou em transliteração (<i>logos</i>, <i>psyche</i>) ou Beta Code (<i>lo/gos</i>).
      Para buscar pelo significado, escolha <b>Português</b>.</p>
    ${hist.length ? `<h3 class="count">Consultados recentemente</h3><div class="chips">${hist.slice(0, 15).map(chip).join("")}</div>` : ""}
    <h3 class="count">Experimente</h3><div class="chips">${examples}<a href="#/acaso">ao acaso ↻</a></div>`;
}

function viewSearch(mode, q) {
  setActiveLetter(null);
  if (qInput.value !== q && document.activeElement !== qInput) qInput.value = q;
  setMode(mode);
  hint.innerHTML = "";
  if (!q.trim()) { viewHome(); return; }
  let idxs, opts = {};
  if (mode === "por") {
    idxs = searchPortuguese(q);
    const w = normPt(q).split(/[^a-z0-9À-ɏ]+/).filter(x => x.length >= 2)[0];
    if (w) { opts.snippet = w; opts.mark = null; }
  } else {
    let qn, isLoose = false;
    if (HAS_GREEK.test(q)) qn = normGr(q);
    else if (HAS_LATIN.test(q)) {
      const g = latinToGreek(q).replace(/σ(?=\s|$)/g, "ς"); qn = normGr(g); isLoose = true;
      hint.innerHTML = `Interpretado como <b>${esc(g)}</b> (ε = η, ο = ω) · <a href="#/por/${encodeURIComponent(q)}">buscar “${esc(q)}” nos significados em português</a>`;
    } else qn = normGr(q);
    idxs = searchGreek(qn, isLoose);
  }
  renderResults(idxs, opts, mode === "por" ? "significados" : "verbetes");
}

function renderResults(idxs, opts, what) {
  if (!idxs.length) { main.innerHTML = `<div class="empty">Nenhum resultado.</div>`; return; }
  const draw = (limit) => {
    main.innerHTML = `<div class="count">${idxs.length.toLocaleString("pt-BR")} ${what}</div>` + resultList(idxs, { ...opts, limit });
    const more = $(".more", main);
    if (more) more.onclick = () => { const y = scrollY; draw(+more.dataset.more); scrollTo(0, y); };
  };
  draw(PAGE);
}

function viewWord(qn) {
  // link a partir de uma palavra grega dentro de um verbete
  const exact = [];
  for (let i = 0; i < E.length; i++) if (keys[i] === qn) exact.push(i);
  if (exact.length === 1) { viewEntry(E[exact[0]][0], true); return; }
  hint.innerHTML = "";
  setMode("grc");
  qInput.value = qn;
  renderResults(exact.length ? exact.concat(searchGreek(qn).filter(i => !exact.includes(i))) : searchGreek(qn), {}, "verbetes");
}

function viewEntry(id, fromLink) {
  const i = byId.get(+id);
  if (i === undefined) { main.innerHTML = `<div class="empty">Verbete não encontrado.</div>`; return; }
  const e = E[i];
  pushHistory(e[0]);
  const p = posInOrder[i];
  const prev = p > 0 ? E[order[p - 1]] : null;
  const next = p < order.length - 1 ? E[order[p + 1]] : null;
  const isFav = favs().includes(e[0]);
  setActiveLetter(letterOf(keys[i]));
  main.innerHTML = `
    <article class="entry" lang="pt">
      <div class="entry-head">
        <h1 lang="grc">${hwHtml(e[1])}</h1>
        <button class="star ${isFav ? "on" : ""}" id="star" aria-pressed="${isFav}" title="Favorito">★</button>
      </div>
      <div class="def">${renderDef(e[2]) || "<p><i>(sem definição)</i></p>"}</div>
      <nav class="entry-nav">
        ${prev ? `<a href="#/v/${prev[0]}">← ${hwHtml(prev[1].split(",")[0])}</a>` : "<span></span>"}
        ${next ? `<a href="#/v/${next[0]}">${hwHtml(next[1].split(",")[0])} →</a>` : "<span></span>"}
      </nav>
      <div class="entry-meta">DDGP nº ${e[0]} · <button class="btn-link" id="share">copiar link</button></div>
    </article>`;
  $("#star").onclick = ev => {
    const on = toggleFav(e[0]);
    ev.currentTarget.classList.toggle("on", on);
    ev.currentTarget.setAttribute("aria-pressed", on);
  };
  $("#share").onclick = async ev => {
    const url = location.href;
    try {
      if (navigator.share && matchMedia("(pointer: coarse)").matches) await navigator.share({ title: e[1], url });
      else { await navigator.clipboard.writeText(url); ev.target.textContent = "link copiado"; }
    } catch { /* cancelado */ }
  };
  if (!fromLink) scrollTo(0, 0);
}

function letterOf(k) {
  const L = normGr(ALPHA);
  const p = L.indexOf(k[0] || "-");
  return p >= 0 ? ALPHA[p] : null;
}

function viewLetter(L) {
  const l = normGr(L);
  setActiveLetter(L);
  const idxs = order.filter(i => keys[i].startsWith(l));
  renderResults(idxs, {}, `verbetes em ${L}`);
}

function viewFavs() {
  setActiveLetter(null);
  const f = favs().map(id => byId.get(id)).filter(i => i !== undefined);
  main.innerHTML = `<div class="page"><h2>Favoritos</h2>` +
    (f.length ? resultList(f, { limit: 1000 }) : `<p class="empty">Toque em ★ num verbete para guardá-lo aqui. Os favoritos ficam salvos neste aparelho.</p>`) + `</div>`;
}

function viewAbout() {
  setActiveLetter(null);
  const rows = [["a", "α"], ["b", "β"], ["g", "γ"], ["d", "δ"], ["e", "ε"], ["z", "ζ"], ["h, ē, ê", "η (h inicial antes de vogal = espírito áspero)"],
    ["th, q", "θ"], ["i", "ι"], ["k", "κ"], ["l", "λ"], ["m", "μ"], ["n", "ν"], ["x, ks", "ξ"], ["o", "ο"], ["p", "π"], ["r, rh", "ρ"],
    ["s", "σ / ς"], ["t", "τ"], ["u, y", "υ"], ["ph, f", "φ"], ["ch, kh, c", "χ"], ["ps", "ψ"], ["w, ō, ô", "ω"], ["ng, nk", "γγ, γκ"]];
  main.innerHTML = `<div class="page">
    <h2>Sobre</h2>
    <p>Este aplicativo é uma interface de consulta, de uso livre e não comercial, ao
      <a href="https://github.com/aniseferreira/Grc-Por-DigDict" target="_blank" rel="noopener"><i>Dicionário Digital Grego-Português</i> (DDGP)</a>,
      edição digital do <i>Dicionário Grego-Português</i> (5 vols., Ateliê Editorial, 2006–2010), coordenado por
      M. Celeste C. Dezotti, Daisi Malhadas e M. Helena de Moura Neves (FCLAr/UNESP), com autores da USP, UFMG, UFRJ e UFF.
      Edição digital coordenada por Anise D'Orange Ferreira (FCLAr/UNESP).</p>
    <p>Os dados vêm do arquivo <code>DDGP-3x-files/ddgp3x-copia_8nov_22.sql</code> (versão 3x, 2022), convertidos para JSON.
      Alterações feitas na conversão: normalização Unicode (NFC), remoção de hifens de diagramação, uma acepção numerada por linha.
      O conteúdo lexicográfico não foi alterado.</p>
    <p>Licença dos dados: <a href="https://creativecommons.org/licenses/by-nc-sa/4.0/deed.pt-br" target="_blank" rel="noopener">CC BY-NC-SA 4.0</a>.
      Este projeto não é afiliado à UNESP nem endossado pelos autores do dicionário.
      Correções ao conteúdo devem ser enviadas ao projeto original.</p>

    <h3>Como buscar</h3>
    <p><b>Grego</b>: digite com ou sem acentos e espíritos (<i>λογος</i> encontra λόγος). Também aceita transliteração e Beta Code:</p>
    <table><tr><th>Digite</th><th>Grego</th></tr>${rows.map(([a, b]) => `<tr><td><code>${a}</code></td><td>${b}</td></tr>`).join("")}</table>
    <p>Sinais de Beta Code (<code>/ \\ = ( ) + |</code>) são ignorados. A busca encontra o lema exato, depois os que começam pelo texto digitado e as formas citadas no cabeçalho do verbete.</p>
    <h3>Teclado grego politônico</h3>
    <p>Toque em <b>αβγ</b>, ao lado do campo de busca. Digite a letra e <i>depois</i> o sinal:
      α + ◌̓ + ◌́ = ἄ; ω + ◌̔ + ◌͂ + ◌ͅ = ᾧ; ρ + ◌̔ = ῥ. Tocar de novo no mesmo sinal o remove; agudo, grave e
      circunflexo se substituem entre si, assim como os dois espíritos. O σ final vira ς ao digitar espaço.
      Num teclado físico, com o painel aberto: <code>Alt</code> + <code>)</code> brando, <code>(</code> áspero,
      <code>/</code> agudo, <code>\\</code> grave, <code>=</code> circunflexo, <code>|</code> iota subscrito, <code>+</code> diérese.
      Como a busca ignora acentos, os sinais servem para escrever corretamente e copiar, não são obrigatórios.</p>
    <p><b>Português</b>: procura nos significados (todas as palavras digitadas precisam aparecer).</p>
    <p>Dentro de um verbete, toque numa palavra grega para procurá-la e numa abreviatura (<i>hom.</i>, <i>aor.</i>…) para ver o que significa.</p>

    <h3>Instalar no iPhone / iPad</h3>
    <p>No Safari, toque em <b>Compartilhar</b> → <b>Adicionar à Tela de Início</b>. Depois do primeiro carregamento o dicionário funciona sem internet.</p>

    <h3>Tema</h3>
    <p><button class="btn-link" data-theme-set="">automático</button> · <button class="btn-link" data-theme-set="light">claro</button> · <button class="btn-link" data-theme-set="dark">escuro</button></p>
  </div>`;
  main.querySelectorAll("[data-theme-set]").forEach(b => b.onclick = () => setTheme(b.dataset.themeSet));
}

function viewRandom() {
  const i = Math.floor(Math.random() * E.length);
  location.replace("#/v/" + E[i][0]);
}

/* ---------- roteamento ---------- */

function route() {
  hideAbbr();
  const h = decodeURIComponent(location.hash.replace(/^#\/?/, ""));
  const [r, ...rest] = h.split("/");
  const arg = rest.join("/");
  if (r !== "grc" && r !== "por") hint.innerHTML = "";
  switch (r) {
    case "v": viewEntry(arg); break;
    case "w": viewWord(normGr(arg)); break;
    case "grc": case "por": viewSearch(r, arg); break;
    case "l": viewLetter(arg); break;
    case "favoritos": viewFavs(); break;
    case "sobre": viewAbout(); break;
    case "acaso": viewRandom(); break;
    default: qInput.value = ""; viewHome();
  }
}

function currentMode() { return $('input[name="mode"]:checked').value; }
function setMode(m) { const r = $(`input[name="mode"][value="${m}"]`); if (r) r.checked = true; }
function setActiveLetter(L) {
  document.querySelectorAll(".alphabet a").forEach(a => a.classList.toggle("on", a.dataset.l === L));
}
function setTheme(t) {
  if (t) document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme;
  store.set("lx.theme", t || "");
}

let tmr;
function onType() {
  clearTimeout(tmr);
  tmr = setTimeout(() => {
    const q = qInput.value;
    const target = q.trim() ? `#/${currentMode()}/${encodeURIComponent(q)}` : "#/";
    const fromSearch = /^#\/(grc|por)\//.test(location.hash);
    if (fromSearch || !q.trim()) history.replaceState(null, "", target); else history.pushState(null, "", target);
    route();
  }, 140);
}

/* ---------- popover de abreviaturas (toque no iOS) ---------- */

let pop;
function showAbbr(el) {
  hideAbbr();
  pop = document.createElement("div");
  pop.className = "abbr-pop";
  pop.textContent = el.dataset.t;
  document.body.appendChild(pop);
  const r = el.getBoundingClientRect();
  const w = pop.offsetWidth;
  pop.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.left + r.width / 2 - w / 2)) + "px";
  pop.style.top = (r.top - pop.offsetHeight - 6 < 8 ? r.bottom + 6 : r.top - pop.offsetHeight - 6) + "px";
}
function hideAbbr() { if (pop) { pop.remove(); pop = null; } }

/* ---------- início ---------- */

async function start() {
  const t = store.get("lx.theme", "");
  if (t) document.documentElement.dataset.theme = t;

  $("#alphabet").innerHTML = [...ALPHA].map(L => `<a href="#/l/${L}" data-l="${L}">${L}</a>`).join("");

  qInput.addEventListener("input", onType);
  document.querySelectorAll('input[name="mode"]').forEach(r => r.addEventListener("change", () => {
    if (qInput.value.trim()) onType();
    qInput.focus();
  }));
  $("#search-form").addEventListener("submit", ev => {
    ev.preventDefault();
    const first = $(".results a", main);
    if (first) { qInput.blur(); location.hash = first.getAttribute("href"); }
  });
  document.addEventListener("keydown", ev => {
    if (ev.key === "/" && document.activeElement !== qInput) { ev.preventDefault(); qInput.focus(); qInput.select(); }
  });
  document.addEventListener("click", ev => {
    const a = ev.target.closest("abbr[data-t]");
    if (a) { ev.preventDefault(); showAbbr(a); } else hideAbbr();
  });
  addEventListener("scroll", hideAbbr, { passive: true });

  try {
    buildIndex(await loadData());
  } catch (err) {
    main.innerHTML = `<div class="empty">Não foi possível carregar o dicionário (${esc(String(err.message || err))}).<br>Verifique a conexão e recarregue a página.</div>`;
    return;
  }
  addEventListener("hashchange", route);
  route();

  if ("serviceWorker" in navigator && location.protocol === "https:") {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
}

start();
