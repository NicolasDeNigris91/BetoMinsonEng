# Identidade visual — DiMinson Engenharia

**Direção:** Blueprint Engineer × Papaya
**Data:** 2026-05-14

## Resumo

Identidade focada em **engenharia**, com toque de F1 entregue apenas pela cor de assinatura (laranja papaya, referência sutil ao McLaren). Resultado esperado: app que sente "prancheta de engenheiro de verdade", com personalidade clara sem sacrificar usabilidade em campo.

---

## Tokens de cor

### Light (default)

| Token | Valor | Uso |
|---|---|---|
| `--background` | `#fbfcfe` | Fundo de página (já com grid sutil sobreposto) |
| `--foreground` | `#0f1e3a` (navy profundo) | Texto principal |
| `--card` | `#ffffff` | Cards, painéis |
| `--brand` | `#ff8000` (Papaya McLaren) | Cor de assinatura |
| `--brand-foreground` | `#ffffff` | Texto sobre brand |
| `--border` | `rgba(15, 30, 58, 0.18)` | Bordas padrão |
| `--muted` | `#f1f5fa` | Áreas neutras |
| `--muted-foreground` | `rgba(15, 30, 58, 0.55)` | Texto secundário, labels |
| `--ring` | `#ff8000` | Foco em inputs |

### Semânticas (mantém o sistema atual)

| Token | Valor | Uso |
|---|---|---|
| `--success` | `#16a34a` | Vistoria concluída, sistema OK |
| `--success-soft` | `rgba(22, 163, 74, 0.15)` | Badge background |
| `--warning` | `#f59e0b` | Achados pendentes, atenção |
| `--warning-soft` | `rgba(245, 158, 11, 0.15)` | Badge background |
| `--destructive` | `#dc2626` | Erro, achado crítico |
| `--destructive-soft` | `rgba(220, 38, 38, 0.12)` | Badge background |

### Grid blueprint (background pattern)

```css
background:
  linear-gradient(rgba(15,30,58,0.025) 1px, transparent 1px) 0 0 / 24px 24px,
  linear-gradient(90deg, rgba(15,30,58,0.025) 1px, transparent 1px) 0 0 / 24px 24px,
  #fbfcfe;
```

Duas intensidades:
- **Sutil (0.025 alpha)** — app diário, todas as telas internas
- **Marcante (0.08 alpha)** — tela de login, empty states, PDF do cliente

---

## Tipografia

| Família | Função | Source |
|---|---|---|
| **Inter** (400/500/600/700/800) | Texto principal, títulos, UI | Google Fonts |
| **JetBrains Mono** (400/500/600) | Números, IDs, datas, labels técnicas | Google Fonts |

Regras de uso da mono:
- IDs de vistoria (`VST-2026-014`)
- Datas em formato técnico (`28/04/2026 · 14:32`)
- Contagens com padding zero (`03`, `14`, `28`)
- Labels em caps com tracking aberto (`VISTORIAS`, `PENDENTES`)
- Breadcrumbs (`EMPREENDIMENTOS / RESIDENCIAL VILA NOVA`)
- Stamps decorativos (`VST · 2026`)

Hierarquia de títulos:
- `page-title`: 26px / 800 / tracking -0.015em
- `section-title` (caps): 12px / 600 / tracking 0.04em / uppercase
- `card-title`: 14px / 600
- `breadcrumb`: 10px / mono / tracking 0.14em / uppercase

---

## Componentes (padrões)

### Header
- Fundo branco semi-transparente com blur
- Logo: marca quadrada papaya (28px) + nome "DiMinson Engenharia" + tagline pequena em caps ("VISTORIAS · INSPEÇÕES TÉCNICAS")
- Linha gradient papaya embaixo (já existente, manter)

### Botão primário
- Background papaya, texto branco
- Sombra dupla: `0 1px 0 rgba(255,128,0,0.4), 0 4px 12px rgba(255,128,0,0.18)`
- Border-radius 5px
- Peso 600

### Botão ghost
- Background transparente, border navy 20% alpha
- Texto navy 70% alpha

### Card (vistoria/unidade)
- Border padrão 18% alpha
- Faixa lateral 3px com cor semântica (verde/amarelo/laranja/vermelho)
- Header com título + badge de status
- Footer separado por linha tracejada com chips "elétrica ok / hidráulica 2 / hvac 1" em mono

### Badge
- Tipografia: caps, 9px, tracking 0.12em, peso 700
- Tipos: brand (papaya sólido), success-soft, warning-soft, destructive-soft

### Stat card
- Label em mono caps no topo (`VISTORIAS`)
- Valor grande em mono tabular-nums (`14`, `03`)
- Variante `accent` pinta o valor de papaya

### Linha de detalhe (chave-valor)
- Chave em mono caps 130px de largura fixa
- Valor em Inter (texto livre) ou mono (números/IDs)
- Background branco com border

---

## Momentos especiais

### Tela de login
- Grid blueprint marcante (alpha 0.08)
- Texto decorativo no topo em mono: "DIMINSON · ENG · ENG · DIMINSON · ENG · ENG ·"
- Card centralizado com side stripe papaya à esquerda
- Stamp `VST · 2026` no canto superior direito (mono, com borda)
- Input com font mono pra senha
- Footer técnico em mono caps: "DIMINSON ENGENHARIA · USO INTERNO"

### Empty state
- Grid blueprint marcante
- Ícone técnico (régua, prancheta) com tracejado
- Mensagem em mono caps + texto Inter
- CTA papaya

---

## Itens em aberto

A decidir antes de começar a implementação:

1. **Dark mode** — manter (ajustando tokens), ou simplificar pra só light?
2. **Logo** — usar `/logo-diminson.png` atual sem alteração, ou desenhar um logotype novo coerente com a nova identidade?
3. **PDF** — aplicar identidade no template ou deixar como segunda fase?
4. **Animações/micro-interações** — adicionar transitions sutis em hover/focus (hover-lift que já existe) ou manter como está?

---

## Fora do escopo

- Não é um redesign de fluxo / informação
- Não muda estrutura de páginas, rotas ou navegação
- Não toca em comportamento, só em apresentação
- Não adiciona F1 easter eggs (toasts "Box, box, box", spinner de pneu, etc.)
