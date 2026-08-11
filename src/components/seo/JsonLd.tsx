/**
 * Server component, so the payload lands in the static HTML rather than
 * appearing after hydration where crawlers of the ssr:false routes never see it.
 */
export function JsonLd({ data }: { data: object | object[] }) {
  return (
    <script
      type="application/ld+json"
      // JSON.stringify output is inert here; "<" is escaped so it cannot close the tag early
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, "\\u003c"),
      }}
    />
  );
}
