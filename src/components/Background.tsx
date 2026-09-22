/**
 * Fixed, non-interactive backdrop: drifting aurora blobs, a fading grid, film
 * grain and a vignette. Pure CSS so it costs nothing on the main thread and
 * respects `prefers-reduced-motion` through the global media query.
 */
export function Background(): React.ReactElement {
  return (
    <div className="backdrop" aria-hidden>
      <div className="backdrop__grid" />
      <div className="backdrop__blob backdrop__blob--a" />
      <div className="backdrop__blob backdrop__blob--b" />
      <div className="backdrop__blob backdrop__blob--c" />
      <div className="backdrop__grain" />
      <div className="backdrop__vignette" />
    </div>
  );
}
