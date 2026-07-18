"use strict";

const routeNames = new Set([
  "inspect",
  "settings",
  "library",
  "addresses",
  "keys",
  "scripts",
  "vault",
  "manual",
]);

const cleanSegments = (pathname) => pathname.split("/").filter(Boolean);

const routeState = () => {
  const pathname = window.location.pathname || "/";
  const segments = cleanSegments(pathname);
  const last = segments.at(-1) || "";

  if (routeNames.has(last)) {
    const baseSegments = segments.slice(0, -1);
    return {
      basePath: `/${baseSegments.join("/")}${baseSegments.length > 0 ? "/" : ""}`,
      suffix: last,
    };
  }

  const basePath = pathname.endsWith("/")
    ? pathname
    : pathname.slice(0, pathname.lastIndexOf("/") + 1) || "/";

  return {
    basePath,
    suffix: "inspect",
  };
};

const routePath = (basePath, suffix) => {
  const base = basePath.endsWith("/") ? basePath : `${basePath}/`;
  return `${base}${suffix}`;
};

export const _routeSuffix = () => routeState().suffix;

export const _basePath = () => routeState().basePath;

export const _pushPath = (basePath) => (suffix) => () => {
  const path = routePath(basePath, suffix);
  if (window.location.pathname !== path) {
    window.history.pushState({}, "", path);
  }
};
