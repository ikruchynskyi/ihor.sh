// Yomu Daily Miniquiz & Gap Identification engine.
// Generates deterministic daily quizzes from graded stories, grammar compendium,
// and vocabulary decks across JLPT N5–N1, tracking knowledge gaps for 1-click remediation.

const W = typeof window === "undefined" ? {} : window;

// Universal fetcher (browser fetch + node fs for tests)
export async function loadJson(relPath) {
  if (typeof window === "undefined" && typeof process !== "undefined") {
    try {
      const fs = await import("node:fs/promises");
      const path = await import("node:path");
      const p = path.join(process.cwd(), relPath.replace(/^\//, ""));
      const raw = await fs.readFile(p, "utf-8");
      return JSON.parse(raw);
    } catch (e) {
      console.warn("loadJson node error:", relPath, e.message);
      return null;
    }
  }
  return fetch(relPath).then((r) => (r.ok ? r.json() : null)).catch(() => null);
}

// Deterministic PRNG for daily seeds
function sfc32(a, b, c, d) {
  return function() {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    var t = (a + b | 0) + d | 0;
    d = d + 1 | 0;
    a = b ^ b >>> 9;
    b = c + (c << 3) | 0;
    c = (c << 21 | c >>> 11);
    c = c + t | 0;
    return (t >>> 0) / 4294967296;
  };
}

export function createRng(seedStr) {
  if (!seedStr) return Math.random;
  let h1 = 1779033703 ^ seedStr.length, h2 = 3144134277 ^ seedStr.length;
  let h3 = 1013904242 ^ seedStr.length, h4 = 2773480762 ^ seedStr.length;
  for (let i = 0, k; i < seedStr.length; i++) {
    k = seedStr.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  return sfc32(h1, h2, h3, h4);
}

export function rngShuffle(arr, rng = Math.random) {
  const x = [...arr];
  for (let i = x.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [x[i], x[j]] = [x[j], x[i]];
  }
  return x;
}

// Caches for in-browser efficiency
let grammarCache = null;
let storyIndexCache = null;
const storyCache = new Map();
const vocabCache = new Map();
let kanjiCache = null;

export async function getGrammarData() {
  return (grammarCache ??= await loadJson("/yomu/data/grammar.json") || []);
}

export async function getStoryIndex() {
  return (storyIndexCache ??= await loadJson("/yomu/stories/index.json") || []);
}

export async function getStory(id) {
  if (storyCache.has(id)) return storyCache.get(id);
  const data = await loadJson(`/yomu/stories/${encodeURIComponent(id)}.json`);
  if (data) storyCache.set(id, data);
  return data;
}

export async function getVocab(level) {
  const lvl = level.toLowerCase();
  if (vocabCache.has(lvl)) return vocabCache.get(lvl);
  const data = await loadJson(`/yomu/data/vocab-${lvl}.json`) || [];
  vocabCache.set(lvl, data);
  return data;
}

export async function getKanjiData() {
  return (kanjiCache ??= await loadJson("/yomu/data/kanji.json") || []);
}

/**
 * Builds a standardized question object.
 * Ensures choices are deduplicated, shuffled with PRNG, and correctIndex points to answerText.
 */
export function normalizeQuestion({
  id,
  category,
  topic,
  level,
  prompt,
  promptPlain,
  hint,
  choices,
  answerText,
  why,
  link,
  audioText,
  rng = Math.random
}) {
  const cleanAnswer = String(answerText ?? "").trim();
  const rawChoices = choices.map((c) => String(c ?? "").trim()).filter(Boolean);
  if (!rawChoices.includes(cleanAnswer)) {
    rawChoices.unshift(cleanAnswer);
  }
  const uniqueChoices = [...new Set(rawChoices)];
  while (uniqueChoices.length < 3) {
    uniqueChoices.push(`Option ${uniqueChoices.length + 1}`);
  }
  const shuffledChoices = rngShuffle(uniqueChoices, rng);
  const correctIndex = shuffledChoices.indexOf(cleanAnswer);

  return {
    id,
    category,
    topic,
    level,
    prompt,
    promptPlain: promptPlain || prompt.replace(/<[^>]+>/g, ""),
    hint: hint || "",
    choices: shuffledChoices,
    correctIndex: correctIndex >= 0 ? correctIndex : 0,
    correctAnswerText: cleanAnswer,
    why: why || "",
    link: link || "/yomu/",
    audioText: audioText || promptPlain || prompt.replace(/<[^>]+>/g, "")
  };
}

/**
 * Builds Question 1: Story Dialogue & Comprehension Question
 */
export function buildStoryQuestion(storyMeta, storyData, qIndex, rng) {
  const questions = storyData.questions || [];
  if (!questions.length) return null;
  const q = questions[qIndex % questions.length];
  const answerText = q.choices[q.answer];

  return normalizeQuestion({
    id: `sq:${storyMeta.id}:${qIndex % questions.length}`,
    category: "Reading Comprehension",
    topic: `Story ${storyMeta.unit}: ${storyMeta.title.ja} (${storyMeta.title.en})`,
    level: storyMeta.level,
    prompt: q.q,
    promptPlain: q.q,
    hint: q.en ? `English: "${q.en}" · Context: ${storyData.scene || ""}` : (storyData.scene || ""),
    choices: q.choices,
    answerText,
    why: `From Story ${storyMeta.unit} (${storyMeta.title.ja}). ${storyData.scene ? `Scene: ${storyData.scene}` : ""}`,
    link: `/yomu/story.html?u=${storyMeta.id}`,
    audioText: q.q,
    rng
  });
}

/**
 * Builds Question 2: Story Grammar in Context Question
 */
export function buildStoryGrammarQuestion(storyMeta, storyData, gIndex, rng) {
  const grammarList = (storyData.grammar || []).filter((g) => g.quiz && g.quiz.length);
  if (!grammarList.length) return null;
  const gItem = grammarList[gIndex % grammarList.length];
  const quizItem = gItem.quiz[0];
  const answerText = quizItem.choices[quizItem.answer];

  return normalizeQuestion({
    id: `sg:${storyMeta.id}:${gIndex % grammarList.length}`,
    category: "Story Grammar",
    topic: gItem.title || `${storyMeta.title.ja} Grammar`,
    level: storyMeta.level,
    prompt: quizItem.q,
    promptPlain: quizItem.q,
    hint: quizItem.hint ? `Hint: ${quizItem.hint}` : `Grammar rule: ${gItem.explain}`,
    choices: quizItem.choices,
    answerText,
    why: quizItem.why || gItem.explain || "Correct grammatical form for this context.",
    link: gItem.lesson ? `/yomu/${gItem.lesson}` : `/yomu/story.html?u=${storyMeta.id}#grammar`,
    audioText: quizItem.q.replace(/＿|____|＿＿/g, answerText),
    rng
  });
}

/**
 * Builds Question 3 & 5: JLPT Grammar Cloze Question from Compendium
 */
export function buildGrammarClozeQuestion(grammarPoint, exIndex, rng) {
  const examples = grammarPoint.examples || [];
  if (!examples.length) return null;
  const ex = examples[exIndex % examples.length];
  const answerText = ex.answer;

  // Build sentence text with a highlighted blank
  const tokens = ex.t || [];
  const [blankStart, blankEnd] = ex.blank || [0, 0];
  const beforeTokens = tokens.slice(0, blankStart).map((t) => t[0]).join("");
  const afterTokens = tokens.slice(blankEnd).map((t) => t[0]).join("");
  const prompt = `${beforeTokens}<span class="blank">＿＿＿</span>${afterTokens}`;
  const fullSentence = `${beforeTokens}${answerText}${afterTokens}`;

  return normalizeQuestion({
    id: `g:${grammarPoint.id}`,
    category: "JLPT Grammar",
    topic: `${grammarPoint.pattern} (${grammarPoint.meaning})`,
    level: grammarPoint.level,
    prompt,
    promptPlain: `${beforeTokens}＿＿＿${afterTokens}`,
    hint: ex.en ? `English: "${ex.en}" · Rule: ${grammarPoint.meaning}` : `Meaning: ${grammarPoint.meaning}`,
    choices: ex.choices,
    answerText,
    why: `${grammarPoint.pattern}: ${grammarPoint.explain}`,
    link: `/yomu/grammar.html?level=${grammarPoint.level}#${grammarPoint.id}`,
    audioText: fullSentence,
    rng
  });
}

/**
 * Builds Question 4: Vocabulary or Kanji Question
 */
export function buildVocabQuestion(wordItem, level, distractors, rng) {
  const answerText = wordItem.m;
  const choices = [answerText, ...distractors.map((d) => d.m).filter((m) => m !== answerText).slice(0, 3)];

  return normalizeQuestion({
    id: `w:${wordItem.w}`,
    category: "Vocabulary",
    topic: `Word: 「${wordItem.w}」 (${wordItem.r})`,
    level,
    prompt: `What does the word <b class="jp" style="font-size:1.3em">「${wordItem.w}」</b> mean?`,
    promptPlain: `What does the word 「${wordItem.w}」 mean?`,
    hint: `Reading: ${wordItem.r}`,
    choices,
    answerText,
    why: `「${wordItem.w}」 is read 「${wordItem.r}」 and means: ${wordItem.m}.`,
    link: `/yomu/deck.html?level=${level}&type=words`,
    audioText: wordItem.r || wordItem.w,
    rng
  });
}

export function buildKanjiQuestion(kanjiItem, level, distractors, rng) {
  const ex = (kanjiItem.ex && kanjiItem.ex[0]) || [kanjiItem.k, kanjiItem.on[0] || "", kanjiItem.m[0] || ""];
  const [word, reading, meaning] = ex;
  const answerText = reading;
  const choices = [answerText, ...distractors.map((d) => (d.ex?.[0]?.[1] || d.on[0] || "")).filter((r) => r && r !== answerText).slice(0, 3)];

  return normalizeQuestion({
    id: `k:${kanjiItem.k}`,
    category: "Kanji & Reading",
    topic: `Kanji 「${kanjiItem.k}」 (${kanjiItem.m.slice(0, 2).join(", ")})`,
    level,
    prompt: `How is the kanji compound <b class="jp" style="font-size:1.3em">「${word}」</b> read?`,
    promptPlain: `How is the kanji compound 「${word}」 read?`,
    hint: `Meaning: "${meaning}" · Kanji: ${kanjiItem.k} (${kanjiItem.m[0]})`,
    choices,
    answerText,
    why: `「${word}」 is read 「${reading}」 (${meaning}). Kanji 「${kanjiItem.k}」 has on-reading: ${kanjiItem.on.join("、") || "—"}, kun-reading: ${kanjiItem.kun.join("、") || "—"}.`,
    link: `/yomu/kanji.html?k=${encodeURIComponent(kanjiItem.k)}`,
    audioText: word,
    rng
  });
}

/**
 * Builds Question 5: Particle / Sentence Nuance Question
 */
export function buildParticleQuestion(grammarList, pIndex, rng) {
  // Find grammar points that focus on particles or case markers
  const particlePoints = grammarList.filter((g) =>
    /は|が|を|に|で|へ|と|も|から|まで|より|ほど|だけ|しか|ばかり/i.test(g.pattern)
  );
  const point = particlePoints[pIndex % particlePoints.length] || grammarList[pIndex % grammarList.length];
  const q = buildGrammarClozeQuestion(point, 0, rng);
  if (q) {
    q.category = "Particles & Nuance";
  }
  return q;
}

/**
 * Generates the full 5-question Daily Miniquiz deterministically for a date and level.
 */
export async function generateDailyQuiz(dateStr, level = "N5", activeGaps = []) {
  const seed = `${dateStr}:${level}`;
  const rng = createRng(seed);

  const [grammar, stories, vocabList, kanjiList] = await Promise.all([
    getGrammarData(),
    getStoryIndex(),
    getVocab(level),
    getKanjiData()
  ]);

  const lvlGrammar = grammar.filter((g) => g.level === level);
  const lvlStories = stories.filter((s) => s.level === level);
  const lvlKanji = kanjiList.filter((k) => `N${k.n}` === level);

  // If no stories at this exact level, fall back to N5
  const activeStories = lvlStories.length ? lvlStories : stories;
  const activeGrammar = lvlGrammar.length ? lvlGrammar : grammar;

  // Pick story 1 and story 2 deterministically
  const s1Meta = activeStories[Math.floor(rng() * activeStories.length)];
  const s2Meta = activeStories[Math.floor(rng() * activeStories.length)];

  const [s1Data, s2Data] = await Promise.all([
    getStory(s1Meta.id),
    getStory(s2Meta.id)
  ]);

  const questions = [];

  // Q1: Story reading comprehension
  const q1 = buildStoryQuestion(s1Meta, s1Data, Math.floor(rng() * 10), rng);
  if (q1) questions.push(q1);

  // Q2: Story grammar or active gap question
  let q2 = null;
  // If user has active gaps at this level, weave one into Question 2 for recap!
  const relevantGaps = (activeGaps || []).filter((g) => g.level === level);
  if (relevantGaps.length && rng() > 0.3) {
    const gap = relevantGaps[Math.floor(rng() * relevantGaps.length)];
    q2 = await buildQuestionFromGap(gap, grammar, stories, rng);
  }
  if (!q2) {
    q2 = buildStoryGrammarQuestion(s2Meta, s2Data, Math.floor(rng() * 10), rng) ||
         buildGrammarClozeQuestion(activeGrammar[Math.floor(rng() * activeGrammar.length)], 0, rng);
  }
  if (q2) questions.push(q2);

  // Q3: JLPT Grammar compendium cloze
  const gIdx = Math.floor(rng() * activeGrammar.length);
  const q3 = buildGrammarClozeQuestion(activeGrammar[gIdx], 0, rng);
  if (q3) questions.push(q3);

  // Q4: Vocabulary or Kanji
  let q4 = null;
  if (lvlKanji.length && rng() > 0.5) {
    const kIdx = Math.floor(rng() * lvlKanji.length);
    const kDistractors = rngShuffle(lvlKanji, rng).slice(0, 4);
    q4 = buildKanjiQuestion(lvlKanji[kIdx], level, kDistractors, rng);
  } else if (vocabList.length) {
    const vIdx = Math.floor(rng() * vocabList.length);
    const vDistractors = rngShuffle(vocabList, rng).slice(0, 4);
    q4 = buildVocabQuestion(vocabList[vIdx], level, vDistractors, rng);
  }
  if (q4) questions.push(q4);

  // Q5: Particle & sentence structure check
  const q5 = buildParticleQuestion(activeGrammar, Math.floor(rng() * 50), rng);
  if (q5) questions.push(q5);

  // If we couldn't reach 5 questions, pad with grammar clozes
  let padIdx = 0;
  while (questions.length < 5 && padIdx < activeGrammar.length) {
    const padQ = buildGrammarClozeQuestion(activeGrammar[(gIdx + padIdx + 1) % activeGrammar.length], 0, rng);
    if (padQ && !questions.some((q) => q.id === padQ.id)) {
      questions.push(padQ);
    }
    padIdx++;
  }

  return questions.slice(0, 5);
}

/**
 * Builds a question directly from an identified knowledge gap.
 */
export async function buildQuestionFromGap(gap, grammarList, storyList, rng = Math.random) {
  if (!gap || !gap.id) return null;

  // 1. If gap is grammar ID: "g:da-desu" or "da-desu"
  const gid = gap.id.replace(/^g:/, "");
  const gPoint = (grammarList || []).find((g) => g.id === gid);
  if (gPoint) {
    const q = buildGrammarClozeQuestion(gPoint, Math.floor(rng() * (gPoint.examples?.length || 1)), rng);
    if (q) {
      q.isGapRecap = true;
      q.gapTitle = gap.title;
      return q;
    }
  }

  // 2. If gap is story grammar or question: "sq:n5-01:0" or "sg:n5-01:0"
  const m = gap.id.match(/^(sq|sg):([a-z0-9-]+):?(\d+)?/);
  if (m) {
    const [, type, storyId, idxStr] = m;
    const sMeta = (storyList || []).find((s) => s.id === storyId);
    if (sMeta) {
      const sData = await getStory(storyId);
      if (sData) {
        const idx = idxStr != null ? parseInt(idxStr, 10) : 0;
        const q = type === "sq"
          ? buildStoryQuestion(sMeta, sData, idx, rng)
          : buildStoryGrammarQuestion(sMeta, sData, idx, rng);
        if (q) {
          q.isGapRecap = true;
          q.gapTitle = gap.title;
          return q;
        }
      }
    }
  }

  // 3. Fallback: create review question from gap metadata
  if (gap.sampleQ && gap.why) {
    return normalizeQuestion({
      id: gap.id,
      category: gap.category || "Remediation",
      topic: gap.title,
      level: gap.level || "N5",
      prompt: gap.sampleQ,
      promptPlain: gap.sampleQ,
      hint: `Reviewing previous gap: ${gap.title}`,
      choices: ["正解 (Correct Rule)", "選択肢 B", "選択肢 C"],
      answerText: "正解 (Correct Rule)",
      why: gap.why,
      link: gap.link || "/yomu/",
      rng
    });
  }

  return null;
}

/**
 * Generates a targeted Gap Remediation Drill focusing strictly on active user gaps.
 */
export async function generateGapsQuiz(activeGaps, level = "N5") {
  const [grammar, stories] = await Promise.all([
    getGrammarData(),
    getStoryIndex()
  ]);

  const questions = [];
  const rng = Math.random;

  // Build a targeted question for each active gap
  for (const gap of activeGaps) {
    if (questions.length >= 5) break;
    const q = await buildQuestionFromGap(gap, grammar, stories, rng);
    if (q && !questions.some((existing) => existing.id === q.id)) {
      questions.push(q);
    }
  }

  // If fewer than 5 gaps, pad with daily quiz items
  if (questions.length < 5) {
    const today = new Date().toISOString().slice(0, 10);
    const filler = await generateDailyQuiz(today, level, []);
    for (const f of filler) {
      if (questions.length >= 5) break;
      if (!questions.some((q) => q.id === f.id)) {
        questions.push(f);
      }
    }
  }

  return questions;
}

/**
 * Format shareable score text (Wordle style)
 */
export function formatQuizShareText(dateStr, level, score, total, streak = 1) {
  const blocks = Array.from({ length: total }, (_, i) => (i < score ? "🟩" : "🟥")).join("");
  const title = score === total ? "満点 (manten)! Perfect" : `${score}/${total}`;
  return `Yomu Daily Miniquiz · ${dateStr} (${level})
${title} ${blocks}
🔥 ${streak} day streak
https://ihor.sh/yomu/quiz.html`;
}
