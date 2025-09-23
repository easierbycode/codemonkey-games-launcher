/** @jsx h */
/** @jsxFrag Fragment */
import { h, Fragment } from "preact";
import { Head } from "fresh";

export default function Error404() {
  return (
    <>
      <Head>
        <title>404 - Page not found</title>
      </Head>
      <div>
        <h1>404 - Page not found</h1>
        <p>The page you were looking for doesn't exist.</p>
        <a href="/">Go back home</a>
      </div>
    </>
  );
}
