# SPDL League Hub

The league site for the SPDL superflex dynasty league on Sleeper (league `1312155248814473216`).

- **Live data:** standings, scores, rosters, trades and picks come straight from the Sleeper API in each visitor's browser.
- **Daily refresh:** player info and KeepTradeCut superflex values are refreshed every morning by the GitHub Action in `.github/workflows/update.yml`, which writes `data/players.json` and `data/ktc.json`.
- **Sign-in:** Google sign-in through Firebase. Members claim their team once, then can make pick'em picks, vote in polls and post on the trade block. Only commissioners can post polls and Commish Corner posts.

## One-time setup

1. **Firebase**
   - Create a project at console.firebase.google.com.
   - Turn on Authentication, then the Google provider.
   - Create a Firestore database in production mode.
   - Register a web app and paste its `firebaseConfig` into `config.js` as `window.FIREBASE_CONFIG = {...}`.
2. **Rules:** in Firestore, open Rules, paste in `firestore.rules`, and publish.
3. **GitHub Pages:** open Settings, then Pages, and choose "Deploy from a branch" with `main` and `/ (root)`.
4. **Authorized domain:** in Firebase, open Authentication, then Settings, then Authorized domains, and add `<username>.github.io`.
5. **Make yourself commissioner:**
   - Sign in on the site and open the Commish tab, which shows your account ID.
   - In Firestore, create the collection `admins` with a document whose ID is that account ID. Give it any field, for example `role: "commish"`.
   - Reload the site. Commissioner tools appear, and pick'em lock times sync on their own.
6. **First data refresh:** open Actions, select "Refresh player and KTC data", and click "Run workflow".

## Each season

`data/static.json` holds history, the What Ifs, the mock draft and pick'em lock times. Update it after each season so that:

- last season moves into History;
- the next season gets new lock times.

The Firebase config in `config.js` is meant to be public. The Firestore rules are what keep the data safe.
