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
    # Metafísica: lemas malformados pelo lematizador automático (forma do texto → lema certo)
    "ἔρχοναι": "εἰμί", "εἰνί": "εἰμί", "εἶνι": "εἰμί",            # εἶναι
    "γίγνιμαι": "γίγνομαι", "γίγνετιομαι": "γίγνομαι", "γίγνει": "γίγνομαι",
    "ἵσταμθι": "ἵστημι", "σττίνω": "ἵστημι",                      # ἵστασθαι, στήσεται
    "μετρειθε͂ω": "μετρέω", "βαδιειθε͂ω": "βαδίζω", "διαιρειθε͂ω": "διαιρέω",
    "διαλύθεεω": "διαλύω", "λεγετ́ρχομαι": "λέγω", "ἀνάγιμαι": "ἀνάγω",
    "σκοπάω": "σκοπέω", "ἀξιάω": "ἀξιόω", "νοόω": "νοέω", "διείλω": "διαιρέω",
    "ἑωράκεω": "ὁράω", "ἐξαιρόομαι": "ἐξαιρέω", "φύζω": "φύω", "ζάκλω": "ζάω",
    "κράω": "κεράννυμι", "καχορίνω": "χωρίζω", "προσστάζω": "προστάσσω", "μεθιέω": "μέτειμι",
    "τέχν": "τέχνη", "τεῥ͂ι": "ἕτερος", "μέλη": "μέλας", "κά̓κες": "κἀκεῖνος",
    "λίθι": "λίθος", "πλίνθον": "πλίνθος", "αὗτι": "οὗτος", "ἡμίσεια": "ἥμισυς",
    "ὀληθείς": "ἀληθής", "φυσικής": "φυσικός", "ἀνολογία": "ἀναλογία",
    "συναμφότεροι": "συναμφότερος", "ἕσπερ": "ὥσπερ", "μεταφοράω": "μεταφορά",
    "ὁμωνυμώσσω": "ὁμώνυμος", "μηθενός": "μηθείς", "μόνονέ": "μόνος",
    "τοονδ́ς": "τοιοσδί", "τοιαδίͅς": "τοιοσδί", "εδί": "ὅδε", "ᾳδίς": "ὅδε", "τησδὶ": "ὅδε",
    "τοσονδί": "τοσόσδε", "ὁπόσης": "ὁπόσος",
    "ὁσποιᾳοῦν": "ὁποῖος", "ὁσποσιαιοῦν": "ὁποῖος", "ὁποιαιοῦν": "ὁποῖος", "ὁποιοσοῦν": "ὁποῖος",
    "ἀδΐος": "ἀΐδιος", "ἐν-ὑπάρχω": "ἐνυπάρχω", "πηρψνις": "Φρῦνις",
    # Platão
    "νυνδί": "νῦν",            # νυνδή (νῦν δή)
    "ποτόν": "ποτός", "μοῦσαι": "μοῦσα", "λαλεπῶς": "χαλεπῶς", "διανοόω": "διανοέομαι",
    "καθαρ́νω": "καθαίρω", "μιμέω": "μιμέομαι", "ζηλέω": "ζηλόω", "βιάζομαι": "βιάζω",
    "ἀφιέω": "ἀφίημι", "παριέω": "παρίημι", "ἐφιέω": "ἐφίημι", "μέστε": "μέχρι",
    "φυλαττοέρχομαι": "φυλάσσω", "συστραεύω": "συστρατεύω", "κικτῄͅσκω": "κτάομαι",
    "περιφύζω": "περιφύω", "περιανέω": "περαίνω", "πεπονθέω": "πάσχω", "γενοῖμαι": "γίγνομαι",
    "τοουτον́ς": "τοιοῦτος", "τοσησδὶ": "τοσόσδε", "τητηνν": "τις", "εἰμικτετμή": "ἐκτέμνω",
    "ἐνεγκατόω": "φέρω", "διαγνοέω": "διαγιγνώσκω", "κηρα": "κήρ", "κήρα": "κήρ",
    "μυάω": "μυέω", "ἐγκαθανδάνω": "ἐγκαταδέω", "λύκων": "λύκος", "κέβητος": "Κέβης",
    "νεουογός": "νεουργός", "εἰσκοπόω": "σκοπέω", "Φαῖδρας": "Φαῖδρος", "ἀνειπεῖν": "ἀνεῖπον",
    # Órganon e Marco Aurélio
    "ὁποτέσρις": "ὁπότερος", "ὁπόσσις": "ὁπόσος", "παρῳχ́οηκε": "παροίχομαι", "παρῳχακίσκω": "παροίχομαι",
    "ἐνεχθέω": "φέρω", "Σέκουνς": "Σέκουνδα", "Ού̓ηρος": "Οὐῆρος",
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
        rank = 1 if FORMREF.search(definition) else 0
        # παντάπασι(ν): indexa as duas grafias
        for t in ({tok.replace("(ν)", ""), tok.replace("(ν)", "ν")} if "(ν)" in tok else {tok}):
            a, b = accented(t), bare(t)
            if not b:
                continue
            by_acc.setdefault(a, []).append((rank, eid))
            by_bare.setdefault(b, []).append((rank, eid))
    for d in (by_acc, by_bare):
        for k in d:
            d[k] = [eid for _, eid in sorted(d[k])]
    return by_acc, by_bare


