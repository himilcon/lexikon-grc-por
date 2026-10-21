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
| Aristóteles, *Categorias* (Κατηγορίαι) — *Órganon* | Bekker, Oxford 1837 (First1KGreek) | 10 316 |
| Aristóteles, *Da interpretação* (Περὶ ἑρμηνείας) — *Órganon* | Bekker 1837 (First1KGreek) | 6 245 |
| Aristóteles, *Primeiros analíticos* (Ἀναλυτικὰ πρότερα) — *Órganon* | Bekker 1837 (First1KGreek) | 37 579 |
| Aristóteles, *Segundos analíticos* (Ἀναλυτικὰ ὕστερα) — *Órganon* | Bekker 1837 (First1KGreek) | 22 673 |
| Aristóteles, *Tópicos* (Τοπικά) — *Órganon* | Bekker 1837 (First1KGreek) | 44 125 |
| Aristóteles, *Refutações sofísticas* (Περὶ σοφιστικῶν ἐλέγχων) — *Órganon* | Bekker 1837 (First1KGreek) | 14 115 |
| Aristóteles, *Metafísica* (Τὰ μετὰ τὰ φυσικά) | Ross, Oxford 1924 (Perseus) | 78 946 |
| Platão, *Apologia de Sócrates* (Ἀπολογία Σωκράτους) | Burnet (Perseus) — anotação **manual** | 8 752 |
| Platão, *Mênon* (Μένων) | Burnet (Perseus) | 9 703 |
| Platão, *Banquete* (Συμπόσιον) | Burnet (Perseus) | 17 349 |
| Platão, *Fédon* (Φαίδων) | Burnet (Perseus) | 22 356 |
| Platão, *República* (Πολιτεία) | Burnet (Perseus) | 88 265 |
| Xenofonte, *Anábase* (Κύρου ἀνάβασις) | Marchant, Oxford 1904 (Perseus) | 57 195 |
| Heródoto, *Histórias* (Ἱστορίαι) | Godley, Loeb 1920 (Perseus) — anotação manual (PROIEL) em ~46% das frases | 184 943 |
| Marco Aurélio, *Meditações* (Τὰ εἰς ἑαυτόν) | Leopold, Teubner 1908 (Perseus) | 29 267 |

As edições digitais de Bekker do *Órganon* (exceto as *Categorias*) não trazem a numeração de página e
linha; a referência é livro.capítulo ou capítulo.seção. No First1KGreek, *Primeiros* e *Segundos
analíticos* estão num só arquivo (e num só arquivo do GLAUx); `selecionar` no metadado escolhe a obra.

Em Xenofonte e Heródoto a referência é livro.capítulo.seção (`4.7.24`, `7.226`): na *Anábase* os
capítulos são títulos e as seções vão à margem; em Heródoto, capítulos (em destaque) e seções vão à
margem, e cada capítulo forma um parágrafo. Os livros de Heródoto levam os nomes das Musas. O painel
indica, palavra a palavra, se a análise é manual (treebank) ou automática.

Em Platão, a margem traz a paginação de **Stephanus** (17a, 514a), e o campo de referência leva direto
a ela; cada nova fala ou parágrafo começa em linha nova, com o nome do interlocutor (ΣΩ., ΜΕΝ.) quando
o TEI o traz. A *República* é mostrada um livro por vez.

Obras divididas em livros (a *Metafísica*) são mostradas **um livro por vez**, com navegação por livro
(Α, α, Β… Ν) e por capítulo; a contagem e a navegação entre ocorrências de um lema valem para a obra
inteira. Onde o TEI traz a numeração de **Bekker** (página, coluna e linha), ela aparece à margem e o
campo *Bekker* leva direto a uma passagem: `1072b14`, `1028a` ou `1028` (link: `…/#/t/aristoteles-metafisica/1072b14`).
Na edição de Ross, as palavras que ele considera interpoladas aparecem entre [ ] e não têm análise
(o GLAUx não as anota); os acréscimos do editor aparecem entre ⟨ ⟩.

### De onde vêm os dados

