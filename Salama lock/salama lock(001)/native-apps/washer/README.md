# Carwash Washer app

Standalone Expo app for washer staff. It includes secure sign-in, assigned wash jobs, start/complete actions, earnings, history and a slide-out navigation menu.

## Run

```sh
npm install
npm start
```

The app starts in demo mode. Use any non-empty email and password. To connect a backend, set `EXPO_PUBLIC_API_URL` and `EXPO_PUBLIC_DEMO_MODE=false`; the expected API routes are `/api/washer/auth/login`, `/api/washer/jobs`, `/api/washer/earnings`, `/api/washer/jobs/:id/start` and `/api/washer/jobs/:id/complete`.
