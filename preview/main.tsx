import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "../src/App";
import "../src/styles.css";

const params = new URLSearchParams(location.search);
if (params.get("scheme")) document.documentElement.dataset.abrumScheme = params.get("scheme")!;
createRoot(document.getElementById("root")!).render(<App />);
