import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../app/globals.css";
import MyPage from "../app/my/page";
import "./runtime";

createRoot(document.getElementById("root")!).render(
  <StrictMode><MyPage /></StrictMode>,
);
