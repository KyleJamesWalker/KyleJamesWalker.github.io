---
title: Lead Scanner
tagline: Mobile lead collection for conference exhibitors. Installs as an app.
screenshot: ../../assets/apps/lead-scanner.png
screenshotAlt: >-
  The Lead Scanner app's Leads tab listing three captured conference contacts with company, job title, email and badge metadata, above an Export CSV button.
source: https://github.com/KyleJamesWalker/KyleJamesWalker.github.io/tree/main/apps/lead-scanner
order: 5
tags: [PWA, QR codes, conferences]
---

Scan attendee badge QR codes at a booth and collect them into a list you can
export. Built for the case where the official lead scanner costs more than the
table did.

Scans are stored in your browser. Nothing is sent anywhere, and there is no
account.

## Using it

1. Open it on your phone and allow camera access.
2. Scan a badge. The parsed contact appears immediately.
3. Export the collected scans when you are done.

## Notes

- Camera access needs HTTPS, which this site serves, or localhost.
- Install it to your home screen before the event and it works without a
  connection on the floor.
- Badge formats vary by conference. Fields that do not parse are kept as raw
  scan text rather than dropped.
