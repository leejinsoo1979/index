import { forwardRef, type AnchorHTMLAttributes } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { toAppPath } from './studio-paths';

type Props = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & {
  href: string;
  prefetch?: boolean;
  replace?: boolean;
  scroll?: boolean;
};

/** `next/link` → react-router Link, translating the original /studio paths. */
const Link = forwardRef<HTMLAnchorElement, Props>(function Link(
  { href, prefetch: _prefetch, scroll: _scroll, replace, ...rest },
  ref,
) {
  const to = toAppPath(href);
  if (/^(https?:|mailto:|tel:)/.test(to)) return <a ref={ref} href={to} {...rest} />;
  return <RouterLink ref={ref} to={to} replace={replace} {...rest} />;
});

export default Link;
