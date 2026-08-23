#!/usr/bin/env node

/**
 * Build the quality-first candidate content bundle.
 *
 * The script deliberately leaves data/ untouched.  It carries forward the
 * phase-2 audit decisions, selects action-oriented phase-3 facts, adds one
 * official-meaning question per sign asset, and adds only the ten new scene
 * questions needed to make the forty-photo requirement distinct and balanced.
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const defaultOutputDir = path.join(rootDir, "deliverables", "final-data-candidate");

function readJson(relativePath) {
  const absolutePath = path.join(rootDir, relativePath);
  return JSON.parse(fs.readFileSync(absolutePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function slug(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function unique(values) {
  return [...new Set(values)];
}

function countryCode(country) {
  return country === "Norway" ? "NO" : "IS";
}

function sourceKind(url) {
  if (url.includes("lovdata.no")) return { sourceType: "official-law", authorityLevel: "government" };
  if (url.includes("politiet.no") || url.includes("island.is/en/o/icelandic-police")) {
    return { sourceType: "public-safety", authorityLevel: "official-safety" };
  }
  if (url.includes("safetravel.is")) return { sourceType: "public-safety", authorityLevel: "official-safety" };
  if (url.includes("oslo.kommune.no") || url.includes("bergen.kommune.no")) {
    return { sourceType: "road-authority", authorityLevel: "road-authority" };
  }
  if (url.includes("autopassferje.no") || url.includes("autopassferje.no")) {
    return { sourceType: "road-authority", authorityLevel: "road-authority" };
  }
  if (url.includes("vegvesen.no") || url.includes("vegagerdin.is")) {
    return { sourceType: "road-authority", authorityLevel: "road-authority" };
  }
  if (url.includes("ust.is")) return { sourceType: "official-guidance", authorityLevel: "government" };
  return { sourceType: "official-guidance", authorityLevel: "government" };
}

const questionsSeed = readJson("data/questions.json");
const sourcesSeed = readJson("data/sources.json");
const assets = readJson("data/assets.json");
const audit = readJson("research/question-audit-phase2.json");
const phase3 = readJson("research/official-sources-phase3.json");
const imageManifest = readJson("research/image-manifest.json");

if (imageManifest.assetCount !== assets.length || imageManifest.signCount !== assets.filter((asset) => asset.signCode).length) {
  throw new Error("data/assets.json does not match research/image-manifest.json asset/sign counts");
}

const auditDecision = new Map(audit.questions.map((item) => [item.id, item.decision]));
// Another workstream may stage phase-3 material in data/questions.json while
// this candidate is being built. The phase-2 audit is authoritative for the
// legacy set, so only audited seed rows are carried forward here; non-audited
// rows are generated from the selected phase-3 records below.
const auditedSeedQuestions = questionsSeed.filter((question) => auditDecision.has(question.id));
if (auditedSeedQuestions.length !== audit.questions.length) {
  throw new Error(`phase-2 audited seed mismatch: found ${auditedSeedQuestions.length}, expected ${audit.questions.length}`);
}

const sources = clone(sourcesSeed);
const sourceById = new Map(sources.map((source) => [source.id, source]));
const sourceIdByUrl = new Map(sources.map((source) => [source.url, source.id]));

function ensurePhase3Source(fact, url, title, role) {
  const existing = sourceIdByUrl.get(url);
  if (existing) return existing;
  const code = countryCode(fact.country);
  const id = `src-phase3-${code.toLowerCase()}-${slug(fact.id)}-${role}`;
  const kind = sourceKind(url);
  const source = {
    id,
    country: code,
    title,
    publisher: fact.country === "Norway" ? "Norwegian public authority / statutory source" : "Icelandic public authority / statutory source",
    sourceType: kind.sourceType,
    authorityLevel: kind.authorityLevel,
    url,
    language: "en",
    accessedAt: phase3.accessDate,
    archivePath: `research/official-sources-phase3.json#facts.${fact.id}.${role}`,
    archiveStatus: "evidence-record",
    sha256: sha256(url),
    claimCoverage: [],
    notes: `Phase 3 evidence record ${fact.id}; ${fact.verificationStatus}.`,
  };
  sources.push(source);
  sourceById.set(id, source);
  sourceIdByUrl.set(url, id);
  return id;
}

const phase3ById = new Map(phase3.facts.map((fact) => [fact.id, fact]));

/*
 * These are the phase-3 facts with a driver action or a meaningful decision
 * point.  Pure price tables, infrastructure trivia, and administrative
 * ownership facts stay in the research record rather than becoming filler.
 */
