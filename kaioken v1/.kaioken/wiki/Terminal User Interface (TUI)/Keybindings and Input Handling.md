# Keybindings and Input Handling

This chapter explains keyboard input processing in Kaioken's terminal user interface (TUI), built with Bubble Tea. It covers chat input, command palette navigation, special key handling (Enter, Esc, etc.), and state-dependent input behaviors.

## Table of Contents
- [Overview](#overview)
- [Input States](#input-states)
- [Keybinding Tables](#keybinding-tables)
- [Special Key Handling](#special-key-handling)
- [Viewport and Composer Behavior](#viewport-and-composer-behavior)
- [State Transition Diagram](#state-transition-diagram)
- [Referenced Files](#referenced-files)

## Overview

The TUI processes input through a state machine managed by the `Model` struct in `internal/tui/tui.go`. Input handling varies based on:
- Current `mode` (`modeChat` or `modePicker`)
- Boolean flags: `pendingApproval`, `pendingKey`, `pal.active` (command palette active)
- `busy` state (indicating ongoing operations)

The primary input handler is the `onKey` method, which processes `tea.KeyMsg` events and routes them to appropriate handlers based on the current state.

## Input States

The TUI operates in distinct input states, each with specific keybindings:

### 1. Normal Chat Mode
Default state for chatting with the AI agent. Active when:
- `mode == modeChat`
- `!pendingApproval`
- `!pendingKey`
- `!pal.active`
- `!busy`

In this state:
- Alphanumeric keys are appended to the chat input (textarea)
- Enter sends the message or triggers slash commands
- Alt+Enter/Ctrl+J inserts newlines
- PgUp/PgDown scrolls chat history
- Up/Down scrolls history when input is single-line; moves cursor in multi-line input
- Ctrl+C clears non-empty input
- Ctrl+D quits if input is empty
- Esc has no special function (passed to input, typically ignored by textarea)

### 2. Command Palette Active
Triggered when typing `/` in chat input (handled via `refreshPalette` called on input changes). Active when:
- `pal.active == true`

In this state:
- Up/Ctrl+P: move selection up in palette
- Down/Ctrl+N: move selection down in palette
- Tab: complete selected command (inserts into input)
- Enter: dispatch selected command (as slash command)
- Esc: dismiss palette and return to chat
- Other keys: ignored (palette handles navigation only)

### 3. Model/Session Picker Active
Active when `mode == modePicker` (opened via `/model` or `/resume` without arguments).

In this state:
- Up/Down: navigate picker list
- Enter: select highlighted item (model or session)
- Esc/Ctrl+C: exit picker and return to chat
- Other keys: filter picker items (fuzzy search)

### 4. Approval Prompt Active
Active when `pendingApproval == true` (awaiting user approval for a tool action).

In this state:
- Y/y/Enter: approve action (send `true` to approvals channel)
- N/n/Esc: decline action (send `false`)
- Ctrl+C: stop current task (calls `stopCurrent`)
- Other keys: ignored

### 5. API Key Entry Active
Active when `pendingKey == true` (hidden input for `/key` command).

In this state:
- Enter: process entered key (trim, save, rebuild client)
- Other keys: update hidden textinput (echo mode disabled)
- Esc/Ctrl+C: not explicitly handled; treated as regular input (but input is hidden)

## Keybinding Tables

### Normal Chat Mode Keybindings
| Key | Action | Notes |
|-----|--------|-------|
| Enter | Send message or dispatch command | Empty input ignored; non-empty input starting with `/` dispatched; otherwise starts chat |
| Alt+Enter / Ctrl+J | Insert newline | Allows multi-line input |
| PgUp/PgDown | Scroll viewport | Scrolls chat history |
| Up/Down | Scroll viewport (single-line input) / Move cursor (multi-line) | Switches based on `input.LineCount()` |
| Ctrl+C | Clear input (if non-empty) / Show hint (if empty) | If input non-empty: clears and refreshes; if empty: suggests Ctrl+D to quit |
| Ctrl+D | Quit (if input empty) / Show hint (if non-empty) | Requires empty input to quit |
| Esc | No special action | Passed to input (typically ignored) |
| Any other key | Append to input | Processed by textarea widget |

### Command Palette Active Keybindings
| Key | Action | Notes |
|-----|--------|-------|
| Up / Ctrl+P | Move selection up | Wraps at list boundaries |
| Down / Ctrl+N | Move selection down | Wraps at list boundaries |
| Tab | Complete selected command | Inserts command into chat input |
| Enter | Dispatch selected command | Executes `/<command>` |
| Esc | Dismiss palette | Returns to chat input |
| Other keys | Ignored | Palette handles navigation only |

### Model/Session Picker Active Keybindings
| Key | Action | Notes |
|-----|--------|-------|
| Up / Down | Navigate list | Changes highlighted item |
| Enter | Select item | Sets model or resumes session |
| Esc / Ctrl+C | Exit picker | Returns to chat (`mode = modeChat`) |
| Any other key | Filter list | Updates fuzzy search |

### Approval Prompt Active Keybindings
| Key | Action | Notes |
|

<!-- kaioken:files internal/tui/tui.go -->
