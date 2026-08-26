"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Asset, Question, Source } from "@/src/content/types";
import { recordAnswer } from "./learning";
import {
  emptyProgress,
  exportProgress,
  importProgress,
  loadProgress,
  requestPersistentStorage,
  saveProgress,
  type ProgressState,
} from "./storage";

type View = "home" | "learn" | "quiz" | "review" | "sources";
type CountryFilter = "ALL" | "NO" | "IS";
type CategoryFilter = "ALL" | Question["category"];

const countryName = { NO: "挪威", IS: "冰岛" } as const;
const categoryName: Record<string, string> = {
  priority: "行程重点",
  signs: "标志识别",
  speed: "限速",
  lights: "灯光",
  safety: "安全驾驶",
  weather: "天气路况",
  parking: "停车",
  tolls: "收费",
  vehicles: "车辆",
};

const categoryOrder: Question["category"][] = [
  "safety",
  "priority",
  "speed",
  "lights",
  "signs",
  "parking",
  "tolls",
  "weather",
  "vehicles",
];

const foundationQuestionIds = [
  "no-seatbelts",
  "is-seatbelts",
  "is-child-seat",
  "is-handsfree",
  "no-alcohol-breath",
  "is-alcohol-threshold",
  "no-roundabout-yield",
  "no-roundabout-lane",
  "is-roundabout",
  "p3-no-bus-leaving-stop",
  "p3-no-turning-yield-users",
  "p3-no-overtaking-side-and-ban",
  "p3-no-cyclist-pedestrian-crossing",
  "p3-is-single-lane-bridge-priority",
  "p3-is-cyclist-clearance",
  "no-speed-default",
  "is-urban-speed",
  "is-gravel-speed",
  "no-lights-tunnel",
  "is-lights",
] as const;

const learningStages = [
  { id: "basics", number: "01", title: "基本交规", copy: "安全、让行、限速与灯光" },
  { id: "signs", number: "02", title: "官方标志", copy: "认识两国真实道路标志" },
  { id: "local", number: "03", title: "地区规则", copy: "处罚、停车、收费与路况" },
  { id: "scenarios", number: "04", title: "开放情境", copy: "游客踩坑与进阶判断" },
] as const;

type LearningStage = (typeof learningStages)[number]["id"];

function getLearningStage(question: Question): LearningStage {
  if ((foundationQuestionIds as readonly string[]).includes(question.id)) return "basics";
  if (question.category === "signs") return "signs";
  if (question.difficulty === "advanced") return "scenarios";
  return "local";
}

function compareCurriculum(a: Question, b: Question) {
  const stageDifference = learningStages.findIndex((stage) => stage.id === getLearningStage(a))
    - learningStages.findIndex((stage) => stage.id === getLearningStage(b));
  if (stageDifference) return stageDifference;
  if (getLearningStage(a) === "basics") {
    return foundationQuestionIds.indexOf(a.id as (typeof foundationQuestionIds)[number])
      - foundationQuestionIds.indexOf(b.id as (typeof foundationQuestionIds)[number]);
  }
  const categoryDifference = categoryOrder.indexOf(a.category) - categoryOrder.indexOf(b.category);
  if (categoryDifference) return categoryDifference;
  if (a.tripPriority !== b.tripPriority) return a.tripPriority - b.tripPriority;
  if (a.country !== b.country) return a.country === "NO" ? -1 : 1;
  return a.id.localeCompare(b.id);
}

function learningStageName(question: Question) {
  return learningStages.find((stage) => stage.id === getLearningStage(question))?.title ?? "课程";
}

function shuffled<T>(items: T[]) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

function getAsset(question: Question, assets: Asset[]) {
  return assets.find((asset) => question.assetIds.includes(asset.id));
}

function assetSrc(asset: Asset) {
  return asset.localPath
    ? asset.localPath.replace(/^public[\\/]/, "").replaceAll("\\", "/")
    : asset.url;
}

function localAppUrl(path = "") {
  const appRoot = new URL("./", window.location.href);
  return new URL(path.replace(/^\/+/, ""), appRoot).href;
}

function restrictProgressToPublished(progress: ProgressState, allowedIds: Set<string>): ProgressState {
  return {
    ...progress,
    completedIds: progress.completedIds.filter((id) => allowedIds.has(id)),
    favorites: progress.favorites.filter((id) => allowedIds.has(id)),
    wrong: Object.fromEntries(Object.entries(progress.wrong).filter(([id]) => allowedIds.has(id))),
    refresh: Object.fromEntries(Object.entries(progress.refresh).filter(([id]) => allowedIds.has(id))),
  };
}

