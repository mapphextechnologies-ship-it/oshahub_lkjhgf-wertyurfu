# Salama Lock Organization Admin

Organization admin portal for managing one company workspace in Salama Lock Enterprise.

## Run locally

```powershell
npm install
npm.cmd run dev
```

Open `http://localhost:3000/login`.

## Structure

```txt
app/                 routes and page styles
components/layout/   sidebar and dashboard shell
components/ui/       shared base UI components
lib/                 workspace data, types, helpers
public/              static assets
```

This portal is separate from `salama-lock-super-admin` so the super admin and organization admin can grow independently.