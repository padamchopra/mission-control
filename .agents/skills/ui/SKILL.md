---
name: ui
description: Layout and keyboard for the Remy web UI. Use when adding or changing ANY web component, dialog, menu, picker, list row, empty state, or shortcut.
---

# UI

`content` owns the words. `qa` owns clicking the result. `.agents/skills/shadcn` owns the CLI, composition rules, and component APIs — read it before adding or rewriting a primitive.

The UI is shadcn New York (Radix, not Base) in `web/src/components/ui`, configured by `web/components.json`. Run CLI commands from `web/`.

## Primitives

Every control comes from `web/src/components/ui`. A primitive that is missing is added with `npx shadcn@latest add <name>` from `web/`, then used.

Answer the prompt to overwrite an existing file with no: the CLI pulls a component's dependencies, and this project has edited some of them.

A custom `div` or `button` is the last resort, after no primitive can do the job.

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

| Job | Primitive |
|---|---|
| App chrome | `Sidebar` |
| Searchable, keyboard-driven list | `Command` |
| ⌘K | `CommandDialog` |
| A row with icon, title, description, trailing action | `Item` |
| A message in a thread | `Message` + `Bubble` |
| Empty panel | `Empty` |
| Modal | `Dialog`, or `AlertDialog` to confirm something destructive |
| Menu | `DropdownMenu`, selected marked by a trailing `Check` |
| Form dropdown | `Select` |
| Labeled setting row | `Field` |
| Composing a message | `InputGroup` |
| Transient status | `toast()` from `sonner` |
| Loading text | the `shimmer` class from `shadcn/tailwind.css` |

`Palette.tsx` is the reference for a searchable list, `AppSidebar.tsx` for app chrome, and `PathPicker.tsx` for choosing a folder.

A composed screen assembles primitives; it never replaces one that exists. A control that appears on two screens moves into its own module rather than being copied — `ComposerMenu.tsx` and `PathPicker.tsx` are shared this way.

## Keyboard

Every interactive surface has keyboard access, from the primitive that already implements it rather than a home-rolled `onKeyDown`.

Arrow keys move the highlight, Enter activates, Escape closes, Tab moves between input, list, and footer actions.

In a path picker, Enter opens the highlighted folder so you can keep going, and ⌘Enter confirms.

A shortcut no primitive owns is bound in the component and shown with `Kbd` next to the action.

## Where the window is

Threads, settings tabs, workspaces, and the device scope are hash routes, parsed and formatted by `web/src/lib/route.ts`. A new place a person can be gets a route, so a reload lands back on it.

State that is genuinely transient — an open palette, an open dialog — stays in React.
