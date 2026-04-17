/**
 * Exports a generated HTML design as a PNG image.
 *
 * Strategy: inject html2canvas (CDN) + an auto-capture script into the design
 * HTML, open it in a temporary popup window. html2canvas renders the page and
 * triggers a PNG download — no npm dependency required.
 */
export async function downloadAsPng(
  html: string,
  filename: string,
  canvasWidth: number,
  canvasHeight: number
): Promise<void> {
  // Wait for fonts script — gives Google Fonts a moment to settle before capture
  const captureScript = `
<script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"><\/script>
<script>
  (async function () {
    // Wait for fonts + paint
    await document.fonts.ready;
    await new Promise(function(r){ setTimeout(r, 600); });

    var target = document.documentElement;
    var canvas = await html2canvas(target, {
      scale: 2,
      useCORS: true,
      allowTaint: false,
      backgroundColor: null,
      width: ${canvasWidth},
      height: ${canvasHeight},
      windowWidth: ${canvasWidth},
      windowHeight: ${canvasHeight},
      scrollX: 0,
      scrollY: 0,
    });

    var a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = '${filename}.png';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  })();
<\/script>`;

  const exportHtml = html.includes("</body>")
    ? html.replace("</body>", captureScript + "\n</body>")
    : html + captureScript;

  const blob = new Blob([exportHtml], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank", `width=${Math.min(canvasWidth, 1400)},height=${Math.min(canvasHeight, 900)}`);
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function downloadAsHtml(html: string, filename: string): void {
  const blob = new Blob([html], { type: "text/html" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${filename}.html`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5_000);
}
