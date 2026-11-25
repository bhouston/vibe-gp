import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

// GITHUB_PAGES=1 builds a plain static site (dist/) for GitHub Pages instead of the
// Cloudflare worker bundle. That build also:
//  - leaves out the original site's analytics tag,
//  - adds a Content Security Policy: the game only ever loads its own files and makes no
//    requests anywhere else, so the page is locked to its own origin (nothing injected
//    could load code from, or send anything to, another site), and no referrer is sent.
const CSP = [
	"default-src 'self'",
	"script-src 'self'",
	"style-src 'self' 'unsafe-inline'", // the HUD sets inline style attributes
	"img-src 'self' data: blob:",
	"media-src 'self' data: blob:",
	"font-src 'self' data:",
	"connect-src 'self'",
	"worker-src 'self' blob:",
	"object-src 'none'",
	"base-uri 'self'",
	"form-action 'none'",
].join("; ");
const pages = {
	name: "pages-static",
	transformIndexHtml: (html) => html
		.replace(/<script async src="https:\/\/www\.googletagmanager\.com[^]*?<\/script>\s*<script>[^]*?<\/script>/, "")
		.replace(/<head>/, `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />\n    <meta name="referrer" content="no-referrer" />`),
};

export default defineConfig({
	plugins: process.env.GITHUB_PAGES ? [pages] : [cloudflare()],
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
