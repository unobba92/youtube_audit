import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL(".", import.meta.url));
const PUBLIC = join(ROOT, "public");

await loadEnv(join(ROOT, ".env"));

const PORT = Number(process.env.PORT || 4173);
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-5.5";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

const ANALYSIS_SCHEMA = {
  type: "object",
  properties: {
    summary: {
      type: "object",
      properties: {
        score: { type: "integer", minimum: 0, maximum: 100 },
        verdict: { type: "string" },
        hook: { type: "string" },
        audience: { type: "string" },
        risk: { type: "string" },
      },
      required: ["score", "verdict", "hook", "audience", "risk"],
      additionalProperties: false,
    },
    keywords: {
      type: "array",
      minItems: 5,
      maxItems: 8,
      items: {
        type: "object",
        properties: {
          keyword: { type: "string" },
          demand: { type: "integer", minimum: 0, maximum: 100 },
          competition: { type: "integer", minimum: 0, maximum: 100 },
          opportunity: { type: "integer", minimum: 0, maximum: 100 },
          trend: { type: "string", enum: ["상승", "유지", "하락", "데이터 부족"] },
          rationale: { type: "string" },
        },
        required: ["keyword", "demand", "competition", "opportunity", "trend", "rationale"],
        additionalProperties: false,
      },
    },
    titles: {
      type: "array",
      minItems: 5,
      maxItems: 5,
      items: {
        type: "object",
        properties: {
          text: { type: "string" },
          score: { type: "integer", minimum: 0, maximum: 100 },
          angle: { type: "string" },
        },
        required: ["text", "score", "angle"],
        additionalProperties: false,
      },
    },
    thumbnail: {
      type: "object",
      properties: {
        headline: { type: "string" },
        subcopy: { type: "string" },
        visual: { type: "string" },
        palette: { type: "string" },
        avoid: { type: "string" },
      },
      required: ["headline", "subcopy", "visual", "palette", "avoid"],
      additionalProperties: false,
    },
    description: {
      type: "object",
      properties: {
        opening: { type: "string" },
        body: { type: "string" },
        hashtags: { type: "array", items: { type: "string" }, minItems: 3, maxItems: 5 },
      },
      required: ["opening", "body", "hashtags"],
      additionalProperties: false,
    },
    tags: { type: "array", items: { type: "string" }, minItems: 6, maxItems: 15 },
    contentPlan: {
      type: "object",
      properties: {
        hook: { type: "string" },
        sections: { type: "array", items: { type: "string" }, minItems: 3, maxItems: 7 },
        cta: { type: "string" },
      },
      required: ["hook", "sections", "cta"],
      additionalProperties: false,
    },
    checks: {
      type: "array",
      minItems: 3,
      maxItems: 7,
      items: {
        type: "object",
        properties: {
          level: { type: "string", enum: ["좋음", "주의", "개선"] },
          item: { type: "string" },
          detail: { type: "string" },
        },
        required: ["level", "item", "detail"],
        additionalProperties: false,
      },
    },
  },
  required: ["summary", "keywords", "titles", "thumbnail", "description", "tags", "contentPlan", "checks"],
  additionalProperties: false,
};

