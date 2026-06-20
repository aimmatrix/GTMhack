const CONFIDENCE_LABELS = {
  high: "92% match",
  medium: "78% match",
  low: "60% match",
};

const LIGHTFERN_LABELS = {
  ready: "Lightfern ready",
  partial: "Lightfern partial",
  unavailable: "Lightfern unavailable",
};

const SKELETON_COUNT = 3;
const SKELETON_STEPS = [
  {
    title: "Checking company context",
    detail: "Looking for role, business, and category fit.",
  },
  {
    title: "Finding recent signals",
    detail: "Scanning for useful timing, source links, and hooks.",
  },
  {
    title: "Preparing Lightfern packet",
    detail: "Turning the strongest context into draft-ready notes.",
  },
];

function getPacketList() {
  return document.querySelector(".packet-list");
}

function getMatchCountEl() {
  return document.querySelector(".packet-section .section-title span");
}

function confidenceLabel(confidence) {
  return CONFIDENCE_LABELS[confidence] ?? confidence ?? "Match";
}

function lightfernLabel(status) {
  return LIGHTFERN_LABELS[status] ?? (status ? `Lightfern ${status}` : "Lightfern");
}

function formatRoleCompany(match = {}) {
  const parts = [match.role, match.company].filter(Boolean);
  return parts.join(" · ");
}

function removePlaceholders(list) {
  list.querySelectorAll(".is-skeleton, .packet-empty").forEach((node) => node.remove());
}

function createSkeletonCard(step = SKELETON_STEPS[0]) {
  const card = document.createElement("article");
  card.className = "packet-card is-skeleton";
  card.setAttribute("aria-busy", "true");
  card.setAttribute("aria-label", "Loading research packet");

  card.innerHTML = `
    <div class="packet-topline">
      <h3>${step.title}</h3>
      <span style="opacity:0.55;">Working...</span>
    </div>
    <p>${step.detail}</p>
    <ul>
      <li><span class="skeleton-line" style="display:block;width:92%;height:0.8rem;border-radius:4px;background:var(--soft-2,#f1f2f4);"></span></li>
      <li><span class="skeleton-line" style="display:block;width:78%;height:0.8rem;border-radius:4px;background:var(--soft-2,#f1f2f4);"></span></li>
    </ul>
  `;

  return card;
}

export function clearPackets() {
  const list = getPacketList();
  if (list) list.replaceChildren();
}

export function setMatchCount(n) {
  const label = getMatchCountEl();
  if (!label) return;

  if (n <= 0) {
    label.textContent = "No matches yet";
  } else if (n === 1) {
    label.textContent = "1 strong match";
  } else {
    label.textContent = `${n} strong matches`;
  }
}

export function showSearching() {
  const list = getPacketList();
  if (!list) return;

  list.replaceChildren();
  for (let i = 0; i < SKELETON_COUNT; i += 1) {
    list.appendChild(createSkeletonCard(SKELETON_STEPS[i]));
  }

  const label = getMatchCountEl();
  if (label) label.textContent = "Working...";
}

export function showEmpty(message = "No matches found.") {
  const list = getPacketList();
  if (!list) return;

  list.replaceChildren();

  const empty = document.createElement("div");
  empty.className = "packet-empty";
  empty.setAttribute("role", "status");

  const text = document.createElement("p");
  text.textContent = message;
  text.style.margin = "0";
  text.style.padding = "18px";
  text.style.color = "#606772";
  text.style.fontSize = "14px";
  text.style.lineHeight = "1.4";

  empty.appendChild(text);
  list.appendChild(empty);

  setMatchCount(0);
}

