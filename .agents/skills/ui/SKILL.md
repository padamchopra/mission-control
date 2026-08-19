---
name: ui
description: Remy web UI conventions — shadcn primitives and keyboard access. Use when adding, changing, or reviewing ANY web component, dialog, modal, form, menu, picker, empty state, or shortcut.
---

# UI

`content` owns the words. This skill owns Remy layout and keyboard. `.agents/skills/shadcn` owns the CLI, composition rules, and component APIs — read it before adding or rewriting a primitive.

Remy's web UI is shadcn New York (Radix) in `web/src/components/ui`, configured by `web/components.json`. Run CLI commands from `web/`.

## Primitives

Use a primitive from `web/src/components/ui` for every control. If it is missing, add it with `npx shadcn@latest add <name>` from `web/` and then use it.

This project is Radix, not Base. Toast is `sonner` (`toast()` from `sonner`, `<Toaster />` from `@/components/ui/sonner`). Do not add the Base `toast` component.

Composed screens (`Palette`, `AddWorkspace`, `Settings`, `AppSidebar`) assemble those primitives. They are not a substitute for a primitive that already exists.

A custom `div`/`button` control is the last resort, only after no shadcn primitive can do the job.

BAD
```tsx
<div className="rounded-md border">
  {items.map((item) => (
    <button type="button" onClick={() => pick(item)}>{item.label}</button>
  ))}
</div>
```

GOOD
```tsx
<Command shouldFilter={false}>
  <CommandInput value={path} onValueChange={setPath} />
  <CommandList>
    {items.map((item) => (
      <CommandItem key={item.path} value={item.path} onSelect={() => pick(item)}>
        {item.label}
      </CommandItem>
    ))}
  </CommandList>
</Command>
```

The reference for a searchable, keyboard-driven list is `web/src/components/Palette.tsx`. The reference for app chrome is `web/src/components/AppSidebar.tsx`.

| Job | Primitive |
|---|---|
| App chrome | `Sidebar` (`AppSidebar`) |
| Searchable / selectable list | `Command` |
| ⌘K | `CommandDialog` (`Palette`) |
| Empty panel | `Empty` |
| Chat row / last preview | `Message` + `Bubble` |
| Confirm a destructive action | `AlertDialog` |
| Transient status | `toast()` from `sonner` |
| Loading text | `shimmer` class from `shadcn/tailwind.css` |
| Modal | `Dialog` (`esc` closes) |
| Menu | `DropdownMenu` |
| Tabs | `Tabs` |
| Confirm / submit | `Button` in a focusable dialog |

## Keyboard

Every interactive surface has keyboard access. Prefer primitives that already implement it over home-rolled `onKeyDown`.

Arrow keys move the highlight. Enter activates. Escape closes. Tab moves between chrome (input, list, footer actions). ⌘K already opens the palette.

In a path picker, Enter fills the highlighted folder so you can keep going. ⌘Enter confirms.

If the primitive cannot own a shortcut, bind it and show it with `Kbd` / `KbdGroup` next to the action, matching the palette footer.

Do not ship a click-only list, picker, or toolbar when the same job exists as a shadcn primitive with keys.