def variants(b):
    """Grafias alternativas de um lema (sem diacríticos) para procurar no DDGP, na ordem de tentativa."""
    base = [b]
    if b.endswith("ν"):
        base.append(b[:-1])                          # ν eufônico: ἔμπροσθεν → ἔμπροσθε
    if "σσ" in b:
        base.append(b.replace("σσ", "ττ"))           # jônico/koiné σσ → ático ττ
    if "ειγν" in b:
        base.append(b.replace("ειγν", "ιγν"))        # συμμείγνυμι → συμμίγνυμι
    # substantivo registrado no verbete do adjetivo: χρηστήριον → χρηστήριος, Ἀττική → Ἀττικός
    if b.endswith("ον"):                            # também μνημόσυνον → μνημόσυνος, λύχνον → λύχνος
        base.append(b[:-2] + "οσ")
    if b.endswith("ικη"):
        base.append(b[:-1] + "οσ")
    out = []
    for v in base:
        out.append(v)
        if v.endswith("ομαι"):                       # voz: μαντεύομαι → μαντεύω
            out.append(v[:-4] + "ω")
        elif v.endswith("ω"):                        # voz: χαρίζω → χαρίζομαι
            out.append(v[:-1] + "ομαι")
    return out[1:]


def ddgp_ids(lemma, form, by_acc, by_bare):
    """Verbetes do DDGP para um lema, na ordem de preferência. Devolve (ids, como)."""
    for key, how in ((lemma, "lema"), (form, "forma")):
        if not key:
            continue
        a, b = accented(key), bare(key)
        ids = by_acc.get(a) or by_bare.get(b)
        if not ids:
            ids = next((by_bare[v] for v in variants(b) if v in by_bare), None)
        if ids:
            pref = PREFERRED.get(nfc(key))
            if pref in ids:
                ids = [pref] + [i for i in ids if i != pref]
            return ids[:6], how
    return [], None


# ---------------------------------------------------------------- texto TEI

WORD = re.compile(r"[Ͱ-ͳͶ-ͽΆΈ-Ͽἀ-῿̀-ͯ]+[’'ʼ]?")


