# Welcome to your Expo app 👋

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   npx expo start
   ```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Project-specific notes

- API proxy endpoints live in `app/api/**/+api.ts`.
- Swipe deck data is stored in `data/swipeDecks/` as both `.ts` and `.json` files.
- Runtime and theme settings are centralized under `constants/`.
- Future librarian-facing collection-gap analysis is specified in [`docs/COLLECTION_OPPORTUNITIES.md`](docs/COLLECTION_OPPORTUNITIES.md); patron-facing Library Mode remains local-collection-only.
- Google Books deterministic source certification is documented in [`docs/GOOGLE_BOOKS_SOURCE_CERTIFICATION.md`](docs/GOOGLE_BOOKS_SOURCE_CERTIFICATION.md).
- Offline source comparison architecture and workflow are documented in [`docs/SOURCE_COMPARISON_HARNESS.md`](docs/SOURCE_COMPARISON_HARNESS.md).
- Owner analytics requires server-only `OWNER_ANALYTICS_PASSWORD` and `OWNER_ANALYTICS_SESSION_SECRET` environment variables. Do not expose either through an `EXPO_PUBLIC_*` variable.
- Anonymous recommendation-session audits use the existing private Vercel Blob store through `BLOB_READ_WRITE_TOKEN`; they do not require Postgres.
- Hosted Librarian Settings sessions use server-only `ADMIN_SESSION_SECRET` (falling back to `BLOB_READ_WRITE_TOKEN`). Set a separate server-only `ADMIN_PIN_RECOVERY_SECRET` of at least 24 characters only when an existing PIN-protected library must enroll its private verifier after upgrading.

## Quick quality checks

Run these commands before committing:

```bash
npm run lint
npm run typecheck
```

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **app-example** directory and create a blank **app** directory where you can start developing.

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.
