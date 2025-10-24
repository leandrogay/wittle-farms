# Coding Standards & Naming Conventions

This document defines the coding standards and naming conventions for all JavaScript and Node.js projects in this repository. Consistent conventions improve code readability, maintainability, and team collaboration.

## 1. General Guidelines

- Use `const` and `let` — **never** use `var`
- Use **arrow functions** unless `this` binding is required
- Always use **strict equality (`===` / `!==`)**
- Avoid **magic numbers** or strings — define them as constants
- Keep functions small and modular
- Use **async/await** instead of raw Promises or callbacks
- Prefer **named exports** over default exports for shared modules

## 2. Variable Naming Conventions

| Type | Convention | Example | Notes |
|------|-----------|---------|-------|
| **Variables** | `camelCase` | `let totalCount = 0;` | Default convention |
| **Constants** | `UPPER_SNAKE_CASE` | `const MAX_RETRY_COUNT = 5;` | For fixed values |
| **Booleans** | `is/has/should + Noun/Verb` | `isLoggedIn`, `hasPermission` | Improves readability |
| **Arrays** | Plural nouns | `const users = [];` | Indicates multiple items |
| **Objects** | Singular nouns | `const user = {};` | Represents one entity |
| **MongoDB Models** | `PascalCase` | `User`, `Project`, `Task` | Represents one model |
| **Collections** | Plural nouns | `users`, `projects`, `tasks` | Represents one collection |

## 3. Function Naming Conventions

| Type | Convention | Example | Notes |
|------|-----------|---------|-------|
| **Regular functions** | `camelCase` | `calculateTotal()` | Verb + noun for clarity |
| **Async functions** | Verb should indicate action | `fetchData()`, `getUserInfo()` | Descriptive of intent |
| **Boolean-returning functions** | Prefix with `is`, `has`, `can`, `should` | `isValidEmail()` | Clear meaning |
| **Event handlers (React)** | `handle + Event` | `handleClick()`, `handleSubmit()` | Common pattern |
| **Private helpers** | Prefix with `_` | `_formatDate()` | Internal use only |
| **Classes / Constructors** | `PascalCase` | `class UserService {}` | Always capitalized |

## 4. File and Folder Naming

| Type | Convention | Example |
|------|-----------|---------|
| **Files (JS/TS)** | `kebab-case` | `overdue-notifs.js` |
| **Folders** | `kebab-case` | `routes/`, `services/`, `models/` |
| **React Components** | `PascalCase` | `TaskCard.jsx` |
| **Tests** | Match file + `.test.js` | `create-task.test.js` |

## 5. Summary Cheat Sheet

| Category | Convention |
|----------|-----------|
| Variables | `camelCase` |
| Constants / Enums | `UPPER_SNAKE_CASE` |
| Functions | `camelCase` |
| Classes | `PascalCase` |
| Files | `kebab-case` |
| Booleans | `isX`, `hasX`, `canX` |
| Async Functions | Use verbs (`fetch`, `load`, `update`) |