const phase3Content = new Map([
  ["NO-P3-01", {
    prompt: "在挪威环岛内准备变道并驶出时，驾驶员应怎样做？",
    correct: "向已经在环岛内行驶的车辆让行，并在变道或驶出前打转向灯。",
    wrong: ["进入环岛后无论变道都享有优先权。", "只需驶出时打灯，环岛内变道不必让行。", "环岛内永远按左侧车辆先行。"],
    category: "priority", riskType: "safety-critical",
  }],
  ["NO-P3-02", {
    prompt: "在挪威限速不高于 60 km/h 的道路上，公交车打灯准备离站时应怎样处理？",
    correct: "让公交车驶出；即使没有专门公交港湾，只要公交打灯离站也适用让行义务。",
    wrong: ["只有公交车完全驶入港湾后才需要让行。", "限速超过 60 km/h 时仍自动适用这项让行义务。", "公交车从左侧出现时，其他车辆必须抢先通过。"],
    category: "priority", riskType: "safety-critical",
  }],
  ["NO-P3-03", {
    prompt: "在挪威道路上遇到有轨电车时，普通驾驶员通常应怎样做？",
    correct: "给有轨电车让出通行空间；即使电车从左侧来通常也要让行，但电车进入环岛时由电车让行。",
    wrong: ["电车从左侧来时普通车辆始终优先。", "进入环岛后电车仍始终优先进入。", "只有电车鸣笛后才需要让行。"],
    category: "priority", riskType: "safety-critical",
  }],
  ["NO-P3-04", {
    prompt: "挪威人行横道前，一名骑车人骑车横穿与下车推车横穿有何区别？",
    correct: "骑车横穿者不按行人处理，车辆不必仅因其骑车而让行；下车推车步行时车辆必须让行。",
    wrong: ["只要自行车出现在横道上，车辆都必须按行人让行。", "下车推车时反而不享有行人让行待遇。", "骑车人和步行者在横道上的法律身份完全相同。"],
    category: "priority", riskType: "safety-critical",
  }],
  ["NO-P3-05", {
    prompt: "挪威自行车道或人行道上人很多时，骑车人应怎样通过？",
    correct: "只有不妨碍或危及行人时才可骑行；人多时应下车推行。",
    wrong: ["人越多越应按铃加速穿过。", "自行车在任何人行道上都享有绝对优先。", "只要是租来的自行车就可以不受该规则约束。"],
    category: "priority", riskType: "safety-critical",
  }],
  ["NO-P3-06", {
    prompt: "在挪威哪些地点不应骑自行车进入？",
    correct: "高速公路，以及设置自行车禁行标志的道路（包括部分桥梁和隧道）。",
    wrong: ["只要没有行人，任何高速公路都可骑行。", "自行车禁行标志只限制汽车。", "桥梁和隧道永远不会设置自行车禁行。"],
    category: "safety", riskType: "safety-critical",
  }],
  ["NO-P3-07", {
    prompt: "挪威道路上通常从哪一侧超车？遇到前车左转时有何例外？",
    correct: "通常从左侧超车；前车正在或明显准备左转时可从右侧通过，但路口前或视线受阻处通常禁止超车。",
    wrong: ["挪威一律从右侧超车。", "只要前车左转，路口前和视线受阻处都可超车。", "超车方向完全由租车公司规定。"],
    category: "priority", riskType: "safety-critical",
  }],
  ["NO-P3-08", {
    prompt: "在挪威驾车转弯时，直行的行人和骑车人应获得什么待遇？",
    correct: "转弯车辆必须让行给直行的行人、骑车人和小型电动车；穿过人行道转弯时也要让行人行道使用者。",
    wrong: ["转弯车辆只需向机动车让行。", "只有行人停下来后转弯车辆才需要观察。", "穿过人行道转弯时行人必须让车。"],
    category: "priority", riskType: "safety-critical",
  }],
  ["NO-P3-09", {
    prompt: "在挪威发生交通事故后，涉事人员首先应怎样处置？",
    correct: "无论责任归属都停车，穿反光背心并放警示三角牌保护现场，救助伤者并按需要拨打 113；除必要情况外不要在警察到达前离开。",
    wrong: ["只要自己没有过错就可以直接离开。", "先拍照上传社交媒体，之后再决定是否停车。", "事故现场必须把受损车辆留在车道中等待。"],
    category: "safety", riskType: "safety-critical",
  }],
  ["NO-P3-10", {
    prompt: "在挪威撞到动物后，驾驶员必须做什么？",
    correct: "保护并标记现场，并拨打警察非紧急号码 02800 报告；不报告本身可能构成违法。",
    wrong: ["撞到动物本身必然构成违法，但无需报告。", "只要动物跑开就不必留下任何信息。", "只能拨打 113，不能向警察报告动物碰撞。"],
    category: "safety", riskType: "safety-critical",
  }],
  ["NO-P3-11", {
    prompt: "挪威隧道内起火时，车辆仍能行驶和无法驶出两种情况分别怎么做？",
    correct: "能安全驶出就驶出并用隧道紧急电话报告；无法驶出时靠边、开危险警示灯并步行撤离。",
    wrong: ["无论情况如何都掉头逆行驶出。", "留在车内等待烟雾散去即可。", "看到红灯或落杆后仍可继续进入隧道。"],
    category: "safety", riskType: "safety-critical",
  }],
  ["NO-P3-12", {
    prompt: "在挪威需要紧急警察、医疗或非紧急警察帮助时，应分别拨打哪些号码？",
    correct: "紧急危险拨 112，人员受伤的医疗急救拨 113，非紧急警察事务拨 02800。",
    wrong: ["所有情况都拨 02800，紧急情况也一样。", "警察和医疗急救都统一拨 110。", "只有租车公司可以拨打紧急号码。"],
    category: "safety", riskType: "safety-critical",
  }],
  ["NO-P3-13", {
    prompt: "在挪威出发前准备经过山口或恶劣天气路段，应查看什么？",
    correct: "使用 Vegvesen trafikk 查看路线、山口、恶劣天气道路、桥梁和隧道的实时警报与状态。",
    wrong: ["只看几年前的纸质地图即可判断当天是否开放。", "只要导航能规划路线，官方道路状态就不必查看。", "山口状态只由住宿平台发布。"],
    category: "weather", riskType: "navigation",
  }],
  ["NO-P3-14", {
    prompt: "挪威官方 DATEX II 交通消息通常覆盖哪些情况？",
    correct: "持续发布施工、临时管制、事故、风暴、滑坡和洪水等消息，并可筛选事故或封路。",
    wrong: ["DATEX II 只发布燃油价格。", "DATEX II 只记录已经结束的历史事故。", "交通消息只能由私人车队内部查看。"],
    category: "weather", riskType: "navigation",
  }],
  ["NO-P3-15", {
    prompt: "在挪威乘坐参与 AutoPASS for ferry 的渡轮但没有标签、预付协议或 FerryPay 时，通常会怎样？",
    correct: "系统读取车牌后向车主寄送全价发票，并收取含增值税的 35 NOK 发票费；外国车辆欠款可由 Epass24 处理。",
    wrong: ["没有标签就自动获得预付协议折扣。", "车牌不会被读取，必须现场现金支付才算完成。", "35 NOK 是交通违法罚款而不是发票费。"],
    category: "tolls", riskType: "cost",
  }],
  ["NO-P3-16", {
    prompt: "挪威 AutoPASS for ferry 预付协议和获批标签对渡轮费用有什么作用？",
    correct: "参与范围内，私人客户可享 50% 折扣、企业客户可享 40% 折扣；部分航线可能被排除。",
    wrong: ["所有航线和所有付款方式都自动享 100% 折扣。", "只有现金付款才有预付折扣。", "企业客户的折扣固定高于私人客户。"],
    category: "tolls", riskType: "cost",
  }],
  ["NO-P3-18", {
    prompt: "开车经过奥斯陆时使用钉胎，哪项做法符合当地官方要求？",
    correct: "即使只是穿行奥斯陆，也要在市界内使用有效钉胎费贴；季节和费率应按市政府当前页面复核。",
    wrong: ["只有在奥斯陆停车过夜才需要钉胎费贴。", "钉胎费只适用于奥斯陆市中心一条街。", "费率永久固定，出发前无需查看当前季节页面。"],
    category: "tolls", riskType: "seasonal",
  }],
  ["NO-P3-19", {
    prompt: "在奥斯陆市界内使用钉胎却没有有效费贴，会有什么直接后果？",
    correct: "所有车辆都可能被收取 750 NOK 的钉胎附加费；具体迟延付款规则按当前页面执行。",
    wrong: ["没有费贴只会收到提醒，不会产生任何费用。", "附加费只适用于重型车辆。", "钉胎附加费与车辆是否使用钉胎无关。"],
    category: "tolls", riskType: "cost",
  }],
  ["NO-P3-21", {
    prompt: "在挪威公交、出租车或有轨电车站附近停车时，应留意哪条距离规则？",
    correct: "不得停在站点延伸区域或公共站牌 20 米内；短暂停靠上下客也不能妨碍公共交通运行。",
    wrong: ["站牌 20 米内只要打开双闪就可以长时间停车。", "只有公交站延伸区域受限，站牌附近没有距离要求。", "上下客妨碍公交运行时仍可继续占用站点。"],
    category: "parking", riskType: "safety-critical",
  }],
  ["NO-P3-22", {
    prompt: "在奥斯陆因交通、道路或交通标志违规收到停车费时，应怎样处理？",
    correct: "官方页面列出的该类停车费为 900 NOK，应在 3 周内支付；车辆也可能被拖移或拖走。",
    wrong: ["停车费只需在租车归还时口头说明。", "所有停车费都有一年付款期限。", "收到停车费后车辆绝不会被拖移。"],
    category: "parking", riskType: "cost",
  }],
  ["NO-P3-23", {
    prompt: "挪威道路出现 HOV/公共交通车道标志“2+”时，数字通常表示什么？",
    correct: "车内至少要有标志所示人数，并且把驾驶员计入人数；公交、两轮摩托、自行车和应急车辆按标志规则另有通行权限。",
    wrong: ["“2+”表示至少两名乘客，不计驾驶员。", "看到 HOV 标志任何单人电动车都自动获准通行。", "HOV 车道标志只适用于停车，不影响行驶。"],
    category: "priority", riskType: "general",
  }],
  ["NO-P3-24", {
    prompt: "挪威 Tempo 100 拖挂批准主要覆盖哪类拖车组合？",
    correct: "O1（不超过 750 kg）和 O2（超过 750 kg 至 3,500 kg）拖车可申请；牵引车需有 ABS 且最大允许总质量不超过 3,500 kg。",
    wrong: ["Tempo 100 只适用于自行车架，不适用于房车。", "牵引车质量和 ABS 与批准无关。", "超过 3,500 kg 的牵引车自动符合 Tempo 100。"],
    category: "vehicles", riskType: "safety-critical",
  }],
  ["NO-P3-25", {
    prompt: "在挪威给车辆装载行李和车顶箱时，官方安全建议是什么？",
    correct: "重物放低并固定，车顶箱放轻物；同时按用户手册或登记证核对车顶架和最大车顶载荷。",
    wrong: ["所有重物都应放在车顶箱最上层。", "只要车门能关上就不必固定行李。", "车顶载荷对不同车辆有统一的全国固定公斤数。"],
    category: "vehicles", riskType: "safety-critical",
  }],
  ["NO-P3-26", {
    prompt: "在挪威，登记在企业名下且超过 3,500 kg 的车辆需要怎样支付通行费？",
    correct: "必须携带有效的通行费标签；私用的 3,500 kg 以上房车或 SUV 不属于这项特定企业车辆强制标签规则。",
    wrong: ["所有超过 3,500 kg 的私人房车也无条件适用同一企业标签规则。", "只有小客车需要标签，重型企业车辆无需标签。", "通行费标签只和停车费有关。"],
    category: "tolls", riskType: "cost",
  }],
  ["NO-P3-28", {
    prompt: "挪威驾驶大型或特殊尺寸车辆规划路线时，应如何判断重量和尺寸限制？",
    correct: "查看具体道路的官方重量、轴载、总质量、长宽高清单；不能用一个通用车辆假设替代路线清单。",
    wrong: ["全国所有道路对同一车型都使用同一个尺寸上限。", "只要导航能通行，路线清单就不必看。", "尺寸限制只在收费站现场才会公布。"],
    category: "vehicles", riskType: "navigation",
  }],
  ["NO-P3-29", {
    prompt: "挪威窄路上的 524 号会车让行处标志意味着什么？",
    correct: "它标出窄路上的会车地点，该处禁止停车，不能当作可以过夜的景观停车点。",
    wrong: ["524 号标志表示可以在此长期停车。", "会车让行处只限制卡车，普通车可以占用。", "该标志表示前方一定有加油站。"],
    category: "parking", riskType: "safety-critical",
  }],
  ["NO-P3-30", {
    prompt: "挪威应急响应车辆在执行必要任务时可以偏离普通交通规则，但哪些规则仍必须遵守？",
    correct: "应急例外仅在服务需要时适用；速度规则和交通信号灯规定始终必须遵守，普通驾驶员不能照搬该例外。",
    wrong: ["任何驾驶员遇到赶时间都可以使用应急车辆例外。", "应急车辆可以在红灯和限速上完全不受约束。", "应急例外只适用于停车，不涉及其他交通规则。"],
    category: "safety", riskType: "safety-critical",
  }],
  ["IS-P3-01", {
    prompt: "冰岛官方所称 F-road 通常具有什么道路特征？",
    correct: "通常异常不平、崎岖或陡峭，和/或有一个以上未设桥的河流穿越；F-road 分类不等于普通租车一定适合。",
    wrong: ["所有 F-road 都是铺装高速公路。", "F-road 标志自动保证任何两驱租车都能安全通过。", "F-road 只按景点名称分类，与路况无关。"],
    category: "weather", riskType: "safety-critical",
  }],
  ["IS-P3-02", {
    prompt: "计划驾驶冰岛高地山路时，如何处理开放时间和车辆适配？",
    correct: "山路常年只开放几个月；Sprengisandsleið 等路段可能到 7 月初才完全开放，并按官方提示仅允许大型四驱或超级吉普通过。",
    wrong: ["所有高地山路全年开放，季节无需确认。", "任何小型两驱租车都自动适合 Sprengisandsleið。", "山路开放只由租车公司口头决定。"],
    category: "weather", riskType: "seasonal",
  }],
  ["IS-P3-03", {
    prompt: "冰岛高地道路什么时候开放，驾驶员应以什么信息为准？",
    correct: "积雪是重要因素；即使路面看似无雪，保护区也可能因承载能力不足继续封闭，应查看 IRCA、环境机构地图和 road.is。",
    wrong: ["只要 GPS 显示道路存在就代表已经开放。", "高地道路每年固定同一天开放。", "保护区内道路开放完全由游客投票决定。"],
    category: "weather", riskType: "navigation",
  }],
  ["IS-P3-04", {
    prompt: "冰岛关闭的 F-road 尚未准备好车辆通行时，驾驶员应如何做？",
    correct: "遵守封闭政策并等待官方开放；在未准备好的道路上行驶可能造成持久损坏并面临重罚。",
    wrong: ["只要车辆是四驱，封路标志就可以忽略。", "封闭 F-road 上留下车辙有助于道路维护。", "遇到封路应绕过道路边界自行开辟新轨迹。"],
    category: "weather", riskType: "safety-critical",
  }],
  ["IS-P3-05", {
    prompt: "冰岛单车道桥前后两车接近时，谁通常先通过？",
    correct: "先到达桥头的车辆先过；应减速，无法判断时让另一辆车先过，桥上速度建议为 50 km/h。",
    wrong: ["桥上车辆永远必须倒车让后来车辆。", "单车道桥按车辆大小自动决定优先权。", "接近桥梁时应加速抢先通过。"],
    category: "priority", riskType: "safety-critical",
  }],
  ["IS-P3-06", {
    prompt: "冰岛遇到未设桥的河流时，何时可以继续通过？",
    correct: "只有确认渡口可通行且车辆适合时才通过；有疑问就掉头，未设桥河流主要位于 F-road。",
    wrong: ["只要水面看起来平静，任何车辆都可以直接通过。", "未设桥河流必须在最深处直线冲过。", "遇到疑问应停车等待水位自然下降而不是掉头。"],
    category: "weather", riskType: "safety-critical",
  }],
  ["IS-P3-07", {
    prompt: "在冰岛高地或无人区驾驶时，越野驶离道路会有什么后果？",
    correct: "只能在道路和标记步道上行驶；越野驾驶严格禁止，可能被罚款或判监禁，路不可通时应步行或掉头。",
    wrong: ["只要没有看到植被，越野就被默许。", "租车四驱车型可以自动获得越野许可。", "遇到不可通路段应在旁边开出新车辙。"],
    category: "safety", riskType: "safety-critical",
  }],
  ["IS-P3-08", {
    prompt: "在冰岛未耕地上搭传统帐篷过夜时，通常的数量和时限边界是什么？",
    correct: "除非土地所有者禁止，否则最多三顶传统帐篷可住一晚；帐篷更多或停留更久需获许可，有营地时应使用营地。",
    wrong: ["任何数量帐篷都可无限期停留。", "只要是游客就不需要土地所有者许可。", "规则要求所有帐篷必须停在公路路肩。"],
    category: "weather", riskType: "seasonal",
  }],
  ["IS-P3-09", {
    prompt: "冰岛房车、拖挂房车或露营车想在有组织营地外过夜时，应满足什么条件？",
    correct: "除非得到土地所有者或权利人的许可，否则不得在有组织营地或城镇区域之外过夜。",
    wrong: ["车辆带睡袋就可在任何路边过夜。", "只有帐篷受营地规则限制，房车永远不受限制。", "只要购买了租车保险就自动获得露营许可。"],
    category: "weather", riskType: "seasonal",
  }],
  ["IS-P3-10", {
    prompt: "在冰岛保护区露营前，为什么不能只套用一般的野外帐篷规则？",
    correct: "保护区可能禁止标记区域外露营，或要求护林员/机构许可；应按具体保护区规定核验。",
    wrong: ["保护区规则永远比一般规则宽松。", "只要不生火，保护区内任何地点都可露营。", "保护区露营规则只由租车合同决定。"],
    category: "weather", riskType: "seasonal",
  }],
  ["IS-P3-11", {
    prompt: "冰岛拖挂车辆遇到大风时，哪些风速范围需要特别谨慎？",
    correct: "持续风约 15–19 m/s、阵风约 15–25 m/s 时，拖挂可能被吹离道路，应特别评估路线和车辆组合。",
    wrong: ["只有无风时拖挂才需要检查道路。", "阵风越大越应加速通过暴露路段。", "拖挂车辆完全不受侧风影响。"],
    category: "weather", riskType: "seasonal",
  }],
  ["IS-P3-12", {
    prompt: "冰岛强风中停车开门时，官方安全建议是什么？",
    correct: "确认风向，让车门背向风，紧握车门并一次只开一扇门，避免车门损坏或失去控制。",
    wrong: ["把车门朝向风打开可减轻风力。", "强风中应同时打开所有车门通风。", "停车后可以松手让车门自行关闭。"],
    category: "weather", riskType: "safety-critical",
  }],
  ["IS-P3-16", {
    prompt: "冰岛驾驶员超越自行车或轻便摩托车时，至少应留出多少侧向距离？",
    correct: "至少 1.5 米；官方罚款计算器把 1.5 米或更少列为 20,000 ISK 的不足距离类别。",
    wrong: ["只要不碰到自行车，0.5 米也总是足够。", "侧向距离只适用于大型卡车。", "超过自行车时应尽量贴近以缩短超车时间。"],
    category: "priority", riskType: "safety-critical",
  }],
  ["IS-P3-17", {
    prompt: "在冰岛路口右转时，行人和骑车人具有怎样的优先权？",
    correct: "右转车辆必须让行给行人和骑车人，并确认此前被超越的骑车人不会被右转动作切断路线。",
    wrong: ["右转车辆永远优先于直行骑车人。", "只要已经完成超车，右转时就无需再观察自行车。", "该规则只适用于环岛，不适用于路口。"],
    category: "priority", riskType: "safety-critical",
  }],
  ["IS-P3-18", {
    prompt: "冰岛双车道环岛内圈和外圈之间通常如何让行？",
    correct: "内圈相对于外圈具有优先权；仍应根据现场标志和车道线提前准备。",
    wrong: ["外圈车辆永远优先于内圈车辆。", "环岛内各车道没有任何让行关系。", "只要打灯，变道车辆就自动优先。"],
    category: "priority", riskType: "safety-critical",
  }],
  ["IS-P3-19", {
    prompt: "冰岛碰撞事故只有同时满足哪些条件时，才可能不必向警方报告？",
    correct: "无人受伤、已取得对方驾驶员或车主信息、且没有发生交通违法；否则应报告，危险或需警方到场时拨 112。",
    wrong: ["只要车辆还能开，任何碰撞都无需报告。", "只要双方口头同意，就算有人受伤也不用报告。", "只有游客必须报告，本地驾驶员不必报告。"],
    category: "safety", riskType: "safety-critical",
  }],
  ["IS-P3-20", {
    prompt: "在冰岛遇到需要警察、救援或医疗紧急帮助的情况，应拨打什么号码？",
    correct: "拨打 112；该号码处理冰岛境内全年全天的各类紧急服务和求助。",
    wrong: ["紧急情况拨 1777，112 只用于道路查询。", "只能联系租车公司，不能直接拨打紧急服务。", "112 仅在工作日白天接听。"],
    category: "safety", riskType: "safety-critical",
  }],
  ["IS-P3-29", {
    prompt: "冰岛铺装路转为碎石路时，驾驶员应怎样调整？",
    correct: "在铺装路转为碎石路前先减速；碎石路抓地力、飞石和扬尘风险都要求按路况进一步降低速度。",
    wrong: ["进入碎石路前加速可以让轮胎更稳定。", "碎石路的 80 km/h 上限意味着任何天气都应保持 80。", "遇到扬尘时应打开远光灯并紧贴前车。"],
    category: "weather", riskType: "safety-critical",
  }],
]);

