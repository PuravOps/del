---
name: softlaunch-react-chat-app
description: Work inside the Softlaunch React + TypeScript chat application and its companion Node.js API contract. Use when Codex needs to modify or debug this repo's auth, users, chat UI, rich messages, uploads, GIFs, reactions, seen state, routing, or socket.io integration, or when a task mentions the paired backend even though only the frontend workspace is available.
---

# Softlaunch React Chat App

Inspect the current workspace before changing behavior. Treat this repository as the frontend for a chat product, not as a generic Vite starter.

## Start Here

Read these files first when the task is broad:

- `package.json` for scripts and library choices
- `src/AppRoutes.tsx` for route structure
- `src/pages/Chat.tsx` for the main product surface
- `src/services/api.ts` for REST endpoints
- `src/services/socket.ts` and `src/pages/ChatService.ts` for realtime behavior
- `src/utils/richChatMessage.ts` and `src/utils/gameMessage.ts` for message encoding rules
- `src/utils/uploadApi.ts` for file-upload behavior

Load [references/project-map.md](references/project-map.md) when you need the architecture map, env vars, API endpoints, or backend contract summary.

## Working Rules

Preserve the existing stack unless the user asks for a larger refactor:

- React 19 + TypeScript + Vite
- React Router for navigation
- Axios for HTTP
- `socket.io-client` for realtime chat and game events
- Bootstrap classes for layout/styling

When editing:

- Keep frontend API calls centralized in `src/services/api.ts` unless there is a strong reason not to.
- Keep socket event wiring in `src/services/socket.ts` or the thin `ChatService` wrapper pattern already used by chat.
- Preserve the rich-message prefixes `__SLRICH__:` and `__SLGAME__:` unless the backend contract is intentionally being migrated.
- Assume auth state comes from `localStorage` keys such as `token` and `userPhone`.
- Be careful with `Chat.tsx`; it is large and contains intertwined UI, pagination, uploads, GIF search, replies, reactions, editing, and privacy behavior.

## Backend Boundary

Assume the Node.js backend is a separate repository unless files in the current workspace prove otherwise.

When a user asks for a backend-related fix:

1. Inspect frontend call sites and event names first.
2. Document the expected backend contract from the frontend code.
3. If the backend code is not present, avoid inventing implementation details.
4. Make safe frontend changes that improve resilience, typing, validation, or error handling against the existing contract.

## Common Task Patterns

For auth or user-management work:

- Check `src/pages/Login.tsx`, `src/pages/Register.tsx`, `src/pages/Users.tsx`
- Verify route protection in `src/components/PrivateRoutes.tsx`
- Keep token-based redirects aligned with `src/AppRoutes.tsx`

For chat behavior:

- Start in `src/pages/Chat.tsx`
- Trace REST calls through `src/services/api.ts`
- Trace realtime events through `src/services/socket.ts`
- Check `src/types/chat.types.ts` before changing message shapes

For uploads, GIFs, replies, or message rendering:

- Use `src/utils/uploadApi.ts`
- Use `src/utils/richChatMessage.ts`
- Use `src/utils/gameMessage.ts` for tic-tac-toe payloads
- Keep plain-text fallback behavior intact when decoding rich payloads fails

## Validation

After edits, run the smallest relevant checks first:

- `npm run lint` for static issues
- `npm run build` for type/build regressions

If a change touches chat flows heavily, also review affected env vars and whether the behavior depends on the unavailable backend.
