import { syncExistingListMarkers, syncOrderedListMarkers } from "./lists";
import { getScopedContainer, KEEP_INDENTS_CLASS, LONG_FORM_CLASS, syncMetaVisibilityClass } from "../logseq-dom";
import { applySavedDisplayMode } from "./mode";
import { scheduleWordCountRefresh } from "./word-count";
import { getSettings, isDebugLoggingEnabled } from "../settings";

let routeHookInstalled = false;
let refreshGeneration = 0;
let runtimeObserverInstalled = false;

function debugRuntime(message: string, details?: Record<string, unknown>): void {
  if (!isDebugLoggingEnabled()) return;
  const serialized = details ? JSON.stringify(details) : "";
  console.info("[long-form:runtime]", message, serialized);
}

function describeRuntimeContainers(): Record<string, unknown> {
  const parentDoc = parent?.document;
  const scoped = getScopedContainer();
  const mainContainer = parentDoc?.querySelector<HTMLElement>("#main-container") ?? null;
  const appContainer = parentDoc?.querySelector<HTMLElement>("#app-container") ?? null;

  return {
    displayMode: getSettings().displayMode,
    enabledForRightSidebar: getSettings().enabledForRightSidebar,
    scopedFound: Boolean(scoped),
    scopedId: scoped?.id ?? null,
    scopedClassName: scoped?.className ?? null,
    mainFound: Boolean(mainContainer),
    mainClassName: mainContainer?.className ?? null,
    appFound: Boolean(appContainer),
    appClassName: appContainer?.className ?? null,
  };
}

export function refreshRuntimeState(): void {
  debugRuntime("refresh start", describeRuntimeContainers());
  syncMetaVisibilityClass();
  void applySavedDisplayMode();
  void syncExistingListMarkers();
  void syncOrderedListMarkers();
  scheduleWordCountRefresh();
  window.setTimeout(() => {
    debugRuntime("refresh after", describeRuntimeContainers());
  }, 0);
}

function scheduleRuntimeRefreshSequence(): void {
  refreshGeneration += 1;
  const generation = refreshGeneration;
  debugRuntime("schedule refresh sequence", { generation });

  for (const delayMs of [0, 50, 150, 300]) {
    window.setTimeout(() => {
      if (generation !== refreshGeneration) return;
      debugRuntime("run scheduled refresh", { generation, delayMs });
      refreshRuntimeState();
    }, delayMs);
  }
}

function installRuntimeContainerObserver(): void {
  if (runtimeObserverInstalled) return;
  const parentDoc = parent?.document;
  if (!parentDoc) return;

  const observeContainer = (selector: string, label: string): void => {
    const element = parentDoc.querySelector<HTMLElement>(selector);
    if (!element) {
      debugRuntime("observer missing container", { selector, label });
      return;
    }

    const observer = new MutationObserver(() => {
      debugRuntime("container class changed", {
        label,
        selector,
        className: element.className,
      });

      const mode = getSettings().displayMode;
      const shouldKeepLongForm = mode !== "outline";
      const shouldKeepIndents = mode === "long-indent";
      const missingLongForm = shouldKeepLongForm && !element.classList.contains(LONG_FORM_CLASS);
      const missingKeepIndents = shouldKeepIndents && !element.classList.contains(KEEP_INDENTS_CLASS);

      if (label === "main" && (missingLongForm || missingKeepIndents)) {
        debugRuntime("container class self-heal", {
          label,
          selector,
          mode,
          missingLongForm,
          missingKeepIndents,
          className: element.className,
        });
        scheduleRuntimeRefreshSequence();
      }
    });

    observer.observe(element, {
      attributes: true,
      attributeFilter: ["class"],
    });
  };

  observeContainer("#main-container", "main");
  observeContainer("#app-container", "app");
  runtimeObserverInstalled = true;
}

export function registerRuntimeSync(): void {
  if (routeHookInstalled) return;
  routeHookInstalled = true;
  installRuntimeContainerObserver();

  logseq.App.onRouteChanged(() => {
    debugRuntime("route changed");
    scheduleRuntimeRefreshSequence();
  });

  logseq.App.onSidebarVisibleChanged(() => {
    debugRuntime("sidebar visible changed");
    scheduleRuntimeRefreshSequence();
  });
}