export async function handleRequest(req, res) {
  try {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

    if (req.method === "GET" && url.pathname === "/api/status") {
      return json(res, 200, {
        openai: Boolean(process.env.OPENAI_API_KEY),
        gemini: Boolean(process.env.GEMINI_API_KEY),
        youtube: Boolean(process.env.YOUTUBE_API_KEY),
        trends: false,
        model: process.env.GEMINI_API_KEY ? GEMINI_MODEL : (process.env.OPENAI_API_KEY ? OPENAI_MODEL : null),
      });
    }

    if (req.method === "POST" && url.pathname === "/api/youtube-search") {
      if (!process.env.YOUTUBE_API_KEY) {
        return json(res, 400, { error: "YOUTUBE_API_KEY가 설정되지 않았습니다." });
      }
      const body = await readJson(req);
      const query = clean(body.query, 100);
      if (query.length < 2) return json(res, 400, { error: "검색어를 2자 이상 입력해주세요." });
      const context = { region: clean(body.region, 10) || "KR", brief: query };
      const research = await researchYouTube(context, query);
      return json(res, 200, { research });
    }

    if (req.method === "POST" && url.pathname === "/api/analyze") {
      const body = await readJson(req);
      const brief = String(body.brief || "").trim();
      if (brief.length < 30) return json(res, 400, { error: "기획안을 30자 이상 입력해주세요." });
      if (brief.length > 20000) return json(res, 400, { error: "기획안은 20,000자 이하로 입력해주세요." });

      const context = {
        brief,
        audience: clean(body.audience, 200),
        format: clean(body.format, 60) || "정보형",
        duration: clean(body.duration, 20) === "숏폼" ? "숏폼" : "롱폼",
        topic: clean(body.topic, 100),
        region: clean(body.region, 10) || "KR",
      };
      context.resolvedTopic = context.topic || inferTopicHeuristic(context.brief);

      const requestedProvider = ["auto", "gemini", "openai"].includes(body.provider) ? body.provider : "auto";
      if (requestedProvider === "gemini" && !process.env.GEMINI_API_KEY) {
        return json(res, 400, { error: "Gemini가 선택됐지만 GEMINI_API_KEY가 없습니다." });
      }
      if (requestedProvider === "openai" && !process.env.OPENAI_API_KEY) {
        return json(res, 400, { error: "GPT가 선택됐지만 OPENAI_API_KEY가 없습니다." });
      }
      const selectedProvider = requestedProvider === "gemini" ? "gemini"
        : requestedProvider === "openai" ? "openai"
        : process.env.GEMINI_API_KEY ? "gemini"
        : process.env.OPENAI_API_KEY ? "openai" : "demo";

      let research = null;
      let youtubeError = null;
      if (process.env.YOUTUBE_API_KEY) {
        let researchQuery = context.resolvedTopic;
        if (!context.topic && selectedProvider !== "demo") {
          try {
            researchQuery = await inferSearchQuery(context, selectedProvider);
            context.resolvedTopic = researchQuery;
          }
          catch (error) { youtubeError = `검색어 AI 판단 실패, 보조 분석 사용: ${error.message}`; }
        }
        try { research = await researchYouTube(context, researchQuery); }
        catch (error) { youtubeError = error.message; }
      }

      let analysis;
      let aiError = null;
      let aiProvider = null;
      if (selectedProvider === "gemini") {
        try {
          analysis = await analyzeWithGemini(context, research);
          aiProvider = `Google Gemini ${GEMINI_MODEL}`;
        } catch (error) { aiError = error.message; }
      } else if (selectedProvider === "openai") {
        try { analysis = await analyzeWithOpenAI(context, research); }
        catch (error) { aiError = error.message; }
        if (analysis) aiProvider = `OpenAI ${OPENAI_MODEL}`;
      }
      if (!analysis) analysis = demoAnalysis(context, research);

      const mode = aiProvider
        ? (research ? "AI + YouTube 실데이터" : "AI 분석")
        : (research ? "규칙 분석 + YouTube 실데이터" : "데모 분석");

      return json(res, 200, {
        ...analysis,
        meta: {
          mode,
          generatedAt: new Date().toISOString(),
          sources: [research ? "YouTube Data API" : "YouTube 예측치", aiProvider || "내장 분석기"],
          warnings: [aiError && `AI 연결 실패: ${aiError}`, youtubeError && `YouTube 연결 실패: ${youtubeError}`].filter(Boolean),
        },
        research,
      });
    }

    if (req.method !== "GET" && req.method !== "HEAD") return json(res, 405, { error: "허용되지 않은 요청입니다." });
    return serveStatic(url.pathname, res, req.method === "HEAD");
  } catch (error) {
    console.error(error);
    return json(res, 500, { error: "분석 중 문제가 발생했습니다.", detail: error.message });
  }
}

const isMainModule = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMainModule) {
  createServer(handleRequest).listen(PORT, "127.0.0.1", () => {
    console.log(`유튜브 기획 검수실: http://localhost:${PORT}`);
  });
}

