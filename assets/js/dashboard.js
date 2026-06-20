import { streamRun } from "./api.js";
import {
  clearPackets,
  setMatchCount,
  showSearching,
  showEmpty,
  renderPacket,
} from "./cards.js";
import { seedSampleSender } from "./handoff.js";

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

const viewResponses = {
  matches: "tell me who you want to reach, and i will shape the search brief.",
  packets: "research packets hold context, talking points, hooks, signals, and suggested angles.",
  drafts: "noodle drafts start after the outreach context is ready.",
  calendar: "reach calendar is ready. i saved your next outreach window for tomorrow morning.",
  sources: "source library keeps the links i can cite before anything goes to noodle.",
  settings: "settings is where sender context, integrations, and handoff rules live.",
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
        sources: "company role context, recent Stripe product notes, public talks or posts",
      },
      {
        name: "Stripe GTM team",
        score: "82% match",
        context: "Adjacent team target if Peter is not the right owner.",
        angle: "Use the same research packet to find the right operator before Lightfern drafts.",
        sources: "team pages, product launches, hiring signals",
      },
    ],
  },
  namedPerson: {
    signal: "public profile, company context, role fit, recent activity",
    matches: [
      {
        name: "Primary person profile",
        score: "88% match",
        context: "Noodle treats this as a named-person lookup and starts by finding role, company, and recent public context.",
        angle: "Use the clearest public signal to explain why this person is worth reaching now.",
        sources: "public profile, company page, recent posts or mentions",
      },
      {
        name: "Closest related company or team",
        score: "76% match",
        context: "If the exact person needs verification, Noodle keeps the search moving by finding the closest company or team context.",
        angle: "Confirm the right owner, then hand Lightfern a grounded reason to start the conversation.",
        sources: "company site, search results, team pages",
      },
    ],
  },
  growth: {
    signal: "growth role, fintech category, active acquisition motion",
    matches: [
      {
        name: "Maya Chen, Head of Growth at Payflow",
        score: "91% match",
        context: "Fintech growth lead working on activation and lifecycle conversion.",
        angle: "Connect Noodle to cleaner research before outbound to operators and partners.",
        sources: "LinkedIn role, product updates, hiring for lifecycle growth",
      },
      {
        name: "RallyPay Growth Team",
        score: "86% match",
        context: "Early fintech team with visible GTM experimentation and partner-led growth.",
        angle: "Frame the packet as a way to make Lightfern drafts more relevant from the first line.",
        sources: "company blog, funding note, GTM job posts",
      },
    ],
  },
  dtc: {
    signal: "DTC brand, marketing owner, retention or launch motion",
    matches: [
      {
        name: "CMO at Kin & Cloth",
        score: "89% match",
        context: "DTC apparel brand with recent campaign activity and retention pressure.",
        angle: "Lead with campaign context, then suggest a sharper way to prep partner or lifecycle outreach.",
        sources: "brand campaigns, email signup flow, press mentions",
      },
      {
        name: "VP Marketing at Glowjar",
        score: "84% match",
        context: "Beauty DTC brand testing creator-led launches and repeat purchase loops.",
        angle: "Use Noodle to collect the proof points Lightfern needs for a relevant opener.",
        sources: "launch pages, creator posts, review patterns",
      },
    ],
  },
  local: {
    signal: "local business, visible website gap, clear service need",
    matches: [
      {
        name: "Paper Cup Coffee, Shoreditch",
        score: "90% match",
        context: "Independent coffee shop with light web presence and strong local footfall.",
        angle: "Lead with a specific observation about the website, then offer a low-friction refresh.",
        sources: "website audit, Google profile, Instagram activity",
      },
      {
        name: "Redchurch Espresso",
        score: "85% match",
        context: "Local cafe with active social presence but thin conversion path online.",
        angle: "Frame the refresh around making bookings, menus, and events easier to discover.",
        sources: "maps listing, social posts, current website",
      },
    ],
  },
  investor: {
    signal: "investment thesis, portfolio fit, recent AI or GTM interest",
    matches: [
      {
        name: "Northstar Ventures",
        score: "92% match",
        context: "Pre-seed investor with workflow software and AI-enabled sales interest.",
        angle: "Show how research packets improve Lightfern draft quality before founder outreach.",
        sources: "portfolio notes, partner posts, recent AI investment thesis",
      },
      {
        name: "Seedcamp",
        score: "87% match",
        context: "European seed fund with strong founder tooling and GTM infrastructure fit.",
        angle: "Position Noodle as the context layer before outbound drafting.",
        sources: "fund focus, founder resources, recent SaaS portfolio work",
      },
    ],
  },
  generic: {
    signal: "role fit, reachable context, visible timing signal",
    matches: [
      {
        name: "Priority target 1",
        score: "88% match",
        context: "Strong fit based on role, category, and available public context.",
        angle: "Use the most specific signal as the opening context before Lightfern drafts.",
        sources: "company site, public profile, recent activity",
      },
      {
        name: "Priority target 2",
        score: "82% match",
        context: "Useful adjacent target with enough evidence for a clean research packet.",
        angle: "Clarify the business reason to talk now, then hand the context to Lightfern.",
        sources: "website, social proof, market timing",
      },
    ],
  },
};

