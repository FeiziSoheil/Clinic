/**
 * PDF export for a prescription.
 *
 * There is no dedicated PDF library in the project; this builds a clean
 * RTL Persian-styled HTML node off-DOM, rasterizes it with `html2canvas-pro`
 * (scale 2) and lays it out across A4 pages with `jsPDF`. Persian RTL is
 * handled transparently because `html2canvas-pro` rasterizes the already-rendered
 * DOM (so Vazirmatn shaping/bidi is captured as pixels). `html2canvas-pro` is
 * the maintained fork of html2canvas and understands modern CSS color functions
 * (`oklch`/`lab`/`lch`/`oklab`/`color()`) emitted by Tailwind v4, which
 * html2canvas@1.4.1 cannot parse.
 */

import html2canvas from "html2canvas-pro";
import { jsPDF } from "jspdf";

import { formatJalaliDateTime } from "@/lib/jalali";
import type { PrescriptionResponse, PrescriptionStatus } from "@/types/prescription";

export interface ExportPrescriptionPdfOptions {
  /** Display name of the issuing doctor (optional). */
  doctorName?: string;
  /** Display name of the patient (optional). */
  patientName?: string;
}

const STATUS_LABELS: Record<PrescriptionStatus, string> = {
  ACTIVE: "فعال",
  COMPLETED: "تکمیل‌شده",
  CANCELLED: "لغوشده",
};

/**
 * Builds the off-DOM RTL Persian-styled HTML node for a prescription.
 *
 * The node is rendered with inline styles (so it is independent of the page
 * stylesheet) and uses a Vazirmatn-like sans-serif stack.
 */