def tei_blocks(path, meta):
    """Lista de blocos do texto.

    {t: 'c', c: '1.2', lv: nível, rot: 'Livro Α · …', chip: 'Α'}  divisão (livro, capítulo…)
    {t: 'h'|'p', x: [itens]}                                     título ou parágrafo
    item = str | {'s': ref, 'd': rótulo} (marco de seção ou linha de Bekker) | {'pb': n} | {'br': 1}

    Os níveis de divisão e seus nomes vêm de meta["niveis"]; por omissão, um só nível, "Capítulo".
    """
    levels = meta.get("niveis") or [{"nome": "Capítulo"}]
    skip_divs = set(meta.get("ignorarDivisoes") or [])   # ex.: as páginas de Stephanus, que viram só marcos
    as_marks = meta.get("divisoesComoMarco") or {}       # ex.: {"chapter": "cap", "section": "sec"}
    select = tuple(meta["selecionar"]) if meta.get("selecionar") else None   # ex.: ["book", "priora"]
    root = ET.parse(path).getroot()
    body = root.find(f".//{TEI}body")
    blocks = []
    state = {"path": [], "page": None, "newpage": False}

    def milestone(ch):
        unit = (ch.get("unit") or "").lower()
        n = ch.get("n")
        if unit == "page":                          # página de Bekker (980a): rótulo vai na linha seguinte
            state["page"], state["newpage"] = n, True
            return None
        if unit == "line" and state["page"]:
            ref = f'{state["page"]}{n}'
            d = ref if state["newpage"] else n
            state["newpage"] = False
            return {"s": ref, "d": d}
        if unit == "section" and (ch.get("resp") or "").lower() == "stephanus":
            return {"s": n, "d": n}                  # página e seção de Stephanus (17a, 327b)
        if unit == "section":
            return {"s": ".".join(state["path"] + [n])}  # seção numerada (capítulo.seção)
        if unit == "para":                          # novo parágrafo / nova fala no diálogo
            return {"br": 1}
        return None                                 # outros marcos (speech, card…) não aparecem

    def emit_text(items, s):
        if s:
            items.append(re.sub(r"\s+", " ", s))

    def walk(el, items):
        emit_text(items, el.text)
        for ch in el:
            tag = ch.tag.replace(TEI, "")
            if tag == "milestone":
                m = milestone(ch)
                if m:
                    items.append(m)
            elif tag == "pb":
                items.append({"pb": ch.get("n")})
            elif tag in ("note", "bibl"):
                pass                                  # notas e referências editoriais não entram no texto lido
            elif tag == "del":                        # palavras que o editor exclui: [ ]
                items.append("[")
                walk(ch, items)
                items.append("]")
            elif tag == "add":                        # palavras que o editor acrescenta: ⟨ ⟩
                items.append("⟨")
                walk(ch, items)
                items.append("⟩")
            elif tag == "gap":
                items.append(" … ")
            elif tag == "l":                          # verso citado: um por linha
                items.append({"br": 1})
                walk(ch, items)
                items.append({"br": 1})
            elif tag == "lb":
                items.append(" ")
            elif tag == "label":                      # nome do interlocutor (ΑΠΟΛ.): exibido, não analisado
                items.append({"lab": re.sub(r"\s+", " ", "".join(ch.itertext())).strip()})
                emit_text(items, ch.tail)
                continue
            else:
                walk(ch, items)
            emit_text(items, ch.tail)

    def label(depth, n):
        lv = levels[min(depth, len(levels) - 1)]
        chip = (lv.get("rotulos") or {}).get(n, n)
        extra = (lv.get("extra") or {}).get(n)
        return f'{lv["nome"]} {chip}' + (f" ({extra})" if extra else ""), chip

    def visit(el, depth):
        for ch in el:
            tag = ch.tag.replace(TEI, "")
            if tag == "div":
                kind = as_marks.get(ch.get("subtype")) if ch.get("type") == "textpart" else None
                if select and depth == 0 and ch.get("type") == "textpart" and ch.get("subtype") == select[0]:
                    # arquivo com várias obras (Primeiros e Segundos analíticos): só a escolhida, sem título
                    if ch.get("n") == select[1]:
                        visit(ch, 0)
                    continue
                if kind:
                    # divisão mostrada só como número à margem (capítulo e seção em Heródoto, seção na Anábase)
                    state["path"] = state["path"][:depth] + [ch.get("n")]
                    if ch.get("n") != "0":
                        blocks.append({"t": "m", "m": {"s": ".".join(state["path"]), "d": ch.get("n"), "k": kind}})
                    visit(ch, depth + 1)
                elif ch.get("type") == "textpart" and ch.get("subtype") not in skip_divs:
                    state["path"] = state["path"][:depth] + [ch.get("n")]
                    rot, chip = label(depth, ch.get("n"))
                    blocks.append({"t": "c", "c": ".".join(state["path"]), "lv": depth, "rot": rot, "chip": chip})
                    visit(ch, depth + 1)
                else:
                    visit(ch, depth)
            elif tag in ("p", "head", "l", "ab"):
                items = []
                walk(ch, items)
                blocks.append({"t": "h" if tag == "head" else "p", "x": items})
            elif tag == "milestone":
                m = milestone(ch)
                if m:
                    blocks.append({"t": "m", "m": m})
            elif tag == "pb":
                blocks.append({"t": "m", "m": {"pb": ch.get("n")}})
            else:
                visit(ch, depth)

    visit(body, 0)

    # Heródoto: as seções de um capítulo correm num só parágrafo (cada capítulo começa um novo)
    if meta.get("juntarParagrafos"):
        merged, prev_p = [], None
        for b in blocks:
            if b["t"] == "m" and b["m"].get("k") == "cap":
                prev_p = None
                merged.append(b)
            elif b["t"] == "m" and prev_p is not None:
                prev_p["x"].append(b["m"])          # marco de seção vai para dentro do parágrafo corrente
            elif b["t"] == "p" and prev_p is not None:
                prev_p["x"].append(" ")
                prev_p["x"].extend(b["x"])
            else:
                merged.append(b)
                prev_p = b if b["t"] == "p" else None
        blocks = merged

    # Marcos soltos entre parágrafos ou antes de um título passam para o parágrafo seguinte
    out, pending = [], []
    for b in blocks:
        if b["t"] == "m":
            pending.append(b["m"])
        elif b["t"] == "h":
            pending += [it for it in b["x"] if isinstance(it, dict) and "br" not in it]
            b["x"] = [it for it in b["x"] if not isinstance(it, dict) or "br" in it]
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
        # quebras de verso: sem repetição, e a pontuação que segue o verso fica na mesma linha
        tidy = []
        for it in merged:
            if isinstance(it, dict) and "br" in it:
                # recua sobre espaços e marcos de referência: a quebra vem antes deles
                k = len(tidy) - 1
                while k >= 0 and ((isinstance(tidy[k], str) and not tidy[k].strip())
                                  or (isinstance(tidy[k], dict) and ("s" in tidy[k] or "pb" in tidy[k]))):
                    k -= 1
                if k < 0 or (isinstance(tidy[k], dict) and "br" in tidy[k]):
                    continue
                tidy.insert(k + 1, it)
                continue
            elif isinstance(it, str) and tidy and isinstance(tidy[-1], dict) and "br" in tidy[-1]:
                m = re.match(r"\s*([,.·;:)\]⟩—]+)", it)
                if m:
                    tidy.insert(len(tidy) - 1, m.group(1))
                    it = it[m.end():]
                it = it.lstrip()
                if not it:
                    continue
            tidy.append(it)
        merged = tidy
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
    toks = []
    for s in root:
        manual = s.get("analysis") == "manual"
        for w in s:
            t = dict(w.attrib)
            t["_manual"] = manual
            toks.append(t)
    by_id = {t["id"]: t for t in toks}
    groups, cur, join_next = [], None, False
    for t in toks:
        form = nfc(t["form"])
        if t.get("artificial") or not t.get("form") or "postag" not in t or t["postag"].startswith("u"):
            # termos elípticos, pontuação e palavras excluídas pelo editor (o GLAUx não as anota)
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
    hw_by_id = {e[0]: e[1] for e in json.load(open(ddgp_path, encoding="utf-8"))["entries"]}
    blocks = tei_blocks(tei_path, meta)
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

    lemma_found = {}

    def lem_index(lemma, form):
        key = nfc(lemma)
        key = LEMMA_FIX.get(key, key)
        if key not in lemma_found:
            lemma_found[key] = bool(ddgp_ids(key, None, by_acc, by_bare)[0])
        lookup = key
        if not lemma_found[key] and form:
            # lema ausente do DDGP: cada forma tenta o seu próprio verbete (καθά → καθάπερ, καθὰ…)
            key = f"{key}|{accented(form)}"
        if key not in lemma_ix:
            ids, how = ddgp_ids(lookup, form, by_acc, by_bare)
            lemma_ix[key] = len(lemmas)
            shown = lookup
            if how == "forma" and ids:
                # lema do GLAUx ausente do DDGP e verbete achado pela forma: mostra o lema do DDGP
                shown = re.sub(r"[\d¹²³⁴]+$", "", hw_by_id[ids[0]].split(",")[0].strip().split()[0]).split("-")[0] or key
            if not ids:
                shown = lookup                       # sem verbete: mostra o lema, não a chave interna
            lemmas.append([shown, ids] + ([how] if how == "forma" else []))
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
                             t.get("relation", ""), head, 1 if ell else 0, 1 if t["_manual"] else 0])
        w.append(analyses)
        stats["anotadas"] += 1
        if not any(lemmas[a[0]][1] for a in analyses):
            stats["sem_verbete"] += 1

    out_blocks = [b if b["t"] == "c" else {"t": b["t"], "x": b["x"]} for b in blocks]

    doc = {
        "id": meta["id"],
        "meta": meta,
        "lemas": lemmas,
        "blocos": out_blocks,
        "estat": {"palavras": len(words), **stats,
                  "lemas": len({l[0] for l in lemmas}),
                  "lemas_sem_verbete": len({l[0] for l in lemmas if not l[1]} - {l[0] for l in lemmas if l[1]})},
    }
    os.makedirs(out_dir, exist_ok=True)
    out = os.path.join(out_dir, meta["id"] + ".json")
    with open(out, "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, separators=(",", ":"))

    # índice da biblioteca
    idx_path = os.path.join(out_dir, "index.json")
    index = json.load(open(idx_path, encoding="utf-8")) if os.path.exists(idx_path) else {"textos": []}
    entry = {k: meta[k] for k in ("id", "autor", "autorGr", "titulo", "tituloGr", "descricao")}
    entry["edicaoCurta"] = meta.get("edicaoCurta", "")
    if meta.get("colecao"):
        entry["colecao"] = meta["colecao"]
    entry["palavras"] = len(words)
    entry["versao"] = hashlib.sha1(json.dumps(doc, ensure_ascii=False, sort_keys=True).encode()).hexdigest()[:10]
    ids = [t["id"] for t in index["textos"]]
    if meta["id"] in ids:                                  # mantém a posição na biblioteca
        index["textos"][ids.index(meta["id"])] = entry
    else:
        index["textos"].append(entry)
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
