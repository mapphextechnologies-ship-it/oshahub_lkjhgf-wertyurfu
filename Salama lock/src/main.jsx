import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

if ("scrollRestoration" in history) {
  history.scrollRestoration = "manual";
}

const resetScrollPosition = () => {
  window.scrollTo({ top: 0, left: 0, behavior: "auto" });
};

resetScrollPosition();
window.addEventListener("beforeunload", resetScrollPosition);
window.addEventListener("pageshow", () => {
  resetScrollPosition();
  requestAnimationFrame(() => {
    resetScrollPosition();
    requestAnimationFrame(resetScrollPosition);
  });
});
window.addEventListener("load", () => {
  setTimeout(resetScrollPosition, 0);
  setTimeout(resetScrollPosition, 100);
});

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
