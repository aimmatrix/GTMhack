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
2. The primary CTA, `Enter the dashboard`, moves the user into `/dashboard/`.
3. `/dashboard/` is the working app shell: match finding, research packets, Lightfern drafts, calendar, source library, rituals, and settings.
4. `/rituals/` is a direct entry into the same dashboard shell with the Rituals view selected.

## Routes

```text
http://127.0.0.1:4173/
```

Landing page and product entry.

```text
http://127.0.0.1:4173/dashboard/
```

Main dashboard app.

```text
http://127.0.0.1:4173/rituals/
```

Rituals-focused dashboard entry.

## Project structure

```text
index.html                 landing page
dashboard/index.html       dashboard app shell
rituals/index.html         rituals deep-link wrapper
assets/css/landing.css     landing-specific visual system
assets/css/dashboard.css   dashboard-specific visual system
assets/js/landing.js       Prism, countdown, and landing interactions
assets/js/dashboard.js     dashboard navigation, task state, and composer interactions
PRD-lightfern-reach.md     product requirements and app flow
```
