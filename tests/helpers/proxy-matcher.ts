import { createRequire } from "node:module";

import { config } from "@/proxy";

const require = createRequire(import.meta.url);

const { getMiddlewareMatchers } =
  require("next/dist/build/analysis/get-page-static-info") as {
    getMiddlewareMatchers: (
      matcherOrMatchers: string | string[] | object,
      nextConfig: Record<string, unknown>
    ) => Array<{ regexp: string; originalSource: string }>;
  };

/** Compile `proxy.ts` `config.matcher` the same way Next.js does at build time. */
export function compiledProxyMatchers(): Array<{
  regexp: string;
  originalSource: string;
}> {
  const matchers = Array.isArray(config.matcher)
    ? config.matcher
    : [config.matcher];
  return getMiddlewareMatchers(matchers, {});
}

export function proxyMatcherMatches(pathname: string): boolean {
  return compiledProxyMatchers().some((matcher) =>
    new RegExp(matcher.regexp).test(pathname)
  );
}
