#!/usr/bin/env python3
"""
Converte o dump MySQL do DDGP (Dicionário Digital Grego-Português, FCLAr/UNESP)
em um arquivo JSON compacto usado pela aplicação web.

Fonte: https://github.com/aniseferreira/Grc-Por-DigDict
       DDGP-3x-files/ddgp3x-copia_8nov_22.sql  (versão 3x, 2022)

Somente as tabelas `entry`, `abbrev` e `abbrevtype` são extraídas.
As tabelas de usuários e logs do dump original NÃO são lidas nem publicadas.

Uso:
    python3 scripts/build_data.py caminho/para/ddgp3x-copia_8nov_22.sql docs/data/ddgp.json
"""
import json
import re
import sys
import unicodedata
from datetime import date

WANTED = {"entry", "abbrev", "abbrevtype"}
INSERT_RE = re.compile(r"^INSERT INTO `(\w+)` \(([^)]*)\) VALUES (.*);\s*$")

ESCAPES = {"n": "\n", "r": "\r", "t": "\t", "0": "\0", "Z": "\x1a",
           "\\": "\\", "'": "'", '"': '"', "b": "\b"}


def parse_values(s):
    """Analisa a lista de tuplas de um INSERT do mysqldump."""
    rows, i, n = [], 0, len(s)
    while i < n:
        if s[i] != "(":
            i += 1
            continue
        i += 1
        row = []
        while True:
            c = s[i]
            if c == "'":
                i += 1
                buf = []
                while True:
                    c = s[i]
                    if c == "\\":
                        buf.append(ESCAPES.get(s[i + 1], s[i + 1]))
                        i += 2
                    elif c == "'":
                        if i + 1 < n and s[i + 1] == "'":
                            buf.append("'")
                            i += 2
                        else:
                            i += 1
                            break
                    else:
                        buf.append(c)
                        i += 1
                row.append("".join(buf))
            else:
                j = i
                while s[j] not in ",)":
                    j += 1
                tok = s[i:j].strip()
                row.append(None if tok == "NULL" else (int(tok) if re.fullmatch(r"-?\d+", tok) else tok))
                i = j
            if s[i] == ",":
                i += 1
                continue
            if s[i] == ")":
                i += 1
                break
        rows.append(row)
    return rows


def clean(text):
    text = unicodedata.normalize("NFC", text or "")
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = text.replace("­", "")  # hifens condicionais da diagramação impressa
    # Acepções numeradas marcadas com espaços finos ("1  ...") -> uma por linha
    text = re.sub(r"[ \t]*(\d{1,2})[  ]+", r"\n\1 ", text)
    # Cada bloco "♦" começa em nova linha
    text = re.sub(r"\s*♦\s*", "\n♦ ", text)
    text = re.sub(r"[ \t ]{2,}", " ", text)
    text = re.sub(r"[ \t]+\n", "\n", text)
    text = re.sub(r"\n[ \t]+", "\n", text)
    text = re.sub(r"\n{2,}", "\n", text)
    return text.strip()


def main(src, dst):
    tables = {t: [] for t in WANTED}
    with open(src, encoding="utf-8") as fh:
        for line in fh:
            m = INSERT_RE.match(line)
            if m and m.group(1) in WANTED:
                cols = [c.strip(" `") for c in m.group(2).split(",")]
                for r in parse_values(m.group(3)):
                    tables[m.group(1)].append(dict(zip(cols, r)))

    types = {r["id"]: r["description"] for r in tables["abbrevtype"]}
    abbrev = sorted(
        ([clean(r["abbrev"]), clean(r["description"]), types.get(r["abbrevtypeid"], "")]
         for r in tables["abbrev"] if r["abbrev"].strip()),
        key=lambda a: a[0].lower())
    entries = sorted(
        ([r["id"], clean(r["gword"]), clean(r["pdesc"])] for r in tables["entry"]),
        key=lambda e: e[0])

    out = {
        "meta": {
            "title": "Dicionário Grego-Português (DDGP) — FCLAr/UNESP",
            "source": "https://github.com/aniseferreira/Grc-Por-DigDict",
            "sourceFile": "DDGP-3x-files/ddgp3x-copia_8nov_22.sql",
            "license": "CC BY-NC-SA 4.0",
            "built": date.today().isoformat(),
            "entries": len(entries),
            "abbreviations": len(abbrev),
        },
        "abbrev": abbrev,
        "entries": entries,
    }
    with open(dst, "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, separators=(",", ":"))
    print(f"{len(entries)} verbetes, {len(abbrev)} abreviaturas -> {dst}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
