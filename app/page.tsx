import { loadContent } from "@/src/content";
import { RoadReadyApp } from "./RoadReadyApp";

export default function Home() {
  const content = loadContent();
  return (
    <RoadReadyApp
      questions={content.questions}
      sources={content.sources}
      assets={content.assets}
    />
  );
}