export function RoadReadyApp({
  questions,
  sources,
  assets,
}: {
  questions: Question[];
  sources: Source[];
  assets: Asset[];
}) {
  const published = useMemo(
    () => questions.filter((question) => question.status === "published"),
    [questions],
  );
  const orderedPublished = useMemo(
    () => [...published].sort(compareCurriculum),
    [published],
  );
  const [view, setView] = useState<View>("home");
  const [country, setCountry] = useState<CountryFilter>("ALL");
  const [category, setCategory] = useState<CategoryFilter>("ALL");
  const [visibleLessonCount, setVisibleLessonCount] = useState(40);
  const [progress, setProgress] = useState<ProgressState>(emptyProgress);
  const [quizIds, setQuizIds] = useState<string[]>([]);
  const [quizIndex, setQuizIndex] = useState(0);
  const [quizCorrect, setQuizCorrect] = useState(0);
  const [quizComplete, setQuizComplete] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [checked, setChecked] = useState(false);
  const [storageMessage, setStorageMessage] = useState("尚未检查");
  const [offlinePackMessage, setOfflinePackMessage] = useState("尚未下载完整离线包");
  const importRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const publishedIds = new Set(published.map((question) => question.id));
    loadProgress()
      .then((stored) => setProgress(restrictProgressToPublished(stored, publishedIds)))
      .catch(() => setProgress(emptyProgress));
    const downloadedAt = window.localStorage.getItem("offline-pack-downloaded-at");
    if (downloadedAt) {
      Promise.resolve().then(() => setOfflinePackMessage(`最近下载：${downloadedAt}`));
    }
  }, [published]);

  const filtered = useMemo(
    () => orderedPublished.filter((question) =>
      (country === "ALL" || question.country === country) &&
      (category === "ALL" || question.category === category),
    ),
    [category, country, orderedPublished],
  );
  const availableCategories = useMemo(
    () => categoryOrder.filter((item) => published.some((question) => question.category === item)),
    [published],
  );
  const dueIds = useMemo(
    () =>
      Object.entries(progress.wrong)
        .filter(([, item]) => new Date(item.dueAt) <= new Date())
        .map(([id]) => id),
    [progress.wrong],
  );
  const refreshDueIds = useMemo(
    () => Object.entries(progress.refresh)
      .filter(([, dueAt]) => new Date(dueAt) <= new Date())
      .map(([id]) => id),
    [progress.refresh],
  );
  const quizQuestions = useMemo(
    () => quizIds.map((id) => published.find((item) => item.id === id)).filter(Boolean) as Question[],
    [published, quizIds],
  );
  const currentQuestion = quizQuestions[quizIndex];
  const currentAsset = currentQuestion ? getAsset(currentQuestion, assets) : undefined;
  const currentAnswerCorrect = currentQuestion
    ? [...currentQuestion.correctOptionIds].sort().join("|") === [...selected].sort().join("|")
    : false;

  function persist(next: ProgressState) {
    setProgress(next);
    void saveProgress(next);
  }

  function startQuiz(mode: "course" | "country" | "exam" | "review" | "all-wrong" | "favorites") {
    let pool = filtered;
    if (mode === "course") {
      const pending = orderedPublished.filter((question) => !progress.completedIds.includes(question.id));
      const completed = orderedPublished.filter((question) => progress.completedIds.includes(question.id));
      pool = [...pending, ...completed];
    }
    if (mode === "review") pool = published.filter((question) => dueIds.includes(question.id) || refreshDueIds.includes(question.id));
    if (mode === "all-wrong") pool = published.filter((question) => question.id in progress.wrong);
    if (mode === "favorites") pool = published.filter((question) => progress.favorites.includes(question.id));
    if (mode !== "course") pool = shuffled(pool);
    const limit = mode === "exam" ? 40 : mode === "course" ? 10 : 12;
    setQuizIds(pool.slice(0, limit).map((question) => question.id));
    setQuizIndex(0);
    setQuizCorrect(0);
    setQuizComplete(false);
    setSelected([]);
    setChecked(false);
    setView("quiz");
  }

  function submitAnswer() {
    if (!currentQuestion || selected.length === 0) return;
    const expected = [...currentQuestion.correctOptionIds].sort().join("|");
    const actual = [...selected].sort().join("|");
    const isCorrect = expected === actual;
    persist(recordAnswer(progress, currentQuestion.id, isCorrect));
    if (isCorrect) setQuizCorrect((count) => count + 1);
    setChecked(true);
  }

  function nextQuestion() {
    if (quizIndex + 1 >= quizQuestions.length) {
      setQuizComplete(true);
      return;
    }
    setQuizIndex((index) => index + 1);
    setSelected([]);
    setChecked(false);
  }

  function toggleOption(optionId: string) {
    if (checked || !currentQuestion) return;
    if (currentQuestion.type === "multiple_choice") {
      setSelected((values) =>
        values.includes(optionId) ? values.filter((value) => value !== optionId) : [...values, optionId],
      );
    } else setSelected([optionId]);
  }

  function toggleFavorite(questionId: string) {
    const favorites = progress.favorites.includes(questionId)
      ? progress.favorites.filter((id) => id !== questionId)
      : [...progress.favorites, questionId];
    persist({ ...progress, favorites, updatedAt: new Date().toISOString() });
  }

  async function checkStorage() {
    const status = await requestPersistentStorage();
    if (!status.supported) setStorageMessage("浏览器不支持持久化授权，请定期导出备份");
    else {
      const used = status.usage === undefined ? "" : ` · 已用 ${(status.usage / 1024 / 1024).toFixed(1)} MB`;
      const quota = status.quota === undefined ? "" : ` / 配额 ${(status.quota / 1024 / 1024).toFixed(0)} MB`;
      setStorageMessage(`${status.granted ? "已获得持久化存储" : "未获授权，请在出发前导出备份"}${used}${quota}`);
    }
  }

  async function downloadOfflinePack() {
    if (!("caches" in window)) {
      setOfflinePackMessage("当前浏览器不支持离线缓存");
      return;
    }
    setOfflinePackMessage("正在下载并验证…");
    try {
      const localAssets = Array.from(new Set(assets
        .map(assetSrc)
        .filter((url) => !/^https?:\/\//i.test(url))
        .map((url) => localAppUrl(url))));
      const cache = await caches.open("nordic-road-ready-v3");
      const urls = [localAppUrl(), localAppUrl("manifest.webmanifest"), ...localAssets];
      let completed = 0;
      for (let start = 0; start < urls.length; start += 12) {
        const batch = urls.slice(start, start + 12);
        await Promise.all(batch.map(async (url) => {
          const response = await fetch(url, { cache: "no-cache" });
          if (!response.ok) throw new Error(`Offline asset failed: ${url}`);
          await cache.put(url, response);
          completed += 1;
          setOfflinePackMessage(`正在下载并验证… ${completed}/${urls.length}`);
        }));
      }
      const downloadedAt = new Date().toLocaleString("zh-CN", { hour12: false });
      window.localStorage.setItem("offline-pack-downloaded-at", downloadedAt);
      setOfflinePackMessage(`下载完成：${downloadedAt} · ${localAssets.length} 张真实素材`);
    } catch {
      setOfflinePackMessage("下载未完成，请联网后重试");
    }
  }

  const accuracy = progress.answered ? Math.round((progress.correct / progress.answered) * 100) : 0;
  const reviewedAt = published.map((item) => item.lastReviewedAt).sort().at(-1) ?? "待核验";

  return (
    <main className="app-shell" id="top">
      <header className="topbar">
        <button className="brand-button" onClick={() => setView("home")} aria-label="返回首页">
          <span className="brand-mark">N·I</span>
          <span><small>NORDIC ROAD READY</small><strong>北境自驾课</strong></span>
        </button>
        <button className="offline-pill" onClick={() => setView("sources")} type="button">
          <span /> 离线与来源
        </button>
      </header>

      {view === "home" && (
        <>
          <section className="hero-card">
            <div>
              <p className="hero-kicker">2026 · 挪威 9月下旬 / 冰岛 10月上旬</p>
              <h1>先打牢基础<br />再避开高价坑</h1>
              <p className="hero-copy">先学安全、让行、限速和灯光，再认官方标志，最后进入两国地区规则与旅行情境。</p>
              <button className="primary-action" type="button" onClick={() => startQuiz("course")}>
                开始今日学习 <span>→</span>
              </button>
            </div>
            <div className="route-orbit" aria-label="行程学习进度">
              <div className="orbit-line" />
              <span className="route-dot norway-dot">NO</span>
              <span className="route-dot iceland-dot">IS</span>
              <div className="progress-ring"><strong>{progress.completedIds.length}</strong><small>/ {published.length}</small></div>
            </div>
          </section>

          <section className="stats-row" aria-label="学习数据">
            <div><strong>{published.length}</strong><span>已发布题目</span></div>
            <div><strong>{accuracy}%</strong><span>当前正确率</span></div>
            <div><strong>{Object.keys(progress.wrong).length}</strong><span>错题待巩固</span></div>
          </section>

          <section className="section-block">
            <div className="section-heading">
              <div><p className="eyebrow">TRIP FOCUS</p><h2>本次行程优先课</h2></div>
              <button className="text-action" type="button" onClick={() => { setCountry("ALL"); setCategory("ALL"); setView("learn"); }}>全部专题</button>
            </div>
            <div className="country-grid">
              {(["NO", "IS"] as const).map((code) => (
                <button
                  className={`country-card ${code === "NO" ? "norway" : "iceland"}`}
                  key={code}
                  onClick={() => { setCountry(code); setCategory("ALL"); setView("learn"); }}
                >
                  <div className="country-code">{code}</div>
                  <p>{code === "NO" ? "9月下旬重点" : "10月上旬重点"}</p>
                  <h3>{countryName[code]}</h3>
                  <div className="card-footer">
                    <span>{published.filter((q) => q.country === code).length} 道已核验</span>
                    <span className="arrow-button">↗</span>
                  </div>
                </button>
              ))}
            </div>
          </section>

          <button className="risk-strip" onClick={() => { setCountry("IS"); setCategory("tolls"); setView("learn"); }}>
            <span className="risk-index">01</span>
            <span><small>今日高风险提醒</small><strong>冰岛无收费站，不等于无需缴费</strong></span>
            <span className="chevron">›</span>
          </button>
        </>
      )}

      {view === "learn" && (
        <section className="workspace-view">
          <div className="view-heading">
            <div><p className="eyebrow">LEARN BY TOPIC</p><h1>专题学习</h1><small className="scope-copy">图片专项仅为“看两国官方标志图选含义”，不调用摄像头识别。</small></div>
            <button className="exam-button" onClick={() => startQuiz("exam")}>模拟考试</button>
          </div>
          <div className="filter-row" role="group" aria-label="国家筛选">
            {(["ALL", "NO", "IS"] as const).map((code) => (
              <button className={country === code ? "active" : ""} onClick={() => { setCountry(code); setVisibleLessonCount(40); }} key={code}>
                {code === "ALL" ? "全部" : countryName[code]}
              </button>
            ))}
          </div>
          <div className="filter-row topic-filter" role="group" aria-label="专题筛选">
            {(["ALL", ...availableCategories] as CategoryFilter[]).map((code) => (
              <button className={category === code ? "active" : ""} onClick={() => { setCategory(code); setVisibleLessonCount(40); }} key={code}>
                {code === "ALL" ? "全部专题" : categoryName[code]}
              </button>
            ))}
          </div>
          <ol className="curriculum-order" aria-label="推荐学习顺序">
            {learningStages.map((stage) => (
              <li key={stage.id}>
                <span>{stage.number}</span>
                <strong>{stage.title}</strong>
                <small>{stage.copy}</small>
              </li>
            ))}
          </ol>
          <p className="filter-result">当前筛选 {filtered.length} 道</p>
          <div className="lesson-list">
            {filtered.slice(0, visibleLessonCount).map((question, index) => {
              const asset = getAsset(question, assets);
              return (
                <article className="lesson-card" key={question.id}>
                  <div className="lesson-number">{String(index + 1).padStart(2, "0")}</div>
                  {asset && (
                    <figure className="asset-evidence">
                      {/* Source dimensions vary across official SVGs and licensed photos. */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={assetSrc(asset)} alt={asset.alt} loading="lazy" decoding="async" />
                      <figcaption>
                        {asset.signCode ? "官方标志" : "当地实景"} ·{" "}
                        <a href={asset.sourcePageUrl ?? asset.url} target="_blank" rel="noreferrer">
                          {asset.attribution} ↗
                        </a>
                      </figcaption>
                    </figure>
                  )}
                  <div className="lesson-body">
                    <div className="tag-line">
                      <span className="stage-tag">{learningStageName(question)}</span>
                      <span>{countryName[question.country]}</span>
                      <span>{categoryName[question.category] ?? question.category}</span>
                      {question.tripPriority <= 30 && <span className="priority-tag">本次必学</span>}
                    </div>
                    <h2>{question.prompt}</h2>
                    <p>{question.explanation}</p>
                    <div className="evidence-line">
                      <span>核验于 {question.lastReviewedAt}</span>
                      <button onClick={() => { setQuizIds([question.id]); setQuizIndex(0); setQuizCorrect(0); setQuizComplete(false); setSelected([]); setChecked(false); setView("quiz"); }}>练这一题 →</button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
          {filtered.length > visibleLessonCount && (
            <button className="load-more" onClick={() => setVisibleLessonCount((count) => count + 40)}>
              再显示 {Math.min(40, filtered.length - visibleLessonCount)} 道
            </button>
          )}
        </section>
      )}

      {view === "quiz" && (
        <section className="quiz-view">
          {quizComplete ? (
            <div className="empty-state">
              <strong>本轮完成：{quizCorrect}/{quizQuestions.length}</strong>
              <p>正确率 {quizQuestions.length ? Math.round((quizCorrect / quizQuestions.length) * 100) : 0}%。答错题已进入 1 / 3 / 7 / 15 天复习节奏。</p>
              <button onClick={() => setView("home")}>返回首页</button>
              <button onClick={() => startQuiz("all-wrong")}>复习全部错题</button>
            </div>
          ) : currentQuestion ? (
            <>
              <div className="quiz-topline">
                <button onClick={() => setView("home")} aria-label="退出答题">×</button>
                <div><span style={{ width: `${((quizIndex + 1) / quizQuestions.length) * 100}%` }} /></div>
                <strong>{quizIndex + 1}/{quizQuestions.length}</strong>
              </div>
              <div className="question-meta">
                <span>{learningStageName(currentQuestion)}</span>
                <span>{countryName[currentQuestion.country]}</span>
                <span>{categoryName[currentQuestion.category]}</span>
                <button onClick={() => toggleFavorite(currentQuestion.id)}>
                  {progress.favorites.includes(currentQuestion.id) ? "★ 已收藏" : "☆ 收藏"}
                </button>
              </div>
              {currentAsset && (
                <figure className="question-asset asset-evidence">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img className="question-image" src={assetSrc(currentAsset)} alt={currentAsset.alt} />
                  <figcaption>
                    {currentAsset.signCode ? "官方标志" : "当地实景"} ·{" "}
                    <a href={currentAsset.sourcePageUrl ?? currentAsset.url} target="_blank" rel="noreferrer">
                      {currentAsset.attribution} ↗
                    </a>
                  </figcaption>
                </figure>
              )}
              <h1 className="question-title">{currentQuestion.prompt}</h1>
              <div className="option-list">
                {currentQuestion.options.map((option, index) => {
                  const isCorrect = checked && currentQuestion.correctOptionIds.includes(option.id);
                  const isWrong = checked && selected.includes(option.id) && !isCorrect;
                  return (
                    <button
                      className={`quiz-option ${selected.includes(option.id) ? "selected" : ""} ${isCorrect ? "correct" : ""} ${isWrong ? "wrong" : ""}`}
                      onClick={() => toggleOption(option.id)}
                      key={option.id}
                    >
                      <span>{String.fromCharCode(65 + index)}</span>{option.text}
                    </button>
                  );
                })}
              </div>
              {checked && (
                <div className="answer-panel">
                  <strong>{currentAnswerCorrect ? "回答正确" : "这题值得再看一遍"}</strong>
                  <p>{currentQuestion.explanation}</p>
                  <small>官方依据：{currentQuestion.sourceIds.length} 项 · 核验日期 {currentQuestion.lastReviewedAt}</small>
                </div>
              )}
              <button className="submit-answer" disabled={!selected.length} onClick={checked ? nextQuestion : submitAnswer}>
                {checked ? (quizIndex + 1 >= quizQuestions.length ? "完成练习" : "下一题") : "确认答案"}
              </button>
            </>
          ) : (
            <div className="empty-state"><strong>当前没有可练题目</strong><p>继续学习新题；错题会按 1/3/7/15 天安排，收藏题可在复习页集中练习。</p><button onClick={() => setView("home")}>返回首页</button></div>
          )}
        </section>
      )}

      {view === "review" && (
        <section className="workspace-view">
          <div className="view-heading"><div><p className="eyebrow">SPACED REVIEW</p><h1>复习与备份</h1></div></div>
          <div className="review-grid">
            <article className="review-card important"><span>今日到期</span><strong>{dueIds.length + refreshDueIds.length}</strong><p>连续答对 3 次移出错题本，第 15 天再巩固一次。</p><button onClick={() => startQuiz("review")}>开始复习</button></article>
            <article className="review-card"><span>全部错题</span><strong>{Object.keys(progress.wrong).length}</strong><p>按 1 / 3 / 7 天复习，掌握后第 15 天确认。</p><button onClick={() => startQuiz("all-wrong")}>练全部错题</button></article>
            <article className="review-card"><span>我的收藏</span><strong>{progress.favorites.length}</strong><p>集中复习高风险规则和易混标志。</p><button onClick={() => startQuiz("favorites")}>练收藏题</button></article>
          </div>
          <div className="backup-panel">
            <div><h2>进度只保存在这台设备</h2><p>出发前建议导出一份 JSON 备份，避免浏览器清理存储后丢失。</p></div>
            <div className="backup-actions">
              <button onClick={() => exportProgress(progress)}>导出备份</button>
              <button onClick={() => importRef.current?.click()}>导入备份</button>
              <input
                ref={importRef}
                type="file"
                accept="application/json"
                hidden
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  try {
                    const imported = await importProgress(file);
                    const next = restrictProgressToPublished(imported, new Set(published.map((question) => question.id)));
                    persist(next);
                  }
                  catch { setStorageMessage("备份文件无法读取"); }
                }}
              />
            </div>
          </div>
        </section>
      )}

      {view === "sources" && (
        <section className="workspace-view">
          <div className="view-heading"><div><p className="eyebrow">EVIDENCE & OFFLINE</p><h1>来源与离线</h1></div></div>
          <div className="freshness-card">
            <div><span className="status-dot" /><strong>题库核验状态</strong><p>最新内容核验：{reviewedAt}。数字类规则在出发前 30 天需要再次集中复查。</p></div>
            <div className="offline-actions"><button onClick={downloadOfflinePack}>下载完整离线包</button><button onClick={checkStorage}>检查存储保障</button></div>
          </div>
          <p className="storage-message">{offlinePackMessage} · {storageMessage}</p>
          <aside className="scope-note">
            <strong>使用边界</strong>
            <p>这是旅行前学习工具，不替代现场标志、警方指示、官方实时路况或租车合同。题目会明确区分交通罚款、道路通行费、租车服务费和保险除外责任。</p>
          </aside>
          <div className="pretrip-checklist">
            <h2>临行复核清单</h2>
            <a href="https://www.vegvesen.no/en/traffic-information/traffic-information/" target="_blank" rel="noreferrer">
              <span>出发前 30 天</span><strong>复核挪威数字类规则与收费说明</strong><b>↗</b>
            </a>
            <a href="https://umferdin.is/en" target="_blank" rel="noreferrer">
              <span>出发前 7 天</span><strong>检查冰岛封路、风速与道路通行状态</strong><b>↗</b>
            </a>
            <a href="https://www.ruv.is/utvarp/spila/kvoldfr%C3%A9ttir-utvarps/25296/bj8fur" target="_blank" rel="noreferrer">
              <span>2026-07-06 核验</span><strong>RÚV 报道 Vaðlaheiði 的 Akureyri 侧已设无接触 POS；运营方网页未列操作细节，使用前再确认</strong><b>↗</b>
            </a>
            <button onClick={() => exportProgress(progress)}>
              <span>出发前 24 小时</span><strong>导出学习进度并重新打开 App 验证离线</strong><b>↓</b>
            </button>
          </div>
          <div className="source-heading"><h2>依据与素材来源</h2><span>{sources.length} 项</span></div>
          <div className="source-list">
            {sources.map((source) => (
              <a href={source.url} target="_blank" rel="noreferrer" key={source.id}>
                <span>{source.country}</span>
                <div><strong>{source.title}</strong><small>{source.publisher} · 访问于 {source.accessedAt} · {source.archiveStatus === "snapshot" ? "页面快照" : "核验记录"}</small></div>
                <b>↗</b>
              </a>
            ))}
          </div>
        </section>
      )}

      {view !== "quiz" && (
        <nav className="bottom-nav" aria-label="主导航">
          <button className={view === "home" ? "active" : ""} onClick={() => setView("home")}><span>⌂</span>首页</button>
          <button className={view === "learn" ? "active" : ""} onClick={() => setView("learn")}><span>▤</span>学习</button>
          <button onClick={() => startQuiz("exam")}><span>✓</span>考试</button>
          <button className={view === "review" ? "active" : ""} onClick={() => setView("review")}><span>↻</span>复习</button>
        </nav>
      )}
    </main>
  );
}
