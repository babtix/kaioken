# Terminal User Interface (TUI)

## Table of Contents
- [Overview](#overview)
- [Command Palette](#command-palette)
- [Session Management](#session-management)
- [Markdown Rendering](#markdown-rendering)
- [Built-in Tutorial](#built-in-tutorial)
- [Status Line](#status-line)
- [Approval Workflow](#approval-workflow)
  - [Overview of the Approval Process](#overview-of-the-approval-process)
  - [Presentation of the Approval Prompt](#presentation-of-the-approval-prompt)
  - [Handling User Responses](#handling-user-responses)
  - [Integration with the Agent](#integration-with-the-agent)
  - [Edge Cases and Cancellation](#edge-cases-and-cancellation)
- [Referenced Files](#referenced-files)

## Overview

The TUI is the primary interface for interacting with kaioken. Built with the Bubble Tea library, it provides a responsive terminal experience that integrates chat, command execution, and knowledge base interactions. Key features include a command palette for accessing slash commands, session management for persisting conversations, markdown rendering for rich assistant responses, a built-in tutorial for new users, and a status line that displays real-time

<!-- kaioken:files internal/tui/tui.go -->
