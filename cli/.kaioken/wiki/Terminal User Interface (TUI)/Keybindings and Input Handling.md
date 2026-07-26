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

The TUI processes input through a state machine managed by the `Model` struct in `internal/tui/tui.go`. Input handling varies

<!-- kaioken:files internal/tui/tui.go -->
