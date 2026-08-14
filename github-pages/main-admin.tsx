import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../app/globals.css";
import AdminPage from "../app/admin/page";
import "./runtime";

createRoot(document.getElementById("root")!).render(
  <StrictMode><AdminPage /></StrictMode>,
);
