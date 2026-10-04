# SBP Information — Android shell

Native Android launcher for the existing SBP Information web application.

## Architecture

The shell uses a Trusted Web Activity (TWA), not a duplicated WebView copy. The live web app remains the single source of truth for UI, Firebase data, RU/KZ localization, service worker, and Web Push.

Live URL:

https://sinevbogdan100-jpg.github.io/college2026grouponecurs.com/

Android application id:

com.sbpinformation.toe2691

## Launch screen

Android requires a system launch frame before web content can execute. The shell intentionally uses:

- no visible splash logo;
- no splash text;
- a transparent Android 12+ splash icon;
- the same purple/blue background family as the in-app launch animation.

This makes the required OS frame visually merge into the animated launch screen in index.html.

## Trusted verification

For the TWA to stay fully fullscreen, the website must contain a valid
/.well-known/assetlinks.json entry for the final Android signing certificate.

Do not commit a production signing keystore to this public repository.
After the release key is created, add its SHA-256 certificate fingerprint to
the website assetlinks file and sign all future Android releases with the same key.

Until that final signing link is configured, debug builds are for shell testing only.
