import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../app/globals.css";
import MapPage from "../app/map/page";
import "./runtime";

createRoot(document.getElementById("root")!).render(
  <StrictMode><MapPage /></StrictMode>,
);
