# Λεξικόν — dicionário grego antigo · português

Aplicação web (PWA) para consultar o **Dicionário Grego-Português (DDGP)** da FCLAr/UNESP,
com ~46 mil verbetes. Funciona no navegador, pode ser instalada na tela de início do iPhone/iPad
e, depois do primeiro acesso, funciona **offline**. É a base para um futuro app iOS.

## Recursos

- Busca em grego **com ou sem acentos e espíritos** (`λογος` encontra *λόγος*).
- Busca por **transliteração** (`logos`, `psyche`, `anthropos`) e **Beta Code** (`lo/gos`); na
  transliteração ε/η e ο/ω são tratados como equivalentes.
- **Busca reversa** em português, nos significados (`lobo` → *λύκος*).
- Formas citadas no cabeçalho também são indexadas (`ἀάσθην` → *ἀάω*).
- Verbete formatado: acepções numeradas, blocos ♦, etimologia 〈…〉 destacada.
- Palavras gregas dentro do verbete são **links**; abreviaturas (*hom.*, *aor.*, *át.*…) mostram o significado ao toque.
- Navegação alfabética, verbete anterior/seguinte, favoritos e histórico (salvos no aparelho), tema claro/escuro.
- Links diretos a verbetes: `…/#/v/25426` (λύκος).
- **Textos para leitura** (`#/textos`) com cada palavra ligada ao dicionário — ver abaixo.

## Estrutura

```
docs/                    ← site publicado pelo GitHub Pages
  index.html, styles.css, app.js
  sw.js                  ← service worker (cache offline)
  manifest.webmanifest, icons/
  reader.js              ← leitor de textos
  data/ddgp.json         ← dados gerados a partir do dump do DDGP
  textos/                ← textos anotados (index.json + um arquivo por texto)
scripts/build_data.py    ← conversor SQL → JSON
scripts/build_text.py    ← conversor TEI + GLAUx + DDGP → texto anotado
scripts/textos/          ← metadados de cada texto
```

Tudo é estático (HTML/CSS/JS puro, sem dependências nem etapa de build).

## Rodar localmente

```bash
cd docs
python3 -m http.server 8000
# abra http://localhost:8000
```

## Atualizar os dados

