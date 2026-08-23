import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { PwaBootstrap } from "../app/PwaBootstrap";
import { RoadReadyApp } from "../app/RoadReadyApp";
import "../app/globals.css";
import { loadContent } from "../src/content";

const content = loadContent();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PwaBootstrap />
    <RoadReadyApp
      questions={content.questions}
      sources={content.sources}
      assets={content.assets}
    />
  </StrictMode>,
);
