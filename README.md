# Mehfil - Event Management Platform

A full-stack event management web application with RSVP tracking, payment processing, and location services.

## Tech Stack

### Frontend
- **React 19** with Vite
- **TailwindCSS v4** for styling
- **React Router v6** for client-side routing
- **Shadcn/ui** component library
- **Lucide React** icons

### Backend
- **Node.js** with Express (ES modules)
- **Drizzle ORM** for database queries
- **Supabase** (PostgreSQL) for database & auth
- **Helmet** for HTTP security headers
- **express-rate-limit** for rate limiting
- **CORS** middleware

## Project Structure

```
mehfil/
├── frontend/                # React + Vite frontend
│   ├── src/
│   │   ├── components/      # Reusable components
│   │   │   ├── ui/          # Shadcn/ui components
│   │   │   └── layout/      # Layout components
│   │   ├── pages/           # Route pages
│   │   ├── hooks/           # Custom React hooks
│   │   ├── utils/           # Utility functions
│   │   └── lib/             # Library configs (cn utility)
│   ├── components.json      # Shadcn/ui config
│   └── vite.config.js
├── backend/                 # Node.js + Express backend
│   ├── src/
│   │   ├── config/          # DB, env, Supabase config
│   │   ├── routes/          # Express route definitions
│   │   ├── controllers/     # Request handlers
│   │   ├── services/        # Business logic
│   │   ├── models/          # Drizzle schema definitions
│   │   └── middleware/      # Custom middleware
│   ├── drizzle/             # Generated migrations
│   └── drizzle.config.js
├── .env.example             # Environment variable template
└── package.json             # Root scripts
```

## Getting Started

### Prerequisites

- Node.js >= 18
- npm >= 9
- A [Supabase](https://supabase.com) project

### Setup

1. **Clone and install dependencies:**
   ```bash
   git clone <repo-url>
   cd mehfil
   npm run install:all
   ```

2. **Configure environment variables:**
   ```bash
   # Copy the template
   cp .env.example backend/.env

   # Edit backend/.env with your Supabase credentials
   ```

3. **Set up the database:**
   ```bash
   # Generate migrations from schema
   npm run db:generate

   # Push schema to Supabase
   npm run db:push
   ```

4. **Start development servers:**
   ```bash
   # Runs both frontend (port 5173) and backend (port 3000)
   npm run dev
   ```

   Or run them separately:
   ```bash
   npm run dev:frontend   # http://localhost:5173
   npm run dev:backend    # http://localhost:3000
   ```

### Available Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start both frontend and backend |
| `npm run dev:frontend` | Start Vite dev server |
| `npm run dev:backend` | Start Express with --watch |
| `npm run build` | Build frontend for production |
| `npm run start` | Start backend in production mode |
| `npm run db:generate` | Generate Drizzle migrations |
| `npm run db:migrate` | Run pending migrations |
| `npm run db:push` | Push schema directly to DB |
| `npm run db:studio` | Open Drizzle Studio |

### Adding Shadcn/ui Components

```bash
cd frontend
npx shadcn@latest add <component-name>
```

Pre-installed components: `button`, `card`, `input`

## API Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/api/health` | Health check |

## License

MIT
