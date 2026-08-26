import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

/**
 * Separate from vite.config.ts so the dev/build config stays free of test
 * concerns. The alias is repeated rather than imported because both files must
 * resolve `@/` on their own — Vitest does not read the app's vite config here.
 */
export default defineConfig({
	plugins: [react()],
	resolve: {
		alias: {
			"@": fileURLToPath(new URL("./src", import.meta.url)),
		},
	},
	test: {
		// Components touch the DOM; jsdom gives them one without a browser.
		environment: "jsdom",
		globals: true,
		setupFiles: ["./tests/setup.ts"],
	},
});