Os dados vêm do arquivo `DDGP-3x-files/ddgp3x-copia_8nov_22.sql` (versão 3x, 2022) do repositório
[aniseferreira/Grc-Por-DigDict](https://github.com/aniseferreira/Grc-Por-DigDict).
Os arquivos de `arquivos_xml/` do repositório original **não** são usados: o próprio README daquela
pasta pede que não sejam utilizados (são da primeira versão de etiquetagem).

```bash
git clone --depth 1 https://github.com/aniseferreira/Grc-Por-DigDict.git /tmp/ddgp
python3 scripts/build_data.py /tmp/ddgp/DDGP-3x-files/ddgp3x-copia_8nov_22.sql docs/data/ddgp.json
```

O conversor lê **apenas** as tabelas `entry`, `abbrev` e `abbrevtype` (as tabelas de usuários e logs
do dump são ignoradas). Transformações aplicadas: normalização Unicode NFC, remoção de hifens
condicionais da diagramação impressa e uma acepção numerada por linha. O conteúdo lexicográfico
não é alterado.

Ao trocar os dados, altere a versão `?v=` em `docs/app.js` (`DATA_URL`) e em `docs/sw.js`
(`DATA` e `DATA_CACHE`) para que os aparelhos baixem a nova cópia. Ao alterar HTML, CSS ou JS, mude
`VERSION` em `docs/sw.js`; o dicionário fica num cache separado e não é baixado de novo.

## Textos (leitor)

Em `#/textos` há textos gregos em que **cada palavra é clicável**. Ao tocar numa palavra, o painel mostra:

- o **lema** e a **análise morfológica** em português (ex.: *verbo · 3ª pessoa singular · presente do
  indicativo · voz médio-passiva*);
- a **função sintática** e a palavra a que ela se liga (destacada no texto);
- o **verbete do DDGP** (com escolha entre homógrafos, como λέγω¹ / λέγω²);
- quantas vezes o lema aparece no texto, com navegação entre as ocorrências.

Crases e palavras compostas (τοὔνομα, θάτερον, οὔτε) mostram o verbete da palavra inteira e o de cada
parte. Teclado: `←` `→` passam à palavra anterior/seguinte, `Esc` fecha o painel. Links diretos para
seções: `…/#/t/aristoteles-categorias/5.3`.

Textos disponíveis:

| Texto | Edição | Palavras |
|---|---|---|
| Aristóteles, *Categorias* (Κατηγορίαι) | Bekker, Oxford 1837 (First1KGreek) | 10 316 |

### De onde vêm os dados

- **Texto exibido**: TEI/EpiDoc do [First1KGreek](https://github.com/OpenGreekAndLatin/First1KGreek)
  ou do [Perseus canonical-greekLit](https://github.com/PerseusDL/canonical-greekLit) (CC BY-SA 4.0).
- **Lemas, morfologia e sintaxe**: [GLAUx](https://github.com/alekkeersmaekers/glaux), de Alek
  Keersmaekers (KU Leuven), CC BY-SA 4.0. A anotação é **automática**; o projeto informa precisão de
  98,8% nos lemas, 97,2% na morfologia e cerca de 80% na sintaxe. O leitor avisa isso no painel.
- **Verbetes**: DDGP, como no resto do app.

O GLAUx tokeniza o texto de outro modo (divide οὔτε em οὔ + -τε e as crases em duas partes, acrescenta
termos elípticos e perde maiúsculas), por isso o conversor **alinha** as palavras do TEI às do GLAUx
pelas letras sem diacríticos; a ortografia exibida é sempre a do TEI. Nas *Categorias*, 10 315 das
10 316 palavras foram alinhadas (a exceção é o título), e 18 dos 622 lemas não constam do DDGP
(termos técnicos como δεκτικός, κατάφασις, ἀποφατικός): para esses o painel oferece um link ao Logeion.
Alguns lemas do GLAUx são corrigidos em `LEMMA_FIX`, e homógrafos frequentes têm o verbete preferido
fixado em `PREFERRED`, ambos em `scripts/build_text.py`.

### Acrescentar um texto

1. Ache o texto no GLAUx: em `metadata.txt` procure o autor/obra; o arquivo é `xml/<TLG>.xml`
   (ex.: `0086-006` = Aristóteles, *Categorias*). Confira a coluna `SOURCE_LICENSE`.
2. Ache o TEI correspondente no First1KGreek ou no Perseus (`data/tlgXXXX/tlgYYY/…grc*.xml`).
3. Crie `scripts/textos/<id>.json` com os metadados (copie o das *Categorias*).
4. Gere o arquivo:

```bash
git clone --depth 1 --filter=blob:none --sparse https://github.com/alekkeersmaekers/glaux /tmp/glaux
git -C /tmp/glaux sparse-checkout set --no-cone xml/0086-006.xml
curl -sLo /tmp/cat.xml https://raw.githubusercontent.com/OpenGreekAndLatin/First1KGreek/master/data/tlg0086/tlg006/tlg0086.tlg006.1st1K-grc1.xml
python3 scripts/build_text.py scripts/textos/aristoteles-categorias.json /tmp/cat.xml \
    /tmp/glaux/xml/0086-006.xml docs/data/ddgp.json docs/textos
```

O script grava `docs/textos/<id>.json`, atualiza `docs/textos/index.json` (com a versão que força os
aparelhos a baixar a nova cópia) e imprime quantas palavras ficaram sem análise ou sem verbete.

## Caminho para o app iOS

1. **PWA (já disponível)** — Safari → Compartilhar → *Adicionar à Tela de Início*.
2. **Capacitor** — embrulha esta mesma pasta `docs/` num app nativo publicável na App Store,
   reaproveitando 100% do código.
3. **SwiftUI nativo** — usar `docs/data/ddgp.json` (ou convertê-lo para SQLite com FTS5) e
   reescrever a interface; melhor integração com o sistema (Spotlight, widgets, teclado).

## Licenças e créditos

**Dados**: *Dicionário Grego-Português* (5 vols., Ateliê Editorial, 2006–2010), coord.
Maria Celeste C. Dezotti, Daisi Malhadas e Maria Helena de Moura Neves (FCLAr/UNESP), com autores
da USP, UFMG, UFRJ e UFF; edição digital DDGP coordenada por Anise D'Orange Ferreira (FCLAr/UNESP).
Fonte: <https://github.com/aniseferreira/Grc-Por-DigDict>.
Distribuídos sob **CC BY-NC-SA 4.0** — ver [`LICENSE-DATA.md`](LICENSE-DATA.md).
Este projeto não é afiliado à UNESP nem endossado pelos autores.
Correções lexicográficas devem ser enviadas ao projeto original.

> Observação: no repositório de origem, o arquivo `Licença de uso` traz no título "CC BY-SA 4.0",
> mas o link e o texto são da **CC BY-NC-SA 4.0** (com a cláusula *NãoComercial*), e o README
> exibe um selo BY-SA. Este projeto segue a leitura mais restritiva (BY-NC-SA): o app pode ser
> distribuído gratuitamente, mas não vendido nem monetizado.

**Textos e anotações** (`docs/textos/`): texto grego do First1KGreek/Perseus e anotação do GLAUx,
ambos **CC BY-SA 4.0**; os arquivos derivados seguem a mesma licença — ver [`LICENSE-DATA.md`](LICENSE-DATA.md).

**Código** (HTML, CSS, JS, scripts): licença MIT — ver [`LICENSE`](LICENSE).