async function analyzeWithGemini(context, research) {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": process.env.GEMINI_API_KEY,
    },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: [
          "당신은 한국 유튜브 성장 전략가다.",
          "기획안의 시청자 약속, 클릭 동기, 시청 지속 가능성, 검색 의도를 냉정하게 평가한다.",
          "제공된 YouTube 데이터가 없으면 검색량을 실제 수치처럼 단정하지 말고 추정치로 다룬다.",
          "제목은 과장 없이 자연스러운 한국어로 작성하고, 썸네일 문구는 가급적 2~6어절로 제한한다.",
          "태그보다 제목·썸네일·설명의 중요도가 높다는 원칙을 따른다.",
          context.duration === "숏폼"
            ? "숏폼으로 설계한다. 첫 1초 훅, 60초 이내 전개, 한 가지 메시지, 빠른 장면 전환에 맞춰 구성한다."
            : "롱폼으로 설계한다. 첫 15초 훅, 충분한 근거와 사례, 챕터별 전개와 시청 지속 장치를 포함한다.",
        ].join(" ") }],
      },
      contents: [{
        role: "user",
        parts: [{ text: `다음 유튜브 기획안을 검수해 실행 가능한 업로드 패키지를 만드세요.\n\n대상: ${context.audience || "미지정"}\n콘텐츠 종류: ${context.format}\n영상 길이: ${context.duration}\n핵심 검색 주제: ${research?.query || context.resolvedTopic}\n지역: ${context.region}\n\n기획안:\n${context.brief}\n\nYouTube 조사 데이터:\n${research ? JSON.stringify(research) : "없음 — 수요와 경쟁 점수는 보수적 추정치로 표시"}` }],
      }],
      generationConfig: {
        responseMimeType: "application/json",
        responseJsonSchema: ANALYSIS_SCHEMA,
        maxOutputTokens: 7000,
        temperature: 0.45,
      },
    }),
  });

  const payload = await response.json();
  if (!response.ok) throw new Error(payload?.error?.message || `Gemini HTTP ${response.status}`);
  const output = payload?.candidates?.[0]?.content?.parts?.map(part => part.text || "").join("");
  if (!output) {
    const reason = payload?.candidates?.[0]?.finishReason || payload?.promptFeedback?.blockReason || "빈 응답";
    throw new Error(`Gemini 분석 결과가 없습니다: ${reason}`);
  }
  return JSON.parse(output);
}

async function analyzeWithOpenAI(context, research) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      input: [
        {
          role: "system",
          content: [
            "당신은 한국 유튜브 성장 전략가다.",
            "기획안의 시청자 약속, 클릭 동기, 시청 지속 가능성, 검색 의도를 냉정하게 평가한다.",
            "제공된 YouTube 데이터가 없으면 검색량을 실제 수치처럼 단정하지 말고 추정치로 다룬다.",
          "제목은 과장 없이 자연스러운 한국어로 작성하고, 썸네일 문구는 가급적 2~6어절로 제한한다.",
          "태그보다 제목·썸네일·설명의 중요도가 높다는 원칙을 따른다.",
          context.duration === "숏폼"
            ? "숏폼으로 설계한다. 첫 1초 훅, 60초 이내 전개, 한 가지 메시지, 빠른 장면 전환에 맞춰 구성한다."
            : "롱폼으로 설계한다. 첫 15초 훅, 충분한 근거와 사례, 챕터별 전개와 시청 지속 장치를 포함한다.",
          ].join(" "),
        },
        {
          role: "user",
          content: `다음 유튜브 기획안을 검수해 실행 가능한 업로드 패키지를 만드세요.\n\n대상: ${context.audience || "미지정"}\n콘텐츠 종류: ${context.format}\n영상 길이: ${context.duration}\n핵심 검색 주제: ${research?.query || context.resolvedTopic}\n지역: ${context.region}\n\n기획안:\n${context.brief}\n\nYouTube 조사 데이터:\n${research ? JSON.stringify(research) : "없음 — 수요와 경쟁 점수는 보수적 추정치로 표시"}`,
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "youtube_plan_audit",
          schema: ANALYSIS_SCHEMA,
          strict: true,
        },
      },
      max_output_tokens: 7000,
    }),
  });

  const payload = await response.json();
  if (!response.ok) throw new Error(payload?.error?.message || `OpenAI HTTP ${response.status}`);
  if (!payload.output_text) throw new Error("구조화된 분석 결과가 비어 있습니다.");
  return JSON.parse(payload.output_text);
}

