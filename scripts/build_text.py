#!/usr/bin/env python3
"""
Gera o arquivo de leitura de um texto grego para o leitor do Λεξικόν.

Junta três fontes:
  1. o texto em TEI/EpiDoc (First1KGreek ou Perseus canonical-greekLit), que é o que se exibe;
  2. a anotação do GLAUx (lema, morfologia e sintaxe por palavra, anotação automática);
  3. o dicionário DDGP (docs/data/ddgp.json), para ligar cada lema ao seu verbete.

O texto do GLAUx deriva do mesmo TEI, mas é tokenizado de outro modo (crases e
palavras como οὔτε divididas, termos elípticos acrescentados, maiúsculas perdidas).
Por isso as palavras do TEI são alinhadas às do GLAUx comparando-se apenas as letras
sem diacríticos; a ortografia exibida é sempre a do TEI.

Uso:
    python3 scripts/build_text.py scripts/textos/aristoteles-categorias.json \
        caminho/para/tlg0086.tlg006.1st1K-grc1.xml \
        caminho/para/glaux/xml/0086-006.xml \
        docs/data/ddgp.json \
        docs/textos

Saída: docs/textos/<id>.json e a entrada correspondente em docs/textos/index.json.
"""
import difflib
import hashlib
import json
import os
import re
import sys
import unicodedata as ud
import xml.etree.ElementTree as ET
from collections import Counter

TEI = "{http://www.tei-c.org/ns/1.0}"

# ---------------------------------------------------------------- normalização

def nfc(s):
    return ud.normalize("NFC", s)


def bare(s):
    """Letras gregas minúsculas sem diacríticos (chave de alinhamento e de busca)."""
    s = ud.normalize("NFD", s)
    s = re.sub("[̀-ͯ]", "", s).lower().replace("ς", "σ").replace("ϲ", "σ")
    return re.sub("[^α-ω]", "", s)


def accented(s):
    """Minúsculas com acentos e espíritos; grave → agudo; só letras e diacríticos."""
    s = ud.normalize("NFD", s).lower().replace("̀", "́").replace("ς", "σ")
    s = re.sub("[^α-ὼ-ͯ]", "", s)
    return ud.normalize("NFC", s)


# ---------------------------------------------------------------- dicionário

# Verbetes que só remetem a uma forma ("3ª sing. impf. de εἰμί", "cf. ἄγω") vão para o fim
FORMREF = re.compile(r"^(\(?[^|]{0,90}?\b(sing|pl|dual|aor|impf|perf|fut|part|inf|gen|dat|ac|nom|voc|imper|subj|opt|"
                     r"contr|crase|elisão|m\.-q\.-perf)\b[^|]{0,60}\bde\s+\S+\.?\s*$|cf\.\s)")

# Homógrafos em que a escolha automática erraria; lema (GLAUx) → número do verbete DDGP preferido
PREFERRED = {
    "λέγω": 24820,   # λέγω2 'dizer' (λέγω1 = 'reunir')
}

# Lemas do GLAUx corrigidos (erro de anotação ou lema que o DDGP registra noutra forma)
LEMMA_FIX = {
    "ὀμώνυμα": "ὁμώνυμος",   # maiúscula inicial ὉΜΩΝΥΜΑ perdeu o espírito no GLAUx
    "ἐλαχύς": "ἐλάχιστος",
    "μουσική": "μουσικός",
    "κεράμιον": "κεράμιος",
    "ἔνιοι": "ἔνιος",
    "ἥδομαι": "ἥδω",
    "ἐφύω": "φύω",           # ἔφυσεν, aor. de φύω
}


def load_ddgp(path):
    data = json.load(open(path, encoding="utf-8"))
    by_acc, by_bare = {}, {}
    for eid, hw, definition in data["entries"]:
        first = hw.split(",")[0].strip()
        tok = (first.split() or [hw])[0]
        tok = re.sub(r"[\d¹²³⁴]+$", "", tok)
        if "-" in tok[1:]:
            tok = tok.split("-")[0] or tok          # ποιέω-ῶ → ποιέω
        a, b = accented(tok), bare(tok)
        if not b:
            continue
        rank = 1 if FORMREF.search(definition) else 0
        by_acc.setdefault(a, []).append((rank, eid))
        by_bare.setdefault(b, []).append((rank, eid))
    for d in (by_acc, by_bare):
        for k in d:
            d[k] = [eid for _, eid in sorted(d[k])]
    return by_acc, by_bare


def ddgp_ids(lemma, form, by_acc, by_bare):
    """Verbetes do DDGP para um lema, na ordem de preferência. Devolve (ids, como)."""
    for key, how in ((lemma, "lema"), (form, "forma")):
        if not key:
            continue
        ids = by_acc.get(accented(key)) or by_bare.get(bare(key))
        if ids:
            pref = PREFERRED.get(nfc(key))
            if pref in ids:
                ids = [pref] + [i for i in ids if i != pref]
            return ids[:6], how
    return [], None


