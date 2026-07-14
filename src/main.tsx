import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { Theme } from "@astryxdesign/core/theme";
import { neutralTheme } from "@astryxdesign/theme-neutral/built";
import App from "./App";
import { AuthProvider } from "./auth/AuthContext";
import "./styles/global.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Theme theme={neutralTheme}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </Theme>
    </BrowserRouter>
  </React.StrictMode>
);
