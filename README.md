# Supervisor Reboot

Internal supervisor management platform for Reboot01.

## Tech Stack

- **Backend**: Go (API on port 4500)
- **Frontend**: React + TypeScript (Vite)
- **Database**: SQLite

## Project Structure

```
backend/       # Go API server
frontend/      # React frontend (Vite + TypeScript)
deploy.sh      # Deployment script
```

## Getting Started

### Backend

```bash
cd backend
go run cmd/api/main.go
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

## Deployment

Deployments are automated via GitHub Actions on push to `main`. The workflow SSHs into the server and runs `deploy.sh`.

The app is available at: https://taskflow.reboot01.com
