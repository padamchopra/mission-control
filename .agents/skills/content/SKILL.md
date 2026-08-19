---
name: content
description: Remy user-facing copy. Use when writing, editing, or reviewing ANY empty state, dialog, button, error, setting, label, or other string a person reads in the app.
---

# Content

`ui` owns layout and keyboard. This skill owns the words.

Remy is a remote for coding agents on your own machines. Copy talks to the person in front of this window, in second person, present tense, one short sentence.

Do not explain how the UI works. Do not mention servers, daemons, or "connected devices" unless the person has to pair a machine.

## Empty states

An empty state is a next action, not a caption for the blank panel.

Title names the state. Detail tells them what to do. The button is that action.

If a prerequisite is missing, send them there. Chats run in a workspace: no workspace means the chats empty state is Add workspace, not New chat. That branch lives in `EmptyState` in `web/src/App.tsx`.

BAD
```
title: "No chats yet"
detail: "Start a chat on a connected device and it shows up here."
```

GOOD
```
title: "No chats yet"
detail: "Add a workspace on this machine first. Chats run there."
```

Never: "shows up here", "this page", "this list", "get started", "simply", "just".

## Buttons and dialogs

Verb + noun. Match the empty-state detail.

BAD
```
Pick a git repo on this machine.
```

GOOD
```
Pick a folder on this machine.
```

The add-workspace dialog in `web/src/components/AddWorkspace.tsx` is the reference for a short dialog: title, one-line description, primary button.

## Errors

What failed, then what to do. No stack traces, no raw JSON.
