# Atoi-Talk

![AtoiTalk Preview](https://github.com/user-attachments/assets/630de5f6-26c2-488f-9c5e-3783ddc11957)

Modern, real-time chat web application supporting private/group messaging, rich media uploads, robust administrative controls, and secure authentication. Built with React 19, TypeScript, Vite, Tailwind CSS, and Zustand.

See [Atoi-Talk-API](https://github.com/Hilmi-Raif/Atoi-Talk-API) for the backend service.

## Features

### Real-Time Chat System

- One-on-one private messaging
- Group chats with role-based access
- Real-time updates via WebSocket integration
- Advanced message features (replies, jump-to-source, editing, deletion)
- Read receipts and typing indicators

### Account & Security

- Custom JWT authentication + Google OAuth login
- Cloudflare Turnstile CAPTCHA for sensitive actions
- Comprehensive User Profile management

### Media & Attachments

- Image uploads with native React Cropper integration
- Avatar management for Users and Groups

### Performance & Optimization

- Virtualized message lists using `Virtua` for handling high-volume chat histories smoothly
- Infinity scroll for seamless older message loading
- Optimized client-side state updates and React Query caching

### Admin Capabilities

- Centralized Dashboard for platform statistics
- User management (view, ban, unban)
- Group moderation (view, dissolve, reset info)
- Reporting system handling (manage and resolve user reports)

## Tech Stack

| Layer                   | Technology                                        |
| ----------------------- | ------------------------------------------------- |
| Framework               | React 19 + Vite                                   |
| Language                | TypeScript                                        |
| Styling                 | Tailwind CSS v4, Radix UI Primitives              |
| Icons & Animations      | Lucide React, Motion                              |
| State Management        | Zustand (Client), TanStack React Query (Server)   |
| Routing                 | React Router v7                                   |
| Forms & Validation      | React Hook Form, Zod                              |
| Utilities & Performance | Virtua (List Virtualization), Next Themes, Sonner |

## Project Structure

```
src/
├── assets/         # Static assets
├── components/     # UI components (modals, charts, chat elements)
├── context/        # React context providers (e.g., WebSocket)
├── hooks/          # Custom React hooks
├── layouts/        # Page layout wrappers (Sidebar, Admin framework)
├── lib/            # Utility functions (date formatting, fetchers)
├── pages/          # Application views (Auth, ChatRoom, Admin)
├── services/       # API integration layers
├── store/          # Zustand state stores
└── types/          # TypeScript interface/type definitions
```

## Environment Variables

| Variable                  | Description                                                        |
| ------------------------- | ------------------------------------------------------------------ |
| `VITE_API_BASE_URL`       | Base URL for the core RESTful API (e.g., `http://localhost:3000`)  |
| `VITE_WS_URL`             | WebSocket Server Address (e.g., `ws://localhost:3000/ws`)          |
| `VITE_GOOGLE_CLIENT_ID`   | Your Google OAuth 2.0 Web Client ID                                |
| `VITE_TURNSTILE_SITE_KEY` | Cloudflare Turnstile public site key                               |
| `VITE_DEBUG_LOGS`         | Flag to enable detailed browser console debugging (`true`/`false`) |

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/)
- `pnpm`

### Setup

1. Clone the repo:

```bash
git clone https://github.com/Hilmi-Raif/Atoi-Talk.git
cd Atoi-Talk
```

2. Copy and fill the env file:

```bash
cp .env.example .env
```

3. Install dependencies:

```bash
pnpm install
```

4. Run the development server:

```bash
pnpm run dev
```

5. Build for production:

```bash
pnpm run build
```