const selectedFacts = phase3.facts.filter((fact) => phase3Content.has(fact.id));
if (selectedFacts.length !== phase3Content.size) throw new Error("phase-3 content map contains an unknown fact id");
for (const fact of selectedFacts) {
  if (!fact.secondSource?.url || !fact.primaryUrl) throw new Error(`${fact.id} lacks two official URLs`);
}

const verifiedFacts = new Set([
  "NO-P3-08", "NO-P3-09", "NO-P3-10", "NO-P3-11", "NO-P3-12", "NO-P3-14", "NO-P3-18", "NO-P3-26",
  "IS-P3-02", "IS-P3-03", "IS-P3-04", "IS-P3-07", "IS-P3-09", "IS-P3-11", "IS-P3-12",
]);

function makeBaseQuestion({ id, country, type, category, riskType, prompt, options, correctOptionIds, explanation, sourceIds, assetIds, tags, status = "published", difficulty = "core" }) {
  return {
    id,
    country,
    locale: "zh-CN",
    type,
    category,
    difficulty,
    riskType,
    appliesFrom: null,
    appliesTo: null,
    tripPriority: riskType === "safety-critical" ? 1 : riskType === "navigation" ? 2 : 3,
    prompt,
    options,
    correctOptionIds,
    explanation,
    sourceIds: unique(sourceIds),
    assetIds: unique(assetIds),
    tags: unique(tags),
    status,
    lastReviewedAt: phase3.accessDate,
  };
}

