---
name: qa
description: Exercise the running Remy UI after ANY visual or interaction change. Use when you change a component, dialog, menu, composer, empty state, shortcut, or icon, or when finishing a UI task.
---

# QA

`ui` owns layout. `content` owns words. This skill owns clicking the running app and checking that what you clicked is actually straight.

A snapshot of the default paint is not a test. After you change a control, open the preview and use it the way a person would: every new click target, every menu item, keyboard, empty and populated.

## When

After the code that a person can see or click has changed, before you tell them it is done.

If the preview is down, start it (`npx vite --host 0.0.0.0 --port 5173` from `web/`) and wait until the page matches the change.

## How

Snapshot first so you know the starting paint. Then click. Then snapshot again. Then measure alignment — a snapshot caption will happily call a staggered menu "fine".

Cover every new or changed control, not one happy path:

- Dropdowns and pickers — open them; select something that is not already selected; select the current value; dismiss with Escape. Opening the menu must not change the value; if it does, the first item is catching the same mouseup
- Buttons and icon-only actions — click; confirm the tooltip/`aria-label` names the action
- Forms — type, submit, Shift+Enter if newlines matter, disabled/empty submit
- Empty, error, and populated — the branch you did not stare at is where it breaks
- File icons — a project PNG in a menu is an `img`; item CSS sizes `svg` only. `WorkspaceIcon` defaults to `size-4` so a menu cannot blow up. A well that should fill passes a larger class, as in `web/src/App.tsx` workspace rows

The composer in `web/src/components/ChatComposer.tsx` is the reference for a surface with several menus: open the workspace name, a device (root on that machine), the footer device chip, model, permission, the git branch search, and Main checkout vs New worktree before calling it done. A workspace footer shows the branch picker and checkout on the right.

## Alignment

Read `getBoundingClientRect` in the page. If it looks even a little off, it is off.

- Icons in a list share one `x`. `DropdownMenuRadioItem` in `web/src/components/ui/dropdown-menu.tsx` reserves a left gutter; mixing it with `DropdownMenuItem` (Add workspace under a selected project) shoves one row. Selected is a trailing `Check`, as in `WorkspaceMenu` in `ChatComposer`
- An icon or picker inside a sentence shares the surrounding line. The composer heading is a flex row (`items-center`); the project well is `1em` — the same height as the type — so it sits on that line, not a step above or below it
- Color swatches and the glyph grid in `IconPicker` share one left edge. The selected tint keeps its fill; zinc is the default/white swatch, not an empty slot

BAD
```
Snapshot the chats composer. The heading shows the workspace. The menu looks fine. Ship it.
```

GOOD
```
Snapshot the composer. Open the workspace picker; measure icon x on every row (they match) and the check on the right of the selected row. Measure the heading: the well and the words around it share one vertical center, and the well is `1em`. Pick a device (root on that machine), pick a workspace, open the branch search and type, pick a branch, open Main checkout vs New worktree, open the device chip, model, and permission, click New chat, Escape back if there is a list.
```

Stop only when every new control has been clicked (or keyed), measured boxes share columns and baselines, and the last snapshot matches what you meant. If the preview cannot reach this machine, say that — do not skip the clicks and describe the code instead.
