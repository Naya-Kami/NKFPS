const base = import.meta.env?.BASE_URL ?? '/';

export function publicAsset(path) {
  return base + path;
}
