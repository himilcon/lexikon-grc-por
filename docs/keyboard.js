/* Teclado grego politônico na tela.
   Os diacríticos funcionam como "teclas mortas pós-fixas": digite a letra e depois o sinal.
   Tocar de novo no mesmo sinal remove-o; sinais incompatíveis se substituem
   (agudo ↔ grave ↔ circunflexo; brando ↔ áspero; mácron ↔ breve). */
"use strict";

(function () {
  const input = document.getElementById("q");
  const form = document.getElementById("search-form");
  if (!input || !form) return;

  // Marcas combinantes, na ordem em que precisam ser aplicadas para o NFC compor
  const MARKS = {
    macron: "̄", breve: "̆", diaer: "̈",
    smooth: "̓", rough: "̔",
    acute: "́", grave: "̀", circ: "͂",
    iota: "ͅ",
  };
  const ORDER = ["macron", "breve", "diaer", "smooth", "rough", "acute", "grave", "circ", "iota"];
  const GROUPS = [["acute", "grave", "circ"], ["smooth", "rough"], ["macron", "breve"]];
  // Onde cada sinal é admissível (letra base, minúscula, sem diacríticos)
  const ALLOWED = {
    smooth: "αεηιουωρ", rough: "αεηιουωρ",
    acute: "αεηιουω", grave: "αεηιουω", circ: "αηιυω",
    iota: "αηω", diaer: "ιυ", macron: "αιυ", breve: "αιυ",
  };

  const LETTERS = [
    ["ς", "ε", "ρ", "τ", "υ", "θ", "ι", "ο", "π"],
    ["α", "σ", "δ", "φ", "γ", "η", "ξ", "κ", "λ"],
    ["ζ", "χ", "ψ", "ω", "β", "ν", "μ"],
  ];
  const DIAC = [
    ["smooth", "◌̓", "espírito brando (ψιλή)"],
    ["rough", "◌̔", "espírito áspero (δασεῖα)"],
    ["acute", "◌́", "acento agudo (ὀξεῖα)"],
    ["grave", "◌̀", "acento grave (βαρεῖα)"],
    ["circ", "◌͂", "acento circunflexo (περισπωμένη)"],
    ["iota", "◌ͅ", "iota subscrito (ὑπογεγραμμένη)"],
    ["diaer", "◌̈", "diérese (διαλυτικά)"],
    ["macron", "◌̄", "mácron (vogal longa)"],
    ["breve", "◌̆", "braquia (vogal breve)"],
  ];

  let shift = false;
  let open = false;

  /* ---------- montagem ---------- */

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "kbd-toggle";
  toggle.title = "Teclado grego politônico";
  toggle.setAttribute("aria-label", "Teclado grego politônico");
  toggle.setAttribute("aria-expanded", "false");
  toggle.textContent = "αβγ";
  input.insertAdjacentElement("afterend", toggle);

  const panel = document.createElement("div");
  panel.className = "kbd";
  panel.id = "kbd";
  panel.hidden = true;
  panel.setAttribute("role", "group");
  panel.setAttribute("aria-label", "Teclado grego politônico");
  form.parentElement.insertBefore(panel, form.nextSibling);

  const key = (cls, label, data, aria) =>
    `<button type="button" class="k ${cls}" ${data}${aria ? ` aria-label="${aria}" title="${aria}"` : ""}>${label}</button>`;

  function draw() {
    const rows = LETTERS.map(r =>
      `<div class="kr">${r.map(c => {
        const ch = shift ? up(c) : c;
        return key("kl", ch, `data-ch="${ch}"`);
      }).join("")}</div>`).join("");
    const diac = `<div class="kr kd">${DIAC.map(([k, lab, aria]) => key("km", lab, `data-mark="${k}"`, aria)).join("")}</div>`;
    const bottom = `<div class="kr">
      ${key("kw" + (shift ? " on" : ""), "⇧", 'data-act="shift"', "maiúscula")}
      ${key("kp", "’", `data-ch="’"`, "apóstrofo (elisão)")}
      ${key("ks", "espaço", 'data-ch=" "', "espaço")}
      ${key("kw", "⌫", 'data-act="back"', "apagar")}
      ${key("kw kgo", "↵", 'data-act="enter"', "abrir primeiro resultado")}
    </div>`;
    panel.innerHTML = rows + diac + bottom +
      `<div class="khelp">Digite a letra e depois o sinal: α + ◌̓ + ◌́ = ἄ · ω + ◌̔ + ◌͂ + ◌ͅ = ᾧ</div>`;
  }

  function up(c) {
    if (c === "ς") return "Σ";
    return c.toUpperCase();
  }

  /* ---------- edição ---------- */

  function caret() {
    const s = input.selectionStart ?? input.value.length;
    const e = input.selectionEnd ?? s;
    return [s, e];
  }

  function setValue(v, pos) {
    input.value = v;
    try { input.setSelectionRange(pos, pos); } catch { /* ignora */ }
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function insert(text) {
    const [s, e] = caret();
    const v = input.value;
    // σ no fim de palavra vira ς automaticamente quando se digita espaço ou pontuação
    let before = v.slice(0, s);
    if (/[\s’,.;]/.test(text)) before = before.replace(/σ$/, "ς");
    setValue(before + text + v.slice(e), before.length + text.length);
    if (shift) { shift = false; draw(); }
  }

  function backspace() {
    const [s, e] = caret();
    const v = input.value;
    if (s !== e) { setValue(v.slice(0, s) + v.slice(e), s); return; }
    if (!s) return;
    // apaga o caractere inteiro (letra + diacríticos), não só o último código
    const chars = [...v.slice(0, s)];
    chars.pop();
    const before = chars.join("");
    setValue(before + v.slice(s), before.length);
  }

  function applyMark(name) {
    const [s] = caret();
    const v = input.value;
    const chars = [...v.slice(0, s)];
    if (!chars.length) return flash();
    const prev = chars[chars.length - 1];
    const decomposed = prev.normalize("NFD");
    const base = decomposed[0];
    const lower = base.toLowerCase();
    if (!ALLOWED[name].includes(lower)) return flash();

    const has = new Set();
    for (const c of decomposed.slice(1)) {
      const k = Object.keys(MARKS).find(m => MARKS[m] === c);
      if (k) has.add(k);
    }
    if (has.has(name)) has.delete(name);
    else {
      for (const g of GROUPS) if (g.includes(name)) g.forEach(m => has.delete(m));
      has.add(name);
    }
    const composed = (base + ORDER.filter(m => has.has(m)).map(m => MARKS[m]).join("")).normalize("NFC");
    chars[chars.length - 1] = composed;
    const before = chars.join("");
    setValue(before + v.slice(s), before.length);
  }

  function flash() {
    panel.classList.remove("kbad");
    void panel.offsetWidth;
    panel.classList.add("kbad");
  }

  /* ---------- abrir / fechar ---------- */

  function setOpen(v, focus = true) {
    open = v;
    panel.hidden = !v;
    toggle.classList.toggle("on", v);
    toggle.setAttribute("aria-expanded", String(v));
    // em telas de toque, esconde o teclado do sistema enquanto o grego estiver aberto
    if (matchMedia("(pointer: coarse)").matches) input.setAttribute("inputmode", v ? "none" : "text");
    try { localStorage.setItem("lx.kbd", v ? "1" : ""); } catch { /* ignora */ }
    if (v) { draw(); if (focus) input.focus(); }
  }

  toggle.addEventListener("click", () => setOpen(!open));

  // mantém o foco (e o cursor) no campo de busca ao tocar nas teclas
  panel.addEventListener("pointerdown", ev => { if (ev.target.closest(".k")) ev.preventDefault(); });
  panel.addEventListener("mousedown", ev => { if (ev.target.closest(".k")) ev.preventDefault(); });

  panel.addEventListener("click", ev => {
    const b = ev.target.closest(".k");
    if (!b) return;
    if (b.dataset.ch) insert(b.dataset.ch);
    else if (b.dataset.mark) applyMark(b.dataset.mark);
    else if (b.dataset.act === "shift") { shift = !shift; draw(); }
    else if (b.dataset.act === "back") backspace();
    else if (b.dataset.act === "enter") form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event("submit", { cancelable: true }));
  });

  // Atalhos no teclado físico enquanto o painel está aberto: Alt + ) ( / \ = | +
  input.addEventListener("keydown", ev => {
    if (!open || !ev.altKey) return;
    const map = { ")": "smooth", "(": "rough", "/": "acute", "\\": "grave", "=": "circ", "|": "iota", "+": "diaer" };
    const m = map[ev.key];
    if (m) { ev.preventDefault(); applyMark(m); }
  });

  // Sincroniza a escolha do modo: o teclado grego não faz sentido na busca em português
  document.querySelectorAll('input[name="mode"]').forEach(r => r.addEventListener("change", () => {
    if (r.checked && r.value === "por" && open) setOpen(false);
  }));

  window.LexKeyboard = { applyMark, insert, setOpen };

  let saved = "";
  try { saved = localStorage.getItem("lx.kbd") || ""; } catch { /* ignora */ }
  if (saved) setOpen(true, false);
})();
