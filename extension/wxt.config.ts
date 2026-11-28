import { defineConfig } from "wxt";

const pagePatterns = ["http://*/*", "https://*/*"];
const icons = {
  16: "icon/16.png",
  32: "icon/32.png",
  48: "icon/48.png",
  128: "icon/128.png",
};

export default defineConfig({
  zip: { excludeSources: ["test-results/**", "artifacts/**", "docs.md", ".env", ".env.*"] },
  modules: ["@wxt-dev/module-react"],
  manifest: ({ browser, manifestVersion }) => ({
    name: "Unloader",
    description: "Unload idle tabs while keeping important sites awake.",
    icons,
    ...(manifestVersion === 2 ? { browser_action: { default_icon: icons } } : { action: { default_icon: icons } }),
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
          default: "Ctrl+Shift+U",
          mac: "Command+Shift+U",
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
