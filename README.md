# One-on-one (שיחות אישיות) – managing a teacher's one-on-one meetings with students

A Hebrew web app that helps a homeroom teacher manage personal meetings with the students in their class: building a personal connection, being someone students can turn to, following up on academic and disciplinary matters, and gathering information that helps the teacher support the class and each student.

All data is stored in the **user's own Google Drive**, in a dedicated folder.

## Features

- **Loading the student list** – from a contacts file (`.vcf`, including the parents' phone numbers, address and email), from a CSV file with "שם פרטי" (first name) and "שם משפחה" (last name) columns, or by pasting a list of names. Re-importing updates contact details without touching existing data.
- **Goals** of several kinds:
  - **Personal, per student** – the teacher's own goal with the student, or the student's goal.
  - **For every student** – a goal checked off separately for each student (e.g. "hear how the holiday went").
  - **Class-wide** – a goal for the class as a whole.
  - Any goal can be **one-time** (with an optional target date) or **recurring** at a fixed frequency (weekly / every two weeks / monthly / … / custom). A recurring goal "opens" again when it comes due.
- **Student page**:
  - Dated meeting summaries (including the Hebrew date), with a meeting type (personal / follow-up / disciplinary / academic).
  - Topics for the next conversation – add, reorder (drag or arrows), mark as done, edit.
  - Checkboxes for personal goals and for goals for every student.
  - Scheduling the next meeting (date, time, note), changing the meeting frequency for the student, and adding follow-up meetings.
  - General notes and contact details (tap-to-call phone numbers).
  - When recording a meeting you can mark which topics were discussed and which goals were achieved, and schedule the next meeting.
- **Dashboard**:
  - Upcoming meetings – scheduled meetings, follow-ups, and suggested slots for the other students based on frequency and urgency, spread over working days with a maximum number of meetings per day.
  - Students not met lately.
  - Goal statistics – by type, by goal and by student.

## Running

The app is a static website (HTML/JS, no build step). It can be hosted on GitHub Pages or any static server.

### Running locally

```bash
npm start          # http://localhost:8080
npm test           # unit tests
```

### Publishing on GitHub Pages

Site address: **https://gilovi.github.io/1-on-1/**

On GitHub: **Settings → Pages → Build and deployment**: Source: *Deploy from a branch*, branch `main`, folder `/ (root)`. Every push to `main` updates the site within a minute or two.

### Installing as an app

The site is a PWA – it can be installed as an app with its own icon, without an app store:

- **Android (Chrome)**: ⋮ menu → "Install app" / "Add to Home screen".
- **iPhone (Safari)**: Share button → "Add to Home Screen".
- **Desktop (Chrome / Edge)**: the install icon in the address bar.

The screens load without a connection; saving to Drive needs internet access.

### Setting up Google sign-in (once, by whoever publishes the app)

After setup, users just click "התחברות עם Google" (Sign in with Google). On later visits a "המשך בתור…" (Continue as…) button signs in with one click and no consent screen. While working, the access token (valid for about an hour) renews automatically on the user's next click.

1. Create a new project in the [Google Cloud Console](https://console.cloud.google.com/).
2. **APIs & Services → Library** – enable the **Google Drive API**.
3. **Google Auth Platform → Branding** (or *OAuth consent screen*):
   - App name: `שיחות אישיות`, support email, logo (you can use `icons/icon-512.png`, resized to 120×120).
   - App home page: `https://gilovi.github.io/1-on-1/`
   - Privacy policy: `https://gilovi.github.io/1-on-1/privacy.html`
   - Authorized domains: `gilovi.github.io`
4. **Audience**: user type *External*.
5. **Data Access**: add only the `https://www.googleapis.com/auth/drive.file` scope.
6. **Clients → Create client** – type *Web application*. Under *Authorized JavaScript origins* add `https://gilovi.github.io` (and for development: `http://localhost:8080`). No redirect URIs are needed.
7. Copy the Client ID into `js/config.js`:
   ```js
   export const GOOGLE_CLIENT_ID = 'xxxxxxxx.apps.googleusercontent.com';
   ```
   (The ID is not a secret – it's normal for it to appear in the code.) Push to `main`.
8. **Opening it to all users**: in *Audience* click **Publish app** (switching from *Testing* to *In production*). While the app is in *Testing*, only users you added manually under *Test users* can sign in.
9. **Brand verification**: `drive.file` is a non-sensitive scope, so no security assessment is required – only verification of the app name, logo and domain. Until verified, users see an "unverified app" warning (they can continue via *Advanced*) and there is a 100-user cap. To verify:
   - Verify ownership of `https://gilovi.github.io/` in [Google Search Console](https://search.google.com/search-console) (a *URL prefix* property, HTML file method – add the file Google gives you to the root of the `gilovi.github.io` repository, or use your own domain instead).
   - In *Branding*, click *Submit for verification*. It usually takes a few days.

### Where the data is stored

- A folder named **"שיחות אישיות - ניהול כיתה"** (can be changed on the welcome screen) is created in "My Drive". You can move it anywhere in Drive – the app will keep finding it.
- All data is in a single file: `one-on-one-data.json`.
- Once a day a copy is saved in the **"גיבויים"** (backups) subfolder.
- The `drive.file` scope gives the app access **only to files it created**, not to the rest of the Drive.
- Changes save automatically. If the connection drops, changes are kept in the browser temporarily and sent to Drive on the next sign-in. If the data was changed on another device, you can choose to reload or keep the local version.

### Trial mode

You can use the app without a Google account – the data is then stored only in the browser. From **Settings** you can switch to Drive at any time and the data is moved over. Settings also offers backup download and restore (JSON).

## Privacy

The data file contains personal information about minors. It is stored only in your Drive account and sent only to Google. Do not commit student contact files to the repository (`*.vcf` files are excluded in `.gitignore`).

## Code layout

| File | Role |
| --- | --- |
| `index.html`, `css/styles.css` | Shell and styling (RTL, dark mode, mobile-friendly) |
| `manifest.webmanifest`, `sw.js`, `icons/` | Installing as an app (PWA) and offline loading |
| `privacy.html` | Privacy policy (required to publish Google sign-in) |
| `js/app.js` | Routing, event handling, Drive sign-in |
| `js/store.js` | App state and autosave |
| `js/storage.js` | Saving to Google Drive / the browser |
| `js/model.js`, `js/logic.js` | Data model, goals, meeting suggestions and statistics (tested in `tests/`) |
| `js/vcf.js` | Reading vCard files and name lists |
| `js/views/*.js` | The screens |
