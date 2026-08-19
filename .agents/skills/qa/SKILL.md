---
name: qa
description: Clicking the running Remy UI to see whether a change is actually right. Use after changing ANY component, dialog, menu, composer, empty state, shortcut, or icon.
---

# QA

`ui` owns layout and keyboard. `content` owns the words. This skill owns proving the thing works in the running app.

A snapshot of the default paint is not a test.

## Getting a page in front of you

`npm run dev:web` from the repo root serves the app at `http://127.0.0.1:5173`, against the same daemon and database as the DMG.

The page does not live-reload — `server.hmr` is `false` in `web/vite.config.ts`. Reload it after every edit, or the screenshot is of the code you had before.

Server changes need the clone's daemon, which cannot start while Remy.app holds port 8420. Quit Remy.app first.

Playwright drives it with the cached Chromium: `web/scripts/shoot.mjs` is the working example, and `chromiumPath()` in `web/scripts/chromium.mjs` finds the binary.

## What counts as having checked it

Snapshot, click, snapshot again, then measure. A snapshot caption will happily call a staggered menu "fine".

Cover every new or changed control, not one happy path:

- Dropdowns and pickers — open; select something not already selected; select the current value; dismiss with Escape. Opening a menu must not change the value; if it does, the first item is catching the same mouseup.
- Buttons and icon-only actions — click, and confirm the tooltip or `aria-label` names the action.
- Forms — type, submit, Shift+Enter where newlines matter, and submit while empty.
- Empty, error, and populated — the branch you did not stare at is where it breaks.
- File icons — a project PNG is an `img` and item CSS sizes `svg` only, so `WorkspaceIcon` defaults to `size-4`; a well that should fill passes a larger class.

Read state back from the server rather than trusting the screen: the endpoints under `/chats` and `/server/settings` say what actually persisted.

Anything you create while testing — a thread, a workspace, a changed setting — you delete or restore before you finish.

## Alignment

Read `getBoundingClientRect` in the page. If it looks a little off, it is off.

- Icons in a list share one `x`.
- An icon inside a sentence shares the surrounding line. The composer heading in `web/src/components/ChatComposer.tsx` is a flex row and the project well is `1em`, the height of the type, so it sits on the line rather than a step above it.
- A selected row is marked by a trailing `Check`, so it must not shift the row's other columns.

BAD
```
Snapshot the composer. The heading shows the workspace. The menu looks fine. Ship it.
```

GOOD
```
Reload, snapshot the composer. Open the workspace picker; measure icon x on every row and the trailing check on the selected one. Measure the heading: the well and the words share one vertical center. Pick a device, pick a workspace, type in the branch search, pick a branch, open Main checkout vs New worktree, open model and permission, send, and confirm through /chats that the thread carries what the toolbar said.
```

Stop when every new control has been clicked or keyed, the boxes you measured share their columns, and the last snapshot matches what you meant. If the page cannot be reached, say so rather than describing the code instead.
