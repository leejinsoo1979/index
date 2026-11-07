import { toJpeg } from 'html-to-image';
import { jsPDF } from 'jspdf';

/**
 * 캔버스 아트보드 DOM을 '화면 그대로' 캡처해 A4 PDF로 저장한다.
 * - html-to-image(toJpeg): 실제 렌더된 DOM을 SVG foreignObject로 직렬화 → 최신 CSS(oklch 등)·
 *   같은 출처 이미지까지 화면과 동일하게 래스터화. JPEG(품질 0.95)로 파일 크기를 크게 줄인다.
 * - jsPDF: 캡처 이미지를 A4 폭에 맞춰 배치. 아트보드가 한 페이지보다 길면 여러 페이지로 분할.
 */
export async function exportArtboardToPdf(el: HTMLElement, filename: string): Promise<void> {
  const width = el.offsetWidth;
  const height = el.offsetHeight;

  const dataUrl = await toJpeg(el, {
    pixelRatio: 2, // 선명도
    quality: 0.95,
    backgroundColor: '#ffffff',
    cacheBust: true,
    width,
    height,
  });

  const pdf = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'portrait' });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();

  // 아트보드 폭을 A4 폭에 맞춘다.
  const scale = pageW / width;
  const renderH = height * scale;

  // 한 페이지 높이와 거의 같으면(렌더 반올림 오차) 빈 2페이지가 생기지 않도록 한 페이지로 처리.
  if (renderH <= pageH + 2) {
    pdf.addImage(dataUrl, 'JPEG', 0, 0, pageW, Math.min(renderH, pageH));
  } else {
    // 여러 페이지로 분할: 전체 이미지를 위로 밀어가며 각 페이지가 해당 구간만 보이도록 한다.
    let remaining = renderH;
    let offset = 0;
    while (remaining > 0) {
      pdf.addImage(dataUrl, 'JPEG', 0, offset, pageW, renderH);
      remaining -= pageH;
      if (remaining > 0) {
        pdf.addPage();
        offset -= pageH;
      }
    }
  }

  pdf.save(filename);
}