async function inferSearchQuery(context, provider) {
  const prompt = [
    "다음 유튜브 기획안에서 시청자가 실제 유튜브 검색창에 입력할 핵심 주제어를 2~5어절로 하나만 고르세요.",
    "콘텐츠의 대상·사물·문제·정보 주제를 우선하고, 제작 방식이나 톤은 제외하세요.",
    "특히 롱폼, 숏폼, 빠른 폼, 짧게, 재미있게, 쉽게, 알기 쉽게, 만든다, 소개한다 같은 표현은 검색어에 넣지 마세요.",
    `기획안: ${context.brief}`,
  ].join("\n");

  if (provider === "gemini") {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseJsonSchema: {
            type: "object",
            properties: { query: { type: "string", description: "유튜브 검색용 핵심 주제어 2~5어절" } },
            required: ["query"], additionalProperties: false,
          },
          temperature: 0.1,
        },
      }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.error?.message || `Gemini HTTP ${response.status}`);
    const output = payload?.candidates?.[0]?.content?.parts?.map(part => part.text || "").join("");
    return clean(JSON.parse(output).query, 100) || inferTopicHeuristic(context.brief);
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      input: prompt,
      text: { format: {
        type: "json_schema", name: "youtube_search_query", strict: true,
        schema: {
          type: "object", properties: { query: { type: "string" } },
          required: ["query"], additionalProperties: false,
        },
      } },
      max_output_tokens: 100,
    }),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload?.error?.message || `OpenAI HTTP ${response.status}`);
  return clean(JSON.parse(payload.output_text).query, 100) || inferTopicHeuristic(context.brief);
}

async function researchYouTube(context, topic) {
  topic = clean(topic, 100) || inferTopicHeuristic(context.brief);
  const key = process.env.YOUTUBE_API_KEY;
  const searchUrl = new URL("https://www.googleapis.com/youtube/v3/search");
  searchUrl.search = new URLSearchParams({
    part: "snippet", type: "video", maxResults: "10", order: "relevance",
    q: topic, regionCode: context.region, relevanceLanguage: context.region === "KR" ? "ko" : "en", key,
  });
  const searchRes = await fetch(searchUrl);
  const searchData = await searchRes.json();
  if (!searchRes.ok) throw new Error(searchData?.error?.message || "YouTube 검색 실패");

  const ids = searchData.items.map(item => item.id.videoId).filter(Boolean);
  if (!ids.length) return { query: topic, totalResults: 0, competitionScore: 15, topVideos: [] };

  const videosUrl = new URL("https://www.googleapis.com/youtube/v3/videos");
  videosUrl.search = new URLSearchParams({ part: "snippet,statistics", id: ids.join(","), key });
  const videosRes = await fetch(videosUrl);
  const videosData = await videosRes.json();
  if (!videosRes.ok) throw new Error(videosData?.error?.message || "YouTube 영상 통계 조회 실패");

  const topVideos = videosData.items.map(item => ({
    videoId: item.id,
    url: `https://www.youtube.com/watch?v=${item.id}`,
    title: item.snippet.title,
    channel: item.snippet.channelTitle,
    publishedAt: item.snippet.publishedAt,
    views: Number(item.statistics.viewCount || 0),
    likes: Number(item.statistics.likeCount || 0),
  })).sort((a, b) => b.views - a.views);

  const views = topVideos.map(v => v.views).sort((a, b) => a - b);
  const medianViews = views.length ? views[Math.floor(views.length / 2)] : 0;
  const recentCount = topVideos.filter(v => Date.now() - Date.parse(v.publishedAt) < 365 * 86400000).length;
  const resultWeight = Math.min(35, Math.log10(Math.max(10, searchData.pageInfo?.totalResults || 10)) * 8);
  const viewWeight = Math.min(45, Math.log10(Math.max(1, medianViews)) * 8);
  const freshWeight = recentCount * 2;

  return {
    query: topic,
    totalResults: searchData.pageInfo?.totalResults || 0,
    medianViews,
    recentTop10: recentCount,
    competitionScore: Math.round(Math.min(100, resultWeight + viewWeight + freshWeight)),
    topVideos: topVideos.slice(0, 5),
  };
}

