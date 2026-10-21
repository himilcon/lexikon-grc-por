# Licença dos dados (`docs/data/ddgp.json`)

Os dados lexicográficos são uma adaptação do **Dicionário Digital Grego-Português (DDGP)**,
FCLAr/UNESP — <https://github.com/aniseferreira/Grc-Por-DigDict> — e são distribuídos sob a
licença **Creative Commons Atribuição-NãoComercial-CompartilhaIgual 4.0 Internacional
(CC BY-NC-SA 4.0)**: <https://creativecommons.org/licenses/by-nc-sa/4.0/deed.pt-br>

- **Atribuição** — créditos: *Dicionário Grego-Português* (Ateliê Editorial, 2006–2010),
  coord. M. Celeste C. Dezotti, D. Malhadas e M. Helena M. Neves; edição digital coordenada por
  Anise D'Orange Ferreira (FCLAr/UNESP).
- **NãoComercial** — não pode ser usado para fins comerciais.
- **CompartilhaIgual** — adaptações destes dados devem ser distribuídas sob a mesma licença.

Alterações feitas em relação à fonte (arquivo `DDGP-3x-files/ddgp3x-copia_8nov_22.sql`):
extração das tabelas de verbetes e abreviaturas para JSON, normalização Unicode NFC, remoção de
hifens condicionais e quebra das acepções numeradas em linhas separadas.

Segundo o arquivo de licença original, a edição e a distribuição impressas permanecem sob
exclusividade da Ateliê Editorial.


---

# Licença dos textos anotados (`docs/textos/`)

Cada arquivo de `docs/textos/` combina:

- **Texto grego**: transcrição digital em TEI do projeto First1KGreek (Open Greek and Latin, Univ. Leipzig)
  ou do Perseus Digital Library (canonical-greekLit), licença **CC BY-SA 4.0**
  (<https://creativecommons.org/licenses/by-sa/4.0/deed.pt-br>). O arquivo de metadados de cada texto,
  em `scripts/textos/`, indica a edição impressa e o arquivo de origem.
- **Lemas, morfologia e sintaxe**: corpus GLAUx — *The Greek Language Automated*, de Alek Keersmaekers
  (KU Leuven), <https://github.com/alekkeersmaekers/glaux>, licença **CC BY-SA 4.0**. Citação pedida pelo
  autor: Keersmaekers, A. (2021), *The GLAUx corpus: methodological issues in designing a long-term,
  diverse, multi-layered corpus of Ancient Greek*, Proceedings of LChange 2021, 39–50,
  doi:10.18653/v1/2021.lchange-1.6.
- **Números de verbete** do DDGP (só os identificadores, não o conteúdo dos verbetes).

Alterações: alinhamento palavra a palavra entre o texto TEI e os tokens do GLAUx; recomposição em
palavras gráficas de crases e compostos que o GLAUx divide; correção de alguns lemas (lista em
`LEMMA_FIX`, em `scripts/build_text.py`); tradução das etiquetas morfológicas e sintáticas para o
português na interface. Os arquivos de `docs/textos/` são distribuídos sob **CC BY-SA 4.0**.
