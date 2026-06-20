# Noodle / Lightfern Reach

Hackathon demo for a Lightfern-first outreach workflow.

Noodle helps a user describe who they want to reach, find relevant people or businesses, prepare research packets, and hand that context to Lightfern so Lightfern can draft better outreach emails.

The app does not replace Lightfern or write the final email itself. Its job is lead discovery, research, and context preparation.

## Run locally

```bash
python3 -m http.server 4173
```

Then open:

```text
http://127.0.0.1:4173/
```

## User journey

1. `/` opens the Prism landing page and explains the Lightfern Reach promise.
2. The landing page asks, `Who do you want to reach?`
3. Submitting the target opens `/dashboard/?target=...` and seeds the assistant with that reach brief.
4. `/dashboard/` is the working app shell: match finding, research packets, Lightfern drafts, calendar, source library, and settings.

## Routes

```text
http://127.0.0.1:4173/
```

Landing page and product entry.

```text
http://127.0.0.1:4173/dashboard/
```

Main dashboard app.

## Project structure

```text
index.html                 landing page
dashboard/index.html       dashboard app shell
rituals/index.html         redirect to /dashboard/
assets/css/landing.css     landing-specific visual system
assets/css/dashboard.css   dashboard-specific visual system
assets/js/landing.js       Prism, countdown, target capture, and landing interactions
assets/js/dashboard.js     dashboard navigation, task state, and composer interactions
PRD-lightfern-reach.md     product requirements and app flow
```
