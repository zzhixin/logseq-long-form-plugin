import { syncExistingListMarkers } from "./lists";
import { syncMetaVisibilityClass } from "../logseq-dom";
import { syncLongFormToolbarState } from "./mode";
import { scheduleWordCountRefresh } from "./word-count";

let routeHookInstalled = false;

export function refreshRuntimeState(): void {
  syncMetaVisibilityClass();
  syncExistingListMarkers();
  syncLongFormToolbarState();
  scheduleWordCountRefresh();
}

export function registerRuntimeSync(): void {
  if (routeHookInstalled) return;
  routeHookInstalled = true;

  logseq.App.onRouteChanged(() => {
    setTimeout(() => {
      refreshRuntimeState();
    }, 50);
  });

  logseq.App.onSidebarVisibleChanged(() => {
    setTimeout(() => {
      refreshRuntimeState();
    }, 50);
  });
}
