import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../app/globals.css";
import AdminLoginPage from "../app/admin/login/page";
import "./runtime";

createRoot(document.getElementById("root")!).render(
  <StrictMode><AdminLoginPage /></StrictMode>,
);