const questions = [];
for (const seed of auditedSeedQuestions) {
  const decision = auditDecision.get(seed.id);
  const question = clone(seed);
  question.status = decision === "keep" ? "published" : "retired";
  if (question.status === "published" && question.id === "is-livestock") question.sourceIds = unique([...question.sourceIds, "src-is-driving-pdf"]);
  if (question.status === "published" && question.id === "is-vadla-price") question.sourceIds = unique([...question.sourceIds, "src-research-is-vadla-faq"]);
  questions.push(question);
}

function addPhase3Question(fact, status = "published", assetIds = [], idPrefix = "phase3") {
  const content = phase3Content.get(fact.id);
  const country = countryCode(fact.country);
  const primarySourceId = ensurePhase3Source(fact, fact.primaryUrl, fact.officialTitle, "primary");
  const secondSourceId = ensurePhase3Source(fact, fact.secondSource.url, fact.secondSource.title, "secondary");
  const options = [
    { id: "a", text: content.correct },
    ...content.wrong.map((text, index) => ({ id: String.fromCharCode(98 + index), text })),
  ];
  const q = makeBaseQuestion({
    id: `${idPrefix}-${slug(fact.id)}-${slug(fact.topic)}`,
    country,
    type: "single_choice",
    category: content.category,
    riskType: content.riskType,
    prompt: content.prompt,
    options,
    correctOptionIds: ["a"],
    explanation: `${content.correct}（Phase 3 事实的适用说明：${fact.applicableDate}；原始结论：${fact.conclusion}。）`,
    sourceIds: [primarySourceId, secondSourceId],
    assetIds,
    tags: ["phase3", `phase3:${fact.id}`, `topic:${slug(fact.topic)}`],
    status,
    difficulty: content.riskType === "safety-critical" ? "core" : "advanced",
  });
  if (questions.some((candidate) => candidate.id === q.id)) throw new Error(`duplicate generated question id ${q.id}`);
  questions.push(q);
  return q;
}

