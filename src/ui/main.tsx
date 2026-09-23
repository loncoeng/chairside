// 画面の入口。
//
// 第1段階では、まだデータベースに繋がない。**動いて公開されている状態**を
// 先に作り、そこへ機能を足していく。一気に作って最後にデプロイすると、
// 途中で詰まったときに何も残らない。

import { render } from "preact";

import { App } from "./app.tsx";
import "./style.css";

const root = document.getElementById("app");
if (!root) throw new Error("#app が見つかりません");
render(<App />, root);
