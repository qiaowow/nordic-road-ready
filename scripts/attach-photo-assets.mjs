import { readFile, writeFile } from "node:fs/promises";

const mappings = {
  "no-photo-fjellet-phus-tromso": "no-parking-forbidden-spots",
  "no-photo-frafjordtunnelen": "no-lights-tunnel",
  "no-photo-klostergarasjen-bergen": "no-parking-fine",
  "no-photo-oppdal-station-parking": "no-parking-junction-distance",
  "no-photo-riksveg50-aurland": "no-speed-default",
  "no-photo-rv15-strynefjellet": "no-winter-grip",
  "no-photo-rv827-closed-nordland": "no-north-winter-window",
  "no-photo-rv827-brattlitunnel": "no-drl-rear-lights",
  "no-photo-sandefjord-parkomat": "no-parking-fine-cap",
  "no-photo-skibotndalen-e8": "no-speed-points-high",
  "no-photo-sthansfjell-tunnel": "no-fog-lights",
  "no-photo-stromsastunnelen-drammen": "no-lights",
  "no-photo-sorastunnelen-bergen": "no-road-toll-foreign-car",
  "no-photo-tindevegen-hurrungbotn": "no-studded-normal-window",
  "no-photo-vesttunnelen-sandvika": "no-tolls",
  "is-photo-fossholli-ring-road-bridge": "is-speed-paved-default",
  "is-photo-gjadalsa-road1-bridge": "is-lights-front-rear",
  "is-photo-f910-kreppa-bridge": "is-km-weight-rate",
  "is-photo-landmannalaugar-dirt-road": "is-closed-road",
  "is-photo-f910-jokulsa-bridge": "is-km-odometer-duty",
  "is-photo-f35-bridge": "is-parking-tunnel-bridge",
  "is-photo-skeidararsandur-dust-storm": "is-lights",
  "is-photo-f98-highland-road": "is-km-all-vehicles",
  "is-photo-highway35": "is-km-energy-date",
  "is-photo-icelandic-sheep-road-risk": "is-livestock",
  "is-photo-ring-road-vatnajokull": "is-seatbelts",
  "is-photo-hoffell-single-lane-bridge": "is-handsfree",
  "is-photo-road1-jokulsa-loni-bridge": "is-child-seat",
  "is-photo-monikubru-austurdalur": "is-km-light-rate",
};

const [questionsRaw, assetsRaw] = await Promise.all([
  readFile("data/questions.json", "utf8"),
  readFile("data/assets.json", "utf8"),
]);
const questions = JSON.parse(questionsRaw);
const assets = JSON.parse(assetsRaw);
const assetById = new Map(assets.map((asset) => [asset.id, asset]));
const questionById = new Map(questions.map((question) => [question.id, question]));

let attached = 0;
for (const [assetId, questionId] of Object.entries(mappings)) {
  const asset = assetById.get(assetId);
  const question = questionById.get(questionId);
  if (!asset) throw new Error(`Missing photo asset: ${assetId}`);
  if (!question) throw new Error(`Missing target question: ${questionId}`);
  if (asset.country !== question.country) throw new Error(`Country mismatch: ${assetId} -> ${questionId}`);
  if (!question.assetIds.includes(assetId)) {
    question.assetIds.unshift(assetId);
    attached += 1;
  }
}

const photoIds = new Set(
  assets.filter((asset) => asset.localPath?.replaceAll("\\", "/").includes("/photos/")).map((asset) => asset.id),
);
for (const question of questions) {
  if (question.type === "image_choice") continue;
  question.assetIds.sort((left, right) => Number(photoIds.has(right)) - Number(photoIds.has(left)));
}

await writeFile("data/questions.json", `${JSON.stringify(questions, null, 2)}\n`);
console.log(`PHOTO_ASSETS_ATTACHED: added=${attached} mappings=${Object.keys(mappings).length}`);
