# Firebase setup

The app uses Firebase Authentication and Cloud Firestore directly from the browser. No service-account key or Firebase Admin credential belongs in this project. The Firebase web configuration is intended to be public; Firestore Security Rules are what protect shop data.

## 1. Create a Firebase project

1. In the Firebase console, create a project and register a **Web app**.
2. Enable **Authentication → Sign-in method → Email/Password**.
3. Create a **Cloud Firestore** database. Start in production mode.
4. Copy `.env.example` to `.env.local` and fill in the web app configuration.
5. Set `VITE_FIREBASE_SHOP_ID` to a short, permanent shop identifier (for example `freshmart-main`). Do not change it after adding shop data.
6. Restart Vite after editing `.env.local`.

The application stays on its setup screen until all required Firebase values and the shop ID are present. `.env.local` is ignored by git.

## 2. Create the first administrator

There is deliberately no public sign-up or client-side administrator creation.

1. Create the owner's email/password account from **Firebase Console → Authentication → Users → Add user**.
2. Copy the account's UID.
3. In Firestore, create `shops/{VITE_FIREBASE_SHOP_ID}/users/{UID}` with these fields:

   ```json
   {
     "role": "admin",
     "active": true
   }
   ```

4. Deploy `firestore.rules` before using the app. The client can read its own membership document but cannot create or change administrator memberships.

Only a Firebase project owner with console access (or a separately secured trusted Admin SDK process) should provision administrators.

## 3. Deploy Firestore rules and indexes

Install the Firebase CLI if needed, sign in, and select your project:

```powershell
npm install -g firebase-tools
firebase login
firebase use --add
firebase deploy --only firestore:rules,firestore:indexes
```

The rules deny access by default and allow access only to active `admin` members of the matching shop. The app scopes documents to `shops/{shopId}/...`.

The local Firebase CLI project alias is set to the project ID from `.env.local`. Deploying from this environment was blocked because its Firebase CLI identity lacks the `serviceusage.services.use` permission for that project. A project owner must grant the deployment identity Service Usage Consumer plus the permissions needed to manage Firestore rules/indexes, or deploy from a CLI session authenticated as a project owner.

## 4. Start and deploy

```powershell
npm install
npm run dev
```

For Firebase Hosting, build and deploy after selecting the project:

```powershell
npm run build
firebase deploy --only hosting
```

Add the deployed site domain under **Authentication → Settings → Authorized domains**.

## Implemented Firebase paths

- Admin email/password sign-in, persistent session, password reset, and membership gate.
- Live, bounded product list; add/edit/archive product operations and stock audit records.
- Bill completion reads current product prices and stock in a Firestore transaction, checks stock, increments an invoice counter, writes the sale, decrements stock, and records each stock movement atomically. Optional customer association, discounts, configurable product GST, payment method, and cash change are supported. A failed operation does not clear the cart.
- Firestore-backed dashboard, inventory adjustments/history, weighted-average purchase cost and stock updates, suppliers, customers, expenses, bill history/PDF/print, reports, and shop settings.

Sales and purchase transactions are atomic but run in the authenticated browser. The current rules trust an authorized shop admin; they are not a server-side pricing engine against a malicious authorized admin. For stronger privileged-operation isolation, move sale and purchase mutations to callable Cloud Functions and enforce App Check before production use.

Some advanced requirements remain outside this initial connected implementation, including server-side Cloud Functions, App Check, CSV product import/export, report pagination, supplier balance settlement, and automated emulator/security test coverage.