export function renderPacket(card) {
  const list = getPacketList();
  if (!list || !card) return null;

  removePlaceholders(list);

  const match = card.match ?? {};
  const article = document.createElement("article");
  article.className = "packet-card";
  article.dataset.cardId = card.id ?? "";

  const topline = document.createElement("div");
  topline.className = "packet-topline";

  const identity = document.createElement("div");

  const title = document.createElement("h3");
  title.textContent = match.name || "Unknown match";
  identity.appendChild(title);

  const meta = document.createElement("div");
  meta.className = "packet-meta";
  meta.style.marginTop = "4px";
  meta.style.display = "grid";
  meta.style.gap = "2px";
  meta.style.color = "#737a84";
  meta.style.fontSize = "12px";
  meta.style.lineHeight = "1.35";

  const roleCompany = formatRoleCompany(match);
  if (roleCompany) {
    const roleLine = document.createElement("span");
    roleLine.textContent = roleCompany;
    meta.appendChild(roleLine);
  }

  if (match.email) {
    const emailLine = document.createElement("span");
    emailLine.textContent = match.email;
    meta.appendChild(emailLine);
  }

  if (meta.childElementCount > 0) {
    identity.appendChild(meta);
  }

  const badges = document.createElement("div");
  badges.style.display = "flex";
  badges.style.flexWrap = "wrap";
  badges.style.gap = "6px";
  badges.style.justifyContent = "flex-end";

  const confidenceChip = document.createElement("span");
  confidenceChip.textContent = confidenceLabel(card.confidence);
  badges.appendChild(confidenceChip);

  const completionStatus = card.lightfern?.completion_status;
  if (completionStatus) {
    const lfBadge = document.createElement("span");
    lfBadge.textContent = lightfernLabel(completionStatus);
    lfBadge.style.padding = "5px 8px";
    lfBadge.style.borderRadius = "999px";
    lfBadge.style.background = completionStatus === "ready" ? "#ecfdf3" : "#fff7ed";
    lfBadge.style.color = completionStatus === "ready" ? "#137333" : "#9a6700";
    lfBadge.style.fontSize = "12px";
    lfBadge.style.fontWeight = "800";
    badges.appendChild(lfBadge);
  }

  topline.append(identity, badges);
  article.appendChild(topline);

  if (card.why_match) {
    const summary = document.createElement("p");
    summary.textContent = card.why_match;
    article.appendChild(summary);
  }

  const insights = document.createElement("ul");

  if (card.suggested_angle) {
    const angleItem = document.createElement("li");
    angleItem.className = "packet-angle";
    angleItem.style.listStyle = "none";
    angleItem.style.marginLeft = "-17px";
    angleItem.style.padding = "10px 12px";
    angleItem.style.borderRadius = "8px";
    angleItem.style.background = "var(--accent-soft, #eeeaff)";
    angleItem.style.color = "#3f3799";
    angleItem.style.fontSize = "14px";
    angleItem.style.fontWeight = "650";
    angleItem.style.lineHeight = "1.4";

    const angleLabel = document.createElement("strong");
    angleLabel.textContent = "Angle: ";
    angleLabel.style.display = "block";
    angleLabel.style.marginBottom = "4px";
    angleLabel.style.fontSize = "11px";
    angleLabel.style.letterSpacing = "0.04em";
    angleLabel.style.textTransform = "uppercase";
    angleLabel.style.color = "#6657f7";

    const angleText = document.createElement("span");
    angleText.textContent = card.suggested_angle;

    angleItem.append(angleLabel, angleText);
    insights.appendChild(angleItem);
  }

  for (const note of card.notes ?? []) {
    const noteItem = document.createElement("li");
    noteItem.textContent = note;
    insights.appendChild(noteItem);
  }

  if (insights.childElementCount > 0) {
    article.appendChild(insights);
  }

  const sources = card.sources ?? [];
  if (sources.length > 0) {
    const sourceWrap = document.createElement("div");
    sourceWrap.className = "packet-sources";
    sourceWrap.style.display = "flex";
    sourceWrap.style.flexWrap = "wrap";
    sourceWrap.style.alignItems = "center";
    sourceWrap.style.gap = "8px";
    sourceWrap.style.marginBottom = "14px";

    const sourceLabel = document.createElement("small");
    sourceLabel.textContent = "Sources";
    sourceLabel.style.color = "#8b9098";
    sourceLabel.style.fontSize = "11px";
    sourceLabel.style.fontWeight = "800";
    sourceLabel.style.letterSpacing = "0.04em";
    sourceLabel.style.textTransform = "uppercase";
    sourceWrap.appendChild(sourceLabel);

    for (const source of sources) {
      const link = document.createElement("a");
      link.href = source.url || "#";
      link.textContent = source.title || source.url || "Source";
      link.target = "_blank";
      link.rel = "noreferrer";
      link.style.color = "#6657f7";
      link.style.fontSize = "12px";
      link.style.fontWeight = "700";
      link.style.textDecoration = "none";
      sourceWrap.appendChild(link);
    }

    article.appendChild(sourceWrap);
  }

  const draftButton = document.createElement("button");
  draftButton.type = "button";
  draftButton.textContent = "Draft in Lightfern";
  draftButton.addEventListener("click", () => {
    document.dispatchEvent(new CustomEvent("noodle:draft", { detail: card }));
  });

  article.appendChild(draftButton);
  list.appendChild(article);

  return article;
}
