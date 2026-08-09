import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import { TonConnectUIProvider } from "@tonconnect/ui-react";
import { WalletProvider } from "./context/WalletContext";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <TonConnectUIProvider manifestUrl="https://aipolynet.com/tonconnect-manifest.json">
      <WalletProvider>
        <App />
      </WalletProvider>
    </TonConnectUIProvider>
  </React.StrictMode>
);