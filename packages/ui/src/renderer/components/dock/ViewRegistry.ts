/**
 * ViewRegistry — single source of truth for all dockable views.
 *
 * Views are registered once at app startup. The DockManager and containers
 * read from this registry to instantiate components. Moving a view between
 * regions doesn't re-register it — only the LayoutTree changes.
 */

import type { ViewDescriptor } from "./types";

class ViewRegistryImpl {
  private views = new Map<string, ViewDescriptor>();

  /** Register a view descriptor. Throws if id already registered. */
  register(descriptor: ViewDescriptor): void {
    if (this.views.has(descriptor.id)) {
      console.warn(`[ViewRegistry] View "${descriptor.id}" already registered, overwriting.`);
    }
    this.views.set(descriptor.id, descriptor);
  }

  /** Get a registered view by id. Returns undefined if not found. */
  get(id: string): ViewDescriptor | undefined {
    return this.views.get(id);
  }

  /** Get all registered views. */
  getAll(): ViewDescriptor[] {
    return Array.from(this.views.values());
  }

  /** Check if a view is registered. */
  has(id: string): boolean {
    return this.views.has(id);
  }

  /** Get views for a specific default location. */
  getByDefaultLocation(location: ViewDescriptor["defaultLocation"]): ViewDescriptor[] {
    return this.getAll().filter((v) => v.defaultLocation === location);
  }

  /** Get views that belong to the activity bar. */
  getActivityBarItems(): ViewDescriptor[] {
    return this.getAll()
      .filter((v) => v.activityGroup != null)
      .sort((a, b) => (a.activityOrder ?? 99) - (b.activityOrder ?? 99));
  }

  /** Clear all registrations (for testing). */
  clear(): void {
    this.views.clear();
  }
}

/** Singleton instance */
export const viewRegistry = new ViewRegistryImpl();
