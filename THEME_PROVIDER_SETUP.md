# ThemeProvider Implementation Guide

## What Was Implemented

A config-driven theme system with JSON as the single source of truth for all design tokens.

### Files Created

1. **`packages/ui/src/renderer/theme/theme-config.json`**
   - Centralized light-only theme configuration
   - Organized into 4 sections: colors, typography, spacing, radius
   - All values are editable without modifying component code

2. **`packages/ui/src/renderer/theme/ThemeProvider.tsx`**
   - React Context provider that loads theme-config.json
   - Injects all tokens as CSS variables on document root
   - Automatically enforces light-only policy
   - Applied on component mount

3. **`packages/ui/src/renderer/hooks/useThemeConfig.ts`**
   - Hook for programmatic access to theme tokens
   - Type-safe helper functions: `getColor()`, `getSpace()`, `getRadius()`, `getFont()`
   - Access to full config object and token collections

4. **Updated `packages/ui/src/renderer/index.tsx`**
   - Wrapped MainPage with ThemeProvider
   - ThemeProvider applied after error boundary bootstrap

## How to Use

### 1. Change Theme Colors (Most Common)

Edit `packages/ui/src/renderer/theme/theme-config.json`:

```json
{
  "colors": {
    "primary": "#C15F3C",        // Change this to any hex value
    "background": "#faf9f5",
    "border": "#e5e2da",
    // ... other colors
  }
}
```

**Result**: All components using `var(--color-primary)` or `bg-primary` class instantly reflect the change.

### 2. Change Typography

Edit the typography section in `theme-config.json`:

```json
{
  "typography": {
    "fontFamily": {
      "sans": "'Segoe UI', ...",    // Main font
      "mono": "'Courier New', ..."  // Code font
    },
    "fontSize": {
      "base": "1rem",
      "lg": "1.125rem",
      // ... other sizes
    }
  }
}
```

**CSS Variables Available**:
- `--font-sans`, `--font-mono`
- `--text-xs`, `--text-sm`, `--text-base`, etc.
- `--font-weight-light`, `--font-weight-bold`, etc.
- `--line-height-tight`, `--line-height-normal`, etc.

### 3. Change Spacing or Border Radius

Edit the spacing/radius sections:

```json
{
  "spacing": {
    "xs": "0.25rem",
    "sm": "0.5rem",
    "lg": "1rem",
    // ... edit any value
  },
  "radius": {
    "sm": "0.3rem",
    "lg": "0.75rem",
    // ... edit any value
  }
}
```

**CSS Variables Available**:
- `--space-xs`, `--space-sm`, `--space-lg`, etc.
- `--radius-sm`, `--radius-lg`, etc.

### 4. Access Theme in React Components

Use the `useThemeConfig` hook:

```typescript
import { useThemeConfig } from "@/hooks/useThemeConfig";

export function MyComponent() {
  const { getColor, getSpace, config } = useThemeConfig();

  const primaryColor = getColor("primary");      // "#C15F3C"
  const padding = getSpace("lg");                // "1rem"
  const allColors = config.colors;               // Full colors object

  return (
    <div style={{ 
      color: primaryColor, 
      padding: padding 
    }}>
      My component
    </div>
  );
}
```

**Available Helpers**:
- `getColor(key)` - Get a color value
- `getSpace(key)` - Get a spacing value
- `getRadius(key)` - Get a radius value
- `getFont(type, key)` - Get typography token (type: "fontFamily" | "fontSize" | "fontWeight" | "lineHeight")
- `getColors()` - Get all color tokens
- `getTypography()` - Get all typography tokens
- `getSpacing()` - Get all spacing values
- `getRadii()` - Get all radius values
- `config` - Access full theme config object

## CSS Usage (Most Common)

Most components should use CSS classes or CSS variables directly:

```css
/* Using utility classes generated from @theme inline */
.my-element {
  background-color: var(--color-background);
  color: var(--color-foreground);
  padding: var(--space-lg);
  border-radius: var(--radius-lg);
}
```

**Tailwind Utility Classes Available**:
- `bg-background`, `text-foreground`, `bg-primary`, etc. (from colors)
- All colors map to Tailwind utilities automatically via `@theme inline` in globals.css

## Architecture

```
┌─────────────────────────────────────────┐
│  theme-config.json (Source of Truth)    │
│  └─ colors, typography, spacing, radius │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│  ThemeProvider (React Context)          │
│  └─ Injects CSS variables on mount      │
│  └─ Enforces light-only policy          │
└──────────────┬──────────────────────────┘
               │
         ┌─────┴─────────┐
         ▼               ▼
    CSS Variables   useThemeConfig Hook
    (in DevTools)   (in components)
         │               │
    ┌────┴────┬──────┬───┴──────┐
    ▼         ▼      ▼          ▼
  Inline  Tailwind  JS        Component
  Styles  Classes   Logic      Styling
```

## Key Design Principles

1. **JSON is Source of Truth**: All tokens live in one file. No hardcoded hex values in components.
2. **Light-Only Enforced**: `ThemeProvider` removes dark class and sets `data-theme="light"` on mount.
3. **CSS Variables First**: Components should prefer `var(--color-primary)` over JS values.
4. **Type-Safe**: `useThemeConfig` hook provides typed access to tokens.
5. **Production-Ready**: Fallback to `enforceLightTheme()` if provider fails to initialize.

## Next Steps (Optional)

### Refactor Hardcoded Colors
Components with inline hex values can now use tokens:

**Before**:
```tsx
<div style={{ color: "#C15F3C" }}>
```

**After**:
```tsx
const { getColor } = useThemeConfig();
<div style={{ color: getColor("primary") }}>
```

Or use CSS variables:
```tsx
<div style={{ color: "var(--color-primary)" }}>
```

### Add Color-Only Variants
To add a light and dark variant later (future feature):

1. Add a `.dark` section to theme-config.json with dark values
2. Create `ThemeProvider` override to toggle dark mode
3. Update policy to remove `enforceLightTheme()` enforcement

---

**Status**: ✅ Implementation complete. All files compile without errors.
