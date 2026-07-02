export function getAppBase() {
  try {
    const { pathname } = window.location;
    if (isBetaChannel(pathname)) {
      return "../";
    }
  } catch {
    /* ignore */
  }
  return "";
}

export function isBetaChannel(pathname = window.location.pathname) {
  return pathname.includes("/beta/") || /\/beta\/?$/.test(pathname.replace(/\/index\.html$/i, ""));
}

export function appAssetUrl(relativePath) {
  return `${getAppBase()}${relativePath}`;
}