# ---------------------------------------------------------------- texto TEI

WORD = re.compile(r"[Ͱ-ͳͶ-ͽΆΈ-Ͽἀ-῿̀-ͯ]+[’'ʼ]?")


def tei_blocks(path):
    """Lista de blocos {t: 'h'|'p', c: capítulo, x: [itens]}; item = str | {'s'} | {'pb'}."""
    root = ET.parse(path).getroot()
    body = root.find(f".//{TEI}body")
    blocks = []
    state = {"chapter": None, "section": None}

    def emit_text(items, s):
        if s:
            items.append(re.sub(r"\s+", " ", s))

    def walk(el, items):
        emit_text(items, el.text)
        for ch in el:
            tag = ch.tag.replace(TEI, "")
            if tag == "milestone":
                state["section"] = ch.get("n")
                items.append({"s": f'{state["chapter"]}.{state["section"]}'})
            elif tag == "pb":
                items.append({"pb": ch.get("n")})
            elif tag in ("note", "bibl"):
                pass                                  # notas editoriais não entram no texto lido
            else:
                walk(ch, items)
            emit_text(items, ch.tail)

    def visit(el):
        for ch in el:
            tag = ch.tag.replace(TEI, "")
            if tag == "div":
                if ch.get("type") == "textpart":
                    state["chapter"] = ch.get("n")
                    blocks.append({"t": "c", "c": state["chapter"]})
                visit(ch)
            elif tag in ("p", "head", "l", "ab"):
                items = []
                walk(ch, items)
                blocks.append({"t": "h" if tag == "head" else "p", "c": state["chapter"], "x": items})
            elif tag == "milestone":
                state["section"] = ch.get("n")
                blocks.append({"t": "m", "s": f'{state["chapter"]}.{state["section"]}'})
            elif tag == "pb":
                blocks.append({"t": "pb", "pb": ch.get("n")})
            else:
                visit(ch)

    visit(body)

    # Marcos soltos entre parágrafos passam para o início do parágrafo seguinte
    out, pending = [], []
    for b in blocks:
        if b["t"] == "m":
            pending.append({"s": b["s"]})
        elif b["t"] == "pb":
            pending.append({"pb": b["pb"]})
        elif b["t"] == "h":
            # marcos antes de um título passam para o parágrafo seguinte
            pending += [it for it in b["x"] if isinstance(it, dict)]
            b["x"] = [it for it in b["x"] if not isinstance(it, dict)]
            out.append(b)
        elif b["t"] == "p":
            b["x"] = pending + b["x"]
            pending = []
            out.append(b)
        else:
            out.append(b)
    return out


def split_words(blocks):
    """Divide o texto em palavras: cada palavra vira ['forma'] (a análise entra depois)."""
    words = []
    for b in blocks:
        if "x" not in b:
            continue
        new = []
        for it in b["x"]:
            if not isinstance(it, str):
                new.append(it)
                continue
            last = 0
            for m in WORD.finditer(it):
                if m.start() > last:
                    new.append(it[last:m.start()])
                w = [nfc(m.group())]
                new.append(w)
                words.append(w)
                last = m.end()
            if last < len(it):
                new.append(it[last:])
        # junta pedaços de texto consecutivos e apara as pontas do parágrafo
        merged = []
        for it in new:
            if isinstance(it, str) and merged and isinstance(merged[-1], str):
                merged[-1] += it
            else:
                merged.append(it)
        while merged and isinstance(merged[0], str) and not merged[0].strip():
            merged.pop(0)
        while merged and isinstance(merged[-1], str) and not merged[-1].strip():
            merged.pop()
        if merged and isinstance(merged[0], str):
            merged[0] = merged[0].lstrip()
        if merged and isinstance(merged[-1], str):
            merged[-1] = merged[-1].rstrip()
        b["x"] = merged
    return words


# ---------------------------------------------------------------- GLAUx

def glaux_groups(path):
    """Agrupa os tokens do GLAUx em palavras gráficas (crase e οὔ + -τε voltam a ser uma palavra)."""
    root = ET.parse(path).getroot()
    toks = [w.attrib for s in root for w in s]
    by_id = {t["id"]: t for t in toks}
    groups, cur, join_next = [], None, False
    for t in toks:
        form = nfc(t["form"])
        if t.get("artificial") or t["postag"].startswith("u"):
            join_next = False
            continue
        if form.startswith("-") and cur is not None:
            cur["parts"].append(t)
            cur["form"] += form[1:]
        elif join_next and cur is not None:
            cur["parts"].append(t)
            cur["form"] = form                       # crase: τα- + θάτερον → θάτερον
        else:
            cur = {"form": form.rstrip("-"), "parts": [t]}
            groups.append(cur)
        join_next = form.endswith("-")
    return groups, by_id


# ---------------------------------------------------------------- montagem