- **Texto exibido**: TEI/EpiDoc do [First1KGreek](https://github.com/OpenGreekAndLatin/First1KGreek)
  ou do [Perseus canonical-greekLit](https://github.com/PerseusDL/canonical-greekLit) (CC BY-SA 4.0).
- **Lemas, morfologia e sintaxe**: [GLAUx](https://github.com/alekkeersmaekers/glaux), de Alek
  Keersmaekers (KU Leuven), CC BY-SA 4.0. A anotação é **automática**; o projeto informa precisão de
  98,8% nos lemas, 97,2% na morfologia e cerca de 80% na sintaxe. O leitor avisa isso no painel.
- **Verbetes**: DDGP, como no resto do app.

O GLAUx tokeniza o texto de outro modo (divide οὔτε em οὔ + -τε e as crases em duas partes, acrescenta
termos elípticos e perde maiúsculas), por isso o conversor **alinha** as palavras do TEI às do GLAUx
pelas letras sem diacríticos; a ortografia exibida é sempre a do TEI. Resultado:

| Texto | Palavras com análise | Lemas sem verbete no DDGP | Ocorrências sem verbete |
|---|---|---|---|
| *Categorias* | 10 315 de 10 316 (falta o título) | 18 de 622 | 66 (0,6%) |
| *Metafísica* | 78 706 de 78 946 (as 238 excluídas por Ross + 2) | 216 de 2 159 | 666 (0,8%) |
| *Apologia* | 8 747 de 8 752 | 28 de 1 069 | 45 (0,5%) |
| *Mênon* | 9 689 de 9 703 | 26 de 914 | 55 (0,6%) |
| *Banquete* | 17 347 de 17 349 | 70 de 1 904 | 142 (0,8%) |
| *Fédon* | 22 274 de 22 356 | 27 de 1 899 | 43 (0,2%) |
| *República* | 88 204 de 88 265 | 286 de 4 629 | 378 (0,4%) |
| *Anábase* | 56 595 de 57 195 (faltam os sumários no início dos livros, tidos por espúrios) | 244 de 3 614 | 734 (1,3%) |
| *Histórias* | 184 843 de 184 943 | 1 504 de 9 006 | 4 258 (2,3%), dos quais ~3 950 nomes próprios |
| *Da interpretação* | 6 243 de 6 245 | 12 de 395 | 108 (1,7%: ἀντίφασις, κατάφασις, ἀπόφανσις) |
| *Primeiros analíticos* | 37 572 de 37 579 | 63 de 790 | 211 (0,6%) |
| *Segundos analíticos* | 22 670 de 22 673 | 64 de 942 | 166 (0,7%) |
| *Tópicos* | 44 116 de 44 125 | 129 de 1 506 | 316 (0,7%) |
| *Refutações sofísticas* | 14 112 de 14 115 | 69 de 1 056 | 176 (1,2%) |
| *Meditações* | 29 227 de 29 267 | 426 de 3 589 | 587 (2,0%: vocabulário da koiné e nomes romanos) |

As palavras sem análise são, em geral, as que o editor exclui ([ ]) ou variantes ausentes da versão do
texto usada pelo GLAUx; o painel as procura diretamente no dicionário.

Os lemas sem verbete são sobretudo termos técnicos (ἐντελέχεια, ἀντίφασις, ἀδιαίρετος, κατάφασις) e
nomes próprios (Ἐμπεδοκλῆς, Δημόκριτος); para esses o painel oferece um link ao Logeion.
Quando o lema do GLAUx não está no DDGP, o conversor tenta também a forma de cada ocorrência
(por exemplo, o lema καθά não está no DDGP, mas a forma καθάπερ está), a grafia sem ν
eufônico (ἔμπροσθεν → ἔμπροσθε), a forma ática com ττ, a outra voz do verbo (μαντεύομαι → μαντεύω,
χαρίζω → χαρίζομαι), μίγνυμι por μείγνυμι e, para substantivos neutros e femininos registrados no verbete
do adjetivo, a forma em ‑ος (χρηστήριον → χρηστήριος, Ἀττική → Ἀττικός); verbetes como `παντάπασι(ν)`
são indexados nas duas grafias. O DDGP registra poucos nomes próprios, o que explica a maior parte das
lacunas em Heródoto e Xenofonte.
Alguns lemas do GLAUx são corrigidos em `LEMMA_FIX`, e homógrafos frequentes têm o verbete preferido
fixado em `PREFERRED`, ambos em `scripts/build_text.py`.

### Acrescentar um texto

1. Ache o texto no GLAUx: em `metadata.txt` procure o autor/obra; o arquivo é `xml/<TLG>.xml`
   (ex.: `0086-006` = Aristóteles, *Categorias*). Confira a coluna `SOURCE_LICENSE`.
2. Ache o TEI correspondente no First1KGreek ou no Perseus (`data/tlgXXXX/tlgYYY/…grc*.xml`).
3. Crie `scripts/textos/<id>.json` com os metadados (copie o das *Categorias* para obras de um só nível,
   ou o da *Metafísica* para obras em livros e capítulos, ou o de um diálogo de Platão: `niveis` dá o
   nome de cada nível e os rótulos dos livros; `ignorarDivisoes` evita que divisões de página virem
   capítulos; `divisoesComoMarco` mostra divisões (capítulo, seção) como números à margem;
   `juntarParagrafos` une as seções de um capítulo num parágrafo; `referencia` e `exemploRef` ativam o
   campo de referência; `treebank` nomeia a anotação manual, quando houver).
4. Rode o conversor e confira, na lista que ele imprime, os lemas sem verbete: lemas malformados pelo
   lematizador (ex.: `ἔρχοναι` para εἶναι) vão para `LEMMA_FIX`.
5. Gere o arquivo:

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
**CC BY-SA 4.0**, com duas exceções sob **CC BY-NC-SA**: a *Apologia* (treebank de Vanessa Gorman) e as
*Histórias* de Heródoto (treebank PROIEL) — ver [`LICENSE-DATA.md`](LICENSE-DATA.md).

**Código** (HTML, CSS, JS, scripts): licença MIT — ver [`LICENSE`](LICENSE).
