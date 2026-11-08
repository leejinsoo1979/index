import { defaultNavigation, type NavLink, type SiteNavigation } from "../data/navigation";
import { useSiteContent } from "./siteContent";

/**
 * Site menus as edited in /admin/menus (site-content block `navigation`), falling back to the
 * defaults in src/data/navigation.ts until an admin saves. Missing fields in a saved block are
 * filled from the defaults so older saves keep working when new fields are added.
 */
export function useNavigation(): { nav: SiteNavigation; saved: boolean; loading: boolean } {
  const { value, saved, loading } = useSiteContent<Partial<SiteNavigation>>("navigation", defaultNavigation);
  return { nav: { ...defaultNavigation, ...value }, saved, loading };
}

/** Links a visitor should see (hidden removed; admin-only kept only for admins). */
export const visibleLinks = (links: NavLink[], isAdmin: boolean) => links.filter((l) => !l.hidden && (!l.adminOnly || isAdmin));

export const isExternalLink = (to: string) => /^https?:\/\//i.test(to);

/** Every in-site path the menus point to, with its label (used for placeholder routes). */
export function menuRouteLabels(nav: SiteNavigation): Map<string, string> {
  const labels = new Map<string, string>();
  const add = (l: NavLink) => {
    if (!isExternalLink(l.to) && l.to.startsWith("/") && !labels.has(l.to)) labels.set(l.to, l.label);
  };
  nav.primary.forEach(add);
  nav.footer.forEach((col) => col.links.forEach(add));
  nav.legal.forEach(add);
  return labels;
}