def build(meta_path, tei_path, glaux_path, ddgp_path, out_dir):
    meta = json.load(open(meta_path, encoding="utf-8"))
    by_acc, by_bare = load_ddgp(ddgp_path)
    blocks = tei_blocks(tei_path)
    words = split_words(blocks)
    groups, by_id = glaux_groups(glaux_path)

    # alinhamento TEI ↔ GLAUx pelas letras sem diacríticos
    A = [bare(w[0]) for w in words]
    B = [bare(g["form"]) for g in groups]
    sm = difflib.SequenceMatcher(None, A, B, autojunk=False)
    match = {}
    for op, i1, i2, j1, j2 in sm.get_opcodes():
        if op == "equal" or (op == "replace" and i2 - i1 == j2 - j1):
            for k in range(i2 - i1):
                a, b = A[i1 + k], B[j1 + k]
                if op == "equal" or difflib.SequenceMatcher(None, a, b).ratio() >= 0.75:
                    match[i1 + k] = j1 + k
    tok_to_word = {}
    for wi, gi in match.items():
        for t in groups[gi]["parts"]:
            tok_to_word[t["id"]] = wi

    def resolve_head(hid):
        """Sobe pelos termos elípticos até uma palavra visível; devolve (índice, passou_por_elipse)."""
        ell = False
        seen = set()
        while hid and hid != "0" and hid not in seen:
            seen.add(hid)
            if hid in tok_to_word:
                return tok_to_word[hid], ell
            t = by_id.get(hid)
            if not t:
                break
            ell = ell or bool(t.get("artificial"))
            hid = t.get("head")
        return -1, ell

    lemmas, lemma_ix = [], {}
    stats = Counter()

    def lem_index(lemma, form):
        key = nfc(lemma)
        key = LEMMA_FIX.get(key, key)
        if key not in lemma_ix:
            ids, how = ddgp_ids(key, form, by_acc, by_bare)
            lemma_ix[key] = len(lemmas)
            lemmas.append([key, ids] + ([how] if how == "forma" else []))
        return lemma_ix[key]

    for wi, w in enumerate(words):
        gi = match.get(wi)
        if gi is None:
            stats["sem_anotacao"] += 1
            w.append([])
            continue
        g = groups[gi]
        analyses = []
        if len(g["parts"]) > 1:
            # palavra que o GLAUx dividiu (οὐδέ, οὔτε, crase): o verbete da palavra inteira vem primeiro
            ids, _ = ddgp_ids(w[0], None, by_acc, by_bare)
            if ids:
                analyses.append([lem_index(w[0].rstrip("’'ʼ"), None), "", "", -1, 0])
        for t in g["parts"]:
            head, ell = resolve_head(t.get("head"))
            if head == wi:
                head = -1
            analyses.append([lem_index(t["lemma"], nfc(t["form"]).strip("-")), t["postag"],
                             t.get("relation", ""), head, 1 if ell else 0])
        w.append(analyses)
        stats["anotadas"] += 1
        if not any(lemmas[a[0]][1] for a in analyses):
            stats["sem_verbete"] += 1

    # sentença de cada palavra (para destacar a oração inteira)
    out_blocks = []
    for b in blocks:
        if b["t"] == "c":
            out_blocks.append({"t": "c", "c": b["c"]})
        else:
            out_blocks.append({"t": b["t"], "x": b["x"]})

    doc = {
        "id": meta["id"],
        "meta": meta,
        "lemas": lemmas,
        "blocos": out_blocks,
        "estat": {"palavras": len(words), **stats,
                  "lemas": len(lemmas), "lemas_sem_verbete": sum(1 for l in lemmas if not l[1])},
    }
    os.makedirs(out_dir, exist_ok=True)
    out = os.path.join(out_dir, meta["id"] + ".json")
    with open(out, "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, separators=(",", ":"))

    # índice da biblioteca
    idx_path = os.path.join(out_dir, "index.json")
    index = json.load(open(idx_path, encoding="utf-8")) if os.path.exists(idx_path) else {"textos": []}
    entry = {k: meta[k] for k in ("id", "autor", "autorGr", "titulo", "tituloGr", "descricao")}
    entry["palavras"] = len(words)
    entry["versao"] = hashlib.sha1(json.dumps(doc, ensure_ascii=False, sort_keys=True).encode()).hexdigest()[:10]
    index["textos"] = [t for t in index["textos"] if t["id"] != meta["id"]] + [entry]
    with open(idx_path, "w", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False, indent=1)

    print(json.dumps(doc["estat"], ensure_ascii=False))
    print("sem verbete:", ", ".join(l[0] for l in lemmas if not l[1]))
    print("via forma:", ", ".join(l[0] for l in lemmas if len(l) > 2))
    print("→", out)


if __name__ == "__main__":
    if len(sys.argv) != 6:
        sys.exit(__doc__)
    build(*sys.argv[1:])
