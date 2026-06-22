const $ = (selector) => document.querySelector(selector);

const form = $("#audit-form");
const submitButton = form.querySelector("button[type=submit]");
const emptyState = $("#empty-state");
const loadingState = $("#loading-state");
const results = $("#results");
let latestResult = null;
const YOUTUBE_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const YOUTUBE_CACHE_PREFIX = "youtube-audit:research:v1:";

const loadingMessages = [
  "시청자 약속을 찾고 있어요…",
  "검색 의도와 경쟁 강도를 비교하고 있어요…",
  "제목의 클릭 동기를 다듬고 있어요…",
  "썸네일에서 남길 단어를 고르고 있어요…",
];

loadStatus();

$("#sample-button").addEventListener("click", () => {
  $("#brief").value = "생성형 AI를 처음 접하는 30대 직장인이 매일 반복하는 보고서 작성 업무를 30분 만에 자동화하는 과정을 보여준다. 실제 회사에서 쓸 수 있는 프롬프트 작성법, 엑셀 데이터 정리, 결과 검수법을 화면 녹화로 설명한다. 과장된 수익 이야기는 피하고, 초보자가 오늘 바로 따라 할 수 있는 실습형 영상으로 만든다.";
  $("#audience").value = "AI 업무 자동화를 처음 시작하는 30대 직장인";
  $("#format").value = "튜토리얼";
  $("#duration").value = "롱폼";
  $("#topic").value = "AI 업무 자동화";
  form.requestSubmit();
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(form));
  setLoading(true);
  let messageIndex = 0;
  const messageTimer = setInterval(() => {
    messageIndex = (messageIndex + 1) % loadingMessages.length;
    $("#loading-copy").textContent = loadingMessages[messageIndex];
  }, 1300);

  try {
    const response = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "분석에 실패했습니다.");
    latestResult = payload;
    render(payload);
  } catch (error) {
    showToast(error.message);
    emptyState.classList.remove("hidden");
  } finally {
    clearInterval(messageTimer);
    setLoading(false);
  }
});

$("#copy-all").addEventListener("click", async () => {
  if (!latestResult) return;
  const r = latestResult;
  const text = [
    "[추천 제목]", ...r.titles.map((x, i) => `${i + 1}. ${x.text}`), "",
    "[썸네일]", `${r.thumbnail.headline} / ${r.thumbnail.subcopy}`, r.thumbnail.visual, "",
    "[설명문]", normalizeLineBreaks(r.description.opening), normalizeLineBreaks(r.description.body), r.description.hashtags.join(" "), "",
    "[태그]", r.tags.join(", "),
  ].join("\n");
  await navigator.clipboard.writeText(text);
  showToast("업로드 패키지를 복사했습니다.");
});

$("#print-report").addEventListener("click", () => {
  document.title = `${latestResult?.meta?.request?.author || "담당자"}_유튜브_기획검수_보고서`;
  window.print();
  setTimeout(() => { document.title = "유튜브 기획 검수실"; }, 500);
});

