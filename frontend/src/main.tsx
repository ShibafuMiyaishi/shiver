import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import AvatarOnly from "./components/AvatarOnly";
import "./index.css";
import "./utils/healthCheck";

// /avatar パスはOBS Browser Source用（UIなし・透過背景・アイドルアニメのみ）
const isAvatarRoute = window.location.pathname === "/avatar";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {isAvatarRoute ? <AvatarOnly /> : <App />}
  </React.StrictMode>
);
