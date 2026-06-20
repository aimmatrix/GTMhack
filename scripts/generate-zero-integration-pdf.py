#!/usr/bin/env python3
"""Generate Zero integration guide PDF for GTMhack / Noodle project."""

from pathlib import Path

from fpdf import FPDF

OUTPUT = Path(__file__).resolve().parent.parent / "docs" / "zero-integration-guide.pdf"

HTML = """
<h1>Zero Integration Guide</h1>
<p><b>GTMhack / Noodle (Lightfern Reach)</b> - June 20, 2026</p>

<h2>Summary</h2>
<p>
There is <b>no Zero integration in the codebase today</b>, but the project can integrate
with <a href="https://zero.inc">Zero</a> via its REST API and MCP server. The app is
currently built for the Lightfern hackathon flow: Unify search -> research cards -> Gmail
draft -> Lightfern Chrome extension.
</p>

<h2>What the project does today</h2>
<p>
The handoff layer (<code>backend/src/handoff/index.ts</code>) creates a Gmail draft from
a research packet. It does <b>not</b> call Lightfern or Zero APIs. When Gmail OAuth is
configured, it creates a real draft; otherwise it returns a prefilled Gmail compose
deep-link. The user opens Gmail and runs the Lightfern extension to polish and send.
</p>
<p><b>Current API endpoints:</b></p>
<ul>
<li>POST /api/brief - turns conversation into a search brief</li>
<li>POST /api/run - search + research (SSE stream)</li>
<li>GET /api/run/:id - run state</li>
<li>POST /api/lightfern/handoff - Gmail draft handoff</li>
</ul>

<h2>How Zero fits</h2>
<p>
Zero is an AI-native CRM/GTM platform. Lightfern is an inbox drafting extension. They are
separate products but serve the same workflow from different angles.
</p>

<table border="1" width="100%">
<tr>
<th>Layer</th>
<th>Noodle (this project)</th>
<th>Zero</th>
<th>Lightfern</th>
</tr>
<tr>
<td>Discovery</td>
<td>Unify / mock search</td>
<td>Lead Search (200M+ people)</td>
<td>-</td>
</tr>
<tr>
<td>Research</td>
<td>AI notes, angles, sources</td>
<td>AI Properties, notes</td>
<td>Contact history in inbox</td>
</tr>
<tr>
<td>CRM</td>
<td>-</td>
<td>Contacts, companies, deals, lists</td>
<td>-</td>
</tr>
<tr>
<td>Drafting</td>
<td>Starter email in Gmail</td>
<td>Automations -> Gmail drafts</td>
<td>Polish in Gmail/Outlook</td>
</tr>
</table>

<p>
Research packets map cleanly onto Zero records: match name, email, company, why_match,
notes, suggested_angle, and sources.
</p>

<h2>Integration paths</h2>

<h3>1. Zero REST API (recommended)</h3>
<p>
Add a handoff endpoint that pushes research into Zero:
</p>
<ol>
<li>Create a contact - POST https://api.zero.inc/api/contacts</li>
<li>Attach a research note - POST https://api.zero.inc/api/notes</li>
<li>Add to a list via listIds (e.g. "Noodle prospects")</li>
<li>Optionally toggle a custom property (e.g. "Generate Outreach") to trigger a Zero automation that drafts email in Gmail</li>
</ol>
<p>
Auth: Bearer token from Workspace Settings -> API keys.
Docs: https://docs.zero.inc/features/api/introduction
</p>

<h3>2. Zero MCP</h3>
<p>
Zero exposes an MCP server at https://api.zero.inc/mcp with OAuth. Tools include
add_contact, add_note, and add_contacts_to_list. Useful for Cursor/agent workflows
without custom backend code.
Docs: https://docs.zero.inc/features/mcp
</p>

<h3>3. Replace Unify with Zero Lead Search</h3>
<p>
Zero already has lead discovery. Noodle could remain the natural-language -> research
brief -> enriched context layer on top, using Zero instead of Unify for search.
</p>

<h3>4. Zero Sequences</h3>
<p>
After creating contacts, add them to a sequence source list to enroll in multichannel
outbound (email, LinkedIn, phone).
Docs: https://docs.zero.inc/features/api/sequences
</p>

<h2>Recommended architecture</h2>
<pre>
User describes target
  -> Noodle builds search brief + research cards
  -> Handoff choice:
      A) Gmail draft + Lightfern (current)
      B) Zero contact + note + list + automation (new)
      C) Both - Zero for CRM, Lightfern for final polish in Gmail
</pre>
<p>
For a hackathon demo with Zero as your CRM, <b>Option B</b> is the strongest story:
"Noodle finds and researches; Zero stores, enriches, and drafts."
</p>

<h2>What to build</h2>
<p>Minimal scope (~1 endpoint + provider):</p>
<ul>
<li>ZERO_API_KEY and ZERO_WORKSPACE_ID in .env</li>
<li>ZeroHandoffProvider mapping MatchCard -> contact + note</li>
<li>UI button: "Save to Zero" alongside "Draft in Lightfern"</li>
</ul>
<p>
The existing HandoffService interface in backend/src/types.ts is the natural extension
point alongside the Gmail handoff.
</p>

<h2>Bottom line</h2>
<p>
No plug-and-play Zero integration exists today, but Zero's API and MCP are a natural
destination for research packets - especially if Zero is your team's CRM. Lightfern
remains complementary for final email polish inside Gmail.
</p>

<p><i>Generated from GTMhack project analysis. Zero docs: https://docs.zero.inc</i></p>
"""


class PDF(FPDF):
    def header(self):
        self.set_font("Helvetica", "I", 8)
        self.set_text_color(120, 120, 120)
        self.cell(0, 8, "Zero Integration Guide - GTMhack / Noodle", align="L")
        self.ln(4)

    def footer(self):
        self.set_y(-15)
        self.set_font("Helvetica", "I", 8)
        self.set_text_color(120, 120, 120)
        self.cell(0, 10, f"Page {self.page_no()}", align="C")


def main() -> None:
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)

    pdf = PDF()
    pdf.set_auto_page_break(auto=True, margin=20)
    pdf.add_page()
    pdf.set_font("Helvetica", size=11)
    pdf.write_html(HTML)
    pdf.output(str(OUTPUT))
    print(f"Wrote {OUTPUT}")


if __name__ == "__main__":
    main()
