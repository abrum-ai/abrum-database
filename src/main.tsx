import { mountAbrumApp } from "@abrum/react";
import { App } from "./App";
import { install } from "@abrum/generated";
import "./styles.css";

mountAbrumApp({
  app: <App />,
  deferReadyUntilAppCommit: true,
  appId: "abrum.database",
  install: { ...install, package: "@abrum/database-web" },
});
