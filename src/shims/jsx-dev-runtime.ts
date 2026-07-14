/**
 * Production shim for react/jsx-dev-runtime.
 *
 * @astryxdesign/core ships dist files compiled with the DEV jsx transform
 * (jsxDEV from react/jsx-dev-runtime). React's production build exports
 * `jsxDEV = undefined`, so those components crash with
 * "jsxDEV is not a function". This shim maps jsxDEV onto the production
 * jsx/jsxs functions. Aliased in vite.config.ts for `vite build` only.
 */
import { Fragment, jsx, jsxs } from "react/jsx-runtime";

export { Fragment };

export function jsxDEV(
  type: Parameters<typeof jsx>[0],
  props: Parameters<typeof jsx>[1],
  key: Parameters<typeof jsx>[2],
  isStaticChildren?: boolean,
) {
  return isStaticChildren ? jsxs(type, props, key) : jsx(type, props, key);
}