function demoAnalysis(context, research) {
  const words = extractKeywords(context.brief, 8);
  const primary = research?.query || context.resolvedTopic || words[0] || "핵심 주제";
  const secondary = words[1] || "실전 방법";
  const isShort = context.duration === "숏폼";
  const baseCompetition = research?.competitionScore ?? 58;
  const seed = hash(context.brief);
  const keywordPhrases = unique([
    primary, `${primary} 방법`, `${primary} 초보`, `${primary} 실전`, `${primary} 추천`, `${primary} ${secondary}`, `${primary} 비교`, `${primary} 주의점`,
  ]).slice(0, 8);

  const keywords = keywordPhrases.map((keyword, index) => {
    const demand = clamp(48 + ((seed >> (index % 8)) % 31) - index * 2);
    const competition = clamp(baseCompetition - index * 3 + ((seed >> ((index + 3) % 8)) % 13));
    const opportunity = clamp(Math.round(demand * 0.62 + (100 - competition) * 0.38));
    return {
      keyword, demand, competition, opportunity,
      trend: index < 2 ? "상승" : index < 6 ? "유지" : "데이터 부족",
      rationale: research ? "YouTube 상위 검색 결과를 반영한 상대 점수" : "기획안의 검색 의도와 표현 구체성을 바탕으로 한 예측치",
    };
  });

  const score = Math.round(keywords.slice(0, 4).reduce((sum, k) => sum + k.opportunity, 0) / Math.min(4, keywords.length));
  return {
    summary: {
      score,
      verdict: score >= 70 ? "주제는 좋습니다. 약속을 더 선명하게 만들면 바로 제작할 수 있어요." : "가능성은 있지만 타깃과 결과 약속을 더 좁혀야 합니다.",
      hook: `${primary}에서 사람들이 가장 자주 놓치는 한 가지를 먼저 보여주세요.`,
      audience: context.audience || `${primary}를 처음 시작하거나 결과가 막힌 시청자`,
      risk: isShort ? "첫 1초 안에 핵심 장면이 나오지 않으면 바로 이탈할 수 있습니다." : "도입부가 설명 위주로 길어지면 핵심 결과를 보기 전에 이탈할 수 있습니다.",
    },
    keywords,
    titles: [
      { text: `${primary}, 처음이라면 이것부터 보세요`, score: 91, angle: "초보자 길잡이" },
      { text: `${primary} 직접 해보니 달랐던 5가지`, score: 88, angle: "경험·검증" },
      { text: `${primary} 잘하는 사람은 ${secondary}부터 다릅니다`, score: 86, angle: "차이 발견" },
      { text: `${primary} 실패하는 이유, 의외로 간단합니다`, score: 84, angle: "문제 해결" },
      { text: `${primary} 완전정복: 준비부터 결과까지`, score: 80, angle: "종합 가이드" },
    ],
    thumbnail: {
      headline: `${primary}, 이렇게`,
      subcopy: "결과가 달라집니다",
      visual: "화면을 전후 비교로 나누고, 오른쪽 결과물을 크게 배치하세요. 인물이 있다면 결과 쪽을 바라보게 합니다.",
      palette: "짙은 네이비 배경 + 크림색 본문 + 핵심 단어만 유튜브 레드",
      avoid: "제목 전체를 반복하거나 작은 아이콘을 여러 개 넣지 마세요.",
    },
    description: {
      opening: `${primary}를 시작할 때 가장 먼저 알아야 할 기준과 실제 적용 순서를 정리했습니다.`,
      body: `이 영상에서는 ${secondary}를 포함해 처음부터 결과까지 이어지는 핵심 단계를 다룹니다. 막연한 팁보다 바로 적용할 수 있는 판단 기준에 집중했습니다.`,
      hashtags: [`#${safeTag(primary)}`, `#${safeTag(secondary)}`, "#유튜브가이드"],
    },
    tags: unique([primary, secondary, `${primary} 방법`, `${primary} 초보`, `${primary} 추천`, `${primary} 실전`, "유튜브 정보", "실전 가이드"]),
    contentPlan: {
      hook: isShort ? `첫 1초에 ${primary}의 가장 헷갈리는 장면을 바로 보여주세요.` : `첫 15초에 ${primary}의 실패 사례와 개선 결과를 나란히 보여주세요.`,
      sections: isShort
        ? ["0~1초: 결과 또는 반전", "2~12초: 문제를 한 문장으로 설명", "13~40초: 핵심 구분법", "41~55초: 적용 예시", "마지막 5초: 한 줄 요약"]
        : ["문제 상황과 시청자가 얻게 될 결과", "가장 중요한 판단 기준 3가지", "실제 적용 과정", "흔한 실패와 수정법", "핵심 요약"],
      cta: isShort ? "한 단어로 답할 수 있는 댓글 질문으로 끝내세요." : "시청자의 현재 상황을 댓글로 받는 구체적인 질문으로 마무리하세요.",
    },
    checks: [
      { level: "좋음", item: "검색 의도", detail: `${primary} 중심으로 정보 탐색 의도가 분명합니다.` },
      { level: "개선", item: "결과 약속", detail: "시청 후 무엇이 가능해지는지 한 문장으로 더 구체화하세요." },
      { level: "주의", item: "초반 이탈", detail: "배경 설명은 줄이고 결과 화면을 먼저 제시하세요." },
      { level: "좋음", item: "확장성", detail: "초보·비교·실전 편으로 후속 콘텐츠를 만들 수 있습니다." },
    ],
  };
}