const phase3Illustrations = new Map([
  ["NO-P3-01", ["no-sign-202"]],
  ["NO-P3-13", ["no-sign-116"]],
]);
for (const fact of selectedFacts) {
  addPhase3Question(fact, verifiedFacts.has(fact.id) ? "verified" : "published", phase3Illustrations.get(fact.id) || []);
}

const signAssets = assets.filter((asset) => asset.signCode);
if (signAssets.length !== 104) throw new Error(`expected 104 sign assets, found ${signAssets.length}`);
const signSourceIds = {
  NO: ["src-assets-no-official-signs", "src-research-no-signs"],
  IS: ["src-assets-is-official-signs", "src-is-signs"],
};
for (const asset of signAssets) {
  const country = asset.country;
  const sameCountry = signAssets.filter((candidate) => candidate.country === country && candidate.id !== asset.id);
  const distractors = sameCountry.filter((candidate) => candidate.signCode !== asset.signCode).slice(0, 3);
  const options = [
    { id: "a", text: asset.alt || asset.title },
    ...distractors.map((candidate, index) => ({ id: String.fromCharCode(98 + index), text: candidate.alt || candidate.title })),
  ];
  const q = makeBaseQuestion({
    id: `sign-${asset.id}`,
    country,
    type: "image_choice",
    category: "signs",
    riskType: "navigation",
    prompt: `图中${country === "NO" ? "挪威" : "冰岛"}官方标志代码 ${asset.signCode} 的含义是什么？`,
    options,
    correctOptionIds: ["a"],
    explanation: `这是一枚${country === "NO" ? "挪威" : "冰岛"}官方标志 ${asset.signCode}；图像的官方说明为“${asset.alt || asset.title}”。`,
    sourceIds: signSourceIds[country],
    assetIds: [asset.id],
    tags: ["official-sign", `sign:${asset.signCode}`, `asset:${asset.id}`],
    difficulty: "core",
  });
  if (questions.some((candidate) => candidate.id === q.id)) throw new Error(`duplicate sign question id ${q.id}`);
  questions.push(q);
}

