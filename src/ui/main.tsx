// UI entry point.

import { render } from "preact";

import { App } from "./app.tsx";
import { applyTheme, savedTheme } from "./theme.tsx";
import "./style.css";

// Before the first render, so a saved dark choice does not flash light.
applyTheme(savedTheme());

const root = document.getElementById("app");
if (!root) throw new Error("#app is missing from index.html");
render(<App />, root);
