import type { AppProps } from "next/app";
import "../app/globals.css";

// The App Router handles every page except the static 500 page in this folder.
// It needs the global styles, and global CSS can only be imported from _app.
export default function PagesApp({ Component, pageProps }: AppProps) {
  return <Component {...pageProps} />;
}
