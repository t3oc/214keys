export function getAppBase() {
  try {
    const { pathname } = window.location;
    if (pathname.includes("/beta/") || /\/beta\/?$/.test(pathname.replace(/\/index\.html$/i, ""))) {
      return "../";
    }
  } catch {
    /* ignore */
  }
  return "";
}

export function appAssetUrl(relativePath) {
  return `${getAppBase()}${relativePath}`;
}
