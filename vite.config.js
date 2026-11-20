import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [cloudflare()],
	build: {
		rolldownOptions: {
			output: {
				// three.js in a chunk of its own: it rarely changes, so after a game update the
				// browser keeps its cached copy and only fetches the (much smaller) game code
				codeSplitting: { groups: [{ name: "three", test: /[\\/]node_modules[\\/](\.pnpm[\\/])?three/ }] },
			},
		},
	},
});
