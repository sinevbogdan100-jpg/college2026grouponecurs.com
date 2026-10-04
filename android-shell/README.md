# SBP Information — Android shell

Version 0.2 uses a native Android WebView instead of a Custom Tab / TWA. This removes the browser/site toolbar completely while the live website remains the single source of truth for UI, Firebase data and RU/KZ localization.

The activity opens the site with launch=1 only on the first native opening. The website removes that flag immediately, so ordinary refreshes do not replay the launch animation.

The website exposes app-version.json. The Android bridge exposes the installed version. When the website reports a higher versionCode, the app shows an RU/KZ update banner.

The GitHub Actions workflow publishes SBP-Information-latest.apk to the latest GitHub Release.