const keepPhotoIds = new Set(
  auditedSeedQuestions
    .filter((question) => auditDecision.get(question.id) === "keep")
    .flatMap((question) => question.assetIds || [])
    .filter((id) => id.startsWith("no-photo-") || id.startsWith("is-photo-")),
);
const unusedPhotos = assets.filter((asset) => asset.localPath?.replaceAll("\\", "/").includes("/photos/") && !keepPhotoIds.has(asset.id));
const photoPlan = [
  { assetId: "no-photo-sandnes-rv44", factId: "NO-P3-13", prompt: "图中的挪威道路准备纳入山地行程时，出发前应做哪项核验？" },
  { assetId: "no-photo-rallarvegen-haugastol", factId: "NO-P3-13", prompt: "看到这段挪威高山道路实景，驾驶员应先查看哪类官方信息？" },
  { assetId: "no-photo-maridalen-oslo", factId: "NO-P3-14", prompt: "计划经过图示挪威道路时，哪项官方交通信息最适合用来发现临时封路或事故？" },
  { assetId: "no-photo-gamle-aurlandsvegen", factId: "NO-P3-13", prompt: "图示挪威山路可能受天气影响时，哪项行前动作最稳妥？" },
  { assetId: "no-photo-butunnelen-hardangerbridge", factId: "NO-P3-11", prompt: "图示挪威隧道内若发生火灾且车辆还能安全行驶，应怎样处理？" },
  { assetId: "no-photo-fjellet-phus-tromso", factId: "NO-P3-22", prompt: "图示挪威停车隧道的停车设施发生违规停车时，驾驶员应留意什么后果和期限？" },
  { assetId: "no-photo-frafjordtunnelen", factId: "NO-P3-11", prompt: "在图示挪威隧道内遇到火情、车辆无法继续行驶时，应怎样撤离？" },
  { assetId: "no-photo-klostergarasjen-bergen", factId: "NO-P3-22", prompt: "图示挪威停车场出口发生停车违规收费时，应依据什么官方要求处理？" },
  { assetId: "no-photo-oppdal-station-parking", factId: "NO-P3-22", prompt: "图示挪威车站停车区域收到停车费通知后，哪项说法符合官方流程？" },
  { assetId: "no-photo-riksveg50-aurland", factId: "NO-P3-13", prompt: "把图示挪威山路列入路线前，驾驶员应先确认哪类实时状态？" },
  { assetId: "no-photo-rv15-strynefjellet", factId: "NO-P3-13", prompt: "经过图示挪威山口道路前，为什么要检查官方山口和天气状态？" },
  { assetId: "no-photo-rv827-closed-nordland", factId: "NO-P3-14", prompt: "图示挪威道路出现封闭或事故迹象时，驾驶员应依靠什么做决定？" },
  { assetId: "no-photo-rv827-brattlitunnel", factId: "NO-P3-11", prompt: "图示挪威隧道内若发生火灾且车辆无法驶出，第一步应做什么？" },
  { assetId: "no-photo-sandefjord-parkomat", factId: "NO-P3-22", prompt: "在图示挪威停车设施收到违规停车费后，应怎样处理付款和车辆风险？" },
  { assetId: "is-photo-route-f35", factId: "IS-P3-01", prompt: "图示冰岛 F35 高地道路属于哪类道路，租车前应怎样理解？" },
  { assetId: "is-photo-skaftafell-route1", factId: "IS-P3-05", prompt: "图示冰岛 Skaftafell 附近单车道桥前，两车接近时谁通常先通过？" },
  { assetId: "is-photo-road60-gravel", factId: "IS-P3-29", prompt: "图示冰岛 60 号公路由铺装转为碎石时，驾驶员应怎样调整速度？" },
  { assetId: "is-photo-foss-a-sidu-ring-road", factId: "IS-P3-05", prompt: "图示冰岛道路桥梁若为单车道桥，两车接近时应按什么原则通过？" },
  { assetId: "is-photo-landmannaleid-f225", factId: "IS-P3-02", prompt: "图示冰岛 F225 高地道路准备纳入行程时，应先核对什么？" },
  { assetId: "is-photo-namafjall-route1", factId: "IS-P3-03", prompt: "图示冰岛高地路线受季节和保护区条件影响时，应以什么信息判断是否开放？" },
  { assetId: "is-photo-fossholli-ring-road-bridge", factId: "IS-P3-05", prompt: "图示冰岛环城公路桥梁若为单车道桥，遇到对向车时应怎样处理？" },
  { assetId: "is-photo-gjadalsa-road1-bridge", factId: "IS-P3-05", prompt: "图示冰岛 1 号公路桥前视线有限时，驾驶员应如何决定先后？" },
  { assetId: "is-photo-f910-kreppa-bridge", factId: "IS-P3-06", prompt: "图示冰岛 F910 河桥附近若遇到未设桥河流，应满足什么条件才可通过？" },
  { assetId: "is-photo-landmannalaugar-dirt-road", factId: "IS-P3-04", prompt: "图示冰岛高地土路处于封闭或未准备好状态时，驾驶员应怎样做？" },
  { assetId: "is-photo-f910-jokulsa-bridge", factId: "IS-P3-06", prompt: "图示冰岛 F910 河流桥附近出现未设桥渡口时，有疑问应采取什么动作？" },
  { assetId: "is-photo-f35-bridge", factId: "IS-P3-05", prompt: "图示冰岛 F35 桥为单车道时，哪条让行原则最重要？" },
  { assetId: "is-photo-skeidararsandur-dust-storm", factId: "IS-P3-03", prompt: "图示冰岛道路受天气影响、能见度不佳时，是否仅凭路面无积雪就可通行？" },
  { assetId: "is-photo-f98-highland-road", factId: "IS-P3-01", prompt: "图示冰岛 F98 高地道路的 F-road 分类对普通租车意味着什么？" },
];
const unusedPhotoIds = new Set(unusedPhotos.map((asset) => asset.id));
if (photoPlan.some((item) => !unusedPhotoIds.has(item.assetId))) throw new Error("photo plan reuses a keep photo or references a missing photo");
for (const item of photoPlan) {
  const asset = assets.find((candidate) => candidate.id === item.assetId);
  const fact = phase3ById.get(item.factId);
  const content = phase3Content.get(item.factId);
  const primarySourceId = ensurePhase3Source(fact, fact.primaryUrl, fact.officialTitle, "primary");
  const secondSourceId = ensurePhase3Source(fact, fact.secondSource.url, fact.secondSource.title, "secondary");
  const q = makeBaseQuestion({
    id: `photo-${asset.id}`,
    country: asset.country,
    type: "single_choice",
    category: content.category,
    riskType: content.riskType,
    prompt: item.prompt,
    options: [
      { id: "a", text: content.correct },
      ...content.wrong.map((text, index) => ({ id: String.fromCharCode(98 + index), text })),
    ],
    correctOptionIds: ["a"],
    explanation: `${content.correct} 图片为${asset.title}；资产的国家证据为：${asset.countryEvidence}`,
    sourceIds: [primarySourceId, secondSourceId],
    assetIds: [asset.id],
    tags: ["real-photo", `photo:${asset.id}`, `phase3:${item.factId}`],
    difficulty: "core",
  });
  if (questions.some((candidate) => candidate.id === q.id)) throw new Error(`duplicate photo question id ${q.id}`);
  questions.push(q);
}

