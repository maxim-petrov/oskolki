// Small original office-object icons on a 24px grid; same flat palette and stepped outline.
export function ReplayRelicArt({ id }: { id: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="34"
      height="34"
      aria-hidden="true"
      shapeRendering="crispEdges"
      data-relic-art={id}
    >
      {id === 'tape' ? (
        <>
          <path d="M3 5h17v3h2v11H2V7h1z" fill="#17171b" />
          <path d="M4 7h15v3h1v7H4z" fill="#a4aaa5" />
          <path d="M5 8h13v4H5z" fill="#e3d4bb" />
          <path d="M6 9h3v3H6zm8 0h3v3h-3zM8 15h8v3H8z" fill="#333039" />
          <path d="M4 13h16v2H4z" fill="#bd8497" />
        </>
      ) : id === 'binding' ? (
        <>
          <path d="M4 3h14v2h3v15H7v2H3V4h1z" fill="#17171b" />
          <path d="M6 5h12v12H6z" fill="#9c94ad" />
          <path d="M8 17h11v2H8z" fill="#e5d8bd" />
          <path d="M6 6h3v10H6zM11 9h5v2h-5z" fill="#686174" />
          <path d="M10 10h10v3H10z" fill="#17171b" />
          <path d="M12 11h6v1h-6z" fill="#c69a59" />
        </>
      ) : id === 'carbon' ? (
        <>
          <path d="M3 6h15v16H3z" fill="#17171b" />
          <path d="M5 8h11v12H5z" fill="#8f9fa6" />
          <path d="M7 2h14v16H7z" fill="#17171b" />
          <path d="M9 4h10v12H9z" fill="#dfd3be" />
          <path d="M11 7h6v2h-6zm0 4h4v2h-4z" fill="#62616a" />
        </>
      ) : (
        <>
          <path d="M6 2h12v21l-6-4-6 4z" fill="#17171b" />
          <path d="M8 4h8v15l-4-3-4 3z" fill="#a4ab75" />
          <path d="M10 7h2v3h-2zm4 4h2v3h-2z" fill="#585c50" />
        </>
      )}
    </svg>
  );
}
