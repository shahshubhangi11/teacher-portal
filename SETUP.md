# TeachDesk — Setup Guide

## Step 1: Create a Firebase Project

1. Go to **https://console.firebase.google.com**
2. Click **"Add project"** → Name it `teachdesk` (or anything)
3. Disable Google Analytics (not needed) → Click **Create project**

---

## Step 2: Enable Authentication

1. In Firebase Console → **Build → Authentication → Get started**
2. Click **"Sign-in method"** tab
3. Enable **Google** (toggle ON, select your support email, save)
4. Enable **Email/Password** (toggle ON, save)

---

## Step 3: Create Firestore Database

1. In Firebase Console → **Build → Firestore Database → Create database**
2. Select **"Start in production mode"** → Next
3. Choose a location close to you (e.g., `asia-south1` for India) → Enable
4. Go to **Rules** tab and paste:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```
5. Click **Publish**

---

## Step 4: Get Your Firebase Config

1. In Firebase Console → ⚙️ Project Settings → **Your apps**
2. Click **"</ >"** (Web) icon → Register app (name: `TeachDesk Web`) → Continue
3. Copy the `firebaseConfig` object values

---

## Step 5: Create Your .env File

In the `teacher-portal` folder, create a file named **`.env`** (copy from `.env.example`):

```
VITE_FIREBASE_API_KEY=AIzaSy...
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=1234567890
VITE_FIREBASE_APP_ID=1:1234567890:web:abcdef
```

---

## Step 6: Run Locally

```bash
cd teacher-portal
npm install         # already done if you followed this guide
npm run dev         # opens at http://localhost:5173
```

---

## Step 7: Deploy to Firebase Hosting (Free)

```bash
# Install Firebase CLI (one-time)
npm install -g firebase-tools

# Login
firebase login

# Initialize (in teacher-portal folder)
firebase init hosting
# → Use existing project → select your project
# → Public directory: dist
# → Single-page app: Yes
# → Overwrite dist/index.html: No

# Build and deploy
npm run build
firebase deploy --only hosting
```

Your site will be live at `https://your-project.web.app` 🎉

---

## Features Summary

| Page | What you can do |
|------|----------------|
| **Dashboard** | See today's classes, recent notes, quick stats |
| **Students** | Add CBSE/ICSE/State students, set hourly or monthly billing |
| **Schedule** | Calendar view, add sessions, mark complete/cancelled |
| **Billing** | Auto-generate invoices from sessions, export PDF, mark paid |
| **Notes** | Daily notes per student, tags, grouped by date |
| **Content** | Worksheets (Grammar/Maths), Study Material, Quizzes (MCQ/Short/Long/Fill), Tests, Writing Skills, LD Materials — all exportable to PDF |
| **Reports** | Student progress reports with subject grades, attendance, remarks — export PDF |