function refreshIcons() {
  if (window.lucide) {
    window.lucide.createIcons({
      attrs: {
        "aria-hidden": "true",
      },
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
  if (looksLikePersonName(value)) return scenarios.namedPerson;
  return scenarios.generic;
}

function looksLikePersonName(value) {
  const words = value
    .replace(/[^a-z\s'-]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (words.length < 2 || words.length > 4) return false;

  const orgWords = ["company", "team", "cmo", "cto", "head", "heads", "founder", "investor", "investors", "brand", "brands"];
  return !words.some((word) => orgWords.includes(word));
}

function formValues() {
  const form = $("[data-reach-builder]");
  return {
    target: cleanValue(form?.elements.target.value || "", "pre-seed investors in London"),
    goal: cleanValue(form?.elements.goal.value || "", "introduce our Lightfern hackathon workflow"),
    offer: cleanValue(form?.elements.offer.value || "", "a prep layer that gives Lightfern better context"),
    whyNow: cleanValue(form?.elements.whyNow.value || "", "outbound quality depends on better research signals"),
    outcome: cleanValue(form?.elements.outcome.value || "", "start a useful conversation"),
    tone: cleanValue(form?.elements.tone.value || "", "warm and specific"),
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
    "[data-brief-signal]": scenario.signal,
  };

  Object.entries(fields).forEach(([selector, value]) => {
    const node = $(selector);
    if (node) node.textContent = value.toLowerCase();
  });

  const statusNode = $("[data-brief-status]");
  if (statusNode) statusNode.textContent = status;
}

function fillBriefPanel(brief, status = "Ready to run") {
  const values = formValues();
  const targetText = [brief.looking_for, brief.location].filter(Boolean).join(" · ");

  const fields = {
    "[data-brief-target]": targetText || brief.raw?.description || values.target,
    "[data-brief-goal]": brief.goal || brief.interest || values.goal,
    "[data-brief-offer]": values.offer,
    "[data-brief-why]": values.whyNow,
    "[data-brief-outcome]": values.outcome,
    "[data-brief-tone]": values.tone,
    "[data-brief-signal]": brief.signals?.join(", ") || selectedScenario(values.target).signal,
  };

  Object.entries(fields).forEach(([selector, value]) => {
    const node = $(selector);
    if (node) node.textContent = String(value).toLowerCase();
  });

  const statusNode = $("[data-brief-status]");
  if (statusNode) statusNode.textContent = status;
}

function setStatus(message) {
  const statusNode = $("[data-brief-status]");
  if (statusNode) statusNode.textContent = message;

  const runMessage = $("[data-run-message]");
  if (runMessage && message) {
    runMessage.textContent = message.endsWith(".") ? message : `${message}...`;
  }

  const greeting = $("[data-assistant-greeting]");
  if (greeting && message) {
    greeting.textContent = message.endsWith(".") ? message : `${message}...`;
  }
}

function demoCard(match, values, index) {
  const isNamedPersonFallback = match.name === "Primary person profile";

  return {
    id: `demo-${index}`,
    confidence: index === 0 ? "high" : "medium",
    match: {
      name: isNamedPersonFallback ? values.target : match.name,
      role: values.target,
      company: isNamedPersonFallback ? "Person lookup" : match.name,
    },
    why_match: match.context,
    suggested_angle: match.angle,
    notes: [
      `Sources: ${match.sources}.`,
      `Tone: ${values.tone}; Outcome: ${values.outcome}.`,
    ],
    lightfern: {
      completion_status: "ready",
    },
  };
}

function renderDemoPackets(status = "2 packet previews") {
  const values = formValues();
  const scenario = selectedScenario(values.target);

  clearPackets();
  scenario.matches.forEach((match, index) => {
    renderPacket(demoCard(match, values, index));
  });

  const count = $("[data-match-count]");
  if (count) count.textContent = status;
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

function shouldAutoRun() {
  const params = new URLSearchParams(window.location.search);
  return params.get("run") === "1" || Boolean(params.get("target")?.trim());
}

function setWorkingMode(active) {
  const form = $("[data-reach-builder]");
  const summary = $("[data-run-summary]");
  const title = $("[data-dashboard-title]");
  const values = formValues();

  if (summary) {
    summary.hidden = !active;
  }

  if (form) {
    form.hidden = active;
  }

  const targetNode = $("[data-run-target]");
  if (targetNode) targetNode.textContent = values.target;

  const messageNode = $("[data-run-message]");
  if (messageNode) {
    messageNode.textContent = active
      ? "Finding the strongest matches and context for Lightfern."
      : "Adjust the target or add more context before Noodle runs again.";
  }

  if (title) {
    title.textContent = active ? "Noodle is on it" : "Refine the reach.";
    title.classList.toggle("is-working", active);
  }
}

function hydrateSeedTarget() {
  const target = getSeedTarget();
  if (!target) return false;

  const form = $("[data-reach-builder]");
  if (form) form.elements.target.value = target;

  const greeting = $("[data-assistant-greeting]");
  if (greeting) {
    greeting.textContent = `got it. i will turn "${target}" into a noodle-ready reach packet.`;
  }

  const input = $("[data-composer] input[name='message']");
  if (input) input.placeholder = "What do you want to talk to them about?";

  setActiveNav("matches");
  setWorkingMode(shouldAutoRun());
  syncBrief(shouldAutoRun() ? "Finding matches" : "Ready to run");

  const sidebarStatus = $("[data-sidebar-status]");
  if (sidebarStatus) {
    sidebarStatus.textContent = shouldAutoRun()
      ? "Working from your target now."
      : "Brief ready. Run matches to prepare Noodle context.";
  }

  return true;
}

function openSettings() {
  const dialog = $("[data-settings-dialog]");
  if (!dialog?.showModal || dialog.open) return;
  dialog.showModal();
}

function setSampleQueriesDisabled(disabled) {
  $$("[data-sample-query]").forEach((button) => {
    button.disabled = disabled;
  });
}

function setActiveSampleQuery(button) {
  $$("[data-sample-query]").forEach((chip) => {
    chip.classList.toggle("is-active", chip === button);
  });
}

function applySampleQuery(button) {
  const form = $("[data-reach-builder]");
  if (!form || !button) return;

  const target = button.dataset.sampleTarget?.trim();
  if (!target) return;

  form.elements.target.value = target;
  form.elements.goal.value = button.dataset.sampleGoal?.trim() ?? "";
  seedSampleSender(form.elements.goal.value);
  setActiveSampleQuery(button);
  syncBrief("Ready to run");
  runReachSearch();
}

function friendlyFetchError(message) {
  if (/failed to fetch/i.test(message ?? "")) {
    return "Can't reach the API — start the backend on http://localhost:8787 (see RUN.md).";
  }
  return message;
}

function closeSettings() {
  const dialog = $("[data-settings-dialog]");
  if (dialog?.open) dialog.close();
}

async function runReachSearch({ fallback = true } = {}) {
  const values = formValues();
  if (!values.target) return;

  setWorkingMode(true);
  clearPackets();
  showSearching();
  setSampleQueriesDisabled(true);
  setActiveNav("matches");
  setActivePanel("matches");
  setStatus(`Turning "${values.target}" into a search brief`);

  try {
    await streamRun(
      {
        input: {
          description: values.target,
          goal: values.goal || undefined,
        },
      },
      {
        onRun: (_runId, brief) => {
          fillBriefPanel(brief, "Searching public signals");
        },
        onStatus: (message) => setStatus(message),
        onCard: (card) => {
          renderPacket(card);
          refreshIcons();
        },
        onDone: (_runId, stats) => {
          if (stats.researched <= 0) {
            syncBrief("Packet previews ready");
            renderDemoPackets("2 suggested starting points");
            setStatus("Suggested starting points ready");

            const greeting = $("[data-assistant-greeting]");
            if (greeting) {
              greeting.textContent = `i could not verify strong live matches yet, so i prepared starting points for "${values.target}".`;
            }

            const messageNode = $("[data-run-message]");
            if (messageNode) {
              messageNode.textContent = "No verified live matches yet, so Noodle prepared useful starting points instead.";
            }

            const sidebarStatus = $("[data-sidebar-status]");
            if (sidebarStatus) sidebarStatus.textContent = "Starting points ready for Noodle context.";
            setSampleQueriesDisabled(false);
            return;
          }

          setMatchCount(stats.researched);
          setStatus(`${stats.researched} match${stats.researched === 1 ? "" : "es"} ready`);

          const greeting = $("[data-assistant-greeting]");
          if (greeting) {
            greeting.textContent =
              stats.researched > 0
                ? `i found ${stats.researched} strong direction${stats.researched === 1 ? "" : "s"} for "${values.target}". the best packets are ready below.`
                : `no strong matches yet for "${values.target}". try refining the brief.`;
          }

          const sidebarStatus = $("[data-sidebar-status]");
          if (sidebarStatus) sidebarStatus.textContent = `${stats.researched} packets ready for Noodle handoff.`;
          setSampleQueriesDisabled(false);
        },
        onError: (message) => {
          if (!fallback) {
            showEmpty(friendlyFetchError(message));
            setStatus("Search failed");
            setSampleQueriesDisabled(false);
          }
        },
      },
    );
  } catch (err) {
    if (!fallback) {
      showEmpty(friendlyFetchError(err.message ?? "Something went wrong"));
      setStatus("Search failed");
      setSampleQueriesDisabled(false);
      return;
    }

    syncBrief("Packet previews ready");
    renderDemoPackets("2 packet previews");

    const greeting = $("[data-assistant-greeting]");
    if (greeting) {
      greeting.textContent = `i built research context for "${values.target}". choose a packet and Noodle can draft from it.`;
    }

    const messageNode = $("[data-run-message]");
    if (messageNode) {
      messageNode.textContent = "Packet previews are ready. Pick one when you want Noodle to draft.";
    }

    const sidebarStatus = $("[data-sidebar-status]");
    if (sidebarStatus) sidebarStatus.textContent = "2 packet previews ready for Noodle handoff.";
    setSampleQueriesDisabled(false);
  }
}

$$("[data-view]").forEach((button) => {
  button.addEventListener("click", () => {
    const view = button.dataset.view;
    document.body.classList.remove("sidebar-open");

    if (view === "settings") {
      openSettings();
      return;
    }

    setActiveNav(view);
    setActivePanel(view);
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

$("[data-refine-search]")?.addEventListener("click", () => {
  setWorkingMode(false);
  syncBrief("Ready to refine");
  $("[data-reach-builder] [name='target']")?.focus();
});

$("[data-reach-builder]")?.addEventListener("input", () => {
  syncBrief();
  renderDemoPackets("2 packet previews");
  setActiveSampleQuery(null);
});

$$("[data-sample-query]").forEach((button) => {
  button.addEventListener("click", () => applySampleQuery(button));
});

$("[data-reach-builder]")?.addEventListener("submit", (event) => {
  event.preventDefault();
  runReachSearch();
});

$("[data-composer]")?.addEventListener("submit", (event) => {
  event.preventDefault();
  const input = event.currentTarget.elements.message;
  const value = input.value.trim();
  const greeting = $("[data-assistant-greeting]");

  if (greeting && value) {
    greeting.textContent = `got it. i will turn "${value}" into a noodle-ready reach packet.`;
  }

  input.value = "";
});

window.addEventListener("load", refreshIcons);
refreshIcons();
setAssistantCollapsed(true);

if (hydrateSeedTarget() && shouldAutoRun()) {
  runReachSearch();
} else {
  syncBrief();
  renderDemoPackets();
}

const reachGoal = $("[data-reach-builder]")?.elements.goal?.value;
seedSampleSender(reachGoal?.trim());
