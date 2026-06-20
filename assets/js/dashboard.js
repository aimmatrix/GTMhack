const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

const viewResponses = {
  matches: "tell me who you want to reach, and i will shape the search brief.",
  packets: "research packets hold context, talking points, hooks, signals, and suggested angles.",
  drafts: "lightfern drafts the email after noodle prepares the packet.",
  calendar: "reach calendar is ready. i saved your next outreach window for tomorrow morning.",
  sources: "source library keeps the links i can cite before anything goes to lightfern.",
  settings: "settings is where sender context, integrations, and handoff rules live."
};

const scenarios = {
  person: {
    signal: "role relevance, company context, recent public signals",
    matches: [
      {
        name: "Peter at Stripe",
        score: "94% match",
        context: "Specific person target with strong fintech, developer tooling, and payments context.",
        angle: "Open with a precise Stripe-relevant observation, then frame the ask around better outreach prep.",
        sources: "company role context, recent Stripe product notes, public talks or posts"
      },
      {
        name: "Stripe GTM team",
        score: "82% match",
        context: "Adjacent team target if Peter is not the right owner.",
        angle: "Use the same research packet to find the right operator before Lightfern drafts.",
        sources: "team pages, product launches, hiring signals"
      }
    ]
  },
  growth: {
    signal: "growth role, fintech category, active acquisition motion",
    matches: [
      {
        name: "Maya Chen, Head of Growth at Payflow",
        score: "91% match",
        context: "Fintech growth lead working on activation and lifecycle conversion.",
        angle: "Connect Noodle to cleaner research before outbound to operators and partners.",
        sources: "LinkedIn role, product updates, hiring for lifecycle growth"
      },
      {
        name: "RallyPay Growth Team",
        score: "86% match",
        context: "Early fintech team with visible GTM experimentation and partner-led growth.",
        angle: "Frame the packet as a way to make Lightfern drafts more relevant from the first line.",
        sources: "company blog, funding note, GTM job posts"
      }
    ]
  },
  dtc: {
    signal: "DTC brand, marketing owner, retention or launch motion",
    matches: [
      {
        name: "CMO at Kin & Cloth",
        score: "89% match",
        context: "DTC apparel brand with recent campaign activity and retention pressure.",
        angle: "Lead with campaign context, then suggest a sharper way to prep partner or lifecycle outreach.",
        sources: "brand campaigns, email signup flow, press mentions"
      },
      {
        name: "VP Marketing at Glowjar",
        score: "84% match",
        context: "Beauty DTC brand testing creator-led launches and repeat purchase loops.",
        angle: "Use Noodle to collect the proof points Lightfern needs for a relevant opener.",
        sources: "launch pages, creator posts, review patterns"
      }
    ]
  },
  local: {
    signal: "local business, visible website gap, clear service need",
    matches: [
      {
        name: "Paper Cup Coffee, Shoreditch",
        score: "90% match",
        context: "Independent coffee shop with light web presence and strong local footfall.",
        angle: "Lead with a specific observation about the website, then offer a low-friction refresh.",
        sources: "website audit, Google profile, Instagram activity"
      },
      {
        name: "Redchurch Espresso",
        score: "85% match",
        context: "Local cafe with active social presence but thin conversion path online.",
        angle: "Frame the refresh around making bookings, menus, and events easier to discover.",
        sources: "maps listing, social posts, current website"
      }
    ]
  },
  investor: {
    signal: "investment thesis, portfolio fit, recent AI or GTM interest",
    matches: [
      {
        name: "Northstar Ventures",
        score: "92% match",
        context: "Pre-seed investor with workflow software and AI-enabled sales interest.",
        angle: "Show how research packets improve Lightfern draft quality before founder outreach.",
        sources: "portfolio notes, partner posts, recent AI investment thesis"
      },
      {
        name: "Seedcamp",
        score: "87% match",
        context: "European seed fund with strong founder tooling and GTM infrastructure fit.",
        angle: "Position Noodle as the context layer before outbound drafting.",
        sources: "fund focus, founder resources, recent SaaS portfolio work"
      }
    ]
  },
  generic: {
    signal: "role fit, reachable context, visible timing signal",
    matches: [
      {
        name: "Priority target 1",
        score: "88% match",
        context: "Strong fit based on role, category, and available public context.",
        angle: "Use the most specific signal as the opening context before Lightfern drafts.",
        sources: "company site, public profile, recent activity"
      },
      {
        name: "Priority target 2",
        score: "82% match",
        context: "Useful adjacent target with enough evidence for a clean research packet.",
        angle: "Clarify the business reason to talk now, then hand the context to Lightfern.",
        sources: "website, social proof, market timing"
      }
    ]
  }
};

