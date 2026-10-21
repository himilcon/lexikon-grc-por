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

## Estrutura

```
docs/                    ← site publicado pelo GitHub Pages
  index.html, styles.css, app.js
  sw.js                  ← service worker (cache offline)
  manifest.webmanifest, icons/
  data/ddgp.json         ← dados gerados a partir do dump do DDGP
scripts/build_data.py    ← conversor SQL → JSON
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
(`DATA` e `VERSION`) para que os aparelhos baixem a nova cópia.

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

**Código** (HTML, CSS, JS, scripts): licença MIT — ver [`LICENSE`](LICENSE).
