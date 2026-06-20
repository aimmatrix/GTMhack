import { buildBrief, streamRun } from "./api.js";
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
  packets: "research packets are where match reasons, notes, angles, and sources stay tidy.",
  drafts: "noodle drafts start after the outreach context is ready.",
  calendar: "reach calendar is ready. i saved your next outreach window for tomorrow morning.",
  sources: "source library keeps the links i can cite before anything goes to noodle.",
  settings: "settings is where sender context, integrations, and handoff rules live.",
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
  $$("[data-view]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.view === view);
  });

  const greeting = $("[data-assistant-greeting]");
  if (greeting && viewResponses[view]) {
    greeting.textContent = viewResponses[view];
  }
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

function fillBriefPanel(brief, status = "Ready to run") {
  const targetNode = $("[data-brief-target]");
  const goalNode = $("[data-brief-goal]");
  const statusNode = $("[data-brief-status]");

  const targetText = [brief.looking_for, brief.location].filter(Boolean).join(" · ");
  if (targetNode) targetNode.textContent = (targetText || brief.raw?.description || "").toLowerCase();
  if (goalNode) goalNode.textContent = (brief.goal || brief.interest || "").toLowerCase();
  if (statusNode) statusNode.textContent = status;
}

function syncBrief(status = "Ready to run") {
  const form = $("[data-reach-builder]");
  if (!form) return;

  const target = cleanValue(form.elements.target.value, "pre-seed investors in London");
  const goal = cleanValue(form.elements.goal.value, "introduce noodle's outreach workflow");

  const targetNode = $("[data-brief-target]");
  const goalNode = $("[data-brief-goal]");
  const statusNode = $("[data-brief-status]");

  if (targetNode) targetNode.textContent = target.toLowerCase();
  if (goalNode) goalNode.textContent = goal.toLowerCase();
  if (statusNode) statusNode.textContent = status;
}

function setStatus(message) {
  const statusNode = $("[data-brief-status]");
  if (statusNode) statusNode.textContent = message;

  const greeting = $("[data-assistant-greeting]");
  if (greeting && message) {
    greeting.textContent = message.endsWith(".") ? message : `${message}…`;
  }
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
  if (!target) return false;

  const form = $("[data-reach-builder]");
  if (form) {
    form.elements.target.value = target;
  }

  const greeting = $("[data-assistant-greeting]");
  if (greeting) {
    greeting.textContent = `got it. i will turn "${target}" into a noodle-ready reach packet.`;
  }

  const input = $("[data-composer] input[name='message']");
  if (input) {
    input.placeholder = "What do you want to talk to them about?";
  }

  setActiveNav("matches");
  syncBrief("Ready to run");
  return true;
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

async function runReachSearch() {
  const form = $("[data-reach-builder]");
  if (!form) return;

  const targetValue = cleanValue(form.elements.target.value, "");
  const goalValue = cleanValue(form.elements.goal.value, "");
  if (!targetValue) return;

  clearPackets();
  showSearching();
  setSampleQueriesDisabled(true);
  setActiveNav("matches");
  setStatus("Building search brief");

  try {
    const brief = await buildBrief({
      description: targetValue,
      goal: goalValue || undefined,
    });

    fillBriefPanel(brief, "Searching for matches");

    await streamRun(
      { brief },
      {
        onStatus: (message) => setStatus(message),
        onCard: (card) => {
          renderPacket(card);
          refreshIcons();
        },
        onDone: (_runId, stats) => {
          setMatchCount(stats.researched);
          setStatus(`${stats.researched} match${stats.researched === 1 ? "" : "es"} ready`);
          const greeting = $("[data-assistant-greeting]");
          if (greeting) {
            greeting.textContent =
              stats.researched > 0
                ? `i found ${stats.researched} strong direction${stats.researched === 1 ? "" : "s"} for "${targetValue}". the best packets are ready below.`
                : `no strong matches yet for "${targetValue}". try refining the brief.`;
          }
          setSampleQueriesDisabled(false);
        },
        onError: (message) => {
          showEmpty(friendlyFetchError(message));
          setStatus("Search failed");
          setSampleQueriesDisabled(false);
        },
      },
    );
  } catch (err) {
    showEmpty(friendlyFetchError(err.message ?? "Something went wrong"));
    setStatus("Search failed");
    setSampleQueriesDisabled(false);
  }
}

$$("[data-view]").forEach((button) => {
  button.addEventListener("click", () => {
    setActiveNav(button.dataset.view);
    document.body.classList.remove("sidebar-open");
  });
});

$$("[data-toggle-sidebar]").forEach((button) => {
  button.addEventListener("click", () => {
    document.body.classList.toggle("sidebar-open");
  });
});

$("[data-toggle-assistant]")?.addEventListener("click", () => {
  setAssistantCollapsed(!document.body.classList.contains("chat-collapsed"));
});

$("[data-reach-builder]")?.addEventListener("input", () => {
  syncBrief();
  setActiveSampleQuery(null);
});

$$("[data-sample-query]").forEach((button) => {
  button.addEventListener("click", () => applySampleQuery(button));
});

$("[data-reach-builder]")?.addEventListener("submit", (event) => {
  event.preventDefault();
  runReachSearch();
});

const copyCode = $("[data-copy-code]");
copyCode?.addEventListener("click", async () => {
  const code = "ANGELA-GIFT";
  try {
    await navigator.clipboard.writeText(code);
    copyCode.querySelector("span").textContent = "COPIED";
    setTimeout(() => {
      copyCode.querySelector("span").textContent = code;
    }, 1200);
  } catch {
    copyCode.querySelector("span").textContent = code;
  }
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

if (hydrateSeedTarget()) {
  runReachSearch();
} else {
  syncBrief();
}

const reachGoal = $("[data-reach-builder]")?.elements.goal?.value;
seedSampleSender(reachGoal?.trim());
