import { defineConfig } from "cf/config";

export default defineConfig({
  worker: {
    "name": "vibe-gp",
    "compatibilityDate": "2026-09-21",
    "domains": ["vibe-gp.ben3d.ca"],
    "observability": {
      "enabled": true
    },
    "assets": {
      "notFoundHandling": "single-page-application"
    }
  }
});