function buildPrescriptionNode(
  prescription: PrescriptionResponse,
  opts: ExportPrescriptionPdfOptions = {},
): HTMLDivElement {
  const wrap = document.createElement("div");
  wrap.setAttribute("dir", "rtl");
  wrap.style.width = "794px"; // ~A4 width at 96dpi
  wrap.style.minHeight = "1123px";
  wrap.style.background = "#ffffff";
  wrap.style.color = "#0f172a";
  wrap.style.padding = "40px";
  wrap.style.boxSizing = "border-box";
  wrap.style.fontFamily =
    "'Vazirmatn','Iranian Sans','Tahoma','Segoe UI',Arial,sans-serif";
  wrap.style.fontSize = "15px";
  wrap.style.lineHeight = "1.8";

  const header = `
    <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #0ea5e9;padding-bottom:14px;margin-bottom:24px;">
      <div>
        <div style="font-size:26px;font-weight:800;color:#0369a1;">کلینیک کلینیک</div>
        <div style="font-size:13px;color:#64748b;margin-top:4px;">نسخهٔ الکترونیک دارو</div>
      </div>
      <div style="text-align:left;font-size:13px;color:#475569;">
        <div>تاریخ صدور: ${formatJalaliDateTime(prescription.created_at)}</div>
        <div>وضعیت: <strong>${STATUS_LABELS[prescription.status]}</strong></div>
      </div>
    </div>
  `;

  // Prefer an explicit caller override, then the server-denormalized name, then
  // fall back to an em dash. The backend resolves patient_name/doctor_name from
  // the users collection so the PDF shows real names instead of bare ids.
  const patientName = opts.patientName ?? prescription.patient_name ?? "—";
  const doctorName = opts.doctorName ?? prescription.doctor_name ?? "—";

  const meta = `
    <div style="display:flex;gap:32px;margin-bottom:24px;">
      <div style="flex:1;">
        <div style="font-size:12px;color:#94a3b8;">بیمار</div>
        <div style="font-size:17px;font-weight:700;">${patientName}</div>
        <div style="font-size:12px;color:#64748b;font-family:monospace;">${prescription.patient_id}</div>
      </div>
      <div style="flex:1;">
        <div style="font-size:12px;color:#94a3b8;">پزشک معالج</div>
        <div style="font-size:17px;font-weight:700;">${doctorName}</div>
        <div style="font-size:12px;color:#64748b;font-family:monospace;">${prescription.doctor_id}</div>
      </div>
    </div>
  `;

  const tableHead = `
    <thead>
      <tr style="background:#e0f2fe;color:#0c4a6e;">
        <th style="border:1px solid #cbd5e1;padding:10px;text-align:right;">ردیف</th>
        <th style="border:1px solid #cbd5e1;padding:10px;text-align:right;">نام دارو</th>
        <th style="border:1px solid #cbd5e1;padding:10px;text-align:right;">دوز</th>
        <th style="border:1px solid #cbd5e1;padding:10px;text-align:right;">دفعات مصرف</th>
        <th style="border:1px solid #cbd5e1;padding:10px;text-align:right;">مدت درمان</th>
        <th style="border:1px solid #cbd5e1;padding:10px;text-align:right;">دستور مصرف</th>
      </tr>
    </thead>
  `;

  const rows = prescription.items
    .map(
      (it, idx) => `
      <tr>
        <td style="border:1px solid #cbd5e1;padding:10px;text-align:right;">${idx + 1}</td>
        <td style="border:1px solid #cbd5e1;padding:10px;text-align:right;font-weight:600;">${escapeHtml(it.drug_name)}</td>
        <td style="border:1px solid #cbd5e1;padding:10px;text-align:right;">${escapeHtml(it.dose)}</td>
        <td style="border:1px solid #cbd5e1;padding:10px;text-align:right;">${escapeHtml(it.frequency)}</td>
        <td style="border:1px solid #cbd5e1;padding:10px;text-align:right;">${escapeHtml(it.duration)}</td>
        <td style="border:1px solid #cbd5e1;padding:10px;text-align:right;">${escapeHtml(it.sig)}</td>
      </tr>
    `,
    )
    .join("");

  const table = `
    <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
      ${tableHead}
      <tbody>${rows || `<tr><td colspan="6" style="border:1px solid #cbd5e1;padding:16px;text-align:center;color:#94a3b8;">موردی ثبت نشده است.</td></tr>`}</tbody>
    </table>
  `;

  const footer = `
    <div style="margin-top:48px;border-top:1px dashed #cbd5e1;padding-top:16px;font-size:12px;color:#94a3b8;display:flex;justify-content:space-between;">
      <span>این نسخه به‌صورت الکترونیکی صادر شده است.</span>
      <span>شناسهٔ نسخه: ${prescription.id}</span>
    </div>
  `;

  wrap.innerHTML = header + meta + table + footer;
  return wrap;
}

/** Escape `<`, `>`, `&` so user-supplied text is safe inside the HTML node. */
function escapeHtml(value: string): string {
  return String(value ?? "")
    .replace(/&/g, "&")
    .replace(/</g, "<")
    .replace(/>/g, ">");
}

/**
 * Render a prescription to a clean A4 PDF and trigger a download
 * (`prescription.pdf`).
 *
 * The node is appended off-DOM, rasterized at 2x for crispness, sliced across
 * A4 pages by `jsPDF`, then removed from the document.
 */
export async function exportPrescriptionPdf(
  prescription: PrescriptionResponse,
  opts: ExportPrescriptionPdfOptions = {},
): Promise<void> {
  const node = buildPrescriptionNode(prescription, opts);
  // Render off-DOM but visible (html2canvas-pro needs layout/paint).
  node.style.position = "fixed";
  node.style.top = "0";
  node.style.left = "-10000px";
  document.body.appendChild(node);

  try {
    const canvas = await html2canvas(node, { scale: 2, backgroundColor: "#ffffff" });
    const imgData = canvas.toDataURL("image/png");

    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const imgWidth = pageWidth;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    let heightLeft = imgHeight;
    let position = 0;

    pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;

    while (heightLeft > 0) {
      position = heightLeft - imgHeight; // move up
      pdf.addPage();
      pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
    }

    pdf.save("prescription.pdf");
  } finally {
    document.body.removeChild(node);
  }
}