const questionIdSet = new Set(questions.map((question) => question.id));
if (questionIdSet.size !== questions.length) throw new Error("generated question IDs are not unique");
for (const source of sources) {
  const covered = new Set((source.claimCoverage || []).filter((id) => questionIdSet.has(id)));
  for (const question of questions) if (question.sourceIds.includes(source.id)) covered.add(question.id);
  source.claimCoverage = [...covered];
}

const sourceIdSet = new Set(sources.map((source) => source.id));
for (const question of questions) for (const sourceId of question.sourceIds) if (!sourceIdSet.has(sourceId)) throw new Error(`${question.id} references missing source ${sourceId}`);

const published = questions.filter((question) => question.status === "published");
const candidates = questions.filter((question) => question.status === "published" || question.status === "verified");
const countryPublished = Object.fromEntries(["NO", "IS"].map((country) => [country, published.filter((question) => question.country === country).length]));
const imageQuestions = published.filter((question) => question.assetIds.length > 0);
const photoAssetIds = new Set(assets.filter((asset) => asset.localPath?.replaceAll("\\", "/").includes("/photos/")).map((asset) => asset.id));
const photoQuestions = published.filter((question) => question.assetIds.some((id) => photoAssetIds.has(id)));
const uniquePhotoIds = new Set(photoQuestions.flatMap((question) => question.assetIds.filter((id) => photoAssetIds.has(id))));
if (photoQuestions.length !== 40 || uniquePhotoIds.size !== 40) throw new Error(`photo invariant failed: ${photoQuestions.length} questions / ${uniquePhotoIds.size} unique photos`);
for (const country of ["NO", "IS"]) {
  const count = photoQuestions.filter((question) => question.country === country).length;
  if (count !== 20) throw new Error(`photo country invariant failed for ${country}: ${count}`);
}
for (const question of published.filter((candidate) => candidate.type === "image_choice")) {
  const first = assets.find((asset) => asset.id === question.assetIds[0]);
  if (!first?.signCode) throw new Error(`${question.id} image_choice does not start with a sign asset`);
}

