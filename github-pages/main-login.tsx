import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../app/globals.css";
import MemberLoginPage from "../app/login/page";
import "./runtime";

createRoot(document.getElementById("root")!).render(
  <StrictMode><MemberLoginPage /></StrictMode>,
);