function refreshIcons() {
  if (window.lucide) {
    window.lucide.createIcons({
      attrs: {
        "aria-hidden": "true"
      }
    });
  }
}

function setActiveNav(view) {
  $$(".primary-nav [data-view]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.view === view);
  });

  const greeting = $("[data-assistant-greeting]");
  if (greeting && viewResponses[view]) {
    greeting.textContent = viewResponses[view];
  }
}

function setActivePanel(view) {
  if (view === "settings") return;

  $$("[data-view-panel]").forEach((panel) => {
    const active = panel.dataset.viewPanel === view;
    panel.hidden = !active;
    panel.classList.toggle("is-active", active);
  });

  $(".task-panel")?.scrollTo({ top: 0, behavior: "smooth" });
}

function setAssistantCollapsed(collapsed) {
  document.body.classList.toggle("chat-collapsed", collapsed);

  const toggle = $("[data-toggle-assistant]");
  if (!toggle) return;

  toggle.setAttribute("aria-expanded", String(!collapsed));
  toggle.setAttribute("aria-label", collapsed ? "Expand assistant" : "Collapse assistant");
  toggle.innerHTML = `<i data-lucide="${collapsed ? "chevrons-left" : "chevrons-right"}" aria-hidden="true"></i>`;

  refreshIcons();
}

function cleanValue(value, fallback) {
  const clean = value.trim();
  return clean || fallback;
}

function selectedScenario(target) {
  const value = target.toLowerCase();
  if (value.includes("stripe") || value.includes("peter")) return scenarios.person;
  if (value.includes("growth") || value.includes("fintech")) return scenarios.growth;
  if (value.includes("cmo") || value.includes("dtc") || value.includes("brand")) return scenarios.dtc;
  if (value.includes("coffee") || value.includes("shoreditch") || value.includes("local")) return scenarios.local;
  if (value.includes("investor") || value.includes("fund") || value.includes("pre-seed")) return scenarios.investor;
  return scenarios.generic;
}

function formValues() {
  const form = $("[data-reach-builder]");
  return {
    target: cleanValue(form?.elements.target.value || "", "pre-seed investors in London"),
    goal: cleanValue(form?.elements.goal.value || "", "introduce our Lightfern hackathon workflow"),
    offer: cleanValue(form?.elements.offer.value || "", "a prep layer that gives Lightfern better context"),
    whyNow: cleanValue(form?.elements.whyNow.value || "", "outbound quality depends on better research signals"),
    outcome: cleanValue(form?.elements.outcome.value || "", "start a useful conversation"),
    tone: cleanValue(form?.elements.tone.value || "", "warm and specific")
  };
}

function syncBrief(status = "Ready to run") {
  const values = formValues();
  const scenario = selectedScenario(values.target);

  const fields = {
    "[data-brief-target]": values.target,
    "[data-brief-goal]": values.goal,
    "[data-brief-offer]": values.offer,
    "[data-brief-why]": values.whyNow,
    "[data-brief-outcome]": values.outcome,
    "[data-brief-tone]": values.tone,
    "[data-brief-signal]": scenario.signal
  };

  Object.entries(fields).forEach(([selector, value]) => {
    const node = $(selector);
    if (node) node.textContent = value.toLowerCase();
  });

  const statusNode = $("[data-brief-status]");
  if (statusNode) statusNode.textContent = status;
}

