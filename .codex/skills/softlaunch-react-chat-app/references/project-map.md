# Project Map

## Scope

This workspace contains the frontend for a chat application called Softlaunch. It is a React + TypeScript + Vite app that relies on a separate Node.js backend through REST and socket.io.

The backend code is not present in this workspace. Backend behavior must be inferred from frontend contracts.

## Stack

- React 19
- TypeScript 5
- Vite 7
- React Router 7
- Axios
- Bootstrap 5
- `socket.io-client`
- `emoji-picker-react`
- `twemoji-parser`

## Important Files

- `src/AppRoutes.tsx`: top-level route definitions and token-based redirects
- `src/components/PrivateRoutes.tsx`: route guard based on `localStorage.getItem("token")`
- `src/pages/Login.tsx`: public login screen
- `src/pages/Register.tsx`: registration/create-user screen
- `src/pages/Users.tsx`: authenticated user list / entry point into chat
- `src/pages/Chat.tsx`: main chat UI and most advanced logic
- `src/services/api.ts`: REST API client and endpoint helpers
- `src/services/socket.ts`: socket lifecycle and event helper methods
- `src/utils/uploadApi.ts`: raw file upload to backend `/uploads`
- `src/utils/richChatMessage.ts`: encoded rich-message schema for text/GIF/file messages
- `src/utils/gameMessage.ts`: encoded tic-tac-toe message schema

## Routes

- `/` redirects to `/users` when `token` exists, otherwise `/login`
- `/login` public
- `/register` public
- `/users/create` protected
- `/users` protected
- `/chat` protected

## Auth and Local Storage

Observed local storage usage:

- `token`: bearer token for API auth and route gating
- `userPhone`: current user identity for chat sender logic

`src/services/api.ts` adds `Authorization: Bearer <token>` automatically through an Axios request interceptor.

## Environment Variables

Observed frontend env vars:

- `VITE_API_URI`: REST API base URL
- `VITE_SOCKET_URI`: socket.io server URL
- `VITE_KLIPY_API_KEY`: preferred GIF provider key
- `VITE_GIPHY_API_KEY`: fallback GIF provider key
- `VITE_TENOR_API_KEY`: fallback GIF provider key

README also notes backend Cloudinary env vars for upload support:

- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`
- `CLOUDINARY_FOLDER` optional

## REST Contract Inferred From Frontend

Base client: `src/services/api.ts`

Chat endpoints:

- `GET /chat/:user1/:user2`
- `POST /chat`
- `DELETE /chat/:messageId`
- `PUT /chat/:messageId`
- `POST /chat/:messageId/reactions`
- `DELETE /chat/:messageId/reactions`
- `GET /chat/unseen-counts/:receiver`
- `POST /chat/mark-seen`

Misc:

- `GET /ping`

User endpoints:

- `POST /users/register`
- `POST /users/login`
- `GET /users`
- `PUT /users/:id`
- `DELETE /users/:id`

Upload endpoint:

- `POST /uploads`

## Socket Contract Inferred From Frontend

Client emits:

- `join`
- `sendMessage`
- `markSeen`
- `deleteMessage`
- `updateMessage`
- `addReaction`
- `removeReaction`
- `game.move`
- `game.rematch`

Client listens for:

- `connect`
- `disconnect`
- `connect_error`
- `receiveMessage`
- `messagesSeen`
- `messageDeleted`
- `messageUpdated`
- `reactionAdded`
- `reactionRemoved`
- `game.created`
- `game.updated`

## Chat Page Behavior

`src/pages/Chat.tsx` is the center of product behavior. It currently handles:

- conversation loading and pagination
- unread counts
- auto-scroll logic
- mobile/responsive layout state
- emoji picker
- GIF search and pagination
- file uploads and clipboard-paste uploads
- rich message encode/decode
- reply previews
- message edit/delete/reaction actions
- privacy mode blur behavior
- image preview modal behavior
- tic-tac-toe game cards and socket updates

Favor narrow edits there. If a change can be extracted into a helper without introducing churn, prefer that.

## Message Encoding Rules

Rich chat messages use a string prefix:

- `__SLRICH__:` followed by JSON for text/GIF/file payloads

Game messages use a string prefix:

- `__SLGAME__:` followed by JSON for tic-tac-toe payloads

Decoders intentionally fall back to plain text when parsing fails. Preserve that behavior unless a migration is explicitly requested.