const manifest = {
  schemaVersion: 1,
  id: "nordic-road-ready-final-candidate",
  version: "2026.08.18-quality-candidate",
  locale: "zh-CN",
  generatedAt: "2026-08-18T00:00:00.000Z",
  questionIds: questions.map((question) => question.id),
  sourceIds: sources.map((source) => source.id),
  assetIds: assets.map((asset) => asset.id),
  countries: ["NO", "IS"].map((country) => ({
    country,
    questionIds: questions.filter((question) => question.country === country).map((question) => question.id),
    minimumPublishedQuestions: countryPublished[country],
  })),
  releasePolicy: {
    minimumPublishedQuestions: published.length,
    minimumPublishedQuestionsPerCountry: Math.min(countryPublished.NO, countryPublished.IS),
    minimumVerifiedOrPublishedQuestions: candidates.length,
    maximumVerifiedOrPublishedQuestions: candidates.length,
    minimumImageQuestions: imageQuestions.length,
    minimumRealPhotoQuestions: photoQuestions.length,
    requireTwoSources: true,
    requireLicensedAssets: true,
  },
};

const outputDir = process.argv.find((argument) => argument.startsWith("--out-dir="))?.slice("--out-dir=".length) || defaultOutputDir;
const resolvedOutputDir = path.resolve(rootDir, outputDir);
fs.mkdirSync(resolvedOutputDir, { recursive: true });
writeJson(path.join(resolvedOutputDir, "questions.json"), questions);
writeJson(path.join(resolvedOutputDir, "sources.json"), sources);
writeJson(path.join(resolvedOutputDir, "manifest.json"), manifest);

console.log(JSON.stringify({
  outputDir: resolvedOutputDir,
  questions: questions.length,
  candidates: candidates.length,
  published: published.length,
  verified: candidates.filter((question) => question.status === "verified").length,
  retired: questions.filter((question) => question.status === "retired").length,
  publishedByCountry: countryPublished,
  sources: sources.length,
  assets: assets.length,
  imageQuestions: imageQuestions.length,
  realPhotoQuestions: photoQuestions.length,
  uniquePhotos: uniquePhotoIds.size,
  selectedPhase3Facts: selectedFacts.length,
  signQuestions: published.filter((question) => question.type === "image_choice").length,
}, null, 2));
