# Kaioken Design System

## Color Palette

### Core Colors
| Variable | Value | Description |
|----------|-------|-------------|
| `--kai-red` | `#ff0000` | Logo, danger |
| `--kai-orange` | `#ff8700` | Primary, gutter, headings |
| `--kai-amber` | `#ffaf00` | Warn, approval, keycaps |
| `--kai-tan` | `#d7af87` | Tool calls |
| `--kai-blue` | `#87d7ff` | User input, commands |
| `--kai-green` | `#00d787` | OK, diff +, examples |
| `--kai-sage` | `#87af87` | Tool results |
| `--kai-rose` | `#ff5f5f` | Errors, diff − |
| `--kai-black` | `#080808` | Background |
| `--kai-ink` | `#121212` | Card background |
| `--kai-panel` | `#1c1c1c` | Popover, secondary, muted |
| `--kai-line` | `#303030` | Borders, divider |
| `--kai-dim` | `#585858` | Dimmed text |
| `--kai-muted` | `#808080` | Muted foreground |
| `--kai-text` | `#d0d0d0` | Primary foreground |
| `--kai-white` | `#eeeeee` | White |

### Derived Tokens
| Token | Value |
|-------|-------|
| `--background` | `var(--kai-black)` |
| `--foreground` | `var(--kai-text)` |
| `--card` | `var(--kai-ink)` |
| `--card-foreground` | `var(--kai-text)` |
| `--popover` | `var(--kai-panel)` |
| `--popover-foreground` | `var(--kai-text)` |
| `--primary` | `var(--kai-orange)` |
| `--primary-foreground` | `#180c00` |
| `--secondary` | `var(--kai-panel)` |
| `--secondary-foreground` | `var(--kai-text)` |
| `--muted` | `var(--kai-panel)` |
| `--muted-foreground` | `var(--kai-muted)` |
| `--accent` | `#241708` |
| `--accent-foreground` | `var(--kai-amber)` |
| `--destructive` | `var(--kai-rose)` |
| `--border` | `#ffffff14` |
| `--input` | `#ffffff1f` |
| `--ring` | `var(--kai-orange)` |

### Chart Colors
| Token | Value |
|-------|-------|
| `--chart-1` | `var(--kai-orange)` |
| `--chart-2` | `var(--kai-amber)` |
| `--chart-3` | `var(--kai-tan)` |
| `--chart-4` | `var(--kai-blue)` |
| `--chart-5` | `var(--kai-green)` |

## Typography

| Token | Value |
|-------|-------|
| `--font-heading` | `var(--font-mono)` |
| `--font-mono` | `"JetBrains Mono Variable", ui-monospace, "Cascadia Code", monospace` |
| `--font-sans` | `"Geist Variable", ui-sans-serif, system-ui, sans-serif` |

## Radius

| Token | Value |
|-------|-------|
| `--radius` | `0.25rem` |
| `--radius-sm` | `calc(var(--radius) * 0.6)` |
| `--radius-md` | `calc(var(--radius) * 0.8)` |
| `--radius-lg` | `var(--radius)` |
| `--radius-xl` | `calc(var(--radius) * 1.4)` |
| `--radius-2xl` | `calc(var(--radius) * 1.8)` |
| `--radius-3xl` | `calc(var(--radius) * 2.2)` |
| `--radius-4xl` | `calc(var(--radius) * 2.6)` |

## Component Variants

### Button
**Variants**: `default`, `outline`, `secondary`, `ghost`, `destructive`, `link`  
**Sizes**: `default`, `xs`, `sm`, `lg`, `icon`, `icon-xs`, `icon-sm`, `icon-lg`

### Badge
**Variants**: `default`, `secondary`, `destructive`, `outline`, `ghost`, `link`

### Tabs
**Orientation**: `horizontal` (default), `vertical`  
**TabsList Variant**: `default`, `line`

## Notes
- The design system is derived from `website/src/index.css` and UI components in `website/src/components/ui/`.
- Colors are synchronized with the terminal TUI lipgloss ANSI codes.
- Square-ish radius reflects terminal aesthetics.
- Fonts use Geist Variable for sans and JetBrains Mono Variable for mono.