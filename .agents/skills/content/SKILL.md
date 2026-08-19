---
name: content
description: The words a person reads in Remy. Use when writing or changing ANY empty state, dialog, button, error, setting, label, or toast.
---

# Content

`ui` owns layout and keyboard. This skill owns the words.

Remy is a remote for coding agents on your own machines. Copy speaks to the person in front of the window: second person, present tense, one short sentence.

A conversation is a **thread**. The API, the database, and the code still say chat; nothing a person reads does.

Do not explain how the UI works, and do not mention servers or daemons unless someone has to pair a machine.

## Empty states

An empty state is a next action, not a caption for a blank panel. The title names the state, the detail says what to do, and the button is that action.

When a prerequisite is missing, send them to it. A thread does not need a workspace — with none, the composer runs in `~` on this machine — so an empty thread list never points at Add workspace.

BAD
```
title: "No threads yet"
detail: "Start a thread on a connected device and it shows up here."
```

GOOD
```
title: "Inbox is clear"
detail: "Nothing is waiting on you."
```

Never: "shows up here", "this page", "this list", "get started", "simply", "just".

## Labels and descriptions

A label names the setting. Its description adds what the label cannot say, in one sentence — never a second reading of the label.

BAD
```
label: "Worktree location"
description: "Remy keeps worktrees in a .remy folder here. Leave it empty to keep each workspace's worktrees inside the workspace. Git ignores the folder without any change to the repo's .gitignore."
```

GOOD
```
label: "Worktree location"
description: "A .remy folder here, hidden from git without touching any .gitignore."
```

## Buttons and dialogs

Verb plus noun, matching the words that sent them there.

BAD
```
Pick a git repo on this machine.
```

GOOD
```
Pick a folder on this machine.
```

`AddWorkspace.tsx` is the reference for a short dialog: title, one-line description, primary button.

## Errors

What failed, then what to do about it. No stack traces, no raw JSON.

A toast says the thing that failed in its title and the reason underneath, from `apiError` in `web/src/lib/api-error.ts` so the server's own sentence survives.
