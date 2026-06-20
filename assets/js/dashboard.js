const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

const taskResponses = {
  "connect-device": "your outreach source is connected. i can read target briefs and keep the handoff clean.",
  "meet-noodle": "i am noodle. give me a messy target, and i will turn it into a sharp reach packet.",
  "connect-lightfern": "lightfern is connected. when a match is ready, i will send context there for drafting.",
  audit: "your target list has been audited. strongest signal: london operators, ai sales tools, and logistics buyers.",
  skills: "skills loaded: find prospects, research context, verify sources, and hand off to lightfern.",
  calendar: "reach calendar is ready. i saved your next outreach ritual for tomorrow morning.",
  rituals: "hey angela. today's ritual is simple: describe who you want to reach, then let me prepare the context."
};

const viewResponses = {
  matches: "tell me who you want to reach, and i will shape the search brief.",
  packets: "research packets are where match reasons, notes, angles, and sources stay tidy.",
  drafts: "lightfern drafts start after the context packet is ready.",
  calendar: "reach calendar is ready. i saved your next outreach ritual for tomorrow morning.",
  sources: "source library keeps the links i can cite before anything goes to lightfern.",
  rituals: "today's ritual: pick one audience, find five high-signal matches, then draft in lightfern.",
  settings: "settings is where sender context, integrations, and handoff rules live."
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

function setActiveTask(taskId) {
  $$("[data-task]").forEach((button) => {
    button.classList.toggle("is-current", button.dataset.task === taskId);
    button.classList.toggle("is-done", button.dataset.task !== taskId);
  });

  const greeting = $("[data-assistant-greeting]");
  if (greeting) {
    greeting.textContent = taskResponses[taskId] || "hey angela.";
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

  try {
    localStorage.setItem("noodle-chat-collapsed", collapsed ? "true" : "false");
  } catch {
    // Local storage can be unavailable in stricter browser contexts.
  }

  refreshIcons();
}

$$("[data-task]").forEach((button) => {
  button.addEventListener("click", () => setActiveTask(button.dataset.task));
});

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
    greeting.textContent = `got it. i will turn "${value}" into a lightfern-ready reach packet.`;
  }

  input.value = "";
});

window.addEventListener("load", refreshIcons);
refreshIcons();

try {
  setAssistantCollapsed(localStorage.getItem("noodle-chat-collapsed") === "true");
} catch {
  setAssistantCollapsed(false);
}

if (window.location.pathname.startsWith("/rituals")) {
  setActiveNav("rituals");
  setActiveTask("rituals");
}
