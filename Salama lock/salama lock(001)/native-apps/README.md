# Salama Lock Native Apps

These are independent React Native applications built with Expo SDK 54. They are
not web views, PWAs, or wrappers around the finance portal.

## Applications

- `customer/` — customer payments, account balance, device status, payment
  history, notifications, and profile.
- `agent/` — agent dashboard, inventory, camera-assisted customer registration,
  customer follow-up, tasks, commissions, and alerts.

The Android application IDs are:

- Customer: `com.salamalock.customer`
- Agent: `com.salamalock.agent`

## API configuration

Both apps use the production API by default:

```text
https://www.salamalockpay.com
```

To use another deployment, create `.env.local` inside each app:

```text
EXPO_PUBLIC_API_URL=https://your-api-domain.example
```

The apps currently start in offline demo mode so the interfaces can be reviewed
without Supabase:

```text
Customer: customer@salama.demo / Demo123!
Agent: agent@salama.demo / Demo123!
```

Set `EXPO_PUBLIC_DEMO_MODE=false` in each app's `.env.local` when the production
backend should be enabled again.

The API must be reachable from the phone. `localhost` points to the phone itself,
not the development computer.

## Run on a phone

Install Expo Go on the Android phone, connect the phone and computer to the same
network, then run:

```powershell
cd native-apps/customer
npm start
```

For the agent app:

```powershell
cd native-apps/agent
npm start
```

Scan the displayed QR code with Expo Go.

## Build installable APKs

Log into an Expo account once:

```powershell
npx eas-cli@latest login
```

Build an APK that can be installed directly:

```powershell
cd native-apps/customer
npm run build:apk

cd ../agent
npm run build:apk
```

EAS prints a download link for each APK.

## Build for Google Play

Google Play requires Android App Bundles (`.aab`) for new applications:

```powershell
cd native-apps/customer
npm run build:play

cd ../agent
npm run build:play
```

Create two applications in Google Play Console using the application IDs above,
then upload each generated `.aab` to its matching application. Complete Play
Console's privacy policy, data safety, content rating, screenshots, and testing
requirements before production rollout.

## Validation

Compile the JavaScript and Hermes Android bundles locally:

```powershell
cd native-apps/customer
npm run check

cd ../agent
npm run check
```