function renderPackets(status = "2 packet previews") {
  const values = formValues();
  const scenario = selectedScenario(values.target);
  const list = $("[data-packet-list]");
  if (!list) return;

  list.innerHTML = scenario.matches
    .map(
      (match) => `
        <article class="packet-card">
          <div class="packet-topline">
            <h3>${match.name}</h3>
            <span>${match.score}</span>
          </div>
          <p>${match.context}</p>
          <ul>
            <li>Hook: ${match.angle}</li>
            <li>Sources: ${match.sources}.</li>
            <li>Tone: ${values.tone}; Outcome: ${values.outcome}.</li>
          </ul>
          <button type="button" data-send-packet="${match.name}">Send packet to Lightfern</button>
        </article>
      `
    )
    .join("");

  const count = $("[data-match-count]");
  if (count) count.textContent = status;

  $$("[data-send-packet]").forEach((button) => {
    button.addEventListener("click", () => {
      const match = button.dataset.sendPacket;
      setActiveNav("drafts");
      setAssistantCollapsed(false);

      const greeting = $("[data-assistant-greeting]");
      if (greeting) {
        greeting.textContent = `${match} has a Noodle packet ready. Lightfern can now draft the email from that context.`;
      }

      const handoff = $("[data-handoff-status]");
      if (handoff) handoff.textContent = `${match} packet sent to Lightfern for drafting.`;
    });
  });
}

function getSeedTarget() {
  const params = new URLSearchParams(window.location.search);
  const queryTarget = params.get("target")?.trim();
  if (queryTarget) return queryTarget;

  try {
    return localStorage.getItem("noodle-last-target")?.trim() || "";
  } catch {
    return "";
  }
}

function hydrateSeedTarget() {
  const target = getSeedTarget();
  if (!target) return;

  const form = $("[data-reach-builder]");
  if (form) form.elements.target.value = target;

  const greeting = $("[data-assistant-greeting]");
  if (greeting) {
    greeting.textContent = `got it. i will turn "${target}" into a lightfern-ready research packet.`;
  }
}

function openSettings() {
  const dialog = $("[data-settings-dialog]");
  if (!dialog?.showModal || dialog.open) return;
  dialog.showModal();
}

function closeSettings() {
  const dialog = $("[data-settings-dialog]");
  if (dialog?.open) dialog.close();
}

$$("[data-view]").forEach((button) => {
  button.addEventListener("click", () => {
    const view = button.dataset.view;
    setActiveNav(view);
    setActivePanel(view);
    document.body.classList.remove("sidebar-open");

    if (view === "settings") {
      openSettings();
    }
  });
});

$$("[data-toggle-sidebar]").forEach((button) => {
  button.addEventListener("click", () => {
    document.body.classList.toggle("sidebar-open");
  });
});

$$("[data-dismiss-card]").forEach((button) => {
  button.addEventListener("click", () => {
    button.closest("[data-dismissible-card]")?.setAttribute("hidden", "");
  });
});

$("[data-close-settings]")?.addEventListener("click", closeSettings);

$("[data-settings-dialog]")?.addEventListener("click", (event) => {
  if (event.target === event.currentTarget) {
    closeSettings();
  }
});

$$("[data-source-chip]").forEach((button) => {
  button.addEventListener("click", () => {
    const selected = !button.classList.contains("is-selected");
    button.classList.toggle("is-selected", selected);
    button.setAttribute("aria-pressed", String(selected));
  });
});

$("[data-toggle-assistant]")?.addEventListener("click", () => {
  setAssistantCollapsed(!document.body.classList.contains("chat-collapsed"));
});

$("[data-reach-builder]")?.addEventListener("input", () => {
  syncBrief();
  renderPackets("2 packet previews");
});

$("[data-reach-builder]")?.addEventListener("submit", (event) => {
  event.preventDefault();
  const { target } = formValues();

  syncBrief("2 packets ready");
  renderPackets("2 researched matches");
  setActiveNav("matches");

  const greeting = $("[data-assistant-greeting]");
  if (greeting) {
    greeting.textContent = `i found researched context for "${target}". choose a packet and Lightfern can draft from it.`;
  }

  const sidebarStatus = $("[data-sidebar-status]");
  if (sidebarStatus) sidebarStatus.textContent = "2 packets ready for Lightfern handoff.";
});

$("[data-composer]")?.addEventListener("submit", (event) => {
  event.preventDefault();
  const input = event.currentTarget.elements.message;
  const value = input.value.trim();
  const greeting = $("[data-assistant-greeting]");

  if (greeting && value) {
    greeting.textContent = `got it. i will use "${value}" as context for the research packet before Lightfern drafts.`;
  }

  input.value = "";
});

window.addEventListener("load", refreshIcons);
hydrateSeedTarget();
syncBrief();
renderPackets();
refreshIcons();
setAssistantCollapsed(true);
