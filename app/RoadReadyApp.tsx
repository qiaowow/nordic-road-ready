"use client";
/* eslint-disable @next/next/no-img-element -- Static Pages uses pre-optimized local WebP and original official SVG files. */
import { useEffect, useMemo, useRef, useState } from "react";
import type { Asset, Question, Source } from "@/src/content/types";
import { recordAnswer, dueQuestions } from "./learning";
import { emptyProgress, exportProgress, importProgress, loadProgress, saveProgress, mergeProgress, requestPersistentStorage, type ProgressState } from "./storage";
import { chapters, contentVersion, countryName, categoryName, chapterOf, compareCurriculum, questionState, questionAssets, assetSrc, isCorrect, stratifiedExam, createSession, restoreSession, type Session } from "./curriculum";
import { offlineAction, type PackStatus } from "./offline";
import scenarios from "../data/scenarios.json";
import coverage from "../data/coverage.json";
type Country = "ALL" | "NO" | "IS";
const sessionKey = "nordic-road-ready:session-v2";
const settingsKey = "nordic-road-ready:settings";
const today = () => new Date().toISOString().slice(0, 10);
const message = (e: unknown) => e instanceof Error ? e.message : "操作失败，请重试";
export function RoadReadyApp({ questions, sources, assets }: {
    questions: Question[];
    sources: Source[];
    assets: Asset[];
}) {
    const published = useMemo(() => questions.filter(q => q.status === "published").sort(compareCurriculum), [questions]);
    const [route, setRoute] = useState("#/");
    const [progress, setProgress] = useState<ProgressState>(emptyProgress);
    const progressRef = useRef(progress);
    const [loaded, setLoaded] = useState(false);
    const [storageWritable, setStorageWritable] = useState(false);
    const [notice, setNotice] = useState("");
    const [country, setCountry] = useState<Country>("ALL");
    const [category, setCategory] = useState("ALL");
    const [stateFilter, setStateFilter] = useState("ALL");
    const [search, setSearch] = useState("");
    const [date, setDate] = useState("");
    const [vehicle, setVehicle] = useState("car");
    const [session, setSession] = useState<Session | null>(null);
    const [selection, setSelection] = useState<string[]>([]);
    const [examCountry, setExamCountry] = useState<Country>("ALL");
    const [examCount, setExamCount] = useState(20);
    const [pack, setPack] = useState<PackStatus | null>(null);
    const [offlineMessage, setOfflineMessage] = useState("尚未检查当前设备的离线完整性");
    const [offlineBusy, setOfflineBusy] = useState(false);
    const [online, setOnline] = useState(true);
    const [imported, setImported] = useState<ProgressState | null>(null);
    const [zoom, setZoom] = useState<Asset | null>(null);
    const [confirmation, setConfirmation] = useState<{ text: string; label: string; accept: () => void } | null>(null);
    const confirmDialog = useRef<HTMLDialogElement>(null);
    const dialog = useRef<HTMLDialogElement>(null);
    const importRef = useRef<HTMLInputElement>(null);
    const [drafts, setDrafts] = useState<Record<string, string>>({});
    const [revealed, setRevealed] = useState<Record<string, boolean>>({});
    const scrolls = useRef<Record<string, number>>({});
    const routeRef = useRef("#/");
    useEffect(() => {
        const onRoute = () => { scrolls.current[routeRef.current] = window.scrollY; const r = location.hash || "#/"; routeRef.current = r; setRoute(r); requestAnimationFrame(() => window.scrollTo(0, scrolls.current[r] ?? 0)); };
        const onNetwork = () => setOnline(navigator.onLine);
        onRoute();
        onNetwork();
        window.addEventListener("hashchange", onRoute);
        window.addEventListener("online", onNetwork);
        window.addEventListener("offline", onNetwork);
        let alive = true;
        void loadProgress().then(p => { if (alive) {
            progressRef.current = p;
            setProgress(p);
            setStorageWritable(true);
        } }).catch(e => { if (alive)
            setNotice("未能读取已有进度，本次不会覆盖原记录：" + message(e)); }).finally(() => { if (alive)
            setLoaded(true); });
        void Promise.resolve().then(() => {
            if (!alive)
                return;
            try {
                const raw = localStorage.getItem(sessionKey);
                if (raw)
                    setSession(restoreSession(raw, published));
                const settings = JSON.parse(localStorage.getItem(settingsKey) || "{}");
                if (["ALL", "NO", "IS"].includes(settings.country))
                    setCountry(settings.country);
                if (typeof settings.search === "string")
                    setSearch(settings.search);
                if (settings.category === "ALL" || Object.hasOwn(categoryName, settings.category))
                    setCategory(settings.category);
                if (["ALL", "new", "wrong", "mastered", "pending"].includes(settings.stateFilter))
                    setStateFilter(settings.stateFilter);
                if (typeof settings.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(settings.date))
                    setDate(settings.date);
                if (["car", "camper", "heavy"].includes(settings.vehicle))
                    setVehicle(settings.vehicle);
                const d = JSON.parse(localStorage.getItem("nordic-road-ready:scenarios") || "{}");
                if (d && typeof d === "object")
                    setDrafts(Object.fromEntries(Object.entries(d).filter(([, v]) => typeof v === "string")) as Record<string, string>);
            }
            catch (e) {
                setNotice(message(e));
            }
        });
        return () => { alive = false; window.removeEventListener("hashchange", onRoute); window.removeEventListener("online", onNetwork); window.removeEventListener("offline", onNetwork); };
    }, [published]);
    useEffect(() => { if (!loaded)
        return; try {
        localStorage.setItem(settingsKey, JSON.stringify({ date, vehicle, country, search, category, stateFilter }));
    }
    catch {
        void Promise.resolve().then(() => setNotice("无法保存筛选与行程设置，请导出进度备份。"));
    } }, [country, date, vehicle, loaded, search, category, stateFilter]);
    useEffect(() => { if (zoom)
        dialog.current?.showModal();
    else
        dialog.current?.close(); }, [zoom]);
    useEffect(() => {
        if (confirmation) confirmDialog.current?.showModal();
        else confirmDialog.current?.close();
    }, [confirmation]);
    useEffect(() => {
        if (!loaded || !storageWritable || !session)
            return;
        void Promise.resolve().then(() => {
            let p = progressRef.current;
            if (session.mode === "practice" || session.finished)
                for (const id of session.ids) {
                    const q = published.find(q => q.id === id);
                    const response = session.answers[id];
                    if (q && (response || session.finished))
                        p = recordAnswer(p, id, isCorrect(q, response || []), new Date(), session.id + ":" + id);
                }
            if (p !== progressRef.current) {
                progressRef.current = p;
                setProgress(p);
                void saveProgress(p).catch(e => setNotice("补存学习记录失败：" + message(e)));
            }
        });
    }, [loaded, storageWritable, session, published]);
    const activeDate = date || today();
    const eligible = published.filter(q => !questionState(q, activeDate));
    const due = dueQuestions(progress).filter(id => eligible.some(q => q.id === id));
    const wrong = eligible.filter(q => progress.items[q.id] && !progress.items[q.id].lastCorrect);
    const mastered = published.filter(q => progress.items[q.id]?.mastered).length;
    const view = route.split("/")[1] || "home";
    const chapterId = route.split("/")[2] || "ALL";
    const filtered = published.filter(q => (country === "ALL" || q.country === country) && (category === "ALL" || q.category === category) && (chapterId === "ALL" || chapterOf(q.id)?.id === chapterId) && (!search || [q.prompt, q.explanation, ...q.options.map(o => o.text), ...q.tags].join(" ").toLowerCase().includes(search.toLowerCase())) && (stateFilter === "ALL" || (stateFilter === "new" && !progress.items[q.id]) || (stateFilter === "wrong" && progress.items[q.id] && !progress.items[q.id].lastCorrect) || (stateFilter === "mastered" && progress.items[q.id]?.mastered) || (stateFilter === "pending" && questionState(q, activeDate))));
    const current = session ? published.find(q => q.id === session.ids[session.index]) : undefined;
    const answered = current && session?.answers[current.id];
    const checked = Boolean(answered);
    function navigate(hash: string) { if (location.hash === hash) {
        setRoute(hash);
        window.scrollTo(0, 0);
    }
    else
        location.hash = hash; }
    function persist(next: ProgressState) {
        progressRef.current = next;
        setProgress(next);
        if (!storageWritable) {
            setNotice("进度仅保存在本次页面内，请立即导出备份；已有存储未被覆盖。");
            return;
        }
        void saveProgress(next).catch(e => setNotice("进度保存失败，请导出备份：" + message(e)));
    }
    function saveSession(next: Session) { setSession(next); try {
        localStorage.setItem(sessionKey, JSON.stringify(next));
    }
    catch {
        setNotice("无法保存本轮练习，请不要关闭页面，并导出学习进度。");
    } }
    function start(pool: Question[], mode: Session["mode"] = "practice", confirmed = false) {
        if (!loaded) {
            setNotice("正在读取学习进度，请稍候。");
            return;
        }
        const safe = pool.filter(q => !questionState(q, activeDate));
        if (!safe.length) {
            setNotice("此范围没有可计分题目。请查看待复核提示或调整筛选。");
            return;
        }
        if (session && !session.finished && route !== "#/quiz" && !confirmed) {
            setConfirmation({ text: "开始新一轮会替换尚未完成的练习。已提交的学习记录会保留。", label: "确认开始新一轮", accept: () => start(safe, mode, true) });
            return;
        }
        saveSession(createSession(safe, mode, route === "#/quiz" ? session?.returnTo || "#/learn" : route));
        setSelection([]);
        navigate("#/quiz");
    }
    function daily() { const duePool = due.map(id => eligible.find(q => q.id === id)!); const unseen = eligible.filter(q => !progress.items[q.id]); start([...duePool.slice(0, 5), ...unseen.slice(0, 10 - Math.min(duePool.length, 5)), ...duePool.slice(5)].slice(0, 10).length ? [...duePool.slice(0, 5), ...unseen.slice(0, 10 - Math.min(duePool.length, 5)), ...duePool.slice(5)].slice(0, 10) : eligible.slice(0, 10)); }
    function submit() {
        if (!session || !current || !selection.length || checked)
            return;
        const next = { ...session, answers: { ...session.answers, [current.id]: selection } };
        saveSession(next);
        if (session.mode === "practice")
            persist(recordAnswer(progressRef.current, current.id, isCorrect(current, selection), new Date(), session.id + ":" + current.id));
    }
    function finish(confirmed = false) {
        if (!session)
            return;
        if (session.mode === "exam") {
            if (Object.keys(session.answers).length < session.ids.length && !confirmed) {
                setConfirmation({ text: `还有 ${session.ids.length - Object.keys(session.answers).length} 道未答题，交卷后按错误计。可以取消并继续作答。`, label: "确认交卷", accept: () => finish(true) });
                return;
            }
            let p = progressRef.current;
            for (const id of session.ids) {
                const q = published.find(q => q.id === id)!;
                p = recordAnswer(p, id, isCorrect(q, session.answers[id] ?? []), new Date(), session.id + ":" + id);
            }
            persist(p);
        }
        saveSession({ ...session, finished: true });
        setSelection([]);
    }
    function advance() { if (!session)
        return; if (session.index === session.ids.length - 1) {
        finish();
        return;
    } saveSession({ ...session, index: session.index + 1 }); setSelection([]); window.scrollTo(0, 0); }
    function favorite(id: string) { const p = progressRef.current; persist({ ...p, favorites: p.favorites.includes(id) ? p.favorites.filter(x => x !== id) : [...p.favorites, id] }); }
    function markRead(id: string) { const p = progressRef.current; persist({ ...p, readIds: [...new Set([...p.readIds, id])] }); }
    async function packAction(type: "DOWNLOAD" | "VERIFY") {
        setOfflineBusy(true);
        setPack(null);
        setOfflineMessage("正在连接离线服务…");
        try {
            const status = await offlineAction(type, setOfflineMessage);
            setPack(status);
            setOfflineMessage(status.ready ? "完整性校验通过，可进行飞行模式演练。" : status.reason || "尚未就绪");
        }
        catch (e) {
            setOfflineMessage(message(e));
        }
        finally {
            setOfflineBusy(false);
        }
    }
    function evidence(q: Question) {
        return <details className="evidence-details"><summary>本题依据与适用条件</summary><p>核验：{q.lastReviewedAt} · 适用：{q.appliesFrom || "未限定起始日"} 至 {q.appliesTo || "未限定结束日"}。这不代表永久有效。</p>{q.sourceIds.map(id => { const s = sources.find(s => s.id === id); return s ? <p key={id}><a href={s.url} target="_blank" rel="noreferrer">{s.publisher} · {s.title} ↗</a><small>{s.archiveStatus === "snapshot" ? "原始页面已存档" : "仅有证据记录，非原页快照"} · {s.accessedAt}</small></p> : null; })}<p>同一机构的不同语言页面不算两份独立证据。在线原文需联网；本题中文解释可离线阅读。</p></details>;
    }
    function pictures(q: Question, quiz = false) {
        const images = questionAssets(q, assets, !quiz);
        if (!images.length)
            return null;
        return <div className="question-gallery">{images.map((a, i) => <figure key={a.id}><button className="image-button" onClick={() => setZoom(a)} aria-label={quiz ? "放大本题图片" : `放大：${a.alt}`}><img src={assetSrc(a)} alt={quiz ? "本题官方标志图；文字辅助请转入学习模式" : a.alt} loading={quiz ? "eager" : "lazy"} decoding="async"/></button>{!quiz && <figcaption>{i === 0 ? "主图" : "对照图"} · {a.title}<br /><a href={a.sourcePageUrl || a.url} target="_blank" rel="noreferrer">图片来源 ↗</a> · {a.attribution} · {a.license}</figcaption>}</figure>)}</div>;
    }
    function answerPanel(q: Question) { return <div className="answer-panel"><strong>正确做法：{q.options.filter(o => q.correctOptionIds.includes(o.id)).map(o => o.text).join("；")}</strong><p>{q.explanation}</p>{evidence(q)}</div>; }
    function lesson(q: Question) {
        const state = questionState(q, activeDate);
        return <article className="study-card" id={q.id} key={q.id}><div className="tag-line"><span>{countryName[q.country]}</span><span>{categoryName[q.category]}</span><span>{progress.items[q.id]?.mastered ? "已掌握" : progress.items[q.id] ? "已练习" : progress.readIds.includes(q.id) ? "已阅读" : "未学习"}</span>{state && <span className="warning">{state}</span>}</div><h2>{q.prompt}</h2>{pictures(q)}{answerPanel(q)}<div className="action-row"><button onClick={() => markRead(q.id)} disabled={!loaded || progress.readIds.includes(q.id)}>{progress.readIds.includes(q.id) ? "已阅读" : "标记已阅读"}</button><button onClick={() => start([q])} disabled={!loaded || Boolean(state)}>练习此题</button><button aria-pressed={progress.favorites.includes(q.id)} onClick={() => favorite(q.id)} disabled={!loaded}>{progress.favorites.includes(q.id) ? "取消收藏" : "收藏"}</button></div></article>;
    }
    const navigation = [["home", "首页"], ["learn", "课程"], ["review", "复习"], ["quick", "出行速查"], ["offline", "离线与设置"]];
    return <main className="app-shell" id="top">
 <button className="skip-link" onClick={() => { document.getElementById("main-content")?.focus(); document.getElementById("main-content")?.scrollIntoView(); }}>跳到内容</button>
 <header className="topbar"><button className="brand-button" onClick={() => navigate("#/")} aria-label="返回首页"><span className="brand-mark">N·I</span><span><small>NORDIC ROAD READY</small><strong>北境自驾课</strong></span></button><span className="connection-label">{online ? "在线" : "离线"} · {contentVersion}</span></header>
 <nav className="main-nav" aria-label="主导航">{navigation.map(([id, label]) => <a key={id} href={id === "home" ? "#/" : `#/${id}`} aria-current={view === id ? "page" : undefined}>{label}{id === "review" && due.length > 0 ? <span> {due.length}</span> : null}</a>)}</nav>
 {notice && <div className="notice" role="alert">{notice}<button onClick={() => setNotice("")} aria-label="关闭提示">×</button></div>}
 {!loaded && <p role="status">正在读取学习记录…</p>}
 <div id="main-content" tabIndex={-1}>
 {view === "home" && <>
  <section className="hero-card"><div><p className="hero-kicker">从基础到独立判断</p><h1>学会规则<br />从容出发</h1><p className="hero-copy">基本交规 → 官方标志 → 两国差异 → 开放自检。到期复习与新课一起安排，不用背题号。</p><div className="action-row"><button className="primary-action" disabled={!loaded} onClick={daily}>开始今日学习 →</button>{session && !session.finished && <button className="hero-secondary" onClick={() => navigate("#/quiz")}>继续上次 · {session.index + 1}/{session.ids.length}</button>}</div></div><div className="hero-progress"><strong>{mastered}<small> / {published.length}</small></strong><span>跨日复习后掌握</span><p>已阅读 {progress.readIds.filter(id => published.some(q => q.id === id)).length} · 已练习 {published.filter(q => progress.items[q.id]).length}</p></div></section>
  <section className="stats-row" aria-label="学习状态"><div><strong>{due.length}</strong><span>到期复习</span></div><div><strong>{wrong.length}</strong><span>最近答错</span></div><div><strong>{published.filter(q => questionState(q, activeDate)).length}</strong><span>暂不计分／待复核</span></div></section>
  <section className="section-block"><div className="section-heading"><h2>按顺序学，也可直接查</h2><a href="#/learn">全部课程 →</a></div><div className="chapter-grid">{chapters.map((c, i) => <a href={`#/learn/${c.id}`} key={c.id}><small>0{i + 1}</small><h3>{c.title}</h3><p>{c.summary}</p><span>{c.questionIds.filter(id => progress.items[id]?.mastered).length}/{c.questionIds.length} 已掌握 →</span></a>)}</div></section>
  <section className="section-block"><div className="section-heading"><h2>本次行程优先课</h2><a href="#/offline">设置行程</a></div><div className="country-grid">{(["NO", "IS"] as const).map(code => <button key={code} className={`country-card ${code === "NO" ? "norway" : "iceland"}`} onClick={() => { setCountry(code); setCategory("ALL"); navigate("#/learn"); }}><div className="country-code">{code}</div><p>{date || "按出发日期复核动态规则"}</p><h3>{countryName[code]}</h3><div className="card-footer"><span>{published.filter(q => q.country === code).length} 个学习题目</span><span className="arrow-button">↗</span></div></button>)}</div></section>
  <div className="action-row"><a href="#/scenarios">开放自检 →</a><a href="#/exam">配置模拟考试 →</a><a href="#/sources">来源与覆盖边界 →</a></div>
 </>}
 {view === "learn" && <section className="workspace-view"><div className="view-heading"><div><p className="eyebrow">先读规则，再练习</p><h1>{chapters.find(c => c.id === chapterId)?.title || "专题学习"}</h1></div><a href="#/exam">模拟考试 →</a></div>
 <div className="chapter-tabs"><a href="#/learn" aria-current={chapterId === "ALL" ? "page" : undefined}>全部章节</a>{chapters.map(c => <a href={`#/learn/${c.id}`} key={c.id} aria-current={chapterId === c.id ? "page" : undefined}>{c.title}</a>)}<a href="#/scenarios">开放自检</a></div>
 {chapters.filter(c => c.id === chapterId).map(c => <section className="primer" key={c.id}><h2>这一章先理解什么</h2>{c.primer.map(t => <p key={t}>{t}</p>)}</section>)}
 <div className="filters"><label>国家<select value={country} onChange={e => setCountry(e.target.value as Country)}><option value="ALL">两国</option><option value="NO">挪威</option><option value="IS">冰岛</option></select></label><label>专题<select value={category} onChange={e => setCategory(e.target.value)}><option value="ALL">全部专题</option>{Object.entries(categoryName).map(([id, n]) => <option value={id} key={id}>{n}</option>)}</select></label><label>状态<select value={stateFilter} onChange={e => setStateFilter(e.target.value)}><option value="ALL">全部状态</option><option value="new">尚未练习</option><option value="wrong">最近答错</option><option value="mastered">已掌握</option><option value="pending">待复核／不适用</option></select></label><label className="search-label">搜索<input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="例如：环岛、车牌、5 m"/></label></div>
 <div className="action-row"><p>找到 {filtered.length} 题 · 时效参考 {activeDate}</p><button onClick={() => start(filtered)} disabled={!loaded || !filtered.some(q => !questionState(q, activeDate))}>练习当前范围</button><button onClick={() => { setCountry("ALL"); setCategory("ALL"); setStateFilter("ALL"); setSearch(""); navigate("#/learn"); }}>清除筛选</button></div>
 {filtered.length ? <div className="lesson-list">{filtered.map(q => lesson(q))}</div> : <p className="empty-state">没有匹配题目，请清除筛选或换个关键词。</p>}
 </section>}
 {view === "quiz" && <section className="quiz-view">{!session ? <div className="empty-state"><h1>还没有进行中的练习</h1><button onClick={daily}>开始今日学习</button></div> : session.finished ? <div>
 <h1>{session.mode === "exam" ? "考试结果" : "本轮完成"}</h1><p className="result-score">{session.ids.filter(id => isCorrect(published.find(q => q.id === id)!, session.answers[id] ?? [])).length} / {session.ids.length}</p><p>这是本轮答题结果，不代表已经掌握。第一次答对也会安排复习。</p>
 <div className="result-breakdown">{[...new Set(session.ids.map(id => published.find(q => q.id === id)!.category))].map(cat => { const ids = session.ids.filter(id => published.find(q => q.id === id)!.category === cat); return <p key={cat}>{categoryName[cat]}：{ids.filter(id => isCorrect(published.find(q => q.id === id)!, session.answers[id] ?? [])).length}/{ids.length}</p>; })}</div>
 <div className="action-row"><button onClick={() => navigate(session.returnTo)}>返回原页面</button><button onClick={daily}>继续下一组</button><button onClick={() => start(session.ids.map(id => published.find(q => q.id === id)!).filter(q => !isCorrect(q, session.answers[q.id] ?? [])))}>巩固本轮错题</button></div>
 {session.ids.map(id => { const q = published.find(q => q.id === id)!; return <details className="result-item" key={id}><summary>{isCorrect(q, session.answers[id] ?? []) ? "✓ 正确" : "✕ 待巩固"} · {q.prompt}</summary><p>你的答案：{q.options.filter(o => session.answers[id]?.includes(o.id)).map(o => o.text).join("；") || "未作答"}</p>{pictures(q)}{answerPanel(q)}</details>; })}
 </div> : current ? <div>
 <div className="action-row quiz-controls"><button onClick={() => navigate(session.returnTo)}>暂停并返回</button><span>{session.mode === "exam" ? "模拟考试 · 交卷后统一解析" : "学习练习"} · {session.index + 1}/{session.ids.length}</span>{session.mode === "exam" && <button onClick={() => finish()}>提前交卷</button>}</div>
 <progress max={session.ids.length} value={Object.keys(session.answers).length} aria-label="本轮作答进度"/>
 <div className="tag-line"><span>{countryName[current.country]}</span><span>{categoryName[current.category]}</span><span>{current.type === "multiple_choice" ? "多选题" : "单选题"}</span></div><h1 className="question-title">{current.prompt}</h1>{pictures(current, !checked || session.mode === "exam")}
 {current.assetIds.length > 0 && <details><summary>文字辅助学习（不计分）</summary><p>图片的文字说明可能直接给出答案。如需读屏辅助，请退出本题的计分流程阅读规则。</p><button onClick={() => { setCountry("ALL"); setCategory("ALL"); setSearch(current.prompt); navigate("#/question/" + current.id); }}>转到此题学习</button></details>}
 <div className="option-list" role="group" aria-label="答案选项">{session.order[current.id].map((id, i) => { const o = current.options.find(o => o.id === id)!; const selected = (answered || selection).includes(id); return <button key={id} className={`quiz-option ${selected ? "selected" : ""} ${checked && session.mode === "practice" ? (current.correctOptionIds.includes(id) ? "correct" : selected ? "wrong" : "") : ""}`} aria-pressed={selected} disabled={checked} onClick={() => setSelection(v => current.type === "multiple_choice" ? (v.includes(id) ? v.filter(x => x !== id) : [...v, id]) : [id])}><span>{String.fromCharCode(65 + i)}</span>{o.text}</button>; })}</div>
 {!checked ? <button className="submit-answer" disabled={!selection.length || !loaded} onClick={submit}>{session.mode === "exam" ? "保存本题答案" : "检查答案"}</button> : <><p role="status">{session.mode === "exam" ? "答案已保存，交卷后查看解析。" : isCorrect(current, answered!) ? "✓ 答对了，仍需跨日复习。" : "✕ 这题需要巩固，先理解下面的规则。"}</p>{session.mode === "practice" && answerPanel(current)}<button className="submit-answer" onClick={advance}>{session.index === session.ids.length - 1 ? "完成并查看结果" : "下一题 →"}</button></>}
 {session.mode === "exam" && <div className="action-row"><button disabled={session.index === 0} onClick={() => { saveSession({ ...session, index: session.index - 1 }); setSelection([]); }}>上一题</button>{checked ? <button onClick={() => { const answers = { ...session.answers }; delete answers[current.id]; setSelection(answered || []); saveSession({ ...session, answers }); }}>修改本题答案</button> : <button onClick={advance}>暂时跳过</button>}</div>}
 <button className="text-action favorite-action" aria-pressed={progress.favorites.includes(current.id)} onClick={() => favorite(current.id)}>{progress.favorites.includes(current.id) ? "取消收藏" : "收藏此题"}</button>
 </div> : <p>题目已更新，请重新开始练习。</p>}</section>}
 {view === "question" && <section className="workspace-view"><p><a href="#/learn">← 课程</a></p>{published.some(q => q.id === chapterId) ? lesson(published.find(q => q.id === chapterId)!) : <p>题目已更新或退役。</p>}</section>}
 {view === "review" && <section className="workspace-view"><h1>复习与收藏</h1><p>答对后按 1 / 3 / 7 / 15 天安排巩固。未到期或同日反复答对不会跳级；答错回到 1 天后再练。</p><div className="review-grid">{[
                { title: "到期复习", pool: due.map(id => eligible.find(q => q.id === id)!), copy: "按最早到期排序，一次包含全部到期题" },
                { title: "最近答错", pool: wrong, copy: "先补薄弱点；到期后答对才推进复习" },
                { title: "收藏题目", pool: eligible.filter(q => progress.favorites.includes(q.id)), copy: "完整收藏队列，不随机截断" }
            ].map(x => <article className="review-card" key={x.title}><span>{x.title}</span><strong>{x.pool.length}</strong><p>{x.copy}</p><button disabled={!loaded || !x.pool.length} onClick={() => start(x.pool)}>开始复习</button></article>)}</div>
 <h2>接下来要复习</h2>{Object.entries(progress.items).filter(([id, x]) => x.dueAt && eligible.some(q => q.id === id)).sort((a, b) => a[1].dueAt!.localeCompare(b[1].dueAt!)).slice(0, 20).map(([id, x]) => <p key={id}>{new Date(x.dueAt!).toLocaleDateString("zh-CN")} · {published.find(q => q.id === id)?.prompt}</p>)}<p><a href="#/offline">备份与恢复学习记录 →</a></p></section>}
 {view === "exam" && <section className="workspace-view"><h1>配置模拟考试</h1><p>考试不继承课程页筛选；按国家和专题分层抽题。只有当前适用且未标记待复核的题进入考试，交卷后统一显示解析。</p><div className="filters"><label>考试范围<select value={examCountry} onChange={e => setExamCountry(e.target.value as Country)}><option value="ALL">挪威 + 冰岛</option><option value="NO">仅挪威</option><option value="IS">仅冰岛</option></select></label><label>计划题数<select value={examCount} onChange={e => setExamCount(Number(e.target.value))}>{[10, 20, 40].map(n => <option key={n} value={n}>{n} 题</option>)}</select></label></div><p>按 {activeDate} 判断时效；本卷实际 {Math.min(examCount, eligible.filter(q => examCountry === "ALL" || q.country === examCountry).length)} 题。不是两国官方驾照考试。</p><button className="exam-button" disabled={!loaded} onClick={() => start(stratifiedExam(eligible.filter(q => examCountry === "ALL" || q.country === examCountry), examCount), "exam")}>开始模拟考试</button></section>}
 {view === "scenarios" && <section className="workspace-view"><h1>开放自检</h1><p>先写自己的处理顺序，再展开要点对照。没有联网 AI 判分，也不计入正确率；你的草稿只存于当前设备。</p>{scenarios.map(s => <article className="study-card" key={s.id}><p className="eyebrow">{countryName[s.country as "NO" | "IS"]}</p><h2>{s.title}</h2><p>{s.prompt}</p><label>我的处理步骤<textarea rows={4} maxLength={5000} value={drafts[s.id] || ""} onChange={e => { const next = { ...drafts, [s.id]: e.target.value }; setDrafts(next); try {
        localStorage.setItem("nordic-road-ready:scenarios", JSON.stringify(next));
    }
    catch {
        setNotice("开放自检草稿保存失败，请自行复制备份。");
    } }}/></label><button disabled={!(drafts[s.id] || "").trim()} onClick={() => setRevealed(v => ({ ...v, [s.id]: !v[s.id] }))}>{revealed[s.id] ? "收起对照" : "写完了，对照处理要点"}</button>{revealed[s.id] && <div className="primer"><ol>{s.steps.map(t => <li key={t}>{t}</li>)}</ol><p>请自查：是否遗漏？顺序是否合理？哪些条件还要查合同或现场信息？</p>{s.questionIds.map(id => { const q = published.find(q => q.id === id); return q ? <div key={id}>{evidence(q)}</div> : null; })}</div>}</article>)}</section>}
 {view === "quick" && <section className="workspace-view"><h1>出行速查</h1><p>停车后再查阅，行车中不要操作。实时开放、天气和付费链接需联网；以下检查顺序可离线使用。</p>
 <div className="quick-grid">{[
                { title: "取车检查", items: ["核对车牌、许可总重、轮胎和已存在损伤，拍照留存。", "询问道路使用费与通行费由谁结算，避免重复支付。", "分别确认允许道路、保险除外责任、免赔额和救援联系方式。"], links: [["公里费日费模式", "https://island.is/en/daily-fee-for-rental-cars"]] },
                { title: "停车与缴费", items: ["看主牌、副牌、时段、区域和地面标线，再决定是否能停。", "输入车牌并核对区域、时长与金额；确认支付成功并保存凭证。", "回来时确认未超时，不把付费成功当成可以停在禁停位置的许可。"], links: [["挪威停车指引", "https://www.vegvesen.no/en/traffic-information/traffic-information/drive-safe-in-norway/drive-safe-in-norway/parking-in-norway/"], ["雷克雅未克停车", "https://reykjavik.is/en/parking"]] },
                { title: "封路、强风与高地", items: ["当天查路况与天气，途中发现变化就重新评估。", "关闭道路不要进入；四驱不能替代开放许可。", "涉水或风力是否安全无法只靠题库判断，不确定时掉头或等待。"], links: [["挪威路况", "https://www.vegvesen.no/trafikk/"], ["冰岛路况", "https://umferdin.is/en"], ["冰岛安全出行", "https://safetravel.is/"]] },
                { title: "需要救援", items: ["先确保自身安全并防止二次事故，再说明位置和情况。", "挪威：112 紧急警务，113 医疗急救；非紧急警务 02800。", "冰岛：112 紧急服务。租车故障另联系合同里的道路救援号码。"], links: [["冰岛 112", "https://www.112.is/en"]] }
            ].map(x => <article className="study-card" key={x.title}><h2>{x.title}</h2><ol>{x.items.map(t => <li key={t}>{t}</li>)}</ol>{x.links.map(([n, url]) => <p key={url}><a href={url} target="_blank" rel="noreferrer">{n} ↗</a></p>)}</article>)}</div><a href="#/sources">数字类题目临行复核清单 →</a></section>}
 {view === "offline" && <section className="workspace-view"><h1>离线与行程设置</h1><section className="primer"><h2>联网时准备，飞机上学习</h2><p>请在手机浏览器中打开本站，添加到主屏幕。先下载完整包，再开启飞行模式，彻底关闭并重新打开应用，检查题图和答题保存。</p><p>浏览器仍可能回收数据。出发前重新验证缓存并导出进度；持久化授权不是永不清除的保证。</p><div className="action-row"><button disabled={offlineBusy} onClick={() => void packAction("DOWNLOAD")}>下载／更新完整离线包</button><button disabled={offlineBusy} onClick={() => void packAction("VERIFY")}>检查离线就绪</button></div><p role="status">{offlineMessage}</p>{pack?.ready && <p>版本 {pack.version} · {((pack.totalBytes || 0) / 1048576).toFixed(1)} MiB · {pack.files} 文件<br />下载日期 {pack.at ? new Date(pack.at).toLocaleString("zh-CN") : "未知"}。完整包更新成功后重新打开页面使用新版本。</p>}<p>单包上限 100 MiB；完整更新后最多保留本应用两个版本。失败不会替换上一个完整包。下载期间请保持页面打开。</p></section>
 <section className="study-card"><h2>按你的行程看时效</h2><div className="filters"><label>出发／复核日期<input type="date" value={date} onChange={e => setDate(e.target.value)}/></label><label>车型<select value={vehicle} onChange={e => setVehicle(e.target.value)}><option value="car">普通轿车／SUV</option><option value="camper">房车／露营车</option><option value="heavy">许可总重超过 3.5 t</option></select></label></div><p>{vehicle === "car" ? "车辆外观不等于道路许可。仍需核对车辆总重、轮胎和租车合同。" : vehicle === "camper" ? "额外检查车高、车宽、风力、过夜许可和车辆总重；房车不一定超过 3.5 t。" : "普通车费率与轮胎规则不可直接套用。请单独核对重型车辆官方规定和租车合同。"}车型只调整提醒，不隐藏基础安全内容。</p><p>未选日期时按今天判断。收费等动态内容超过 30 天会标记待复核，并暂停计分。</p></section>
 <section className="study-card"><h2>学习记录备份</h2><p>本站没有账户同步。更换浏览器或手机前导出 JSON；旧版记录按“练习过”迁移，不直接算掌握。开放自检草稿不在进度备份内，请另行复制。</p><div className="action-row"><button disabled={!loaded} onClick={() => { exportProgress(progress); setNotice("已发起进度备份下载，请确认文件保存成功。"); }}>导出进度 JSON</button><button disabled={!loaded} onClick={() => importRef.current?.click()}>导入备份</button><button onClick={() => void requestPersistentStorage().then(s => setNotice(s.granted ? "已获得持久化存储授权；仍建议导出备份。" : "未获持久化授权或不支持，请定期导出备份。")).catch(e => setNotice(message(e)))}>请求持久化存储</button></div><input ref={importRef} type="file" accept=".json,application/json" hidden onChange={e => { const f = e.target.files?.[0]; if (f)
            void importProgress(f).then(setImported).catch(x => setNotice("导入失败：" + message(x))); e.target.value = ""; }}/>
 {imported && <div className="notice"><p>备份含 {imported.completedIds.length} 个练习记录。合并按每题较新记录保留；统计不简单相加以避免重复。替换前建议先导出当前记录。</p><div className="action-row"><button onClick={() => { persist(mergeProgress(progress, imported)); setImported(null); setNotice("已合并备份。"); }}>合并（推荐）</button><button onClick={() => setConfirmation({ text: "备份会替换当前学习记录。建议先导出当前记录；合并不会清空当前记录。", label: "确认替换记录", accept: () => {
            persist(imported);
            setImported(null);
            setNotice("已载入备份。");
        } })}>替换</button><button onClick={() => setImported(null)}>取消</button></div></div>}
 </section><p><a href="#/sources">法规来源、核验日期与覆盖边界 →</a></p></section>}
 {view === "sources" && <section className="workspace-view"><h1>来源与临行复核</h1><p>内容版本 {contentVersion}。题量按独立学习目标决定，不设凑数配额。原始快照与证据记录分开标示；不把社区经验当法律依据。</p><div className="scope-note"><strong>学习辅助，不替代现场标志、现行法规及你的租车合同</strong><p>未完成逐项证据确认的细节不作为计分答案。复核日期不代表适用于所有车辆或所有城市。实际出行前请检查下列动态信息。</p></div><h2>数字与动态规则复核清单</h2><p>建议出发前一个月集中复核；收费、天气和开放状态在临行／当天再次查看。点击题目可找到其对应官方原文。</p>{published.filter(q => q.riskType === "cost" || q.tags.includes("dynamic") || /\d/.test(q.options.find(o => q.correctOptionIds.includes(o.id))?.text || "")).map(q => <details className="result-item" key={q.id}><summary>{countryName[q.country]} · {q.prompt} · {q.lastReviewedAt}{questionState(q, activeDate) ? " · " + questionState(q, activeDate) : ""}</summary>{answerPanel(q)}</details>)}
 <h2>覆盖清单：哪些已做，哪些不猜</h2><div className="coverage-list">{coverage.topics.map(t => <details className="result-item" key={t.title}><summary>{t.title} · {t.status}</summary><p>{t.note}</p><button onClick={() => { setCountry("ALL"); setSearch(""); setCategory("ALL"); navigate("#/learn"); }}>查阅课程</button></details>)}</div><details className="result-item"><summary>社区线索映射（{coverage.community.length} 条）</summary><p>以下为历史采集记录，本轮没有重新核验帖子。主题关联不是对帖子金额、事故或观点的背书；法律答案看官方依据。</p>{coverage.community.map(c => <div key={c.id}><p><a href={c.url} target="_blank" rel="noreferrer">{c.id} · {c.platform} · {c.title}</a></p><p>{c.status} · 关联 {c.questionIds.length} 个题目</p></div>)}</details><h2>材料类型与边界</h2><p>{sources.filter(s => s.archiveStatus === "snapshot").length} 项原始快照、{sources.filter(s => s.archiveStatus === "evidence-record").length} 项证据记录；这两类不能互相替代。图片仅用两国官方标志及有来源许可的当地照片，装饰风景不当作交规证据。</p><p>右方优先、停车支付、城市钉胎费等新增核验进度见交付覆盖表；尚未证实的组合副牌／标线细节保留待核验，不补造题目。</p><h2>全部官方与素材来源</h2><div className="source-list">{sources.map(s => <a key={s.id} href={s.url} target="_blank" rel="noreferrer"><span>{s.country}</span><div><strong>{s.title}</strong><small>{s.publisher} · {s.accessedAt} · {s.archiveStatus === "snapshot" ? "原始快照" : "证据记录"}</small></div><b>↗</b></a>)}</div></section>}
 {!["home", "learn", "quiz", "review", "exam", "scenarios", "quick", "offline", "sources", "question"].includes(view) && <section className="empty-state"><h1>页面不存在</h1><a href="#/">返回首页</a></section>}
 </div>
 <footer className="app-footer"><a href="#/sources">来源与内容边界</a><span>请停车后使用 · 学习进度仅在当前浏览器保存</span></footer>
 <dialog ref={confirmDialog} onClose={() => setConfirmation(null)} className="confirm-dialog" aria-labelledby="confirm-title" aria-describedby="confirm-description"><h2 id="confirm-title">请确认操作</h2><p id="confirm-description">{confirmation?.text}</p><div className="action-row"><button onClick={() => setConfirmation(null)}>取消，保留当前状态</button><button className="exam-button" onClick={() => { const accept = confirmation?.accept; setConfirmation(null); accept?.(); }}>{confirmation?.label || "确认"}</button></div></dialog>
 <dialog ref={dialog} onClose={() => setZoom(null)} className="image-dialog"><button className="dialog-close" onClick={() => setZoom(null)} aria-label="关闭放大图">关闭 ×</button>{zoom && <><img src={assetSrc(zoom)} alt={view === "quiz" && session && !session.finished ? "放大的题目图片" : zoom.alt}/>{view !== "quiz" && <p>{zoom.title} · {zoom.attribution} · <a href={zoom.sourcePageUrl || zoom.url} target="_blank" rel="noreferrer">原始出处</a></p>}</>}</dialog>
 </main>;
}
