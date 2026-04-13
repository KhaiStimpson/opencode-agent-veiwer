import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import "@mantine/code-highlight/styles.css";
import "./index.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MantineProvider } from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import { theme } from "./theme";
import { App } from "./App";

const container = document.getElementById("root");

// Inject ColorSchemeScript into head for SSR-safe color scheme
const head = document.head;
const scriptContainer = document.createElement("div");
head.appendChild(scriptContainer);

createRoot(container!).render(
  <StrictMode>
    <MantineProvider theme={theme} defaultColorScheme="dark">
      <Notifications position="top-right" />
      <App />
    </MantineProvider>
  </StrictMode>
);
