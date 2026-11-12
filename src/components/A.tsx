// Internal links do a normal page load: see TabLink for why.
export default function A({ href, ...p }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) { return <a href={href} {...p} />; }
