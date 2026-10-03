// Where the screen starts.
//
// Stage one is not connected to a database. Something deployed and working
// comes first, and the features go on top of it. Building the whole thing and
// deploying at the end leaves nothing behind if it stalls halfway.

import { render } from "preact";

import { App } from "./app.tsx";
import "./style.css";

const root = document.getElementById("app");
if (!root) throw new Error("#app が見つかりません");
render(<App />, root);
