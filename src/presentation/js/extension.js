// Chrome-Extension-Kommunikation

export const isExtensionContext = Boolean(
  globalThis.chrome?.runtime?.id && globalThis.chrome?.runtime?.sendMessage
);

export async function send(type, rest = {}) {
  const response = await chrome.runtime.sendMessage({ type, ...rest });
  if (!response?.ok) throw new Error(response?.error ?? "不明なエラー");
  return response.payload;
}
