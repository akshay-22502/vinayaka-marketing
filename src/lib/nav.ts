export type NavLink = { href: string; label: string };

/**
 * The main navigation. Certifications and Projects appear only when the site
 * has published entries for them (see `getNavVisibility`).
 */
export function mainNavLinks(visibility: {
  certifications: boolean;
  projects: boolean;
}): NavLink[] {
  return [
    { href: "/products", label: "Products" },
    { href: "/applications", label: "Applications" },
    ...(visibility.certifications ? [{ href: "/certifications", label: "Certifications" }] : []),
    ...(visibility.projects ? [{ href: "/projects", label: "Projects" }] : []),
    { href: "/about", label: "About" },
    { href: "/contact", label: "Contact" },
  ];
}
