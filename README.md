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

There is also a separate experimental route at:

```text
http://127.0.0.1:4173/rituals/
```

## Files

- `index.html` - landing page structure and Lightfern Reach demo copy
- `styles.css` - visual design, responsive layout, and landing page polish
- `script.js` - prism animation, modal behavior, countdown, and research packet switching
- `PRD-lightfern-reach.md` - product requirements and app flow
