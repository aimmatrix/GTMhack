import { handoff } from "./api.js";

const STORAGE_KEY = "noodle-sender";

const $ = (selector) => document.querySelector(selector);

function loadSender() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveSender(sender) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sender));
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function setHandoffStatus(message) {
  const p = $(".handoff-strip p");
  if (p) p.textContent = message;
}

function showHandoffPreview(result) {
  const strip = $(".handoff-strip > div");
  if (!strip) return;

  let preview = strip.querySelector("[data-handoff-preview]");
  if (!preview) {
    preview = document.createElement("div");
    preview.dataset.handoffPreview = "";
    strip.appendChild(preview);
  }

  preview.innerHTML = `
    <small style="display:block;margin-top:10px;color:var(--muted)">Subject</small>
    <p style="margin:4px 0 0;font-size:13px;font-weight:650">${escapeHtml(result.subject)}</p>
    <small style="display:block;margin-top:10px;color:var(--muted)">Draft preview</small>
    <pre style="margin:4px 0 0;padding:10px;border-radius:8px;background:var(--soft);white-space:pre-wrap;font:13px/1.4 var(--sans);color:#505762">${escapeHtml(result.body)}</pre>
  `;
}

function readSenderForm(form) {
  const data = new FormData(form);
  return {
    name: data.get("name")?.toString().trim() ?? "",
    company: data.get("company")?.toString().trim() ?? "",
    whatYouDo: data.get("whatYouDo")?.toString().trim() ?? "",
    goal: data.get("goal")?.toString().trim() ?? "",
    fromEmail: data.get("fromEmail")?.toString().trim() ?? "",
  };
}

function fillSenderForm(form, sender = {}) {
  for (const field of ["name", "company", "whatYouDo", "goal", "fromEmail"]) {
    const input = form.elements[field];
    if (input && sender[field]) input.value = sender[field];
  }

  if (!form.elements.goal?.value) {
    const goalInput = $("[data-reach-builder] [name='goal']");
    if (goalInput?.value) form.elements.goal.value = goalInput.value.trim();
  }
}

function ensureSender() {
  const existing = loadSender();
  if (existing?.name && existing?.fromEmail) {
    return Promise.resolve(existing);
  }

  const dialog = $(".sender-modal");
  const form = dialog?.querySelector("[data-sender-form]");
  if (!dialog || !form) {
    return Promise.reject(new Error("Sender modal not found"));
  }

  fillSenderForm(form, existing ?? {});

  return new Promise((resolve, reject) => {
    let settled = false;

    const finish = (fn) => {
      if (settled) return;
      settled = true;
      form.removeEventListener("submit", onSubmit);
      dialog.removeEventListener("cancel", onCancel);
      dialog.querySelector("[data-sender-cancel]")?.removeEventListener("click", onCancel);
      fn();
    };

    const onSubmit = (event) => {
      event.preventDefault();
      const sender = readSenderForm(form);
      if (!sender.name || !sender.fromEmail) {
        form.reportValidity();
        return;
      }

      saveSender(sender);
      dialog.close();
      finish(() => resolve(sender));
    };

    const onCancel = () => {
      dialog.close();
      finish(() => reject(new Error("Sender context cancelled")));
    };

    form.addEventListener("submit", onSubmit);
    dialog.addEventListener("cancel", onCancel);
    dialog.querySelector("[data-sender-cancel]")?.addEventListener("click", onCancel);
    dialog.showModal();
  });
}

async function handleDraft(card) {
  if (!card) return;

  const statusNode = $(".handoff-strip p");
  const previousStatus = statusNode?.textContent ?? "";

  try {
    setHandoffStatus("Collecting sender context…");
    const sender = await ensureSender();

    setHandoffStatus("Creating Gmail draft…");
    const result = await handoff({ packet: card, sender });

    setHandoffStatus(result.message);
    showHandoffPreview(result);

    if (result.gmailUrl) {
      window.open(result.gmailUrl, "_blank");
    }
  } catch (err) {
    if (err.message === "Sender context cancelled") {
      setHandoffStatus(previousStatus);
    } else {
      setHandoffStatus(err.message ?? "Handoff failed");
    }
  }
}

document.addEventListener("noodle:draft", (event) => {
  handleDraft(event.detail);
});

function styleSenderModal() {
  const dialog = $(".sender-modal");
  if (!dialog || dialog.dataset.styled) return;
  dialog.dataset.styled = "true";

  Object.assign(dialog.style, {
    padding: "0",
    border: "none",
    borderRadius: "12px",
    maxWidth: "min(440px, calc(100vw - 32px))",
    boxShadow: "0 24px 48px rgba(21, 25, 34, 0.18)",
  });

  const form = dialog.querySelector(".sender-form");
  if (form) {
    Object.assign(form.style, {
      display: "grid",
      gap: "12px",
      padding: "22px",
      margin: "0",
    });
  }

  const header = dialog.querySelector(".sender-modal-header");
  if (header) {
    Object.assign(header.style, { marginBottom: "4px" });
    const h2 = header.querySelector("h2");
    if (h2) {
      Object.assign(h2.style, {
        margin: "0",
        fontFamily: "var(--serif)",
        fontSize: "28px",
        fontWeight: "400",
      });
    }
    const p = header.querySelector("p");
    if (p) {
      Object.assign(p.style, {
        margin: "6px 0 0",
        color: "#606772",
        fontSize: "14px",
        lineHeight: "1.4",
      });
    }
  }

  const actions = dialog.querySelector(".sender-modal-actions");
  if (actions) {
    Object.assign(actions.style, {
      display: "flex",
      justifyContent: "flex-end",
      gap: "10px",
      marginTop: "6px",
    });
  }
}

styleSenderModal();
