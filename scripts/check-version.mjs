#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import process from "node:process";
import { URL } from "node:url";

const PACKAGE_PATHS = [
	"package.json",
	"apps/server/package.json",
	"apps/web/package.json",
	"packages/shared-types/package.json",
];
const SEMVER_PATTERN =
	/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

async function readJson(path) {
	return JSON.parse(await readFile(new URL(`../${path}`, import.meta.url), "utf8"));
}

function fail(message) {
	process.stderr.write(`Version check failed: ${message}\n`);
	process.exitCode = 1;
}

const packages = await Promise.all(PACKAGE_PATHS.map(async (path) => ({ path, manifest: await readJson(path) })));
const rootVersion = packages[0].manifest.version;

if (typeof rootVersion !== "string" || !SEMVER_PATTERN.test(rootVersion)) {
	fail(`root package version ${JSON.stringify(rootVersion)} is not valid SemVer`);
}

for (const { path, manifest } of packages.slice(1)) {
	if (manifest.version !== rootVersion) {
		fail(`${path} is ${manifest.version}; every workspace must match ${rootVersion}`);
	}
}

const lockfile = await readJson("package-lock.json");
const lockVersions = [
	["package-lock.json", lockfile.version],
	["package-lock.json packages root", lockfile.packages?.[""]?.version],
	["package-lock.json apps/server", lockfile.packages?.["apps/server"]?.version],
	["package-lock.json apps/web", lockfile.packages?.["apps/web"]?.version],
	["package-lock.json packages/shared-types", lockfile.packages?.["packages/shared-types"]?.version],
];

for (const [location, version] of lockVersions) {
	if (version !== rootVersion) fail(`${location} is ${version}; expected ${rootVersion}`);
}

const requestedTag = process.argv[2];
if (requestedTag && requestedTag !== `v${rootVersion}`) {
	fail(`release tag ${requestedTag} does not match package version v${rootVersion}`);
}

if (!process.exitCode) process.stdout.write(`Version ${rootVersion} is consistent across the monorepo.\n`);
