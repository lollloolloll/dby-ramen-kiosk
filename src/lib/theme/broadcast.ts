/**
 * 같은 origin의 모든 탭/창에 site_config 변경 알림.
 * admin/theme에서 저장 또는 업로드 성공 시 호출 → 다른 탭의 키오스크가
 * router.refresh()로 새 server-rendered config 가져옴.
 */

const CHANNEL_NAME = "site-config";
const MESSAGE_TYPE = "site-config-changed";

export interface SiteConfigChangedMessage {
  type: typeof MESSAGE_TYPE;
  at: number;
}

function getChannel(): BroadcastChannel | null {
  if (typeof window === "undefined") return null;
  if (typeof BroadcastChannel === "undefined") return null;
  return new BroadcastChannel(CHANNEL_NAME);
}

export function broadcastSiteConfigChanged() {
  const channel = getChannel();
  if (!channel) return;
  const msg: SiteConfigChangedMessage = {
    type: MESSAGE_TYPE,
    at: Date.now(),
  };
  channel.postMessage(msg);
  channel.close();
}

/**
 * 리스너 등록. 콜백은 변경 알림을 받을 때마다 호출됨.
 * 반환값은 cleanup 함수 (useEffect 안에서 그대로 return).
 */
export function subscribeToSiteConfigChanges(onChange: () => void): () => void {
  const channel = getChannel();
  if (!channel) return () => undefined;

  const handler = (event: MessageEvent<SiteConfigChangedMessage>) => {
    if (event.data?.type === MESSAGE_TYPE) {
      onChange();
    }
  };
  channel.addEventListener("message", handler);

  return () => {
    channel.removeEventListener("message", handler);
    channel.close();
  };
}