$("#youtube-search-form").addEventListener("submit", async event => {
  event.preventDefault();
  const query = $("#research-query").value.trim();
  const button = $("#research-search-button");
  const original = button.textContent;
  button.disabled = true;
  button.textContent = "검색 중…";
  try {
    const cached = readYouTubeCache(query, "KR");
    if (cached) {
      if (latestResult) latestResult.research = cached;
      renderResearch(cached);
      showToast(`‘${cached.query}’ 캐시 결과를 재사용했습니다.`);
      return;
    }
    const response = await fetch("/api/youtube-search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, region: "KR" }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "YouTube 검색에 실패했습니다.");
    if (latestResult) latestResult.research = payload.research;
    renderResearch(payload.research);
    showToast(`‘${payload.research.query}’ 상위 결과를 불러왔습니다.`);
  } catch (error) {
    showToast(error.message);
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
});

async function loadStatus() {
  try {
    const status = await fetch("/api/status").then(r => r.json());
    const aiLive = status.gemini || status.openai;
    const aiLabel = status.gemini
      ? `Gemini · ${status.model}`
      : status.openai ? `OpenAI · ${status.model}` : "AI · 데모";
    const provider = $("#provider");
    const geminiOption = provider.querySelector('option[value="gemini"]');
    const openaiOption = provider.querySelector('option[value="openai"]');
    geminiOption.disabled = !status.gemini;
    openaiOption.disabled = !status.openai;
    geminiOption.textContent = status.gemini ? "Gemini · 연결됨" : "Gemini · 키 없음";
    openaiOption.textContent = status.openai ? "GPT · 연결됨" : "GPT · 키 없음";
    $("#provider-help").textContent = status.gemini && status.openai
      ? "원하는 엔진을 직접 선택할 수 있습니다."
      : status.gemini ? "현재 Gemini만 연결되어 있습니다."
      : status.openai ? "현재 GPT만 연결되어 있습니다."
      : "AI 키가 없어 데모 분석을 사용합니다.";
    const items = [
      [aiLive, aiLabel],
      [status.youtube, status.youtube ? "YouTube · 연결" : "YouTube · 예측"],
      [status.trends, status.trends ? "Trends · 연결" : "Trends · 준비"],
    ];
    $("#connections").innerHTML = items.map(([live, label]) => `<span class="connection ${live ? "live" : ""}"><i></i>${escapeHtml(label)}</span>`).join("");
  } catch {
    $("#connections").innerHTML = '<span class="connection"><i></i>오프라인</span>';
  }
}

function setLoading(active) {
  submitButton.disabled = active;
  submitButton.querySelector(".button-label").textContent = active ? "검수 중…" : "기획안 검수하기";
  loadingState.classList.toggle("hidden", !active);
  if (active) {
    emptyState.classList.add("hidden");
    results.classList.add("hidden");
  }
}

function render(data) {
  results.classList.remove("hidden");
  emptyState.classList.add("hidden");
  $("#mode-badge").textContent = `${data.meta.mode} · ${data.meta.sources.join(" + ")}`;
  renderWorkRecord(data.meta);
  $("#total-score").textContent = data.summary.score;
  $("#score-ring").style.setProperty("--score", data.summary.score);
  text("#verdict", data.summary.verdict);
  text("#risk", `주의: ${data.summary.risk}`);
  text("#hook", data.summary.hook);
  text("#audience-result", `핵심 시청자 · ${data.summary.audience}`);

  $("#keyword-table").innerHTML = `
    <div class="keyword-row header"><span>키워드</span><span>수요</span><span>경쟁</span><span>기회</span><span>추세</span></div>
    ${data.keywords.map(k => `<div class="keyword-row" title="${escapeAttr(k.rationale)}">
      <strong>${escapeHtml(k.keyword)}</strong>
      ${metric(k.demand, "demand")}${metric(k.competition, "competition")}${metric(k.opportunity, "opportunity")}
      <span class="trend">${escapeHtml(k.trend)}</span>
    </div>`).join("")}`;

  $("#title-list").innerHTML = data.titles.map((title, index) => `<div class="title-item">
    <span class="title-index">0${index + 1}</span><div><p>${escapeHtml(title.text)}</p><small>${escapeHtml(title.angle)}</small></div><span class="title-score">${title.score}</span>
  </div>`).join("");

  text("#thumb-headline", data.thumbnail.headline);
  text("#thumb-subcopy", data.thumbnail.subcopy);
  text("#thumb-visual", data.thumbnail.visual);
  text("#thumb-palette", data.thumbnail.palette);
  text("#thumb-avoid", data.thumbnail.avoid);
  text("#plan-hook", data.contentPlan.hook);
  $("#chapter-list").innerHTML = data.contentPlan.sections.map(section => `<li>${escapeHtml(section)}</li>`).join("");
  text("#plan-cta", `마무리 · ${data.contentPlan.cta}`);

  $("#check-list").innerHTML = data.checks.map(check => `<div class="check-item">
    <span class="check-level ${escapeAttr(check.level)}">${escapeHtml(check.level)}</span><b>${escapeHtml(check.item)}</b><p>${escapeHtml(check.detail)}</p>
  </div>`).join("");

  text("#description-opening", data.description.opening);
  text("#description-body", data.description.body);
  $("#tag-list").innerHTML = [...data.description.hashtags, ...data.tags].map(tag => `<span class="tag">${escapeHtml(tag)}</span>`).join("");
  renderResearch(data.research);
  results.scrollIntoView({ behavior: "smooth", block: "start" });
  if (data.meta.warnings?.length) showToast(data.meta.warnings[0]);
}

function renderWorkRecord(meta) {
  const request = meta.request || {};
  const created = new Date(meta.generatedAt);
  $("#record-time").textContent = Number.isNaN(created.getTime()) ? "" : created.toLocaleString("ko-KR");
  $("#record-meta").innerHTML = [
    ["담당자", request.author || "미입력"],
    ["영상", `${request.format || "-"} · ${request.duration || "-"}`],
    ["대상", request.audience || "미지정"],
    ["검색 주제", request.topic || "자동 판단"],
    ["AI 선택", providerDisplayName(request.provider)],
  ].map(([label, value]) => `<div><small>${escapeHtml(label)}</small><b>${escapeHtml(value)}</b></div>`).join("");
  text("#record-brief", request.brief || "기록 없음");
}

function providerDisplayName(provider) {
  return provider === "gemini" ? "Gemini" : provider === "openai" ? "GPT" : "자동 선택";
}

function renderResearch(research) {
  const card = $("#research-card");
  if (!research) return card.classList.add("hidden");
  card.classList.remove("hidden");
  $("#research-query").value = research.query || "";
  writeYouTubeCache(research, "KR");
  const compact = new Intl.NumberFormat("ko-KR", { notation: "compact", maximumFractionDigits: 1 });
  const cacheLabel = research.cache?.hit ? "캐시 · 재사용" : "데이터 · 새 조회";
  $("#research-content").innerHTML = `<div class="research-stats">
    <span class="cache-state ${research.cache?.hit ? "cached" : "fresh"}">${cacheLabel}</span><span>검색어 · ${escapeHtml(research.query)}</span><span>선정 · 관련도 상위 10개 중 조회수 상위 5개</span><span>경쟁 ${research.competitionScore}/100</span><span>중앙 조회수 ${compact.format(research.medianViews || 0)}</span><span>최근 1년 ${research.recentTop10}개</span>
  </div>${research.topVideos.map(v => {
    const url = /^https:\/\/www\.youtube\.com\/watch\?v=[A-Za-z0-9_-]+$/.test(v.url || "") ? v.url : `https://www.youtube.com/watch?v=${encodeURIComponent(v.videoId || "")}`;
    return `<a class="video-row" href="${escapeAttr(url)}" target="_blank" rel="noopener noreferrer" aria-label="${escapeAttr(v.title)} 영상 열기"><div><b>${escapeHtml(v.title)}</b><br><small>${escapeHtml(v.channel)}</small></div><span class="video-meta"><strong>${compact.format(v.views)}회</strong><i aria-hidden="true">↗</i></span></a>`;
  }).join("")}`;
}

function youtubeCacheKey(query, region) {
  const normalized = String(query || "").normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
  return `${YOUTUBE_CACHE_PREFIX}${region}:${normalized}`;
}

function readYouTubeCache(query, region) {
  try {
    const raw = localStorage.getItem(youtubeCacheKey(query, region));
    if (!raw) return null;
    const entry = JSON.parse(raw);
    if (!entry.savedAt || Date.now() - entry.savedAt > YOUTUBE_CACHE_TTL_MS) {
      localStorage.removeItem(youtubeCacheKey(query, region));
      return null;
    }
    return { ...entry.data, cache: { hit: true, source: "browser", expiresAt: entry.savedAt + YOUTUBE_CACHE_TTL_MS } };
  } catch { return null; }
}

function writeYouTubeCache(research, region) {
  if (!research?.query) return;
  try {
    localStorage.setItem(youtubeCacheKey(research.query, region), JSON.stringify({ savedAt: Date.now(), data: research }));
  } catch {}
}

function metric(value, kind) {
  return `<div class="metric ${kind}"><div class="bar"><i style="width:${Number(value)}%"></i></div><b>${Number(value)}</b></div>`;
}
function text(selector, value) { $(selector).textContent = normalizeLineBreaks(value); }
function normalizeLineBreaks(value) { return String(value ?? "").replace(/\\n/g, "\n"); }
function escapeHtml(value) { return String(value ?? "").replace(/[&<>'"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[c]); }
function escapeAttr(value) { return escapeHtml(value).replace(/`/g, "&#96;"); }
function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 3000);
}
