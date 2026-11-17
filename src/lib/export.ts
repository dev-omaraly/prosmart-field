import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

/** Save a file: browser download on the web, share sheet (WhatsApp / Drive / Files…) inside the APK. */
export async function saveFile(name: string, blob: Blob) {
  if (Capacitor.isNativePlatform()) {
    const data = await new Promise<string>((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result).split(',')[1]);
      r.onerror = () => rej(r.error);
      r.readAsDataURL(blob);
    });
    const f = await Filesystem.writeFile({ path: name, data, directory: Directory.Cache });
    await Share.share({ title: name, url: f.uri, dialogTitle: 'حفظ / مشاركة الملف' });
    return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

export type Sheet = { name: string; headers: string[]; rows: (string | number)[][] };

export async function exportExcel(filename: string, sheets: Sheet[]) {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  for (const s of sheets) {
    const ws = wb.addWorksheet(s.name.slice(0, 31), { views: [{ rightToLeft: true }] });
    const h = ws.addRow(s.headers);
    h.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    h.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF003A5F' } };
    s.rows.forEach((r) => ws.addRow(r));
    ws.columns.forEach((c, i) => {
      const max = Math.max(String(s.headers[i] ?? '').length, ...s.rows.map((r) => String(r[i] ?? '').length));
      c.width = Math.min(45, Math.max(10, max + 3));
    });
  }
  const buf = await wb.xlsx.writeBuffer();
  await saveFile(filename.endsWith('.xlsx') ? filename : filename + '.xlsx', new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
}

/**
 * PDF from HTML (so Arabic shapes and RTL render correctly: the browser does the text layout).
 * `html` is a body fragment; it is rendered off-screen on a white A4-width page and sliced into pages.
 */
export async function exportPdf(filename: string, html: string) {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')]);
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-10000px;top:0;width:794px;background:#fff;color:#111;padding:32px;box-sizing:border-box;direction:rtl;font-family:Cairo,Tahoma,sans-serif;font-size:14px;line-height:1.7';
  host.innerHTML = html;
  document.body.appendChild(host);
  try {
    if (document.fonts?.ready) await document.fonts.ready;
    // wait for images (signature) to load
    await Promise.all(Array.from(host.querySelectorAll('img')).map((im) => (im.complete ? 0 : new Promise((r) => { im.onload = im.onerror = () => r(0); }))));
    const canvas = await html2canvas(host, { scale: 2, backgroundColor: '#ffffff', useCORS: true });
    const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
    const pw = pdf.internal.pageSize.getWidth();
    const ph = pdf.internal.pageSize.getHeight();
    const imgH = (canvas.height * pw) / canvas.width;
    const pageCanvasH = Math.floor((ph * canvas.width) / pw);
    let y = 0;
    while (y < canvas.height) {
      const h = Math.min(pageCanvasH, canvas.height - y);
      const part = document.createElement('canvas');
      part.width = canvas.width;
      part.height = h;
      part.getContext('2d')!.drawImage(canvas, 0, y, canvas.width, h, 0, 0, canvas.width, h);
      if (y > 0) pdf.addPage();
      pdf.addImage(part.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, pw, (h * pw) / canvas.width);
      y += h;
    }
    void imgH;
    await saveFile(filename.endsWith('.pdf') ? filename : filename + '.pdf', pdf.output('blob'));
  } finally {
    host.remove();
  }
}

export const esc = (v: unknown) =>
  String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
