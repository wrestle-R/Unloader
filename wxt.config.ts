import { defineConfig } from "wxt";

const pagePatterns = ["http://*/*", "https://*/*"];

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  manifest: ({ browser, manifestVersion }) => ({
    name: "Unloader",
    description: "Unload idle tabs while keeping important sites awake.",
    permissions: [
      "tabs",
      "storage",
      "alarms",
      "idle",
      ...(manifestVersion === 2 ? pagePatterns : []),
    ],
    ...(manifestVersion === 3 ? { host_permissions: pagePatterns } : {}),
    commands: {
      "unload-current-tab": {
        suggested_key: {
          default: "Ctrl+U",
          mac: "Command+U",
        },
        description: "Unload the current tab",
      },
    },
    ...(browser === "firefox"
      ? {
          browser_specific_settings: {
            gecko: {
              id: "unloader@wrestle-r.local",
              data_collection_permissions: { required: ["none"] },
            },
          },
        }
      : {}),
  }),
});