function extractKeywords(text, limit = 8) {
  const stop = new Set(["그리고", "하지만", "그래서", "대한", "위한", "하는", "있는", "없는", "영상", "유튜브", "콘텐츠", "기획", "방법", "정도", "관련", "통해", "이번", "제가", "우리", "하려고", "합니다", "해주세요", "만든다", "만들기", "소개한다", "재미있게", "재미잇게", "재미있고", "재미잇고", "알기쉽게", "쉽게", "빠른폼으로", "빠른폼", "롱폼", "숏폼", "짧게", "헷갈리는"]);
  const tokens = text.toLowerCase().match(/[가-힣a-z0-9]{2,}/g) || [];
  const counts = new Map();
  for (const token of tokens) {
    if (stop.has(token) || /^\d+$/.test(token)) continue;
    counts.set(token, (counts.get(token) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0].length - a[0].length).slice(0, limit).map(([word]) => word);
}

function inferTopicHeuristic(text) {
  const cleaned = String(text)
    .replace(/(헷갈리는|롱폼|숏폼|빠른\s*폼(?:으로)?|쇼츠|재미있게|재미잇게|재미있고|재미잇고|알기\s*쉽게|쉽게|짧게|빠르게|만든다|만들기|소개한다|설명한다)/gi, " ")
    .replace(/\s+/g, " ").trim();
  const phrase = cleaned.match(/([가-힣a-z0-9]{2,})\s+([가-힣a-z0-9]{2,})(?:을|를|이|가|에|의|은|는)?/i);
  if (phrase) return `${stripParticle(phrase[1])} ${stripParticle(phrase[2])}`.trim();
  return extractKeywords(cleaned, 2).join(" ") || text.slice(0, 60);
}

function stripParticle(word) {
  return String(word).replace(/(으로|에서|에게|까지|부터|처럼|보다|이랑|하고|과|와|을|를|이|가|은|는|의|에)$/u, "");
}

function clean(value, max) { return String(value || "").trim().slice(0, max); }
function clamp(n) { return Math.max(0, Math.min(100, Number(n) || 0)); }
function unique(items) { return [...new Set(items.filter(Boolean))]; }
function safeTag(value) { return String(value).replace(/[^가-힣a-zA-Z0-9]/g, ""); }
function hash(text) { let h = 2166136261; for (const char of text) h = Math.imul(h ^ char.charCodeAt(0), 16777619); return h >>> 0; }

async function serveStatic(pathname, res, headOnly) {
  const requested = pathname === "/" ? "/index.html" : pathname;
  const safe = normalize(requested).replace(/^(\.\.[/\\])+/, "");
  const file = join(PUBLIC, safe);
  if (!file.startsWith(PUBLIC)) return json(res, 403, { error: "접근할 수 없습니다." });
  try {
    const info = await stat(file);
    if (!info.isFile()) throw new Error("not file");
    const data = headOnly ? null : await readFile(file);
    res.writeHead(200, { "Content-Type": MIME[extname(file)] || "application/octet-stream", "Cache-Control": "no-cache" });
    res.end(data);
  } catch {
    json(res, 404, { error: "페이지를 찾을 수 없습니다." });
  }
}

function json(res, status, value) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(value));
}

async function readJson(req) {
  if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === "string") {
    try { return JSON.parse(req.body || "{}"); }
    catch { throw new Error("잘못된 JSON 요청입니다."); }
  }
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 1_000_000) throw new Error("요청이 너무 큽니다.");
  }
  try { return JSON.parse(raw || "{}"); }
  catch { throw new Error("잘못된 JSON 요청입니다."); }
}

async function loadEnv(path) {
  try {
    const content = await readFile(path, "utf8");
    for (const line of content.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!match || match[2].startsWith("#")) continue;
      const value = match[2].replace(/^(["'])(.*)\1$/, "$2");
      if (!(match[1] in process.env)) process.env[match[1]] = value;
    }
  } catch {}
}
