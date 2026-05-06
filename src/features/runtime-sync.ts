import { syncExistingListMarkers, syncOrderedListMarkers } from "./lists";
import { syncMetaVisibilityClass } from "../logseq-dom";
import { applySavedDisplayMode } from "./mode";
import { scheduleWordCountRefresh } from "./word-count";

let routeHookInstalled = false;

export function refreshRuntimeState(): void {
  syncMetaVisibilityClass();
  void applySavedDisplayMode();
  void syncExistingListMarkers();
  void syncOrderedListMarkers();
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
